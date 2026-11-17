// Integración de GET /api/v1/finanzas contra Postgres real (PGlite) y Redis en memoria: permiso por app
// (can_read_finances), alcance por subcuenta, regla «cortesía primero» sobre el libro real, rango por día local
// en la zona pedida, y el arreglo del panel de Créditos (la recarga con tarjeta es dinero recargado, no cortesía).
import { test, mock, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

process.env.APP_BASE_URL = 'https://marketplace.test'
process.env.NODE_ENV = 'test'

// ---- Postgres real en proceso ----
const pg = new PGlite()
const q = (text, params) => pg.query(text, params)
let txQueue = Promise.resolve()
const pool = {
  query: q,
  end: async () => {},
  connect: async () => {
    let release
    const turn = new Promise((r) => { release = r })
    const prev = txQueue
    txQueue = prev.then(() => turn)
    await prev
    return { query: q, release: () => release() }
  },
}
mock.module(new URL('../src/db.js', import.meta.url).href, {
  namedExports: {
    q, pool, migrate: async () => {},
    numOr: (v, fb = null) => { if (v === null || v === undefined || v === '') return fb; const n = Number(v); return Number.isFinite(n) ? n : fb },
  },
})

// ---- Redis en memoria (rate limit y sesión del admin) ----
const store = new Map()
const redis = {
  async set(k, v) { store.set(k, String(v)); return 'OK' },
  async get(k) { return store.get(k) ?? null },
  async del(k) { return store.delete(k) ? 1 : 0 },
  async eval() { return 1 },
  async incr() { return 1 },
  async expire() { return 1 },
  async ping() { return 'PONG' },
  on() {},
}
mock.module(new URL('../src/redis.js', import.meta.url).href, { namedExports: { redis } })

// ---- sin red: ninguna de estas rutas debe salir a GHL ni a Stripe ----
const realFetch = globalThis.fetch
globalThis.fetch = async () => { throw new Error('fetch no esperado en este test') }

const KEY_LECTORA = 'dw_' + 'a'.repeat(48) // puede leer finanzas, todas las subcuentas
const KEY_SIN_PERMISO = 'dw_' + 'b'.repeat(48) // no puede leer finanzas
const KEY_ACOTADA = 'dw_' + 'c'.repeat(48) // puede leer, solo L1
const ADMIN = 'tok-admin'
let app, lectora, otraApp, acotada, sinPermiso

const get = (url, key = KEY_LECTORA) => app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${key}` } })
const admin = (method, url, payload) => app.inject({ method, url, payload, headers: { cookie: `dw_session=${ADMIN}` } })

before(async () => {
  const dir = new URL('../src/migrations/', import.meta.url)
  for (const f of (await readdir(dir)).filter((x) => x.endsWith('.sql')).sort()) await pg.exec(await readFile(new URL(f, dir), 'utf8'))
  const { hashKey } = await import('../src/lib/crypto.js')
  const nueva = async (name, key, { lee = false } = {}) => {
    const { rows: [a] } = await q(`INSERT INTO apps (name, key_prefix, key_hash, status) VALUES ($1, 'dw_…', $2, 'active') RETURNING *`, [name, hashKey(key)])
    assert.equal(a.can_read_finances, false) // por defecto ninguna app puede leer finanzas
    if (lee) await q('UPDATE apps SET can_read_finances = true WHERE id=$1', [a.id])
    return a
  }
  lectora = await nueva('Hermes', KEY_LECTORA, { lee: true })
  sinPermiso = await nueva('Sin permiso', KEY_SIN_PERMISO)
  acotada = await nueva('Acotada', KEY_ACOTADA, { lee: true })
  await q(`UPDATE apps SET allowed_location_ids='["L1"]'::jsonb WHERE id=$1`, [acotada.id])
  otraApp = (await q(`INSERT INTO apps (name, key_prefix, key_hash, status) VALUES ('Otra','dw_…','h-otra','active') RETURNING *`)).rows[0]

  await q(`INSERT INTO connections (location_id, company_id, status, name, alias) VALUES
           ('L1','COMP','connected','Uno', 'Clínica Uno'), ('L2','COMP','connected','Dos', ''), ('L3','COMP','connected','Tres', NULL)`)

  // cargos (los consumos del libro apuntan a ellos)
  const cargo = async (appId, loc, eventId, amount, paidWith, status, createdAt) => (await q(
    `INSERT INTO charges (app_id, location_id, event_id, units, amount, status, paid_with, created_at)
     VALUES ($1,$2,$3,1,$4,$5,$6,$7) RETURNING id`, [appId, loc, eventId, amount, status, paidWith, createdAt])).rows[0].id
  const cH1 = await cargo(lectora.id, 'L1', 'h1', 8, 'credit', 'created', '2026-10-31T23:30:00Z') // 1-nov en Madrid
  const cO1 = await cargo(otraApp.id, 'L1', 'o1', 1, 'credit', 'refunded', '2026-11-05T10:00:00Z')
  await cargo(lectora.id, 'L3', 'h-wallet', 4.5, 'wallet', 'created', '2026-11-10T10:00:00Z') // monedero: no pasa por el saldo
  await cargo(lectora.id, 'L3', 'h-wallet-fallido', 9, 'wallet', 'failed', '2026-11-10T11:00:00Z') // no cuenta
  const { rows: [ct] } = await q(`INSERT INTO card_topups (location_id, amount, status) VALUES ('L1', 20, 'paid') RETURNING id`)

  // libro de L1: cortesía 5 (oct) + tarjeta 20 (oct) → consumo Hermes 8 (5 cortesía + 3 real) → consumo de otra app 1 y su reembolso
  const entrada = (loc, amount, reason, chargeId, topupId, createdAt) => q(
    `INSERT INTO credit_entries (location_id, amount, reason, charge_id, card_topup_id, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
    [loc, amount, reason, chargeId, topupId, createdAt])
  await entrada('L1', 5, 'promo de bienvenida', null, null, '2026-10-10T10:00:00Z')
  await entrada('L1', 20, 'recarga con tarjeta', null, ct.id, '2026-10-12T10:00:00Z')
  await entrada('L1', -8, 'consumo de cobro', cH1, null, '2026-10-31T23:30:00Z')
  await entrada('L1', -1, 'consumo de cobro', cO1, null, '2026-11-05T10:00:00Z')
  await entrada('L1', 1, `reembolso del cargo #${cO1}`, cO1, null, '2026-11-06T10:00:00Z')
  await q(`INSERT INTO credits (location_id, balance) VALUES ('L1', 17)`)
  // L2: solo cortesía, y el saldo registrado NO cuadra con el libro (descuadre)
  await entrada('L2', 3, null, null, null, '2026-11-02T10:00:00Z')
  await q(`INSERT INTO credits (location_id, balance) VALUES ('L2', 2.5)`)

  // sesión de administrador para las rutas del panel
  store.set(`sess:${ADMIN}`, JSON.stringify({ userId: 'root', role: 'admin' }))

  const Fastify = (await import('fastify')).default
  app = Fastify({ logger: false })
  await app.register((await import('@fastify/cookie')).default)
  await app.register((await import('../src/routes/admin.js')).default)
  await app.register((await import('../src/routes/marketplace.js')).default)
  await app.register((await import('../src/routes/publicApi.js')).default)
  await app.ready()
})

