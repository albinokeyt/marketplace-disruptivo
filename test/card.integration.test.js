// Integración de la RECARGA CON TARJETA (Stripe Checkout) contra Postgres real (PGlite) con Stripe simulado:
// la sesión lleva importe y metadatos correctos, solo se abona cuando Stripe dice «paid», una única vez, nunca si
// el importe no cuadra, y el barrido abona los pagos de quien cerró la pestaña.
import { test, mock, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

process.env.APP_BASE_URL = 'https://marketplace.test'
process.env.NODE_ENV = 'test'
process.env.STRIPE_SECRET_KEY = 'rk_test_simulada'

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
mock.module(new URL('../src/redis.js', import.meta.url).href, {
  namedExports: { redis: { async get() { return null }, async set() { return 'OK' }, async del() { return 0 }, async incr() { return 1 }, async expire() { return 1 }, on() {} } },
})

// ---- Stripe simulado ----
const sesiones = new Map() // id → sesión
const llamadas = []
let n = 0
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init = {}) => {
  const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url)
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  if (url.hostname !== 'api.stripe.com') return json(404, {})
  const method = init.method || 'GET'
  const form = init.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : {}
  llamadas.push({ method, path: url.pathname, form, idem: init.headers?.['Idempotency-Key'] || null, auth: init.headers?.Authorization })
  if (method === 'POST' && url.pathname === '/v1/checkout/sessions') {
    const id = `cs_test_${++n}`
    const s = {
      id, url: `https://checkout.stripe.com/c/pay/${id}`, status: 'open', payment_status: 'unpaid',
      amount_total: Number(form['line_items[0][price_data][unit_amount]']), currency: form['line_items[0][price_data][currency]'],
      client_reference_id: form.client_reference_id, metadata: { card_topup_id: form['metadata[card_topup_id]'], location_id: form['metadata[location_id]'] },
      payment_intent: null,
    }
    sesiones.set(id, s)
    return json(200, s)
  }
  const m = url.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)$/)
  if (method === 'GET' && m) return sesiones.has(m[1]) ? json(200, sesiones.get(m[1])) : json(404, { error: { message: 'No such session' } })
  return json(404, { error: { message: 'no simulado' } })
}
const pagar = (id) => Object.assign(sesiones.get(id), { status: 'complete', payment_status: 'paid', payment_intent: `pi_${id}` })

let card, credits
before(async () => {
  const dir = new URL('../src/migrations/', import.meta.url)
  for (const f of (await readdir(dir)).filter((x) => x.endsWith('.sql')).sort()) await pg.exec(await readFile(new URL(f, dir), 'utf8'))
  await q(`INSERT INTO connections (location_id, company_id, status, name) VALUES ('L1','COMP','connected','Uno'), ('L2','COMP','connected','Dos')`)
  card = await import('../src/lib/cardTopup.js')
  credits = await import('../src/lib/credits.js')
})
after(async () => { globalThis.fetch = realFetch; await pg.close() })

const sesionDe = async (id) => (await q('SELECT stripe_session_id FROM card_topups WHERE id=$1', [id])).rows[0].stripe_session_id

