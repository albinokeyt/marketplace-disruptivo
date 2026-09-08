// Reglas PURAS del cobro recurrente (sin base de datos): se prueban en test/unit.test.js
import { numOr } from '../db.js'

export const DEFAULTS = { enabled: true, meter_code: 'suscripcion', max_retries: 10, grace_days: 3 }
// entre intentos fallidos
export const RETRY_HOURS = 24
// el cobro de renovación se intenta hasta LEAD_HOURS ANTES de que venza el periodo: si va bien, el acceso se
// extiende antes de caducar y el cliente nunca ve un "access:false" entre el vencimiento y el cobro
export const LEAD_HOURS = 1

export const normalizeBillingConfig = (s = {}) => ({
  enabled: s.enabled === undefined ? DEFAULTS.enabled : Boolean(s.enabled),
  meter_code: String(s.meter_code || DEFAULTS.meter_code).trim().toLowerCase(),
  max_retries: Math.max(1, Math.trunc(numOr(s.max_retries) ?? DEFAULTS.max_retries)),
  grace_days: Math.max(0, numOr(s.grace_days) ?? DEFAULTS.grace_days),
})

// suma meses de CALENDARIO (no 30 días fijos): el 31 de enero + 1 mes cae en el último día de febrero.
// En UTC: el resultado no depende de la zona horaria de la máquina ni de los cambios de hora
export const addMonths = (base, n) => {
  const d = new Date(base.getTime())
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()))
  return d
}

// Qué le pasa a una suscripción tras un intento de cobro FALLIDO.
//   · next_charge_at NO se mueve: marca el periodo que se está cobrando → el mismo event_id en cada reintento,
//     así un intento ambiguo (unknown) que GHL acabe confirmando nunca se cobra dos veces
//   · retry_at = cuándo volver a intentarlo
//   · GRACIA: al PRIMER fallo de una suscripción que ya estaba activa (pagó antes), ends_at se alarga grace_days
//     desde el vencimiento: el cliente sigue con acceso mientras se reintenta. Una prueba gratuita que no
//     consigue convertirse en pago no tiene gracia: se corta al vencer.
//   · agotados los reintentos → past_due (checkAccess ya no lo da por válido) hasta que el admin la reactive
export function afterFailure({ sub, fails, cfg, now = new Date() }) {
  const exhausted = fails >= cfg.max_retries
  let endsAt = sub.ends_at ? new Date(sub.ends_at) : null
  if (fails === 1 && sub.status === 'active' && cfg.grace_days > 0 && endsAt && sub.next_charge_at) {
    const graceEnd = new Date(new Date(sub.next_charge_at).getTime() + cfg.grace_days * 86_400_000)
    if (graceEnd > endsAt) endsAt = graceEnd
  }
  return {
    exhausted,
    status: exhausted ? 'past_due' : sub.status,
    ends_at: endsAt,
    next_charge_at: exhausted ? null : sub.next_charge_at,
    retry_at: exhausted ? null : new Date(now.getTime() + RETRY_HOURS * 3_600_000),
  }
}
