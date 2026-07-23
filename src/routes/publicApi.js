import { q, numOr } from '../db.js'
import { hashKey } from '../lib/crypto.js'
import { rateLimit } from '../lib/ratelimit.js'
import { resolveChargeInput, executeCharge, reconcileCharge, refundCharge, publicCharge } from '../lib/charges.js'
import { checkAccess } from '../lib/access.js'
import { trySpendCredit, getBalance } from '../lib/credits.js'
import * as ghl from '../lib/ghl.js'

const RATE_PER_MIN = numOr(process.env.API_RATE_PER_MIN, 600) ?? 600

async function authApp(req, reply) {
  const header = req.headers.authorization || ''
  const key = header.startsWith('Bearer ') ? header.slice(7).trim() : req.headers['x-api-key']
  if (!key) return reply.code(401).send({ error: 'Falta la API key (header Authorization: Bearer dw_... o X-Api-Key)' })
  const { rows: [appRow] } = await q('SELECT * FROM apps WHERE key_hash=$1', [hashKey(String(key))])
  if (!appRow || appRow.status !== 'active') {
    return reply.code(401).send({ error: 'API key inválida o revocada' })
  }
  req.consumerApp = appRow
  const rl = await rateLimit(`app:${appRow.id}`, RATE_PER_MIN, 60)
  reply.header('X-RateLimit-Remaining', rl.remaining)
  if (!rl.ok) return reply.code(429).send({ error: `Límite de ${RATE_PER_MIN} peticiones/min superado` })
}

// una app solo ve las subcuentas a las que puede cobrar (NULL = todas)
const locationAllowed = (appRow, locationId) =>
  !Array.isArray(appRow.allowed_location_ids) || appRow.allowed_location_ids.includes(locationId)

const STALE_PENDING_SECONDS = 90

