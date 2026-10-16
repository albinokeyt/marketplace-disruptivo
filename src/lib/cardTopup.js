// Recarga de saldo con TARJETA (Stripe Checkout). El cliente elige el importe, paga en la página segura de Stripe y,
// cuando Stripe confirma el pago, el mismo importe se abona como crédito en su subcuenta. Nunca toca ningún monedero
// de GHL, así que nunca paga la agencia. Se confirma al volver del pago, cuando el portal pregunta y en el barrido
// del reconciliador (por si el cliente cerró la pestaña); el abono es único por recarga.
import { pool, q, numOr } from '../db.js'
import { config } from '../config.js'
import { getTopupConfig } from './topup.js'
import { stripeEnabled, createCheckoutSession, getCheckoutSession } from './stripe.js'

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode })
const cents = (amount) => Math.round(Number(amount) * 100)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function getCardTopupConfig() {
  const t = await getTopupConfig()
  return { enabled: stripeEnabled(), presets: t.presets, min: t.min, max: t.max, currency: 'USD' }
}

export async function createCardTopup({ locationId, amount, userId = null, email = null }) {
  if (!stripeEnabled()) throw fail(503, 'El pago con tarjeta aún no está activado')
  if (!config.appBaseUrl) throw fail(503, 'Falta la variable APP_BASE_URL')
  const cfg = await getCardTopupConfig()
  const value = Math.round((numOr(amount) ?? 0) * 100) / 100
  if (!Number.isFinite(value) || value < cfg.min || value > cfg.max) {
    throw fail(400, `El importe debe estar entre ${cfg.min} y ${cfg.max} USD`)
  }
  const { rows: [conn] } = await q('SELECT location_id, status, alias, name FROM connections WHERE location_id=$1', [locationId])
  if (!conn || conn.status === 'uninstalled') throw fail(404, 'Esta subcuenta no tiene instalado Marketplace Disruptivo')
  const mail = EMAIL_RE.test(String(email || '').trim()) ? String(email).trim().toLowerCase() : null
  const { rows: [row] } = await q(
    `INSERT INTO card_topups (location_id, amount, user_id, email) VALUES ($1,$2,$3,$4) RETURNING *`,
    [locationId, value, userId, mail])
  const nombre = conn.alias || conn.name || locationId
  const meta = { card_topup_id: String(row.id), location_id: locationId }
  const base = config.appBaseUrl
  try {
    const session = await createCheckoutSession({
      mode: 'payment',
      locale: 'es',
      submit_type: 'pay',
      client_reference_id: String(row.id),
      ...(mail ? { customer_email: mail } : {}),
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: cents(value),
          product_data: { name: 'Recarga de saldo · Marketplace Disruptivo', description: `Saldo para ${nombre}` },
        },
      }],
      metadata: meta,
      payment_intent_data: { metadata: meta, description: `Recarga de saldo · ${nombre}` },
      success_url: `${base}/recarga-tarjeta/ok?id=${row.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/recarga-tarjeta/cancelada?id=${row.id}`,
    }, `card-topup-${row.id}`)
    await q(`UPDATE card_topups SET stripe_session_id=$2, updated_at=now() WHERE id=$1`, [row.id, session.id])
    return { id: row.id, url: session.url, amount: value }
  } catch (err) {
    await q(`UPDATE card_topups SET status='failed', error=$2, updated_at=now() WHERE id=$1`, [row.id, String(err.message).slice(0, 500)])
    throw fail(err.statusCode && err.statusCode < 500 ? 503 : 502, 'No se pudo abrir el pago seguro en este momento. Inténtalo de nuevo en unos minutos o escríbenos a departamentodisruptivo@gmail.com.')
  }
}

