import { q } from '../db.js'

// ¿Tiene esta subcuenta acceso a esta app? Acceso = suscripción vigente directa a la app
// o vía un plan que la incluya. Estados con acceso: trial, active, comped (cortesía).
// La vigencia se calcula SIEMPRE al leer (ends_at manda sobre el status guardado).
export async function checkAccess(appId, locationId) {
  const { rows } = await q(
    `SELECT s.id, s.app_id, s.plan_id, s.status, s.starts_at, s.ends_at,
            p.name AS plan_name, p.app_ids AS plan_app_ids
     FROM subscriptions s
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE s.location_id = $1
       AND s.status IN ('trial','active','comped')
       AND s.starts_at <= now()
       AND (s.ends_at IS NULL OR s.ends_at > now())
     ORDER BY s.ends_at DESC NULLS FIRST`,
    [locationId]
  )
  for (const s of rows) {
    const viaApp = s.app_id === appId
    const planApps = Array.isArray(s.plan_app_ids) ? s.plan_app_ids.map(Number) : []
    const viaPlan = !viaApp && planApps.includes(Number(appId))
    if (viaApp || viaPlan) {
      return {
        access: true,
        via: viaApp ? 'app' : 'plan',
        plan: viaPlan ? s.plan_name : null,
        status: s.status,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        subscription_id: s.id,
      }
    }
  }
  return { access: false }
}

// Estado derivado para el panel: lo que el admin debe ver, no el status crudo
export function derivedStatus(sub) {
  // impagada manda sobre "caducada": explica POR QUÉ se le cortó el acceso
  if (sub.status === 'past_due') return 'past_due'
  if (sub.ends_at && new Date(sub.ends_at).getTime() <= Date.now()) return 'expired'
  if (new Date(sub.starts_at).getTime() > Date.now()) return 'scheduled'
  return sub.status
}