after(async () => {
  globalThis.fetch = realFetch
  await app?.close()
  await pg.close()
})

test('sin permiso de finanzas: 403 FINANCES_NOT_ALLOWED', async () => {
  const res = await get('/api/v1/finanzas', KEY_SIN_PERMISO)
  assert.equal(res.statusCode, 403)
  assert.equal(res.json().code, 'FINANCES_NOT_ALLOWED')
})

test('sin API key: 401', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/v1/finanzas' })
  assert.equal(res.statusCode, 401)
})

test('subcuenta fuera del alcance de la API key: 403 LOCATION_NOT_ALLOWED', async () => {
  const res = await get('/api/v1/finanzas?location_id=L2', KEY_ACOTADA)
  assert.equal(res.statusCode, 403)
  assert.equal(res.json().code, 'LOCATION_NOT_ALLOWED')
})

test('200: saldo por bolsas con «cortesía primero», histórico, nombres y totales', async () => {
  const res = await get('/api/v1/finanzas')
  assert.equal(res.statusCode, 200, res.body)
  const d = res.json()
  assert.equal(d.regla, 'cortesia_primero')
  assert.equal(d.moneda, 'USD')
  assert.equal(d.zona, 'UTC')
  assert.equal(d.zona_valida, true)
  assert.equal(d.desde, null)
  assert.equal(d.hasta, null)
  // solo subcuentas con movimientos en el libro o cargos de la app por monedero
  assert.deepEqual(d.locations.map((l) => l.location_id).sort(), ['L1', 'L2', 'L3'])

  const l1 = d.locations.find((l) => l.location_id === 'L1')
  assert.equal(l1.name, 'Clínica Uno')
  assert.deepEqual(l1.saldo, { total: 17, cortesia: 0, real: 17, registrado: 17, descuadre: false })
  assert.equal(l1.rango, null)
  assert.deepEqual(l1.historico, {
    cortesia_concedida: 5, cortesia_retirada: 0,
    real_tarjeta: 20, real_monedero: 0, real_revertido: 0, real_retirado: 0, real_recargado: 20,
    consumo_total: 8, consumo_app: 8, consumo_app_cortesia: 5, consumo_app_real: 3, reembolsos_app: 0,
    consumo_otras_apps: 0, otros: 0, cobrado_monedero_app: 0,
  })

  const l2 = d.locations.find((l) => l.location_id === 'L2')
  assert.equal(l2.name, 'Dos') // alias vacío → nombre
  assert.deepEqual(l2.saldo, { total: 3, cortesia: 3, real: 0, registrado: 2.5, descuadre: true })

  const l3 = d.locations.find((l) => l.location_id === 'L3')
  assert.equal(l3.name, 'Tres')
  assert.equal(l3.historico.cobrado_monedero_app, 4.5) // el cargo fallido no cuenta
  assert.deepEqual(l3.saldo, { total: 0, cortesia: 0, real: 0, registrado: 0, descuadre: false })

  assert.deepEqual(d.totales.saldo, { total: 20, cortesia: 3, real: 17, registrado: 19.5 })
  assert.equal(d.totales.historico.cortesia_concedida, 8)
  assert.equal(d.totales.historico.consumo_app, 8)
  assert.equal(d.totales.historico.cobrado_monedero_app, 4.5)
  assert.equal(d.totales.rango, null)
})

