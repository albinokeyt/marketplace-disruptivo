import { q, numOr } from '../db.js'
import { getSetting, isGlobalTestMode } from './settings.js'
import { executeCharge, publicCharge } from './charges.js'
import { trySpendCredit, getBalance } from './credits.js'
import { getSystemApp } from './topup.js'
import { normalizeBillingConfig, addMonths, afterFailure, LEAD_HOURS } from './billingRules.js'
import { checkAccess } from './access.js'
import { hasFunds } from './ghl.js'

const fail = (statusCode, message) => { const e = new Error(message); e.statusCode = statusCode; return e }

// COBRO RECURRENTE de suscripciones (el otro modelo es el cobro por uso de /api/v1/charges).
// Cada periodo se cobra UNA vez: el event_id es determinista (sub-<id>-<inicio del periodo>) y la
// idempotencia de charges(app_id, event_id) impide que un reintento o dos réplicas cobren dos veces.
// Las reglas puras (gracia, reintentos, meses de calendario) viven en billingRules.js.
export { addMonths }

export async function getBillingConfig() {
  return normalizeBillingConfig((await getSetting('subscription_billing')) || {})
}

const periodKey = (date) => new Date(date).toISOString().slice(0, 10)

// Cobra UN periodo de una suscripción. Devuelve { charged } | { already } | { skipped, reason } | { failed, error }.
// Nunca lanza por un fallo de cobro: el barrido debe seguir con las demás suscripciones.
export async function chargeSubscriptionOnce(sub, cfg, log) {
  const price = numOr(sub.price, 0) ?? 0
  if (price <= 0) return { skipped: true, reason: 'sin precio' }

  const { rows: [meter] } = await q('SELECT * FROM meters WHERE code=$1 AND active=true', [cfg.meter_code])
  if (!meter) return { skipped: true, reason: `falta la tarifa "${cfg.meter_code}"` }
  // La tarifa de suscripciones admite dos formas, y el precio del plan encaja en las dos:
  //   · dynamic → 1 unidad al precio del plan (limitado por el min/max del meter en GHL)
  //   · fixed 1.00 → tantas unidades como dólares (sin techo de precio; el patrón de las recargas)
  const fixedUnit = meter.price_type === 'fixed' && Math.abs((numOr(meter.default_price) ?? 0) - 1) < 1e-9
  if (!fixedUnit && meter.price_type !== 'dynamic') {
    return { skipped: true, reason: `la tarifa "${meter.code}" debe ser dinámica o fija a 1.00 por unidad` }
  }
  if (meter.price_type === 'dynamic') {
    const min = numOr(meter.min_price)
    const max = numOr(meter.max_price)
    if ((min !== null && price < min) || (max !== null && price > max)) {
      return { skipped: true, reason: `el precio ${price} está fuera del rango de la tarifa "${meter.code}"` }
    }
  }

  const { rows: [conn] } = await q('SELECT * FROM connections WHERE location_id=$1', [sub.location_id])
  if (!conn) return { skipped: true, reason: 'subcuenta no conectada' }
  if (conn.status !== 'connected') return { skipped: true, reason: `conexión en estado "${conn.status}"` }

  // Los cobros de una suscripción de UNA app los firma esa app (así los ve en su historial);
  // los de un PLAN (varias apps) los firma la app interna del sistema.
  let app
  if (sub.app_id) {
    const { rows: [a] } = await q('SELECT * FROM apps WHERE id=$1', [sub.app_id])
    app = a
    if (!app || app.status !== 'active') return { skipped: true, reason: 'la app de la suscripción está desactivada' }
  } else {
    app = await getSystemApp()
  }

  const testMode = (await isGlobalTestMode()) || conn.test_mode || app.test_mode
  const eventId = `sub-${sub.id}-${periodKey(sub.next_charge_at)}`
  const description = `Suscripción ${sub.plan_name || sub.app_name || ''}`.trim() + ` · ${sub.period_months} mes(es)`
  const units = fixedUnit ? price : 1
  const pricePerUnit = fixedUnit ? 1 : price

  const { rows: [inserted] } = await q(
    `INSERT INTO charges (app_id, meter_id, connection_id, location_id, event_id, units, price_per_unit,
                          amount, status, description, kind, paid_with, subscription_id)
     VALUES ($1,$2,$3,$4,$5,$10,$11,$6,$7,$8,'subscription','wallet',$9)
     ON CONFLICT (app_id, event_id) DO NOTHING
     RETURNING *`,
    [app.id, meter.id, conn.id, sub.location_id, eventId, price, testMode ? 'test' : 'pending', description, sub.id,
     units, pricePerUnit]
  )

  let row = inserted
  if (!row) {
    // este periodo ya se intentó: si quedó cobrado, se avanza sin volver a cobrar
    const { rows: [existing] } = await q('SELECT * FROM charges WHERE app_id=$1 AND event_id=$2', [app.id, eventId])
    if (!existing) return { failed: true, error: 'no se pudo registrar el cobro' }
    if (['created', 'test'].includes(existing.status)) return { already: true, charge: existing }
    if (existing.status === 'refunded') return { skipped: true, reason: 'el cobro de este periodo fue reembolsado' }
    if (['pending', 'unknown'].includes(existing.status)) return { skipped: true, reason: 'cobro en verificación' }
    // 'failed': se reclama la fila y se reintenta contra GHL con el mismo event_id
    const { rows: [claimed] } = await q(
      `UPDATE charges SET status='pending', error=NULL, units=$3, price_per_unit=$4, amount=$2, updated_at=now()
       WHERE id=$1 AND status='failed' RETURNING *`, [existing.id, price, units, pricePerUnit])
    if (!claimed) return { skipped: true, reason: 'el cobro cambió de estado' }
    row = claimed
  }

  if (testMode) return { charged: true, test_mode: true, charge: row }

  // el crédito interno se consume ANTES que el wallet (igual que en el cobro por uso)
  if (inserted) {
    const credit = await trySpendCredit(row.id, sub.location_id, price)
    if (credit.ok) return { charged: true, charge: credit.row }
    if (credit.reason === 'not_pending') {
      const { rows: [cur] } = await q('SELECT * FROM charges WHERE id=$1', [row.id])
      return { already: true, charge: cur }
    }
  }

  try {
    const input = {
      meter, conn, units, pricePerUnit, amount: price,
      description, userId: null, eventTime: null,
    }
    const updated = await executeCharge(row.id, input, log)
    return { charged: true, charge: updated }
  } catch (err) {
    // ambiguo (unknown) o rechazado: el reconciliador ya sabe cerrarlo; aquí solo se reporta
    return { failed: true, error: err.message, charge: err.charge || null }
  }
}

