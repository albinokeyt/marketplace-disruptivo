// Integración del «MONEDERO PROPIO VERIFICADO» contra Postgres real (PGlite) y Redis en memoria, con GoHighLevel
// simulado. GHL cobra los cargos de la app al monedero de la AGENCIA salvo que la subcuenta tenga la reventa con
// refacturación: sin la marca wallet_ok el marketplace NO puede llamar a GHL para cobrar (recarga, API de cobros,
// compra de planes ni renovaciones) y todo se paga con el crédito ya recargado.
import { test, mock, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

process.env.APP_BASE_URL = 'https://marketplace.test'
process.env.NODE_ENV = 'test'

// ---- Postgres real en proceso (con transacciones reales para pool.connect) ----
const pg = new PGlite()
const q = (text, params) => pg.query(text, params)
let txQueue = Promise.resolve()
const pool = {
  query: q,
  end: async () => {},
  // PGlite es una sola conexión: las transacciones se serializan para que BEGIN/COMMIT no se mezclen
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
    q,
    pool,
    migrate: async () => {},
    numOr: (v, fb = null) => { if (v === null || v === undefined || v === '') return fb; const n = Number(v); return Number.isFinite(n) ? n : fb },
  },
})

// ---- Redis en memoria ----
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
  async eval(_s, _n, k, val) { if (alive(k)?.v === String(val)) { store.delete(k); return 1 } return 0 },
  async incr(k) { const n = Number(alive(k)?.v || 0) + 1; store.set(k, { v: String(n), exp: alive(k)?.exp || null }); return n },
  async expire(k, s) { const e = alive(k); if (e) e.exp = Date.now() + s * 1000; return e ? 1 : 0 },
  async ping() { return 'PONG' },
  on() {},
}
mock.module(new URL('../src/redis.js', import.meta.url).href, { namedExports: { redis } })

// ---- GoHighLevel simulado: registra cada llamada de cobro ----
const ghlCalls = []
let nextCharge = 1
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init = {}) => {
  const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url)
  const method = init.method || 'GET'
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  if (url.pathname.startsWith('/marketplace/billing/charges')) {
    ghlCalls.push({ method, path: url.pathname, body: init.body ? JSON.parse(String(init.body)) : null })
    if (url.pathname === '/marketplace/billing/charges/has-funds') return json(200, { hasFunds: true })
    if (method === 'POST') return json(201, { chargeId: `ghl-${nextCharge++}` })
    if (method === 'GET') return json(200, { data: [] })
  }
  return json(404, { message: 'no simulado' })
}
const cobrosGhl = () => ghlCalls.filter((c) => c.method === 'POST' && c.path === '/marketplace/billing/charges')
const fondosGhl = () => ghlCalls.filter((c) => c.path === '/marketplace/billing/charges/has-funds')

const API_KEY = 'dw_' + 'k'.repeat(48)
let app, topup, billing, credits, consumerId, planId