test('crear: sesión de Stripe con el importe en céntimos, USD, metadatos de la recarga y clave de idempotencia', async () => {
  const r = await card.createCardTopup({ locationId: 'L1', amount: 25, userId: 'sso:x', email: 'cliente@ejemplo.com' })
  assert.match(r.url, /^https:\/\/checkout\.stripe\.com\//)
  const c = llamadas.at(-1)
  assert.equal(c.form['line_items[0][price_data][unit_amount]'], '2500')
  assert.equal(c.form['line_items[0][price_data][currency]'], 'usd')
  assert.equal(c.form['metadata[location_id]'], 'L1')
  assert.equal(c.form['metadata[card_topup_id]'], String(r.id))
  assert.equal(c.form.customer_email, 'cliente@ejemplo.com')
  assert.match(c.form.success_url, /^https:\/\/marketplace\.test\/recarga-tarjeta\/ok\?id=\d+&session_id=\{CHECKOUT_SESSION_ID\}$/)
  assert.equal(c.idem, `card-topup-${r.id}`)
  assert.equal(c.auth, 'Bearer rk_test_simulada')
  const { rows: [row] } = await q('SELECT status, amount FROM card_topups WHERE id=$1', [r.id])
  assert.equal(row.status, 'pending')
})

test('importe fuera de rango o subcuenta inexistente: se rechaza sin llamar a Stripe', async () => {
  const antes = llamadas.length
  await assert.rejects(card.createCardTopup({ locationId: 'L1', amount: 1 }), (e) => e.statusCode === 400)
  await assert.rejects(card.createCardTopup({ locationId: 'NO-EXISTE', amount: 10 }), (e) => e.statusCode === 404)
  assert.equal(llamadas.length, antes)
})

test('sin pagar: sigue pendiente y no abona; pagada: abona el importe UNA sola vez', async () => {
  const r = await card.createCardTopup({ locationId: 'L2', amount: 10 })
  const s1 = await card.confirmCardTopup(r.id)
  assert.equal(s1.status, 'pending')
  assert.equal(await credits.getBalance('L2'), 0)
  pagar(await sesionDe(r.id))
  const s2 = await card.confirmCardTopup(r.id)
  assert.equal(s2.status, 'paid')
  assert.equal(s2.credited, true)
  assert.equal(await credits.getBalance('L2'), 10)
  // repetir la confirmación (portal, página de vuelta y barrido a la vez) nunca abona dos veces
  await Promise.all([card.confirmCardTopup(r.id), card.confirmCardTopup(r.id), card.confirmCardTopup(r.id)])
  assert.equal(await credits.getBalance('L2'), 10)
  const { rows } = await q(`SELECT amount, reason FROM credit_entries WHERE card_topup_id=$1`, [r.id])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].reason, 'recarga con tarjeta')
})

test('la página de vuelta con un session_id ajeno no confirma nada', async () => {
  const r = await card.createCardTopup({ locationId: 'L1', amount: 5 })
  await assert.rejects(card.confirmCardTopup(r.id, { sessionId: 'cs_otro' }), (e) => e.statusCode === 400)
})

test('si el importe cobrado por Stripe no cuadra, NO se abona y queda para revisar a mano', async () => {
  const r = await card.createCardTopup({ locationId: 'L1', amount: 50 })
  const sid = await sesionDe(r.id)
  pagar(sid)
  sesiones.get(sid).amount_total = 100 // 1 USD en vez de 50
  const antes = await credits.getBalance('L1')
  const s = await card.confirmCardTopup(r.id)
  assert.equal(s.status, 'failed')
  assert.equal(await credits.getBalance('L1'), antes)
})

test('barrido: abona las pagadas con la pestaña cerrada y marca las caducadas', async () => {
  const a = await card.createCardTopup({ locationId: 'L1', amount: 7 })
  const b = await card.createCardTopup({ locationId: 'L1', amount: 8 })
  pagar(await sesionDe(a.id))
  sesiones.get(await sesionDe(b.id)).status = 'expired'
  const antes = await credits.getBalance('L1')
  const r = await card.sweepCardTopups()
  assert.ok(r.paid >= 1)
  assert.equal(await credits.getBalance('L1'), antes + 7)
  const { rows: [eb] } = await q('SELECT status FROM card_topups WHERE id=$1', [b.id])
  assert.equal(eb.status, 'expired')
})

test('sin STRIPE_SECRET_KEY: el pago con tarjeta está desactivado y no se crea nada', async () => {
  const k = process.env.STRIPE_SECRET_KEY
  process.env.STRIPE_SECRET_KEY = ''
  try {
    assert.equal((await card.getCardTopupConfig()).enabled, false)
    await assert.rejects(card.createCardTopup({ locationId: 'L1', amount: 10 }), (e) => e.statusCode === 503)
  } finally { process.env.STRIPE_SECRET_KEY = k }
})