// Barrido: cobra las suscripciones vencidas y mueve su periodo. Se ejecuta dentro del reconciliador.
export async function sweepSubscriptions(log) {
  const cfg = await getBillingConfig()
  if (!cfg.enabled) return { checked: 0 }

  const { rows } = await q(
    `SELECT s.*, a.name AS app_name, p.name AS plan_name
     FROM subscriptions s
     LEFT JOIN apps a ON a.id = s.app_id
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE s.auto_renew = true
       AND s.status IN ('active','trial','past_due')
       AND s.price > 0
       AND s.next_charge_at IS NOT NULL
       AND s.next_charge_at <= now() + interval '${LEAD_HOURS} hours'
       AND (s.retry_at IS NULL OR s.retry_at <= now())
     ORDER BY s.next_charge_at ASC
     LIMIT 25`
  )
  if (!rows.length) return { checked: 0 }

  let charged = 0
  let failed = 0
  for (const sub of rows) {
    try {
      const r = await chargeSubscriptionOnce(sub, cfg, log)

      if (r.charged || r.already) {
        // periodo pagado: se extiende el acceso y se programa el siguiente cobro
        const base = new Date(sub.next_charge_at)
        const next = addMonths(base, sub.period_months || 1)
        await q(
          `UPDATE subscriptions
             SET status='active', ends_at=$2, next_charge_at=$2, failed_charges=0, last_error=NULL,
                 retry_at=NULL, updated_at=now()
           WHERE id=$1`, [sub.id, next])
        charged++
        log?.info?.({ subId: sub.id, hasta: next }, 'suscripción cobrada y renovada')
        continue
      }

      // no se pudo cobrar: gracia al primer fallo, reintento diario con el MISMO event_id y, agotados los
      // intentos, impagada (las reglas exactas, en afterFailure)
      const fails = (sub.failed_charges || 0) + 1
      const motivo = r.reason || r.error || 'cobro no completado'
      const next = afterFailure({ sub, fails, cfg })
      await q(
        `UPDATE subscriptions
           SET failed_charges=$2, last_error=$3, status=$4, ends_at=$5, next_charge_at=$6, retry_at=$7,
               updated_at=now()
         WHERE id=$1`,
        [sub.id, fails, String(motivo).slice(0, 500), next.status, next.ends_at, next.next_charge_at, next.retry_at])
      failed++
      log?.warn?.({ subId: sub.id, intentos: fails, motivo, agotado: next.exhausted, acceso_hasta: next.ends_at },
        'suscripción sin cobrar')
    } catch (err) {
      log?.error?.({ err: err.message, subId: sub.id }, 'barrido de suscripciones: fallo inesperado')
    }
  }
  return { checked: rows.length, charged, failed }
}