export default async function publicApiRoutes(app) {
  app.addHook('preHandler', authApp)

  // Crear un cobro contra el wallet de GHL de una subcuenta conectada
  app.post('/api/v1/charges', async (req, reply) => {
    const consumer = req.consumerApp
    let input
    try {
      input = await resolveChargeInput(consumer, req.body)
    } catch (err) {
      return reply.code(err.statusCode || 400).send({ error: err.message })
    }

    const initialStatus = input.testMode ? 'test' : 'pending'
    const { rows: [inserted] } = await q(
      `INSERT INTO charges (app_id, meter_id, connection_id, location_id, event_id, units,
                            price_per_unit, amount, status, description, user_id, event_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (app_id, event_id) DO NOTHING
       RETURNING *`,
      [consumer.id, input.meter.id, input.conn.id, input.conn.location_id, input.eventId,
       input.units, input.pricePerUnit, input.amount, initialStatus, input.description,
       input.userId, input.eventTime]
    )

    let row = inserted
    if (!row) {
      // idempotencia: ya existe un cargo con este event_id para esta app
      const { rows: [existing] } = await q(
        'SELECT * FROM charges WHERE app_id=$1 AND event_id=$2', [consumer.id, input.eventId])
      if (['created', 'test', 'refunded'].includes(existing.status)) {
        return reply.send({ idempotent: true, test_mode: existing.status === 'test', charge: publicCharge(existing, input.meter) })
      }

      // 'unknown' o 'pending' colgado: ANTES de reintentar, comprobar en GHL si el cargo original ya se cobró
      const staleMs = STALE_PENDING_SECONDS * 1000
      const isStalePending = existing.status === 'pending' && Date.now() - new Date(existing.updated_at).getTime() > staleMs
      if (existing.status === 'unknown' || isStalePending) {
        const rec = await reconcileCharge(existing)
        if (rec.verified) {
          return reply.send({ idempotent: true, reconciled: true, test_mode: false, charge: publicCharge(rec.verified, input.meter) })
        }
        if (rec.unreachable) {
          return reply.code(503).send({
            error: 'No se pudo verificar en GHL el estado del intento anterior de este event_id; reintenta en unos segundos',
            charge_id: existing.id,
          })
        }
        // rec.absent → GHL confirma que no se cobró: seguro reintentar
      } else if (existing.status !== 'failed') {
        return reply.code(409).send({ error: 'Este event_id tiene un cargo en curso; reintenta en unos segundos', charge_id: existing.id })
      }

      // reclamar la fila refrescándola con el input ACTUAL (el ledger siempre refleja lo que se envía a GHL)
      const { rows: [claimed] } = await q(
        `UPDATE charges SET status='pending', error=NULL,
           meter_id=$2, connection_id=$3, location_id=$4, units=$5, price_per_unit=$6, amount=$7,
           description=$8, user_id=$9, event_time=$10, updated_at=now()
         WHERE id=$1 AND (status IN ('failed','unknown')
                          OR (status='pending' AND updated_at < now() - interval '${STALE_PENDING_SECONDS} seconds'))
         RETURNING *`,
        [existing.id, input.meter.id, input.conn.id, input.conn.location_id, input.units,
         input.pricePerUnit, input.amount, input.description, input.userId, input.eventTime]
      )
      if (!claimed) {
        return reply.code(409).send({ error: 'Este event_id tiene un cargo en curso; reintenta en unos segundos', charge_id: existing.id })
      }
      row = claimed
      if (input.testMode) {
        const { rows: [t] } = await q(`UPDATE charges SET status='test', updated_at=now() WHERE id=$1 RETURNING *`, [row.id])
        return reply.code(201).send({ test_mode: true, charge: publicCharge(t, input.meter) })
      }
    }

    if (input.testMode) {
      return reply.code(201).send({ test_mode: true, charge: publicCharge(row, input.meter) })
    }

    // 1º el crédito interno (si cubre el importe completo); si no alcanza, al wallet de GHL.
    // SOLO para cargos NUEVOS: un reintento (fila reclamada de failed/unknown) debe pasar por GHL,
    // que dedupe por eventId y detecta si el intento anterior ya cobró — esa red de seguridad no se toca.
    if (inserted) {
      const credit = await trySpendCredit(row.id, input.conn.location_id, input.amount)
      if (credit.ok) {
        return reply.code(201).send({ test_mode: false, charge: publicCharge(credit.row, input.meter) })
      }
      if (credit.reason === 'not_pending') {
        // otro proceso ya resolvió este cargo: devolver su estado, JAMÁS volver a cobrarlo
        const { rows: [cur] } = await q('SELECT * FROM charges WHERE id=$1', [row.id])
        return reply.send({ idempotent: true, charge: publicCharge(cur, input.meter) })
      }
      // 'no_funds' → sigue al wallet
    }

    try {
      const updated = await executeCharge(row.id, input, req.log)
      return reply.code(201).send({ test_mode: false, charge: publicCharge(updated, input.meter) })
    } catch (err) {
      return reply.code(err.statusCode || 502).send({
        error: err.message,
        charge: err.charge ? publicCharge(err.charge, input.meter) : undefined,
      })
    }
  })

  // ¿Tiene saldo el wallet de esta subcuenta?
  app.get('/api/v1/locations/:locationId/has-funds', async (req, reply) => {
    if (!locationAllowed(req.consumerApp, req.params.locationId)) {
      return reply.code(403).send({ error: 'Esta API key no está autorizada para esa subcuenta' })
    }
    const { rows: [conn] } = await q('SELECT * FROM connections WHERE location_id=$1', [req.params.locationId])
    if (!conn) return reply.code(404).send({ error: 'Subcuenta no conectada' })
    if (conn.status !== 'connected') return reply.code(409).send({ error: `Conexión en estado "${conn.status}"` })
    // el crédito interno se consume ANTES que el wallet: si hay saldo, hay fondos
    const credit = await getBalance(req.params.locationId)
    if (credit > 0) return { hasFunds: true, credit, wallet_has_funds: null }
    try {
      const data = await ghl.hasFunds(conn.id)
      return { hasFunds: Boolean(data?.hasFunds), credit, wallet_has_funds: Boolean(data?.hasFunds) }
    } catch (err) {
      return reply.code(502).send({ error: `GHL no respondió: ${err.message}` })
    }
  })

  // Listado de cobros de la propia app
  app.get('/api/v1/charges', async (req, reply) => {
    const consumer = req.consumerApp
    const { location_id, event_id, status } = req.query
    const limit = Math.min(Math.max(Math.trunc(numOr(req.query.limit, 50) ?? 50), 1), 200)
    const offset = Math.max(Math.trunc(numOr(req.query.offset, 0) ?? 0), 0)
    const where = ['c.app_id = $1']
    const params = [consumer.id]
    if (location_id) { params.push(location_id); where.push(`c.location_id = $${params.length}`) }
    if (event_id) { params.push(event_id); where.push(`c.event_id = $${params.length}`) }
    if (status) { params.push(status); where.push(`c.status = $${params.length}`) }
    params.push(limit, offset)
    const { rows } = await q(
      `SELECT c.*, m.code AS meter_code FROM charges c
       LEFT JOIN meters m ON m.id = c.meter_id
       WHERE ${where.join(' AND ')}
       ORDER BY c.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    )
    return { charges: rows.map((r) => publicCharge(r)) }
  })

  // Reembolsar un cargo propio
  app.delete('/api/v1/charges/:id', async (req, reply) => {
    const consumer = req.consumerApp
    const id = numOr(req.params.id)
    if (id === null) return reply.code(400).send({ error: 'id inválido' })
    const { rows: [row] } = await q('SELECT * FROM charges WHERE id=$1 AND app_id=$2', [id, consumer.id])
    if (!row) return reply.code(404).send({ error: 'Cargo no encontrado' })
    try {
      const updated = await refundCharge(row)
      return { charge: publicCharge(updated) }
    } catch (err) {
      return reply.code(err.statusCode || 502).send({ error: err.message })
    }
  })

  // Tarifas activas disponibles
  app.get('/api/v1/meters', async () => {
    const { rows } = await q(
      `SELECT code, name, unit_label, price_type, default_price, min_price, max_price
       FROM meters WHERE active=true ORDER BY code`
    )
    return {
      meters: rows.map((m) => ({
        code: m.code,
        name: m.name,
        unit_label: m.unit_label,
        price_type: m.price_type,
        default_price: numOr(m.default_price),
        min_price: numOr(m.min_price),
        max_price: numOr(m.max_price),
      })),
    }
  })

  // Subcuentas conectadas que esta app puede cobrar
  app.get('/api/v1/locations', async (req) => {
    const { rows } = await q(
      `SELECT location_id, COALESCE(NULLIF(alias, ''), name, location_id) AS name, test_mode, status
       FROM connections ORDER BY created_at DESC`
    )
    return { locations: rows.filter((r) => locationAllowed(req.consumerApp, r.location_id)) }
  })

  // ¿Esta subcuenta tiene acceso/suscripción vigente a MI app? (la app se identifica por su API key)
  app.get('/api/v1/access/:locationId', async (req, reply) => {
    const locationId = req.params.locationId
    if (!locationAllowed(req.consumerApp, locationId)) {
      return reply.code(403).send({ error: 'Esta API key no está autorizada para esa subcuenta' })
    }
    const access = await checkAccess(req.consumerApp.id, locationId)
    return { ...access, credit: await getBalance(locationId) }
  })
}
