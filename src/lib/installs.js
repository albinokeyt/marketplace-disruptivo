// INSTALACIONES AUTOMÁTICAS: que toda subcuenta con la app instalada aparezca sola en Conexiones.
//
// GoHighLevel entrega los tokens de tres formas y aquí se cubren todas:
//   1. Instalación por un usuario de SUBCUENTA → el callback recibe un token de subcuenta (lo de siempre).
//   2. Instalación por un usuario de AGENCIA (GHL fuerza la instalación masiva) → el callback recibe un token de
//      AGENCIA sin locationId. Se guarda, se listan las subcuentas donde está instalada y se pide el token de cada una.
//   3. Instalaciones sin redirección (planes SaaS, «futuras subcuentas», pestaña cerrada…) → llega el webhook
//      AppInstall con el locationId y, con el token de agencia guardado, se pide el de esa subcuenta.
// Además: sincronización periódica (reconciliador) y alta al abrir la app dentro de la subcuenta (SSO).
import { q } from '../db.js'
import { redis } from '../redis.js'
import { getGhlConfig, getSetting } from './settings.js'
import { API, tokenRequest, fetchLocationName } from './ghl.js'
import { SELF_HEAL, isOurCompany, parseInstalledLocations, hasScope } from './installRules.js'

const V_LEGACY = '2021-07-28'
const V3 = 'v3'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const expMs = (row) => (row?.token_expires_at ? new Date(row.token_expires_at).getTime() : 0)
const fresh = (row) => Boolean(row?.access_token) && expMs(row) - Date.now() > 120_000
// endpoint o versión no reconocidos → se prueba la otra variante de la API (legacy ↔ v3)
const fallbackable = (err) => [400, 404, 405, 422].includes(err?.status)

export async function ourCompanyIds() {
  const cfg = await getGhlConfig()
  const admins = (await getSetting('sso_admins')) || {}
  return { cfg, admins, check: (cid) => isOurCompany(cid, cfg, admins) }
}

// ---------- token de AGENCIA ----------
export async function saveAgencyToken(tok) {
  const companyId = String(tok?.companyId || tok?.company_id || '').trim()
  if (!companyId || !tok?.access_token) throw new Error('Token de agencia incompleto (sin companyId)')
  const expiresAt = new Date(Date.now() + ((Number(tok.expires_in) || 86399) - 60) * 1000)
  await q(
    `INSERT INTO agency_tokens (company_id, access_token, refresh_token, token_expires_at, scope, user_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (company_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, agency_tokens.refresh_token),
       token_expires_at = EXCLUDED.token_expires_at,
       scope = COALESCE(EXCLUDED.scope, agency_tokens.scope),
       user_id = COALESCE(EXCLUDED.user_id, agency_tokens.user_id),
       updated_at = now()`,
    [companyId, tok.access_token, tok.refresh_token || null, expiresAt, tok.scope || null, tok.userId || null]
  )
  return companyId
}

export async function agencyTokenInfo(companyId = null) {
  const { rows } = await q(
    `SELECT company_id, scope, token_expires_at, last_sync_at, last_sync_result, created_at, updated_at,
            (refresh_token IS NOT NULL) AS has_refresh
     FROM agency_tokens ${companyId ? 'WHERE company_id=$1' : ''} ORDER BY updated_at DESC`,
    companyId ? [companyId] : []
  )
  return rows.map((r) => ({
    ...r,
    oauth_write: hasScope(r.scope, 'oauth.write'),
    oauth_readonly: hasScope(r.scope, 'oauth.readonly'),
  }))
}

// Refresh token de un solo uso → lock Redis (igual que los de subcuenta en ghl.js)
async function getAgencyAccessToken(companyId) {
  const read = async () => (await q('SELECT * FROM agency_tokens WHERE company_id=$1', [companyId])).rows[0]
  const row = await read()
  if (!row) return null
  if (fresh(row)) return row.access_token
  if (!row.refresh_token) return null

  const lockKey = `agencytok:${companyId}`
  const lockVal = `${Date.now()}-${Math.random()}`
  let locked = false
  for (let i = 0; i < 40; i++) {
    locked = Boolean(await redis.set(lockKey, lockVal, 'PX', 20_000, 'NX'))
    if (locked) break
    await sleep(250)
    const again = await read()
    if (fresh(again)) return again.access_token
  }
  if (!locked) throw new Error('Timeout esperando el refresh del token de agencia')
  try {
    const cur = await read()
    if (!cur) return null
    if (fresh(cur)) return cur.access_token
    const cfg = await getGhlConfig()
    const tok = await tokenRequest({
      grant_type: 'refresh_token',
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
      refresh_token: cur.refresh_token,
      user_type: 'Company',
    })
    await saveAgencyToken({ ...tok, companyId: tok.companyId || companyId })
    return tok.access_token
  } catch (err) {
    // GHL rechazó el refresh (revocado / app desinstalada de la agencia): el token ya no sirve
    if (err.status >= 400 && err.status < 500 && err.status !== 429 && err.status !== 408) {
      await q('DELETE FROM agency_tokens WHERE company_id=$1', [companyId])
    }
    throw err
  } finally {
    await redis.eval(
      `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end`,
      1, lockKey, lockVal
    ).catch(() => {})
  }
}

