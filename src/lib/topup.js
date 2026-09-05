import { randomUUID } from 'node:crypto'
import { pool, q, numOr } from '../db.js'
import { getSetting, isGlobalTestMode } from './settings.js'
import { generateApiKey } from './crypto.js'
import { executeCharge } from './charges.js'
import { getBalance } from './credits.js'
import * as ghl from './ghl.js'

// Recarga = cobro REAL al wallet de GHL (meter de recarga, precio FIJO 1.00/unidad → unidades = USD)
// + abono del mismo importe como crédito interno. GHL no deja meter dinero en un wallet: esta es
// la única forma sancionada de "recargar" saldo en la app desde la billetera.
const DEFAULTS = { enabled: true, meter_code: 'recarga-saldo', presets: [10, 25, 50, 100], min: 5, max: 5000 }
const HARD_MAX = 100_000 // tope absoluto por recarga (muy por debajo de numeric(14,6))
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode })
const INFLIGHT_MSG = 'Tienes una recarga en verificación con GHL. No la repitas: el crédito se abonará automáticamente si GHL confirma el cobro.'

export async function getTopupConfig() {
  const s = (await getSetting('topup')) || {}
  const min = Math.max(1, numOr(s.min) ?? DEFAULTS.min)
  const max = Math.min(HARD_MAX, Math.max(min, numOr(s.max) ?? DEFAULTS.max))
  const presets = (Array.isArray(s.presets) ? s.presets : DEFAULTS.presets)
    .map(Number).filter((n) => Number.isFinite(n) && n >= min && n <= max)
  return {
    enabled: s.enabled === undefined ? DEFAULTS.enabled : Boolean(s.enabled),
    meter_code: String(s.meter_code || DEFAULTS.meter_code),
    presets: presets.length ? presets : DEFAULTS.presets.filter((n) => n >= min && n <= max),
    min, max,
  }
}

// App interna dueña de los cargos de recarga: oculta del panel y de la tienda, su key jamás se revela.
// El índice único parcial apps_system_uq garantiza UNA sola aunque dos recargas la creen a la vez.
export async function getSystemApp() {
  const { rows: [existing] } = await q('SELECT * FROM apps WHERE system = true ORDER BY id LIMIT 1')
  if (existing) return existing
  const { prefix, hash } = generateApiKey()
  const { rows: [created] } = await q(
    `INSERT INTO apps (name, key_prefix, key_hash, status, system, visible)
     VALUES ('Sistema · Recargas', $1, $2, 'active', true, false)
     ON CONFLICT DO NOTHING RETURNING *`,
    [prefix, hash]
  )
  if (created) return created
  const { rows: [again] } = await q('SELECT * FROM apps WHERE system = true ORDER BY id LIMIT 1')
  return again
}