// COMPRA desde el portal del cliente: crea la suscripción y cobra el PRIMER periodo ahora mismo
// (crédito interno → wallet de GHL). Sin cobro no hay acceso: si falla, la suscripción queda cancelada
// con el motivo y el cliente recibe un error claro. Después se renueva sola cada period_months.
export async function purchasePlan({ locationId, planId, userId = null, log }) {
  const cfg = await getBillingConfig()
  if (!cfg.enabled) throw fail(503, 'La contratación de planes está desactivada temporalmente')
  const { rows: [plan] } = await q('SELECT * FROM plans WHERE id=$1 AND active=true AND visible=true', [planId])
  if (!plan) throw fail(404, 'Plan no disponible')
  const price = numOr(plan.price) ?? 0
  if (price <= 0) throw fail(400, 'Este plan no se contrata desde el portal: pídeselo a tu agencia')
  const appIds = (Array.isArray(plan.app_ids) ? plan.app_ids : []).map(Number).filter(Boolean)
  if (!appIds.length) throw fail(400, 'El plan no incluye ninguna app')
  const { rows: apps } = await q('SELECT id, name, status FROM apps WHERE id = ANY($1)', [appIds])
  if (apps.length !== appIds.length || apps.some((a) => a.status !== 'active')) throw fail(409, 'Alguna app del plan no está disponible')
  const { rows: [conn] } = await q('SELECT * FROM connections WHERE location_id=$1', [locationId])
  if (!conn || conn.status !== 'connected') throw fail(409, 'Esta subcuenta no tiene instalado Marketplace Disruptivo: pídeselo a tu agencia para poder pagar con tu saldo')
  for (const a of apps) {
    const acc = await checkAccess(a.id, locationId)
    if (acc.access) throw fail(409, `Ya tienes acceso a ${a.name}${acc.ends_at ? ' hasta el ' + new Date(acc.ends_at).toLocaleDateString('es-ES') : ''}`)
  }
  // fondos ANTES de crear nada: crédito interno o, si no llega, el wallet de GHL
  const credit = await getBalance(locationId)
  if (credit < price) {
    let wallet = false
    try { wallet = Boolean((await hasFunds(conn.id))?.hasFunds) } catch { wallet = false }
    if (!wallet) throw fail(402, `Saldo insuficiente para ${price.toFixed(2)} USD: recarga tu saldo o tu wallet de GoHighLevel y vuelve a intentarlo`)
  }
  const period = Math.max(1, plan.period_months || 1)
  const now = new Date()
  // un plan de UNA app se atribuye a esa app (así lo ve en su historial); un pack lo firma la app del sistema
  const appId = appIds.length === 1 ? appIds[0] : null
  const { rows: [sub] } = await q(
    `INSERT INTO subscriptions (location_id, app_id, plan_id, status, starts_at, ends_at, notes, price, period_months, auto_renew, next_charge_at)
     VALUES ($1,$2,$3,'active',$4,$4,$5,$6,$7,true,$4) RETURNING *`,
    [locationId, appId, plan.id, now, `Contratado desde el portal${userId ? ` (${userId})` : ''}`, price, period]
  )
  const r = await chargeSubscriptionOnce({ ...sub, plan_name: plan.name, app_name: apps.length === 1 ? apps[0].name : null }, cfg, log)
  if (r.charged || r.already) {
    const next = addMonths(now, period)
    const { rows: [updated] } = await q(
      `UPDATE subscriptions SET status='active', ends_at=$2, next_charge_at=$2, failed_charges=0, last_error=NULL, retry_at=NULL,
              updated_at=now() WHERE id=$1 RETURNING *`, [sub.id, next])
    log?.info?.({ subId: sub.id, locationId, planId: plan.id, price, hasta: next, test: Boolean(r.test_mode) }, 'plan contratado desde el portal')
    return {
      subscription: { ...updated, plan_name: plan.name, apps: apps.map((a) => a.name) },
      charge: r.charge ? publicCharge(r.charge) : null,
      test_mode: Boolean(r.test_mode),
    }
  }
  const motivo = String(r.reason || r.error || 'cobro no completado')
  await q(
    `UPDATE subscriptions SET status='canceled', ends_at=$2, auto_renew=false, next_charge_at=NULL, last_error=$3,
            notes = notes || ' · cobro fallido', updated_at=now() WHERE id=$1`, [sub.id, now, motivo.slice(0, 500)])
  log?.warn?.({ subId: sub.id, locationId, planId: plan.id, motivo }, 'contratación fallida')
  throw fail(402, /insufficient|fondos|funds|saldo|balance/i.test(motivo)
    ? `No se pudo cobrar ${price.toFixed(2)} USD: saldo insuficiente. Recarga tu saldo o tu wallet de GoHighLevel y vuelve a intentarlo`
    : `No se pudo cobrar el plan: ${motivo}`)
}
