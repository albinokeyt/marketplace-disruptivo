import { pool, q, numOr } from '../db.js'

const MAX_BALANCE = 99_999_999.999999 // techo de numeric(14,6)
const round6 = (n) => Math.round(n * 1e6) / 1e6

export async function getBalance(locationId) {
  const { rows: [r] } = await q('SELECT balance FROM credits WHERE location_id=$1', [locationId])
  return numOr(r?.balance, 0) ?? 0
}

// Concede crédito (amount > 0) o lo retira (amount < 0, nunca por debajo de 0).
// Devuelve { balance, applied }: applied es el movimiento REAL registrado (el clamp puede recortarlo).
export async function grantCredit(locationId, amount, reason, chargeId = null) {
  const delta = numOr(amount)
  if (delta === null || delta === 0) throw Object.assign(new Error('Importe inválido'), { statusCode: 400 })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // asegura la fila y la bloquea para que dos concesiones simultáneas no se pisen
    await client.query('INSERT INTO credits (location_id) VALUES ($1) ON CONFLICT (location_id) DO NOTHING', [locationId])
    const { rows: [cur] } = await client.query('SELECT balance FROM credits WHERE location_id=$1 FOR UPDATE', [locationId])
    const before = numOr(cur.balance, 0) ?? 0
    const after = round6(Math.max(0, before + delta))
    if (after > MAX_BALANCE) {
      await client.query('ROLLBACK')
      throw Object.assign(new Error(`El saldo resultante supera el máximo permitido (${MAX_BALANCE})`), { statusCode: 400 })
    }
    const applied = round6(after - before)
    if (applied === 0) { await client.query('ROLLBACK'); return { balance: before, applied: 0 } }
    await client.query('UPDATE credits SET balance=$1, updated_at=now() WHERE location_id=$2', [after, locationId])
    await client.query(
      'INSERT INTO credit_entries (location_id, amount, reason, charge_id) VALUES ($1,$2,$3,$4)',
      [locationId, applied, reason ? String(reason).slice(0, 300) : null, chargeId])
    await client.query('COMMIT')
    return { balance: after, applied }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Intenta pagar un cargo PENDIENTE con el crédito de la subcuenta, todo en UNA transacción.
// Devuelve un resultado TIPADO — distinguir el motivo es crítico:
//   { ok:true, row }                   → pagado con crédito
//   { ok:false, reason:'no_funds' }    → saldo insuficiente: el llamador debe ir al wallet
//   { ok:false, reason:'not_pending' } → otro proceso ya resolvió el cargo: NUNCA volver a cobrarlo
export async function trySpendCredit(chargeId, locationId, amount) {
  const value = numOr(amount)
  if (value === null || value <= 0) return { ok: false, reason: 'no_funds' }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // el cargo debe seguir pendiente: se bloquea ANTES de tocar el saldo
    const { rows: [locked] } = await client.query(
      "SELECT id FROM charges WHERE id=$1 AND status='pending' FOR UPDATE", [chargeId])
    if (!locked) { await client.query('ROLLBACK'); return { ok: false, reason: 'not_pending' } }
    // descuento atómico: sin saldo negativo ni doble gasto concurrente
    const { rows: [c] } = await client.query(
      `UPDATE credits SET balance = balance - $1, updated_at = now()
       WHERE location_id = $2 AND balance >= $1 RETURNING balance`,
      [value, locationId]
    )
    if (!c) { await client.query('ROLLBACK'); return { ok: false, reason: 'no_funds' } }
    const { rows: [row] } = await client.query(
      `UPDATE charges SET status='created', paid_with='credit', error=NULL, updated_at=now()
       WHERE id=$1 RETURNING *`, [chargeId])
    await client.query(
      'INSERT INTO credit_entries (location_id, amount, reason, charge_id) VALUES ($1,$2,$3,$4)',
      [locationId, -value, 'consumo de cobro', chargeId])
    await client.query('COMMIT')
    return { ok: true, row }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Retira el crédito de una RECARGA que se va a reembolsar. Atómico e idempotente (índice único
// parcial por charge_id con reason 'reversion_recarga'): nunca retira dos veces ni parcialmente.
// Devuelve { ok:true } (retirado o ya retirado antes) o { ok:false, reason:'insufficient' } si el
// cliente ya consumió parte del saldo — en ese caso NO se debe reembolsar en GHL.
export async function reverseTopupCredit(charge) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // solo se puede revertir un crédito que REALMENTE se abonó (si no, se retiraría saldo ajeno del cliente)
    const { rows: [credited] } = await client.query(
      `SELECT amount FROM credit_entries WHERE charge_id = $1 AND reason = 'recarga' FOR UPDATE`, [charge.id])
    if (!credited) { await client.query('ROLLBACK'); return { ok: false, reason: 'not_credited' } }
    // se retira EXACTAMENTE lo abonado (la fila del cargo pudo alinearse con GHL después del abono)
    const value = numOr(credited.amount, 0) ?? 0
    if (value <= 0) { await client.query('ROLLBACK'); return { ok: true } }
    const ins = await client.query(
      `INSERT INTO credit_entries (location_id, amount, reason, charge_id) VALUES ($1,$2,'reversion_recarga',$3)
       ON CONFLICT DO NOTHING`,
      [charge.location_id, -value, charge.id]
    )
    if (ins.rowCount === 0) { await client.query('ROLLBACK'); return { ok: true, already: true } }
    const { rows: [c] } = await client.query(
      `UPDATE credits SET balance = balance - $1, updated_at = now()
       WHERE location_id = $2 AND balance >= $1 RETURNING balance`,
      [value, charge.location_id]
    )
    if (!c) { await client.query('ROLLBACK'); return { ok: false, reason: 'insufficient' } }
    await client.query('COMMIT')
    return { ok: true }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Deshace una reversión cuyo reembolso en GHL falló: borra la entry de reversión (para que un
// nuevo intento pueda volver a retirar) y devuelve el saldo. Idempotente.
export async function restoreTopupCredit(charge) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // se devuelve exactamente lo que retiró la reversión (no charge.amount, que puede diferir)
    const del = await client.query(
      `DELETE FROM credit_entries WHERE charge_id = $1 AND reason = 'reversion_recarga' RETURNING amount`, [charge.id])
    const value = del.rowCount > 0 ? Math.abs(numOr(del.rows[0].amount, 0) ?? 0) : 0
    if (value > 0) {
      await client.query('INSERT INTO credits (location_id) VALUES ($1) ON CONFLICT (location_id) DO NOTHING', [charge.location_id])
      await client.query('UPDATE credits SET balance = balance + $1, updated_at = now() WHERE location_id = $2', [value, charge.location_id])
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// Reembolsa un cargo pagado con crédito: marca 'refunded' Y devuelve el saldo en la MISMA
// transacción. Si algo falla, no ocurre nada (el cargo sigue reembolsable y el reintento lo repara).
// Devuelve la fila actualizada, o null si el cargo ya no estaba en 'created'.
export async function refundChargeCredit(charge) {
  const value = numOr(charge.amount, 0) ?? 0
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: [row] } = await client.query(
      "UPDATE charges SET status='refunded', updated_at=now() WHERE id=$1 AND status='created' RETURNING *",
      [charge.id])
    if (!row) { await client.query('ROLLBACK'); return null }
    if (value > 0) {
      await client.query('INSERT INTO credits (location_id) VALUES ($1) ON CONFLICT (location_id) DO NOTHING', [charge.location_id])
      await client.query('UPDATE credits SET balance = balance + $1, updated_at=now() WHERE location_id=$2', [value, charge.location_id])
      await client.query(
        'INSERT INTO credit_entries (location_id, amount, reason, charge_id) VALUES ($1,$2,$3,$4)',
        [charge.location_id, value, `reembolso del cargo #${charge.id}`, charge.id])
    }
    await client.query('COMMIT')
    return row
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
