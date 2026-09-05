import { q, numOr } from '../db.js'
import { redis } from '../redis.js'
import { getGhlConfig } from './settings.js'

const API = 'https://services.leadconnectorhq.com'
const VERSION = '2021-07-28'
const AUTH_BASE = 'https://marketplace.gohighlevel.com/oauth/chooselocation'

export const DEFAULT_SCOPES = ['charges.readonly', 'charges.write', 'oauth.readonly', 'locations.readonly']

export function buildAuthUrl(cfg, redirectUri, { scopes = DEFAULT_SCOPES, state } = {}) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.client_id,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
  })
  if (state) params.set('state', state)
  return `${AUTH_BASE}?${params}`
}

async function tokenRequest(form) {
  // timeout menor que el TTL del lock de refresh (20s): la sección crítica queda acotada
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(15_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const raw = data?.message || data?.error_description || data?.error || `HTTP ${res.status}`
    const err = new Error(`OAuth GHL falló: ${Array.isArray(raw) ? raw.join('; ') : raw}`)
    err.status = res.status
    throw err
  }
  return data
}

export async function exchangeCode(code, redirectUri) {
  const cfg = await getGhlConfig()
  if (!cfg.client_id || !cfg.client_secret) {
    throw new Error('Faltan las credenciales de la app GHL (client_id/client_secret) en Configuración')
  }
  // sin user_type=Location GHL devuelve token de agencia sin locationId
  return tokenRequest({
    grant_type: 'authorization_code',
    client_id: cfg.client_id,
    client_secret: cfg.client_secret,
    code,
    user_type: 'Location',
    redirect_uri: redirectUri,
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const expMs = (conn) => (conn?.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0)
const tokenFresh = (conn) => Boolean(conn?.access_token) && expMs(conn) - Date.now() > 120_000

// Los refresh tokens de GHL son de UN SOLO USO: serializar el refresh con lock Redis
export async function getAccessToken(connectionId) {
  const { rows: [conn] } = await q('SELECT * FROM connections WHERE id=$1', [connectionId])
  if (!conn || conn.status !== 'connected') throw new Error('Conexión GHL no disponible')
  if (tokenFresh(conn)) return conn.access_token
  if (!conn.refresh_token) throw new Error('Conexión sin refresh token: reconecta la subcuenta')

  const lockKey = `ghltok:${connectionId}`
  const lockVal = `${Date.now()}-${Math.random()}`
  let locked = false
  for (let i = 0; i < 40; i++) {
    locked = Boolean(await redis.set(lockKey, lockVal, 'PX', 20_000, 'NX'))
    if (locked) break
    await sleep(250)
    const { rows: [again] } = await q('SELECT * FROM connections WHERE id=$1', [connectionId])
    if (tokenFresh(again)) return again.access_token
  }
  if (!locked) throw new Error('Timeout esperando el refresh del token GHL')

  try {
    const { rows: [fresh] } = await q('SELECT * FROM connections WHERE id=$1', [connectionId])
    if (tokenFresh(fresh)) return fresh.access_token
    const cfg = await getGhlConfig()
    const tok = await tokenRequest({
      grant_type: 'refresh_token',
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
      refresh_token: fresh.refresh_token,
      user_type: 'Location',
    })
    const expiresAt = new Date(Date.now() + (numOr(tok.expires_in, 3600) - 60) * 1000)
    await q(
      `UPDATE connections SET access_token=$1, refresh_token=COALESCE($2, refresh_token),
       token_expires_at=$3, status='connected', updated_at=now() WHERE id=$4`,
      [tok.access_token, tok.refresh_token || null, expiresAt, connectionId]
    )
    return tok.access_token
  } catch (err) {
    // solo marcar la conexión como rota si GHL rechazó las credenciales — nunca por red, timeout o rate limit (429/408)
    if (err.status >= 400 && err.status < 500 && err.status !== 429 && err.status !== 408) {
      // si otro proceso ya rotó los tokens con éxito, no pisar su estado
      const { rows: [now] } = await q('SELECT access_token, token_expires_at FROM connections WHERE id=$1', [connectionId])
      if (!tokenFresh(now)) {
        await q(`UPDATE connections SET status='error', updated_at=now() WHERE id=$1`, [connectionId])
      }
    }
    throw err
  } finally {
    await redis.eval(
      `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end`,
      1, lockKey, lockVal
    )
  }
}

export async function apiCall(connectionId, method, path, { query, body } = {}) {
  let token
  try {
    token = await getAccessToken(connectionId)
  } catch (err) {
    err.preSend = true // nada salió hacia GHL: el llamador puede tratarlo como fallo concluyente
    throw err
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const url = new URL(API + path)
    if (query) {
      for (const [k, v] of Object.entries(query)) if (v !== null && v !== undefined) url.searchParams.set(k, v)
    }
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: VERSION,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      // acota la ambigüedad de red muy por debajo de los 90s del reclamo de pendientes
      signal: AbortSignal.timeout(30_000),
    })
    if (res.status === 401 && attempt === 0) {
      // token inválido antes de expirar: fuerza refresh y reintenta una vez
      await q('UPDATE connections SET token_expires_at=NULL, updated_at=now() WHERE id=$1', [connectionId])
      try {
        token = await getAccessToken(connectionId)
      } catch (err) {
        err.preSend = true // el 401 previo garantiza que GHL no creó nada: fallo concluyente, no ambiguo
        throw err
      }
      continue
    }
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
    if (!res.ok) {
      const raw = data?.message || data?.error || `HTTP ${res.status}`
      const err = new Error(Array.isArray(raw) ? raw.join('; ') : String(raw))
      err.status = res.status
      err.data = data
      throw err
    }
    return data
  }
}

export const createCharge = (connectionId, body) =>
  apiCall(connectionId, 'POST', '/marketplace/billing/charges', { body })

export const deleteCharge = (connectionId, ghlChargeId) =>
  apiCall(connectionId, 'DELETE', `/marketplace/billing/charges/${encodeURIComponent(ghlChargeId)}`)

export const hasFunds = (connectionId) =>
  apiCall(connectionId, 'GET', '/marketplace/billing/charges/has-funds')

export const listCharges = (connectionId, query) =>
  apiCall(connectionId, 'GET', '/marketplace/billing/charges', { query })

export async function fetchLocationName(connectionId, locationId) {
  try {
    const data = await apiCall(connectionId, 'GET', `/locations/${encodeURIComponent(locationId)}`)
    return data?.location?.name || data?.name || null
  } catch {
    return null
  }
}
