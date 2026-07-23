import { q, numOr } from '../db.js'
import { getGhlConfig, isGlobalTestMode } from './settings.js'
import { refundChargeCredit } from './credits.js'
import * as ghl from './ghl.js'

// límites de las columnas numeric(12,6) / numeric(14,6)
const MAX_PRICE = 999_999.999999
const MAX_AMOUNT = 99_999_999.999999

const fail = (statusCode, message) => {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

export const publicCharge = (row, meter = null) => ({
  id: row.id,
  event_id: row.event_id,
  location_id: row.location_id,
  meter: meter?.code ?? row.meter_code ?? null,
  units: numOr(row.units),
  price_per_unit: numOr(row.price_per_unit),
  amount: numOr(row.amount),
  currency: row.currency,
  status: row.status,
  paid_with: row.paid_with || 'wallet',
  ghl_charge_id: row.ghl_charge_id,
  description: row.description,
  error: row.error,
  created_at: row.created_at,
})

// Valida y resuelve todo lo necesario para un cargo. Lanza {statusCode, message} en errores de validación.
export async function resolveChargeInput(appRow, body) {
  const { location_id, meter: meterRef, units, event_id, description, price, user_id, event_time } = body || {}

  if (!location_id || typeof location_id !== 'string') throw fail(400, 'Falta location_id')
  if (!meterRef || typeof meterRef !== 'string') throw fail(400, 'Falta meter (código de la tarifa o meterId de GHL)')
  if (!event_id || typeof event_id !== 'string' || event_id.length > 190) {
    throw fail(400, 'Falta event_id (identificador único del cobro en tu app, máx. 190 caracteres)')
  }
  const unitsNum = numOr(units)
  if (unitsNum === null || unitsNum <= 0 || unitsNum > 1_000_000) throw fail(400, 'units debe ser un número > 0')

  const { rows: [meter] } = await q(
    'SELECT * FROM meters WHERE (code=$1 OR ghl_meter_id=$1) AND active=true',
    [meterRef]
  )
  if (!meter) throw fail(404, `Tarifa (meter) no encontrada o inactiva: ${meterRef}`)

  // scoping app→subcuenta: NULL = todas; array = solo esas
  const allowed = appRow.allowed_location_ids
  if (Array.isArray(allowed) && !allowed.includes(location_id)) {
    throw fail(403, `Esta API key no está autorizada para cobrar a la subcuenta ${location_id}`)
  }

  const { rows: [conn] } = await q('SELECT * FROM connections WHERE location_id=$1', [location_id])
  if (!conn) throw fail(404, `La subcuenta ${location_id} no está conectada a Disruptivo Wallet`)
  if (conn.status !== 'connected') throw fail(409, `La conexión de ${location_id} está en estado "${conn.status}": reconéctala desde el panel`)

  let pricePerUnit = numOr(meter.default_price)
  const priceNum = numOr(price)
  if (priceNum !== null) {
    if (meter.price_type !== 'dynamic') throw fail(400, `La tarifa "${meter.code}" es de precio fijo: no admite price por cargo`)
    const min = numOr(meter.min_price)
    const max = numOr(meter.max_price)
    if ((min !== null && priceNum < min) || (max !== null && priceNum > max)) {
      throw fail(400, `price ${priceNum} fuera del rango permitido [${min ?? '-'} , ${max ?? '-'}] de la tarifa "${meter.code}"`)
    }
    pricePerUnit = priceNum
  }
  // ningún cargo sale hacia GHL sin importe contabilizable en el ledger
  if (pricePerUnit === null) {
    throw meter.price_type === 'dynamic'
      ? fail(400, `La tarifa "${meter.code}" es dinámica y no tiene precio por defecto: envía price en la petición`)
      : fail(409, `La tarifa "${meter.code}" no tiene precio: define su precio por defecto en el panel`)
  }
  if (pricePerUnit <= 0 || pricePerUnit > MAX_PRICE) throw fail(400, `price fuera de rango (0 – ${MAX_PRICE})`)

  const amount = Math.round(unitsNum * pricePerUnit * 1e6) / 1e6
  if (amount > MAX_AMOUNT) throw fail(400, `El importe total ${amount} supera el máximo soportado (${MAX_AMOUNT})`)

  let eventTime = null
  if (event_time) {
    const d = new Date(event_time)
    if (Number.isNaN(d.getTime())) throw fail(400, 'event_time no es una fecha ISO válida')
    eventTime = d
  }

  const testMode = (await isGlobalTestMode()) || conn.test_mode || appRow.test_mode

  return {
    meter, conn, testMode,
    units: unitsNum,
    pricePerUnit,
    amount,
    eventId: event_id,
    description: description ? String(description).slice(0, 500) : meter.name,
    userId: user_id ? String(user_id) : null,
    eventTime,
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Busca en GHL si nuestro eventId determinista ya se cobró (para filas 'unknown'/'pending' huérfanas).
// Devuelve: { verified: fila } si existe, { absent: true } si GHL confirma que no, { unreachable: true } si no se pudo saber.
export async function reconcileCharge(row) {
  let data
  try {
    data = await ghl.listCharges(row.connection_id, { eventId: `dw-${row.id}`, limit: 10 })
  } catch {
    return { unreachable: true }
  }
  const list = Array.isArray(data) ? data : data?.charges || data?.data || []
  const hit = Array.isArray(list) ? list.find((c) => c && c.transactionType !== 'refund') : null
  if (!hit) return { absent: true }
  const ghlId = hit.chargeId || hit._id || hit.id || null
  // Escribimos el importe/unidades REALES que reporta GHL: si un reintento reescribió la fila con otro
  // importe, el ledger queda fiel a lo que GHL cobró de verdad (no al último input reenviado).
  const amt = numOr(hit.amountCharged)
  const ppu = numOr(hit.pricePerUnit)
  const un = numOr(hit.units)
  // nunca pisar un estado final (p. ej. 'refunded'); solo promocionar estados no confirmados
  const { rows: [updated] } = await q(
    `UPDATE charges SET status='created', ghl_charge_id=COALESCE($1, ghl_charge_id),
       amount=COALESCE($3, amount), price_per_unit=COALESCE($4, price_per_unit), units=COALESCE($5, units),
       error=NULL, updated_at=now()
     WHERE id=$2 AND status IN ('pending','unknown','failed') RETURNING *`,
    [ghlId, row.id, amt, ppu, un]
  )
  return updated ? { verified: updated } : { verified: row }
}

// Ejecuta el cargo contra GHL sobre una fila ya reservada en estado pending. Devuelve la fila actualizada.
export async function executeCharge(rowId, input, log) {
  const cfg = await getGhlConfig()
  const abort = async (message) => {
    await q(`UPDATE charges SET status='failed', error=$1, updated_at=now() WHERE id=$2 AND status='pending'`,
      [message.slice(0, 500), rowId])
    throw fail(409, message)
  }
  if (!cfg.app_id) return abort('Falta el app_id de la app del marketplace en Configuración')
  const companyId = input.conn.company_id || cfg.company_id
  if (!companyId) return abort('La conexión no tiene companyId (agencia): reconecta la subcuenta desde el panel')

  const ghlBody = {
    appId: cfg.app_id,
    meterId: input.meter.ghl_meter_id,
    eventId: `dw-${rowId}`,
    locationId: input.conn.location_id,
    companyId,
    description: input.description,
    units: input.units,
  }
  if (input.meter.price_type === 'dynamic') ghlBody.price = input.pricePerUnit
  if (input.userId) ghlBody.userId = input.userId
  if (input.eventTime) ghlBody.eventTime = input.eventTime.toISOString()

  let res
  try {
    res = await ghl.createCharge(input.conn.id, ghlBody)
  } catch (err) {
    // Un 409 (o "duplicate eventId") NO es un rechazo: el cargo YA existe en GHL de un intento previo
    // = cobro REAL. Lo tratamos como AMBIGUO ('unknown') para que la reconciliación lo promueva a
    // 'created', nunca 'failed' (marcarlo failed lo dejaría invisible y provocaría re-cobro al reintentar).
    const dupBlob = `${err.message} ${err.data ? JSON.stringify(err.data) : ''}`
    const duplicate = err.status === 409 || /duplicat|already\s*ex[ií]st/i.test(dupBlob)
    // Otros 4xx (400/422/403…) = rechazo concluyente (no cobró). Timeout/red/5xx/duplicado = AMBIGUO → 'unknown'.
    const conclusive = err.status >= 400 && err.status < 500 && !duplicate
    const newStatus = conclusive ? 'failed' : 'unknown'
    log?.error({ err: err.message, rowId, status: newStatus, duplicate }, 'cargo GHL falló')
    const { rows: [updated] } = await q(
      `UPDATE charges SET status=$1, error=$2, updated_at=now() WHERE id=$3 AND status='pending' RETURNING *`,
      [newStatus, String(err.message).slice(0, 500), rowId]
    )
    const out = fail(502, conclusive
      ? `GHL rechazó el cargo: ${err.message}`
      : `Sin confirmación de GHL (${err.message}). El cargo queda en verificación: reintenta con el mismo event_id y se reconciliará.`)
    out.charge = updated || null
    throw out
  }

  // el cargo EXISTE en GHL: persistir con reintentos; un fallo de BD aquí jamás debe marcarlo 'failed'
  const ghlChargeId = res?.chargeId || null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { rows: [updated] } = await q(
        `UPDATE charges SET status='created', ghl_charge_id=$1, error=NULL, updated_at=now()
         WHERE id=$2 AND status IN ('pending','unknown','failed') RETURNING *`,
        [ghlChargeId, rowId]
      )
      if (updated) return updated
      const { rows: [current] } = await q('SELECT * FROM charges WHERE id=$1', [rowId])
      return current
    } catch (err) {
      log?.error({ err: err.message, rowId, attempt }, 'no se pudo persistir el cargo creado')
      if (attempt < 2) await sleep(400)
    }
  }
  // BD caída tras cobrar: informar la verdad; el reintento del consumidor reconciliará el ledger
  const out = fail(502, `El cargo SE CREÓ en GHL (chargeId ${ghlChargeId ?? 'desconocido'}) pero no se pudo registrar en el ledger. Reintenta con el mismo event_id para reconciliar.`)
  out.charge = null
  throw out
}

// Reembolsa un cargo (borra el cargo en GHL). Devuelve la fila actualizada.
export async function refundCharge(row) {
  if (row.status === 'refunded') return row
  if (row.status === 'test') {
    const { rows: [updated] } = await q(
      `UPDATE charges SET status='refunded', updated_at=now() WHERE id=$1 RETURNING *`, [row.id])
    return updated
  }
  // pagado con crédito interno: marcar reembolsado y devolver el saldo van en la MISMA transacción
  if (row.paid_with === 'credit') {
    if (row.status !== 'created') throw fail(409, `Solo se pueden reembolsar cargos completados (estado actual: ${row.status})`)
    const updated = await refundChargeCredit(row)
    if (!updated) throw fail(409, 'El cargo ya no está en estado cobrable')
    return updated
  }
  if (row.status !== 'created' || !row.ghl_charge_id) {
    throw fail(409, `Solo se pueden reembolsar cargos completados (estado actual: ${row.status})`)
  }
  if (!row.connection_id) throw fail(409, 'El cargo no tiene conexión asociada')
  try {
    await ghl.deleteCharge(row.connection_id, row.ghl_charge_id)
  } catch (err) {
    // 404 = ya no existe en GHL (reembolso previo que no llegó a registrarse): marcarlo igualmente
    if (err.status !== 404) throw err
  }
  const { rows: [updated] } = await q(
    `UPDATE charges SET status='refunded', updated_at=now() WHERE id=$1 RETURNING *`, [row.id])
  return updated
}
