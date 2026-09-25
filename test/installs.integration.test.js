// Integración de las INSTALACIONES AUTOMÁTICAS contra Postgres real (PGlite en proceso) y Redis en memoria,
// con la API de GoHighLevel simulada. Cubre: callback con token de agencia (instalación masiva) y de subcuenta,
// webhooks AppInstall/AppUninstall firmados, rechazo de firmas falsas, duplicados, desconexión manual,
// ausencia de token de agencia y refresh del token de agencia con user_type=Company.
import { test, mock, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// ---- clave de firma de pruebas: el módulo lee GHL_WEBHOOK_PUBLIC_KEY al cargarse ----
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
process.env.GHL_WEBHOOK_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' })
process.env.APP_BASE_URL = 'https://marketplace.test'
process.env.NODE_ENV = 'test'
const sign = (raw) => crypto.sign(null, Buffer.from(raw), privateKey).toString('base64')

// ---- Postgres real en proceso ----
const pg = new PGlite()
const q = (text, params) => pg.query(text, params)
mock.module(new URL('../src/db.js', import.meta.url).href, {
  namedExports: {
    q,
    pool: { query: q, end: async () => {} },
    migrate: async () => {},
    numOr: (v, fb = null) => { if (v === null || v === undefined || v === '') return fb; const n = Number(v); return Number.isFinite(n) ? n : fb },
  },
})

// ---- Redis en memoria (lo que usa el código: set NX/EX/PX, get, del, eval compare-and-delete, incr, expire) ----
const store = new Map()
const alive = (k) => { const e = store.get(k); if (!e) return null; if (e.exp && e.exp < Date.now()) { store.delete(k); return null } return e }
const redis = {
  async set(k, v, ...args) {
    let exp = null; let nx = false
    for (let i = 0; i < args.length; i++) {
      const a = String(args[i]).toUpperCase()
      if (a === 'EX') exp = Date.now() + Number(args[++i]) * 1000
      else if (a === 'PX') exp = Date.now() + Number(args[++i])
      else if (a === 'NX') nx = true
    }
    if (nx && alive(k)) return null
    store.set(k, { v: String(v), exp })
    return 'OK'
  },
  async get(k) { return alive(k)?.v ?? null },
  async del(k) { return store.delete(k) ? 1 : 0 },
  async eval(_script, _n, k, val) { if (alive(k)?.v === String(val)) { store.delete(k); return 1 } return 0 },
  async incr(k) { const n = Number(alive(k)?.v || 0) + 1; store.set(k, { v: String(n), exp: alive(k)?.exp || null }); return n },
  async expire(k, s) { const e = alive(k); if (e) e.exp = Date.now() + s * 1000; return e ? 1 : 0 },
  async ping() { return 'PONG' },
  on() {},
}
mock.module(new URL('../src/redis.js', import.meta.url).href, { namedExports: { redis } })

// ---- GoHighLevel simulado ----
const calls = []
const installed = new Map([['L1', 'Uno'], ['L2', 'Dos'], ['L3', 'Tres']])
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init = {}) => {
  const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url)
  const body = init.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : {}
  calls.push({ method: init.method || 'GET', path: url.pathname, query: Object.fromEntries(url.searchParams), body, auth: init.headers?.Authorization || null })
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  if (url.pathname === '/oauth/token') {
    if (body.grant_type === 'authorization_code' && body.code === 'BULK') {
      return json(200, { access_token: 'AG-1', refresh_token: 'AGR-1', expires_in: 86399, userType: 'Company', companyId: 'COMP', isBulkInstallation: true, scope: 'charges.write oauth.readonly oauth.write' })
    }
    if (body.grant_type === 'authorization_code' && body.code === 'OTRA') {
      return json(200, { access_token: 'X', refresh_token: 'XR', expires_in: 86399, userType: 'Company', companyId: 'OTRA-AGENCIA' })
    }
    if (body.grant_type === 'authorization_code' && body.code === 'LOC') {
      return json(200, { access_token: 'LT-9', refresh_token: 'LR-9', expires_in: 86399, userType: 'Location', companyId: 'COMP', locationId: 'L9' })
    }
    if (body.grant_type === 'refresh_token' && body.user_type === 'Company') {
      return json(200, { access_token: 'AG-2', refresh_token: 'AGR-2', expires_in: 86399, userType: 'Company', companyId: 'COMP', scope: 'charges.write oauth.readonly oauth.write' })
    }
    return json(400, { error: 'invalid_grant' })
  }
  if (url.pathname === '/oauth/installedLocations') {
    return json(200, { locations: [...installed].map(([id, name]) => ({ _id: id, name, isInstalled: true })), count: installed.size })
  }
  if (url.pathname === '/oauth/locationToken') {
    if (!installed.has(body.locationId)) return json(400, { message: 'App no instalada en esa subcuenta' })
    return json(201, { access_token: `LT-${body.locationId}`, refresh_token: `LR-${body.locationId}`, expires_in: 86399, userType: 'Location', companyId: body.companyId, locationId: body.locationId })
  }
  const m = url.pathname.match(/^\/locations\/([^/]+)$/)
  if (m) return json(200, { location: { name: `Subcuenta ${decodeURIComponent(m[1])}` } })
  return json(404, { message: 'no simulado' })
}