async function agencyFetch(companyId, method, path, { version = V_LEGACY, query, form } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAgencyAccessToken(companyId)
    if (!token) {
      const e = new Error('No hay token de agencia: instala la app una vez desde el panel de agencia de GHL')
      e.code = 'NO_AGENCY_TOKEN'
      throw e
    }
    const url = new URL(API + path)
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: version,
        Accept: 'application/json',
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: form ? new URLSearchParams(form) : undefined,
      signal: AbortSignal.timeout(20_000),
    })
    const text = await res.text()
    // token de agencia caducado antes de tiempo: forzar refresh y reintentar una vez
    // (no si GHL dice que falta un permiso: refrescar no lo arregla y solo rotaría el token en bucle)
    if (res.status === 401 && attempt === 0 && !/scope/i.test(text)) {
      await q('UPDATE agency_tokens SET token_expires_at=NULL WHERE company_id=$1', [companyId])
      continue
    }
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

// ---------- token de SUBCUENTA a partir del de agencia ----------
export async function mintLocationToken(companyId, locationId) {
  const form = { companyId, locationId }
  let tok
  try {
    tok = await agencyFetch(companyId, 'POST', '/oauth/locationToken', { version: V_LEGACY, form })
  } catch (err) {
    if (!fallbackable(err)) throw err
    tok = await agencyFetch(companyId, 'POST', '/oauth/location-token', { version: V3, form })
  }
  if (!tok?.access_token) throw new Error('GHL no devolvió el token de la subcuenta')
  return { ...tok, locationId: tok.locationId || locationId, companyId: tok.companyId || companyId }
}

// ---------- subcuentas donde está instalada la app ----------
export async function listInstalledLocations(companyId) {
  const cfg = await getGhlConfig()
  if (!cfg.app_id) throw new Error('Falta el App ID de la app de GHL en Configuración')
  const found = new Map()
  const add = (arr) => { for (const l of arr) if (!found.has(l.locationId)) found.set(l.locationId, l.name) }
  try {
    for (let page = 0, skip = 0; page < 30; page++, skip += 100) {
      const d = await agencyFetch(companyId, 'GET', '/oauth/installedLocations', {
        version: V_LEGACY, query: { companyId, appId: cfg.app_id, isInstalled: true, limit: 100, skip },
      })
      const arr = parseInstalledLocations(d)
      add(arr)
      const raw = Array.isArray(d?.locations) ? d.locations.length : Array.isArray(d?.items) ? d.items.length : 0
      if (raw < 100) break
    }
    return [...found].map(([locationId, name]) => ({ locationId, name }))
  } catch (err) {
    if (!fallbackable(err)) throw err
  }
  let pageToken
  for (let page = 0; page < 30; page++) {
    const d = await agencyFetch(companyId, 'GET', '/oauth/installed-locations', {
      version: V3, query: { companyId, appId: cfg.app_id, isInstalled: true, pageSize: 100, pageToken },
    })
    add(parseInstalledLocations(d))
    pageToken = d?.pagination?.nextPageToken || d?.nextPageToken || null
    if (!d?.pagination?.hasNextPage || !pageToken) break
  }
  return [...found].map(([locationId, name]) => ({ locationId, name }))
}

// ---------- conexiones ----------
export async function upsertConnectionFromToken(tok, { source = 'install', refreshName = false, nameHint = null } = {}) {
  const locationId = String(tok?.locationId || '').trim()
  if (!locationId) throw new Error('El token no trae locationId')
  const expiresAt = new Date(Date.now() + ((Number(tok.expires_in) || 3600) - 60) * 1000)
  const { rows: [conn] } = await q(
    `INSERT INTO connections (location_id, company_id, access_token, refresh_token, token_expires_at, status,
                              source, installed_at, last_error, name)
     VALUES ($1,$2,$3,$4,$5,'connected',$6, now(), NULL, $7)
     ON CONFLICT (location_id) DO UPDATE SET
       company_id = COALESCE(EXCLUDED.company_id, connections.company_id),
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       token_expires_at = EXCLUDED.token_expires_at,
       status = 'connected',
       last_error = NULL,
       uninstalled_at = NULL,
       installed_at = COALESCE(connections.installed_at, now()),
       source = COALESCE(connections.source, EXCLUDED.source),
       name = COALESCE(connections.name, EXCLUDED.name),
       updated_at = now()
     RETURNING *`,
    [locationId, tok.companyId || null, tok.access_token, tok.refresh_token || null, expiresAt, source, nameHint]
  )
  if (refreshName || !conn.name) {
    const name = await fetchLocationName(conn.id, locationId)
    if (name && name !== conn.name) {
      await q('UPDATE connections SET name=$1, updated_at=now() WHERE id=$2', [name, conn.id])
      conn.name = name
    }
  }
  return conn
}