// Abona la recarga una sola vez, en una transacción: bloquea la fila, comprueba que sigue pendiente y que el pago
// de Stripe cuadra con lo pedido (sesión, importe, divisa), suma el crédito y la marca cobrada.
async function creditOnce(row, session) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [cur] } = await client.query('SELECT * FROM card_topups WHERE id=$1 FOR UPDATE', [row.id])
    if (!cur || cur.status !== 'pending') { await client.query('ROLLBACK'); return { credited: false, already: cur?.status === 'paid' } }
    const okMeta = String(session.metadata?.card_topup_id || session.client_reference_id || '') === String(cur.id)
    const okAmount = Number(session.amount_total) === cents(cur.amount) && String(session.currency).toLowerCase() === 'usd'
    if (!okMeta || !okAmount || session.id !== cur.stripe_session_id) {
      await client.query(`UPDATE card_topups SET status='failed', error=$2, updated_at=now() WHERE id=$1`,
        [cur.id, `El pago de Stripe no cuadra (sesión ${session.id}, ${session.amount_total} ${session.currency}): revisar a mano`])
      await client.query('COMMIT')
      return { credited: false, mismatch: true }
    }
    const ins = await client.query(
      `INSERT INTO credit_entries (location_id, amount, reason, card_topup_id) VALUES ($1,$2,'recarga con tarjeta',$3)
       ON CONFLICT DO NOTHING RETURNING id`, [cur.location_id, cur.amount, cur.id])
    const nuevo = ins.rows.length === 1 // portable: no depende de rowCount del driver
    if (nuevo) {
      await client.query('INSERT INTO credits (location_id) VALUES ($1) ON CONFLICT (location_id) DO NOTHING', [cur.location_id])
      await client.query('UPDATE credits SET balance = balance + $1, updated_at = now() WHERE location_id = $2', [cur.amount, cur.location_id])
    }
    await client.query(
      `UPDATE card_topups SET status='paid', paid_at=now(), stripe_payment_intent=$2, error=NULL, updated_at=now() WHERE id=$1`,
      [cur.id, typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null])
    await client.query('COMMIT')
    return { credited: nuevo }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Pregunta a Stripe por la recarga y, si está pagada, la abona. Devuelve el estado para el portal.
export async function confirmCardTopup(id, { sessionId = null } = {}) {
  const { rows: [row] } = await q('SELECT * FROM card_topups WHERE id=$1', [numOr(id)])
  if (!row) throw fail(404, 'Recarga no encontrada')
  if (sessionId && row.stripe_session_id && sessionId !== row.stripe_session_id) throw fail(400, 'La sesión de pago no corresponde a esta recarga')
  if (row.status !== 'pending' || !row.stripe_session_id) return { id: row.id, status: row.status, location_id: row.location_id, amount: numOr(row.amount) }
  const session = await getCheckoutSession(row.stripe_session_id)
  if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
    const r = await creditOnce(row, session)
    const { rows: [now] } = await q('SELECT status FROM card_topups WHERE id=$1', [row.id])
    return { id: row.id, status: now.status, credited: r.credited, location_id: row.location_id, amount: numOr(row.amount) }
  }
  if (session.status === 'expired') {
    await q(`UPDATE card_topups SET status='expired', updated_at=now() WHERE id=$1 AND status='pending'`, [row.id])
    return { id: row.id, status: 'expired', location_id: row.location_id, amount: numOr(row.amount) }
  }
  return { id: row.id, status: 'pending', location_id: row.location_id, amount: numOr(row.amount) }
}

// Barrido del reconciliador: las recargas pendientes de las últimas 48 h se confirman contra Stripe
// (el cliente puede haber pagado y cerrado la pestaña sin volver).
export async function sweepCardTopups(log) {
  if (!stripeEnabled()) return { checked: 0 }
  const { rows } = await q(
    `SELECT id FROM card_topups WHERE status='pending' AND stripe_session_id IS NOT NULL
       AND created_at > now() - interval '48 hours' ORDER BY id LIMIT 50`)
  let paid = 0
  for (const r of rows) {
    try {
      const s = await confirmCardTopup(r.id)
      if (s.status === 'paid') paid++
    } catch (err) {
      log?.warn?.({ err: err.message, cardTopupId: r.id }, 'recarga con tarjeta: no se pudo confirmar')
    }
  }
  if (paid) log?.info?.({ paid }, 'recargas con tarjeta abonadas por el barrido')
  return { checked: rows.length, paid }
}
