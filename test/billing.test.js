import { test } from 'node:test'
import assert from 'node:assert/strict'
import { afterFailure, addMonths, normalizeBillingConfig, LEAD_HOURS, RETRY_HOURS } from '../src/lib/billingRules.js'
import { derivedStatus } from '../src/lib/access.js'

const cfg = normalizeBillingConfig({})
const T = new Date('2026-10-07T12:00:00.000Z') // vencimiento del periodo (= next_charge_at)
const now = new Date('2026-10-07T11:30:00.000Z') // el barrido cobra hasta LEAD_HOURS antes de vencer
const activa = { id: 1, status: 'active', auto_renew: true, ends_at: T, next_charge_at: T, failed_charges: 0 }

test('normalizeBillingConfig: valores por defecto y saneado', () => {
  assert.deepEqual(cfg, { enabled: true, meter_code: 'suscripcion', max_retries: 10, grace_days: 3 })
  const c = normalizeBillingConfig({ enabled: false, meter_code: ' Sub ', max_retries: '0', grace_days: '-2' })
  assert.deepEqual(c, { enabled: false, meter_code: 'sub', max_retries: 1, grace_days: 0 })
  assert.equal(LEAD_HOURS, 1)
  assert.equal(RETRY_HOURS, 24)
})

test('primer fallo de una suscripción activa: gracia, reintento en 24 h y MISMO periodo (event_id estable)', () => {
  const r = afterFailure({ sub: activa, fails: 1, cfg, now })
  assert.equal(r.exhausted, false)
  assert.equal(r.status, 'active')
  assert.equal(r.ends_at.toISOString(), '2026-10-10T12:00:00.000Z') // vencimiento + 3 días
  assert.equal(r.next_charge_at, T) // no se mueve: sub-1-2026-10-07 en cada reintento
  assert.equal(r.retry_at.toISOString(), '2026-10-08T11:30:00.000Z')
})

test('segundo fallo: la gracia no se vuelve a alargar', () => {
  const enGracia = { ...activa, failed_charges: 1, ends_at: new Date('2026-10-10T12:00:00.000Z') }
  const r = afterFailure({ sub: enGracia, fails: 2, cfg, now: new Date('2026-10-08T11:30:00.000Z') })
  assert.equal(r.ends_at.toISOString(), '2026-10-10T12:00:00.000Z')
  assert.equal(r.status, 'active')
})

test('una prueba gratuita que no convierte no tiene gracia: se corta al vencer', () => {
  const r = afterFailure({ sub: { ...activa, status: 'trial' }, fails: 1, cfg, now })
  assert.equal(r.ends_at.toISOString(), T.toISOString())
  assert.equal(r.status, 'trial')
  assert.ok(r.retry_at) // pero se sigue intentando
})

test('sin gracia configurada (0 días) no se alarga nada; ends_at más lejano se respeta', () => {
  const r = afterFailure({ sub: activa, fails: 1, cfg: { ...cfg, grace_days: 0 }, now })
  assert.equal(r.ends_at.toISOString(), T.toISOString())
  const lejana = { ...activa, ends_at: new Date('2026-12-01T00:00:00.000Z') }
  assert.equal(afterFailure({ sub: lejana, fails: 1, cfg, now }).ends_at.toISOString(), '2026-12-01T00:00:00.000Z')
})

test('agotados los reintentos: impagada, sin más cobros programados', () => {
  const r = afterFailure({ sub: { ...activa, failed_charges: 9 }, fails: 10, cfg, now })
  assert.equal(r.exhausted, true)
  assert.equal(r.status, 'past_due')
  assert.equal(r.next_charge_at, null)
  assert.equal(r.retry_at, null)
})

test('addMonths suma meses de calendario sin desbordar el mes', () => {
  assert.equal(addMonths(new Date('2027-01-31T10:00:00.000Z'), 1).toISOString().slice(0, 10), '2027-02-28')
  assert.equal(addMonths(new Date('2026-10-07T12:00:00.000Z'), 1).toISOString(), '2026-11-07T12:00:00.000Z')
  assert.equal(addMonths(new Date('2026-11-30T12:00:00.000Z'), 3).toISOString().slice(0, 10), '2027-02-28')
})

test('derivedStatus: impagada > cancelada > caducada > programada > en gracia > estado', () => {
  const futuro = new Date(Date.now() + 5 * 86_400_000)
  const pasado = new Date(Date.now() - 86_400_000)
  const base = { status: 'active', starts_at: pasado, ends_at: futuro, auto_renew: true, failed_charges: 0 }
  assert.equal(derivedStatus({ ...base, status: 'past_due', ends_at: pasado }), 'past_due')
  assert.equal(derivedStatus({ ...base, status: 'canceled', ends_at: pasado }), 'canceled')
  assert.equal(derivedStatus({ ...base, ends_at: pasado }), 'expired')
  assert.equal(derivedStatus({ ...base, starts_at: futuro }), 'scheduled')
  assert.equal(derivedStatus({ ...base, failed_charges: 1 }), 'grace')
  assert.equal(derivedStatus({ ...base, failed_charges: 1, auto_renew: false }), 'active')
  assert.equal(derivedStatus({ ...base, status: 'trial', failed_charges: 1 }), 'trial')
  assert.equal(derivedStatus(base), 'active')
})