// Abona el crédito de una recarga ya COBRADA, una sola vez (el índice único parcial por charge_id
// hace idempotente el INSERT: un reintento o el reconciliador nunca abonan dos veces).
export async function creditTopupOnce(charge) {
  const value = numOr(charge.amount, 0) ?? 0
  if (value <= 0) return { credited: false }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const ins = await client.query(
      `INSERT INTO credit_entries (location_id, amount, reason, charge_id) VALUES ($1,$2,'recarga',$3)
       ON CONFLICT DO NOTHING`,
      [charge.location_id, value, charge.id]
    )
    if (ins.rowCount === 0) { await client.query('ROLLBACK'); return { credited: false, already: true } }
    await client.query('INSERT INTO credits (location_id) VALUES ($1) ON CONFLICT (location_id) DO NOTHING', [charge.location_id])
    await client.query('UPDATE credits SET balance = balance + $1, updated_at = now() WHERE location_id = $2', [value, charge.location_id])
    await client.query('COMMIT')
    return { credited: true }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Tras cobrar, contrasta (best-effort) el importe REAL que GHL registró con el pedido: si el meter
// de GHL no estaba a 1.00 como el espejo local, se corrige la fila para abonar exactamente lo cobrado.
async function alignWithGhl(created, log) {
  try {
    const data = await ghl.listCharges(created.connection_id, { eventId: `dw-${created.id}`, limit: 5 })
    const list = Array.isArray(data) ? data : data?.charges || data?.data || []
    const hit = Array.isArray(list) ? list.find((c) => c && c.transactionType !== 'refund') : null
    const real = numOr(hit?.amountCharged)
    if (real === null || Math.abs(real - (numOr(created.amount) ?? 0)) <= 1e-6) return created
    log?.error?.({ chargeId: created.id, pedido: created.amount, real }, 'recarga: GHL cobró un importe distinto al espejo local (revisa el meter de recarga = 1.00 fijo)')
    // solo se corrige si el crédito AÚN no se abonó: abono y cargo deben coincidir siempre (el reembolso
    // retira lo abonado). Si el reconciliador ya abonó lo pedido, se deja constancia sin tocar el importe.
    const { rows: [fixed] } = await q(
      `UPDATE charges SET amount=$1, units=$1, error=$2, updated_at=now()
       WHERE id=$3 AND status='created'
         AND NOT EXISTS (SELECT 1 FROM credit_entries WHERE charge_id=$3 AND reason='recarga')
       RETURNING *`,
      [real, `Importe alineado con GHL (pedido ${created.amount}, cobrado ${real})`, created.id]
    )
    if (fixed) return fixed
    await q(`UPDATE charges SET error=$2, updated_at=now() WHERE id=$1 AND status='created'`,
      [created.id, `GHL cobró ${real} pero se abonó ${created.amount} (meter de recarga ≠ 1.00): revisar a mano`])
    return created
  } catch {
    return created // consistencia eventual / red: se abona lo pedido (= lo que el meter fijo 1.00 cobra)
  }
}

// Ejecuta una recarga completa. Lanza {statusCode, message} en validación; 502/409 si GHL rechaza.
export async function createTopup({ locationId, amount, userId = null, log }) {
  const cfg = await getTopupConfig()
  if (!cfg.enabled) throw fail(409, 'Las recargas están desactivadas')
  const value = Math.round((numOr(amount) ?? 0) * 100) / 100
  if (!Number.isFinite(value) || value < cfg.min || value > cfg.max) {
    throw fail(400, `El importe debe estar entre ${cfg.min} y ${cfg.max} USD`)
  }

  // el meter de recarga DEBE ser fijo a 1.00/unidad: así unidades = USD y lo cobrado = lo abonado
  const { rows: [meter] } = await q('SELECT * FROM meters WHERE code=$1 AND active=true', [cfg.meter_code])
  if (!meter) {
    throw fail(409, `Falta la tarifa "${cfg.meter_code}": créala en Tarifas apuntando al meter de recarga de GHL (precio fijo 1.00 por unidad)`)
  }
  if (meter.price_type !== 'fixed' || Math.abs((numOr(meter.default_price) ?? 0) - 1) > 1e-9) {
    throw fail(409, `La tarifa "${cfg.meter_code}" debe ser de precio FIJO 1.00 por unidad (ahora: ${meter.price_type} ${meter.default_price ?? '—'})`)
  }

  const { rows: [conn] } = await q('SELECT * FROM connections WHERE location_id=$1', [locationId])
  if (!conn) throw fail(404, 'Subcuenta no conectada')
  if (conn.status !== 'connected') throw fail(409, `La conexión está en estado "${conn.status}"`)

  // una recarga anterior sin confirmar (pending/unknown) bloquea nuevas: repetirla sería cobrar dos veces.
  // (comprobación previa para dar buen mensaje; la garantía real es el índice único charges_topup_inflight_uq)
  const { rows: [inflight] } = await q(
    `SELECT 1 FROM charges WHERE kind='topup' AND location_id=$1 AND status IN ('pending','unknown') LIMIT 1`,
    [locationId]
  )
  if (inflight) throw fail(409, INFLIGHT_MSG)

  const app = await getSystemApp()
  if (app.status !== 'active') throw fail(409, 'La app interna de recargas está desactivada')
  const testMode = (await isGlobalTestMode()) || conn.test_mode

  let row
  try {
    const ins = await q(
      `INSERT INTO charges (app_id, meter_id, connection_id, location_id, event_id, units, price_per_unit, amount,
                            status, description, user_id, kind, paid_with)
       VALUES ($1,$2,$3,$4,$5,$6,1,$6,$7,'Recarga de saldo',$8,'topup','wallet') RETURNING *`,
      [app.id, meter.id, conn.id, locationId, `topup-${randomUUID()}`, value, testMode ? 'test' : 'pending', userId]
    )
    row = ins.rows[0]
  } catch (err) {
    if (err.code === '23505') throw fail(409, INFLIGHT_MSG) // dos recargas simultáneas: solo pasa una
    throw err
  }
  // en modo prueba NO se abona crédito (sería saldo gratis): solo se registra el cargo de prueba
  if (testMode) return { test_mode: true, credited: false, charge: row, balance: await getBalance(locationId) }

  const input = { meter, conn, units: value, pricePerUnit: 1, amount: value, description: 'Recarga de saldo', userId: null, eventTime: null }
  let created
  try {
    created = await executeCharge(row.id, input, log)
  } catch (err) {
    // AMBIGUO (timeout/red o "se creó pero no se registró"): el cobro puede haber salido.
    // Mensaje explícito para que el cliente NO repita; el reconciliador abonará si GHL confirma.
    const ambiguous = err.statusCode === 502 && (!err.charge || err.charge.status === 'unknown')
    if (ambiguous) {
      const out = fail(502, 'El cobro está en verificación con GHL. NO vuelvas a recargar: el crédito se abonará automáticamente solo si GHL confirma el cobro.')
      out.charge = err.charge || null
      throw out
    }
    throw err
  }

  created = await alignWithGhl(created, log)
  let credit
  try {
    credit = await creditTopupOnce(created)
  } catch (err) {
    // el wallet YA se cobró: no perder el abono — el reconciliador lo reintenta (sweepTopupCredits)
    log?.error?.({ err: err.message, chargeId: created.id }, 'recarga cobrada pero crédito no abonado; se reintentará')
    credit = { credited: false, pending: true }
  }
  return { test_mode: false, ...credit, charge: created, balance: await getBalance(locationId) }
}