let app
before(async () => {
  // esquema real: las mismas migraciones que en producción
  const dir = new URL('../src/migrations/', import.meta.url)
  for (const f of (await readdir(dir)).filter((x) => x.endsWith('.sql')).sort()) {
    await pg.exec(await readFile(new URL(f, dir), 'utf8'))
  }
  await q(`INSERT INTO settings(key, value) VALUES ('ghl_app', $1), ('sso_admins', $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [
    JSON.stringify({ client_id: 'cid', client_secret: 'secret', app_id: 'APP1', company_id: 'COMP' }),
    JSON.stringify({ company_ids: ['COMP'], emails: [] }),
  ])
  // L1 ya conectada a mano; L3 figuraba como instalada pero sin token
  await q(`INSERT INTO connections (location_id, company_id, access_token, refresh_token, token_expires_at, status, name)
           VALUES ('L1','COMP','old','oldr', now() + interval '1 day', 'connected', 'Uno'),
                  ('L3','COMP', NULL, NULL, NULL, 'awaiting', NULL)`)
  const Fastify = (await import('fastify')).default
  const cookie = (await import('@fastify/cookie')).default
  app = Fastify({ logger: false, trustProxy: true })
  await app.register(cookie)
  await app.register((await import('../src/routes/oauth.js')).default)
  await app.register((await import('../src/routes/webhooks.js')).default)
  await app.ready()
})

after(async () => {
  globalThis.fetch = realFetch
  await app?.close()
  await pg.close()
})

const conn = async (loc) => (await q('SELECT * FROM connections WHERE location_id=$1', [loc])).rows[0]
const waitFor = async (fn, ms = 2000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 20)) }
  return false
}
const hook = (payload, { signed = true } = {}) => {
  const raw = JSON.stringify(payload)
  return app.inject({
    method: 'POST', url: '/api/webhooks/app', payload: raw,
    headers: { 'content-type': 'application/json', ...(signed ? { 'x-ghl-signature': sign(raw) } : {}) },
  })
}

test('callback con token de AGENCIA (instalación masiva): guarda el token y conecta todas las subcuentas instaladas', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/oauth/callback?code=BULK', headers: { host: 'marketplace.test' } })
  assert.equal(res.statusCode, 200, res.body)
  assert.match(res.body, /Subcuentas conectadas/)
  const ag = (await q('SELECT * FROM agency_tokens WHERE company_id=$1', ['COMP'])).rows[0]
  assert.equal(ag.access_token, 'AG-1')
  // L1 ya estaba conectada: no se toca; L2 nueva y L3 pendiente → conectadas con su token de subcuenta
  assert.equal((await conn('L1')).access_token, 'old')
  for (const loc of ['L2', 'L3']) {
    const c = await conn(loc)
    assert.equal(c.status, 'connected', loc)
    assert.equal(c.access_token, `LT-${loc}`)
    assert.equal(c.name, installed.get(loc)) // nombre real que devuelve GHL en la lista de instaladas
  }
  assert.equal((await conn('L2')).source, 'sync')
  // el canje usó la URL exacta a la que redirigió GHL
  const tokenCall = calls.find((c) => c.path === '/oauth/token' && c.body.code === 'BULK')
  assert.equal(tokenCall.body.redirect_uri, 'https://marketplace.test/api/oauth/callback')
  const listCall = calls.find((c) => c.path === '/oauth/installedLocations')
  assert.equal(listCall.query.appId, 'APP1')
  assert.equal(listCall.query.companyId, 'COMP')
})

test('callback sin state de otra agencia: se rechaza y no guarda nada', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/oauth/callback?code=OTRA', headers: { host: 'marketplace.test' } })
  assert.equal(res.statusCode, 500)
  assert.match(res.body, /no autorizada/)
  assert.equal((await q('SELECT 1 FROM agency_tokens WHERE company_id=$1', ['OTRA-AGENCIA'])).rows.length, 0)
})

test('callback con token de SUBCUENTA: conexión directa como siempre', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/oauth/callback?code=LOC', headers: { host: 'marketplace.test' } })
  assert.equal(res.statusCode, 200, res.body)
  const c = await conn('L9')
  assert.equal(c.status, 'connected')
  assert.equal(c.source, 'install')
  assert.equal(c.access_token, 'LT-9')
})

test('webhook sin firma o con firma falsa: 401 y no crea nada', async () => {
  let res = await hook({ type: 'INSTALL', appId: 'APP1', companyId: 'COMP', locationId: 'L4' }, { signed: false })
  assert.equal(res.statusCode, 401)
  const raw = JSON.stringify({ type: 'INSTALL', appId: 'APP1', companyId: 'COMP', locationId: 'L4' })
  const fake = crypto.sign(null, Buffer.from(raw), crypto.generateKeyPairSync('ed25519').privateKey).toString('base64')
  res = await app.inject({ method: 'POST', url: '/api/webhooks/app', payload: raw, headers: { 'content-type': 'application/json', 'x-ghl-signature': fake } })
  assert.equal(res.statusCode, 401)
  assert.equal(await conn('L4'), undefined)
})

test('webhook AppInstall de una subcuenta nueva: se conecta sola con el token de agencia', async () => {
  installed.set('L4', 'Cuatro')
  const res = await hook({ type: 'INSTALL', appId: 'APP1', companyId: 'COMP', locationId: 'L4', installType: 'Location', webhookId: 'wh-1' })
  assert.equal(res.statusCode, 200)
  assert.ok(await waitFor(async () => (await conn('L4'))?.status === 'connected'))
  const c = await conn('L4')
  assert.equal(c.source, 'webhook')
  assert.equal(c.access_token, 'LT-L4')
})

test('webhook duplicado (mismo webhookId): se ignora', async () => {
  const before = calls.length
  const res = await hook({ type: 'INSTALL', appId: 'APP1', companyId: 'COMP', locationId: 'L4', webhookId: 'wh-1' })
  assert.equal(res.statusCode, 200)
  assert.equal(JSON.parse(res.body).duplicado, true)
  await new Promise((r) => setTimeout(r, 100))
  assert.equal(calls.length, before)
})

test('webhook de otra app u otra agencia: se ignora', async () => {
  await hook({ type: 'INSTALL', appId: 'OTRA-APP', companyId: 'COMP', locationId: 'L7' })
  await hook({ type: 'INSTALL', appId: 'APP1', companyId: 'OTRA-AGENCIA', locationId: 'L8' })
  await new Promise((r) => setTimeout(r, 150))
  assert.equal(await conn('L7'), undefined)
  assert.equal(await conn('L8'), undefined)
})

test('webhook AppUninstall: queda como desinstalada, sin tokens; al reinstalar se reconecta', async () => {
  await hook({ type: 'UNINSTALL', appId: 'APP1', locationId: 'L2' })
  assert.ok(await waitFor(async () => (await conn('L2'))?.status === 'uninstalled'))
  let c = await conn('L2')
  assert.equal(c.access_token, null)
  assert.equal(c.refresh_token, null)
  assert.ok(c.uninstalled_at)
  await hook({ type: 'INSTALL', appId: 'APP1', companyId: 'COMP', locationId: 'L2' })
  assert.ok(await waitFor(async () => (await conn('L2'))?.status === 'connected'))
  c = await conn('L2')
  assert.equal(c.uninstalled_at, null)
  assert.equal(c.access_token, 'LT-L2')
})

test('desconexión manual: la sincronización la respeta, pero una reinstalación la reconecta', async () => {
  await q(`UPDATE connections SET status='disconnected', access_token=NULL, refresh_token=NULL WHERE location_id='L3'`)
  const { syncInstalledLocations } = await import('../src/lib/installs.js')
  const s = await syncInstalledLocations({})
  assert.ok(s.skipped >= 1)
  assert.equal((await conn('L3')).status, 'disconnected')
  await hook({ type: 'INSTALL', appId: 'APP1', companyId: 'COMP', locationId: 'L3' })
  assert.ok(await waitFor(async () => (await conn('L3'))?.status === 'connected'))
})

test('token de agencia caducado: se refresca con user_type=Company antes de pedir el de la subcuenta', async () => {
  await q(`UPDATE agency_tokens SET token_expires_at = now() - interval '1 hour' WHERE company_id='COMP'`)
  installed.set('L5', 'Cinco')
  await hook({ type: 'INSTALL', appId: 'APP1', companyId: 'COMP', locationId: 'L5' })
  assert.ok(await waitFor(async () => (await conn('L5'))?.status === 'connected'))
  const refresh = calls.find((c) => c.path === '/oauth/token' && c.body.grant_type === 'refresh_token')
  assert.equal(refresh.body.user_type, 'Company')
  assert.equal(refresh.body.refresh_token, 'AGR-1')
  assert.equal((await q('SELECT access_token FROM agency_tokens WHERE company_id=$1', ['COMP'])).rows[0].access_token, 'AG-2')
  const mint = calls.filter((c) => c.path === '/oauth/locationToken').pop()
  assert.equal(mint.auth, 'Bearer AG-2')
})

test('sin token de agencia: la instalación queda listada como «falta token» con el motivo', async () => {
  await q('DELETE FROM agency_tokens')
  await hook({ type: 'INSTALL', appId: 'APP1', companyId: 'COMP', locationId: 'L6' })
  assert.ok(await waitFor(async () => Boolean(await conn('L6'))))
  const c = await conn('L6')
  assert.equal(c.status, 'awaiting')
  assert.match(c.last_error, /Falta el token/)
  // una conexión que ya funciona no se degrada por un aviso de instalación repetido
  await hook({ type: 'INSTALL', appId: 'APP1', companyId: 'COMP', locationId: 'L1' })
  await new Promise((r) => setTimeout(r, 150))
  assert.equal((await conn('L1')).status, 'connected')
})