before(async () => {
  const dir = new URL('../src/migrations/', import.meta.url)
  for (const f of (await readdir(dir)).filter((x) => x.endsWith('.sql')).sort()) {
    await pg.exec(await readFile(new URL(f, dir), 'utf8'))
  }
  await q(`INSERT INTO settings(key, value) VALUES ('ghl_app', $1), ('subscription_billing', $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [
    JSON.stringify({ client_id: 'cid', client_secret: 'secret', app_id: 'APP1', company_id: 'COMP' }),
    JSON.stringify({ enabled: true, meter_code: 'suscripcion', max_retries: 10, grace_days: 3 }),
  ])
  await q(`INSERT INTO meters (code, ghl_meter_id, name, price_type, default_price, min_price, max_price) VALUES
           ('recarga-saldo','M-REC','Recarga','fixed',1,NULL,NULL),
           ('consumo','M-CON','Consumo','fixed',0.5,NULL,NULL),
           ('suscripcion','M-SUB','Suscripción','dynamic',49,0.01,50)`)
  // L1 y L2 SIN monedero propio verificado (lo normal hasta que el admin lo compruebe); L3 verificada
  await q(`INSERT INTO connections (location_id, company_id, access_token, refresh_token, token_expires_at, status, name, wallet_ok)
           VALUES ('L1','COMP','t1','r1', now() + interval '1 day','connected','Uno', false),
                  ('L2','COMP','t2','r2', now() + interval '1 day','connected','Dos', false),
                  ('L3','COMP','t3','r3', now() + interval '1 day','connected','Tres', true)`)
  const { hashKey } = await import('../src/lib/crypto.js')
  const { rows: [a] } = await q(`INSERT INTO apps (name, key_prefix, key_hash, status) VALUES ('Consumidora','dw_k…',$1,'active') RETURNING id`, [hashKey(API_KEY)])
  consumerId = a.id
  const { rows: [p] } = await q(`INSERT INTO plans (name, app_ids, visible, active, price, period_months)
                                 VALUES ('Pro', $1, true, true, 29, 1) RETURNING id`, [JSON.stringify([consumerId])])
  planId = p.id

  topup = await import('../src/lib/topup.js')
  billing = await import('../src/lib/billing.js')
  credits = await import('../src/lib/credits.js')
  const Fastify = (await import('fastify')).default
  app = Fastify({ logger: false })
  await app.register((await import('../src/routes/publicApi.js')).default)
  await app.ready()
})

after(async () => {
  globalThis.fetch = realFetch
  await app?.close()
  await pg.close()
})

const charge = (body) => app.inject({ method: 'POST', url: '/api/v1/charges', headers: { authorization: `Bearer ${API_KEY}` }, payload: body })

test('recarga SIN monedero propio verificado: se rechaza con aviso claro y no se llama a GHL', async () => {
  const antes = cobrosGhl().length
  await assert.rejects(
    topup.createTopup({ locationId: 'L1', amount: 10 }),
    (err) => err.statusCode === 409 && err.code === 'WALLET_NOT_ENABLED' && /no ha activado la recarga/.test(err.message),
  )
  assert.equal(cobrosGhl().length, antes)
  const { rows } = await q(`SELECT 1 FROM charges WHERE location_id='L1' AND kind='topup'`)
  assert.equal(rows.length, 0)
  assert.equal(await credits.getBalance('L1'), 0)
})

test('recarga CON monedero propio verificado: cobra en GHL (meter de recarga) y abona el crédito', async () => {
  const r = await topup.createTopup({ locationId: 'L3', amount: 10 })
  assert.equal(r.credited, true)
  const ultimo = cobrosGhl().at(-1)
  assert.equal(ultimo.body.meterId, 'M-REC')
  assert.equal(ultimo.body.locationId, 'L3')
  assert.equal(ultimo.body.units, 10)
  assert.equal(await credits.getBalance('L3'), 10)
})

test('API de cobros SIN monedero propio y sin crédito: 402 INSUFFICIENT_CREDIT y GHL no se toca', async () => {
  const antes = cobrosGhl().length
  const res = await charge({ location_id: 'L2', meter: 'consumo', units: 1, event_id: 'ev-sin-saldo' })
  assert.equal(res.statusCode, 402, res.body)
  assert.equal(res.json().code, 'INSUFFICIENT_CREDIT')
  assert.equal(cobrosGhl().length, antes)
})

test('API de cobros SIN monedero propio pero con crédito: se paga con crédito, nunca con el monedero', async () => {
  await credits.grantCredit('L2', 5, 'prueba')
  const antes = cobrosGhl().length
  const res = await charge({ location_id: 'L2', meter: 'consumo', units: 2, event_id: 'ev-con-saldo' })
  assert.equal(res.statusCode, 201, res.body)
  assert.equal(res.json().charge.paid_with, 'credit')
  assert.equal(cobrosGhl().length, antes)
  assert.equal(await credits.getBalance('L2'), 4)
})

test('API de cobros: el reintento del mismo event_id sin saldo tampoco va al monedero; con saldo se paga con crédito', async () => {
  // L1 sin crédito: el primer intento falla (402) y el reintento, ya con saldo, se cobra del crédito
  const r1 = await charge({ location_id: 'L1', meter: 'consumo', units: 1, event_id: 'ev-reintento' })
  assert.equal(r1.statusCode, 402)
  await credits.grantCredit('L1', 1, 'prueba')
  const antes = cobrosGhl().length
  const r2 = await charge({ location_id: 'L1', meter: 'consumo', units: 1, event_id: 'ev-reintento' })
  assert.equal(r2.statusCode, 201, r2.body)
  assert.equal(r2.json().charge.paid_with, 'credit')
  assert.equal(cobrosGhl().length, antes)
})

test('API de cobros CON monedero propio y sin crédito: va al monedero de GHL como antes', async () => {
  const antes = cobrosGhl().length
  const res = await charge({ location_id: 'L3', meter: 'consumo', units: 30, event_id: 'ev-wallet' }) // 15 USD > 10 de crédito
  assert.equal(res.statusCode, 201, res.body)
  assert.equal(cobrosGhl().length, antes + 1)
  assert.equal(cobrosGhl().at(-1).body.meterId, 'M-CON')
})

test('fondos SIN monedero propio: solo cuenta el crédito y no se pregunta a GHL', async () => {
  await q(`UPDATE credits SET balance=0 WHERE location_id='L1'`)
  const antes = fondosGhl().length
  const res = await app.inject({ method: 'GET', url: '/api/v1/locations/L1/has-funds', headers: { authorization: `Bearer ${API_KEY}` } })
  assert.equal(res.statusCode, 200)
  assert.deepEqual({ hasFunds: res.json().hasFunds, wallet_enabled: res.json().wallet_enabled }, { hasFunds: false, wallet_enabled: false })
  assert.equal(fondosGhl().length, antes)
})

test('compra de plan SIN monedero propio y sin crédito: 402 «recarga tu saldo del marketplace», sin suscripción ni cobro', async () => {
  const antes = cobrosGhl().length
  await assert.rejects(
    billing.purchasePlan({ locationId: 'L1', planId }),
    (err) => err.statusCode === 402 && /recarga tu saldo del marketplace/.test(err.message),
  )
  assert.equal(cobrosGhl().length, antes)
  const { rows } = await q(`SELECT 1 FROM subscriptions WHERE location_id='L1'`)
  assert.equal(rows.length, 0)
})

test('renovación SIN monedero propio: falla sin llamar a GHL y, al recargar crédito, el reintento se paga con crédito', async () => {
  const { rows: [sub] } = await q(
    `INSERT INTO subscriptions (location_id, app_id, plan_id, status, starts_at, ends_at, price, period_months, auto_renew, next_charge_at)
     VALUES ('L2', $1, $2, 'active', now(), now(), 3, 1, true, now()) RETURNING *`, [consumerId, planId])
  const cfg = await billing.getBillingConfig()
  await q(`UPDATE credits SET balance=0 WHERE location_id='L2'`)
  const antes = cobrosGhl().length
  const r1 = await billing.chargeSubscriptionOnce(sub, cfg)
  assert.equal(r1.failed, true)
  assert.match(r1.error, /monedero de GoHighLevel no está activado/)
  assert.equal(cobrosGhl().length, antes)
  const { rows: [f] } = await q(`SELECT status FROM charges WHERE subscription_id=$1`, [sub.id])
  assert.equal(f.status, 'failed')

  await credits.grantCredit('L2', 3, 'prueba')
  const r2 = await billing.chargeSubscriptionOnce(sub, cfg)
  assert.equal(r2.charged, true, JSON.stringify(r2))
  assert.equal(r2.charge.paid_with, 'credit')
  assert.equal(cobrosGhl().length, antes)
  assert.equal(await credits.getBalance('L2'), 0)
})
