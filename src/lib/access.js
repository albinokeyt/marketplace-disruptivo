import { q } from '../db.js'

const VALID = ['trial', 'active', 'comped']
const isValid = (s, now) =>
  VALID.includes(s.status) && new Date(s.starts_at).getTime() <= now &&
  (!s.ends_at || new Date(s.ends_at).getTime() > now)

// renovación impagada con reintentos en curso: el acceso sigue (ends_at alargado por la gracia) pero hay que avisar
const inGrace = (s) => s.status === 'active' && Boolean(s.auto_renew) && (s.failed_charges || 0) > 0

// por qué NO hay acceso: lo más útil primero (impagada > programada > la más reciente caducada/cancelada)
const REASON_RANK = { past_due: 0, scheduled: 1, expired: 2, canceled: 2 }

// ¿Tiene esta subcuenta acceso a esta app? Acceso = suscripción vigente directa a la app
// o vía un plan que la incluya. Estados con acceso: trial, active, comped (cortesía).
// La vigencia se calcula SIEMPRE al leer (ends_at manda sobre el status guardado).
export async function checkAccess(appId, locationId) {
  const now = Date.now()
  const { rows } = await q(
    `SELECT s.id, s.app_id, s.plan_id, s.status, s.starts_at, s.ends_at, s.failed_charges, s.auto_renew,
            p.name AS plan_name, p.app_ids AS plan_app_ids
     FROM subscriptions s
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE s.location_id = $1
     ORDER BY s.ends_at DESC NULLS FIRST, s.updated_at DESC`,
    [locationId]
  )
  let last = null
  for (const s of rows) {
    const viaApp = s.app_id === appId
    const planApps = Array.isArray(s.plan_app_ids) ? s.plan_app_ids.map(Number) : []
    const viaPlan = !viaApp && planApps.includes(Number(appId))
    if (!viaApp && !viaPlan) continue
    if (isValid(s, now)) {
      return {
        access: true,
        via: viaApp ? 'app' : 'plan',
        // el nombre del plan también en las suscripciones directas a la app (la app lo muestra en su panel)
        plan: s.plan_name || null,
        status: s.status,
        grace: inGrace(s),
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        subscription_id: s.id,
      }
    }
    const reason = derivedStatus(s)
    if (!last || (REASON_RANK[reason] ?? 9) < (REASON_RANK[last] ?? 9)) last = reason
  }
  return { access: false, reason: last || 'none' }
}

// Estado derivado para el panel: lo que el admin debe ver, no el status crudo
export function derivedStatus(sub) {
  // impagada manda sobre "caducada": explica POR QUÉ se le cortó el acceso
  if (sub.status === 'past_due') return 'past_due'
  if (sub.status === 'canceled') return 'canceled'
  if (sub.ends_at && new Date(sub.ends_at).getTime() <= Date.now()) return 'expired'
  if (new Date(sub.starts_at).getTime() > Date.now()) return 'scheduled'
  if (inGrace(sub)) return 'grace'
  return sub.status
}