// La app está instalada pero aún no hay token: se lista igualmente (status 'awaiting') con el motivo.
// No degrada una conexión que ya funciona ni pisa la desconexión manual del administrador.
async function markAwaiting(locationId, companyId, source, motivo, nameHint = null) {
  const { rows: [conn] } = await q(
    `INSERT INTO connections (location_id, company_id, status, source, installed_at, last_error, name)
     VALUES ($1,$2,'awaiting',$3, now(), $4, $5)
     ON CONFLICT (location_id) DO UPDATE SET
       company_id = COALESCE(connections.company_id, EXCLUDED.company_id),
       status = CASE WHEN connections.status IN ('connected','error') THEN connections.status ELSE 'awaiting' END,
       last_error = EXCLUDED.last_error,
       uninstalled_at = CASE WHEN connections.status IN ('connected','error') THEN connections.uninstalled_at ELSE NULL END,
       name = COALESCE(connections.name, EXCLUDED.name),
       updated_at = now()
     RETURNING *`,
    [locationId, companyId || null, source, String(motivo || '').slice(0, 500), nameHint]
  )
  return conn
}

// Garantiza que la subcuenta esté conectada. Devuelve { conn, action } con action:
// 'ya-conectada' | 'creada' | 'reparada' | 'pendiente' (sin token de agencia) | 'desconectada-a-mano' | 'en-curso'
export async function ensureConnection(locationId, { companyId = null, source = 'sync', reconnectDisconnected = false, nameHint = null } = {}) {
  const loc = String(locationId || '').trim()
  if (!loc) throw new Error('Falta locationId')
  const read = async () => (await q('SELECT * FROM connections WHERE location_id=$1', [loc])).rows[0]
  const row = await read()
  if (row && row.status === 'connected' && row.refresh_token) return { conn: row, action: 'ya-conectada' }
  if (row && row.status === 'disconnected' && !reconnectDisconnected) return { conn: row, action: 'desconectada-a-mano' }

  const { cfg, check } = await ourCompanyIds()
  const cid = String(companyId || row?.company_id || cfg.company_id || '').trim()
  if (!cid || !check(cid)) throw new Error('La subcuenta no pertenece a la agencia configurada')

  // una sola petición de token por subcuenta a la vez (callback, webhook, sincronización y SSO pueden coincidir)
  const lockKey = `ensureconn:${loc}`
  if (!(await redis.set(lockKey, '1', 'PX', 30_000, 'NX'))) {
    for (let i = 0; i < 20; i++) {
      await sleep(500)
      const again = await read()
      if (again?.status === 'connected' && again.refresh_token) return { conn: again, action: 'ya-conectada' }
    }
    return { conn: (await read()) || row || null, action: 'en-curso' }
  }
  try {
    const { rows: [agency] } = await q('SELECT company_id FROM agency_tokens WHERE company_id=$1', [cid])
    if (!agency) {
      const conn = await markAwaiting(loc, cid, source, 'Instalada en GHL. Falta el token: instala la app una vez desde el panel de agencia de GHL o usa «Conectar subcuenta».', nameHint)
      return { conn, action: 'pendiente' }
    }
    try {
      const tok = await mintLocationToken(cid, loc)
      const conn = await upsertConnectionFromToken(tok, { source, nameHint })
      return { conn, action: row && row.status !== 'awaiting' ? 'reparada' : 'creada' }
    } catch (err) {
      const scopeHint = /scope|not authorized|unauthorized/i.test(err.message) || err.status === 401 || err.status === 403
        ? ' (¿falta el permiso oauth.write en la app de GHL?)' : ''
      err.conn = await markAwaiting(loc, cid, source, `No se pudo obtener el token de la subcuenta: ${err.message}${scopeHint}`, nameHint)
      throw err
    }
  } finally {
    await redis.del(lockKey).catch(() => {})
  }
}