test('rango por día LOCAL: en Madrid el consumo de las 23:30 UTC del 31-oct cae en noviembre', async () => {
  const madrid = (await get('/api/v1/finanzas?location_id=L1&desde=2026-11-01&hasta=2026-11-30&zona=Europe/Madrid')).json()
  assert.equal(madrid.zona, 'Europe/Madrid')
  assert.equal(madrid.zona_valida, true)
  assert.equal(madrid.desde, '2026-11-01')
  assert.equal(madrid.hasta, '2026-11-30')
  assert.equal(madrid.locations.length, 1)
  const r = madrid.locations[0].rango
  assert.equal(r.consumo_app, 8)
  assert.equal(r.consumo_app_cortesia, 5) // pagado con la cortesía de octubre (historial previo)
  assert.equal(r.consumo_app_real, 3)
  assert.equal(r.cortesia_concedida, 0)
  assert.equal(r.real_recargado, 0)
  assert.deepEqual(madrid.totales.rango, r)

  // en UTC ese consumo es del 31-oct: fuera de noviembre
  const utc = (await get('/api/v1/finanzas?location_id=L1&desde=2026-11-01&hasta=2026-11-30')).json()
  assert.equal(utc.locations[0].rango.consumo_app, 0)
  // el reembolso de la otra app sí cae en noviembre en ambas zonas: neto 0
  assert.equal(utc.locations[0].rango.consumo_otras_apps, 0)
})