// Recorre las subcuentas donde está instalada la app (por cada token de agencia guardado) y conecta las que falten.
// Nunca marca nada como desinstalado por no aparecer (un fallo de la API vaciaría la lista): eso lo hace el webhook.
export async function syncInstalledLocations({ companyId = null, log, maxMints = 50 } = {}) {
  const agencies = await agencyTokenInfo(companyId)
  const summary = { agencies: agencies.length, installed: 0, created: [], repaired: [], pending: [], failed: [], skipped: 0 }
  for (const a of agencies) {
    let locs
    try {
      locs = await listInstalledLocations(a.company_id)
    } catch (err) {
      summary.failed.push({ companyId: a.company_id, error: err.message })
      await q('UPDATE agency_tokens SET last_sync_at=now(), last_sync_result=$2 WHERE company_id=$1',
        [a.company_id, JSON.stringify({ error: err.message })]).catch(() => {})
      continue
    }
    summary.installed += locs.length
    const { rows: existing } = await q(
      'SELECT location_id, status, refresh_token FROM connections WHERE location_id = ANY($1)',
      [locs.map((l) => l.locationId)]
    )
    const byLoc = new Map(existing.map((r) => [r.location_id, r]))
    let mints = 0
    for (const l of locs) {
      const r = byLoc.get(l.locationId)
      if (r && r.status === 'connected' && r.refresh_token) continue
      if (r && r.status === 'disconnected') { summary.skipped++; continue }
      if (r && !SELF_HEAL.includes(r.status) && r.status !== 'connected') { summary.skipped++; continue }
      if (mints++ >= maxMints) break
      try {
        const res = await ensureConnection(l.locationId, { companyId: a.company_id, source: 'sync', nameHint: l.name })
        const item = { locationId: l.locationId, name: res.conn?.alias || res.conn?.name || l.name || null }
        if (res.action === 'creada') summary.created.push(item)
        else if (res.action === 'reparada') summary.repaired.push(item)
        else if (res.action === 'pendiente') summary.pending.push(item)
      } catch (err) {
        summary.failed.push({ locationId: l.locationId, name: l.name || null, error: err.message })
        // si falta un permiso en la app de GHL fallarán todas igual: no seguir llamando
        if (/scope|not authorized/i.test(err.message) || err.status === 403) break
      }
    }
    await q('UPDATE agency_tokens SET last_sync_at=now(), last_sync_result=$2 WHERE company_id=$1', [a.company_id, JSON.stringify({
      installed: locs.length, created: summary.created.length, repaired: summary.repaired.length, failed: summary.failed.length,
    })]).catch(() => {})
  }
  if (summary.created.length || summary.repaired.length || summary.failed.length) {
    log?.info?.({ created: summary.created, repaired: summary.repaired, failed: summary.failed }, 'instalaciones: sincronización')
  }
  return summary
}

// Webhook de GHL (AppInstall / AppUninstall) ya verificado. Idempotente.
export async function handleAppEvent(p, log) {
  const { cfg, check } = await ourCompanyIds()
  if (cfg.app_id && p?.appId && String(p.appId) !== String(cfg.app_id)) return { ignored: 'otra app' }
  const type = String(p?.type || '').toUpperCase()
  const cid = String(p?.companyId || '').trim()
  const loc = String(p?.locationId || '').trim()

  if (type === 'INSTALL') {
    if (cid && !check(cid)) return { ignored: 'otra agencia' }
    if (loc) {
      const r = await ensureConnection(loc, { companyId: cid || null, source: 'webhook', reconnectDisconnected: true })
      log?.info?.({ locationId: loc, action: r.action }, 'instalaciones: AppInstall')
      return { action: r.action }
    }
    // instalación a nivel agencia: si ya hay token, se sincronizan sus subcuentas
    if (cid) {
      const { rows: [a] } = await q('SELECT 1 FROM agency_tokens WHERE company_id=$1', [cid])
      if (a) return { action: 'sync', ...(await syncInstalledLocations({ companyId: cid, log })) }
    }
    return { action: 'sin-token-agencia' }
  }

  if (type === 'UNINSTALL') {
    if (loc) {
      await q(
        `UPDATE connections SET status='uninstalled', uninstalled_at=now(), access_token=NULL, refresh_token=NULL,
         token_expires_at=NULL, updated_at=now() WHERE location_id=$1`,
        [loc]
      )
      log?.info?.({ locationId: loc }, 'instalaciones: AppUninstall')
      return { action: 'desinstalada' }
    }
    if (cid) {
      await q('DELETE FROM agency_tokens WHERE company_id=$1', [cid])
      return { action: 'agencia-desinstalada' }
    }
  }
  return { ignored: type || 'sin tipo' }
}