test('solo «desde»: hasta hoy (hasta = null en la respuesta)', async () => {
  const d = (await get('/api/v1/finanzas?location_id=L1&desde=2026-10-11')).json()
  assert.equal(d.hasta, null)
  assert.equal(d.locations[0].rango.cortesia_concedida, 0)
  assert.equal(d.locations[0].rango.real_tarjeta, 20)
})

test('zona inválida: se responde en UTC con zona_valida:false', async () => {
  const d = (await get('/api/v1/finanzas?zona=Marte/Olimpo')).json()
  assert.equal(d.zona, 'UTC')
  assert.equal(d.zona_valida, false)
})

test('zona que Postgres no reconoce (tzdata distinta a la de Node): respaldo a UTC con zona_valida:false', async () => {
  const { leerFinanzas } = await import('../src/lib/finanzas.js')
  const d = await leerFinanzas({ appId: lectora.id, locationIds: ['L1'], zona: 'Marte/Olimpo', zonaValida: true })
  assert.equal(d.zona, 'UTC')
  assert.equal(d.zona_valida, false)
  assert.equal(d.locations[0].saldo.total, 17)
})

test('fechas mal escritas o al revés: 400', async () => {
  const a = await get('/api/v1/finanzas?desde=01-11-2026')
  assert.equal(a.statusCode, 400)
  assert.equal(a.json().code, 'INVALID_DATE')
  const b = await get('/api/v1/finanzas?desde=2026-11-30&hasta=2026-11-01')
  assert.equal(b.statusCode, 400)
  assert.equal(b.json().code, 'INVALID_RANGE')
})

test('API key acotada: sin location_id solo ve sus subcuentas', async () => {
  const d = (await get('/api/v1/finanzas', KEY_ACOTADA)).json()
  assert.deepEqual(d.locations.map((l) => l.location_id), ['L1'])
  // y desde ESA app el consumo de Hermes es de «otras apps»
  assert.equal(d.locations[0].historico.consumo_app, 0)
  assert.equal(d.locations[0].historico.consumo_otras_apps, 8)
})

test('subcuenta permitida sin movimientos: lista vacía y totales a cero', async () => {
  const d = (await get('/api/v1/finanzas?location_id=SIN-MOVIMIENTOS')).json()
  assert.deepEqual(d.locations, [])
  assert.deepEqual(d.totales.saldo, { total: 0, cortesia: 0, real: 0, registrado: 0 })
  assert.equal(d.totales.historico.consumo_total, 0)
})

test('panel: PATCH can_read_finances activa y corta el permiso (y el listado lo devuelve)', async () => {
  const off = await admin('PATCH', `/api/admin/apps/${lectora.id}`, { can_read_finances: false })
  assert.equal(off.statusCode, 200, off.body)
  assert.equal(off.json().app.can_read_finances, false)
  assert.equal((await get('/api/v1/finanzas')).statusCode, 403)
  const mal = await admin('PATCH', `/api/admin/apps/${lectora.id}`, { can_read_finances: 'sí' })
  assert.equal(mal.statusCode, 400)
  const on = await admin('PATCH', `/api/admin/apps/${lectora.id}`, { can_read_finances: true })
  assert.equal(on.json().app.can_read_finances, true)
  assert.equal((await get('/api/v1/finanzas')).statusCode, 200)
  const lista = (await admin('GET', '/api/admin/apps')).json().apps
  assert.equal(lista.find((a) => a.id === lectora.id).can_read_finances, true)
  assert.equal(lista.find((a) => a.id === sinPermiso.id).can_read_finances, false)
})

test('panel de Créditos: la recarga con tarjeta cuenta como recargado, no como cortesía concedida', async () => {
  const res = await admin('GET', '/api/admin/credits')
  assert.equal(res.statusCode, 200, res.body)
  const l1 = res.json().credits.find((c) => c.location_id === 'L1')
  assert.equal(l1.granted, 5)
  assert.equal(l1.topups, 20)
  const mov = (await admin('GET', '/api/admin/credits/L1/entries')).json().entries
  assert.ok(mov.some((e) => e.card_topup_id !== null && e.reason === 'recarga con tarjeta'))
})
