// Unitarios de la regla «CORTESÍA PRIMERO» (src/lib/finanzas.js, función pura, sin BD): cada consumo se paga primero
// con la cortesía (lo añadido a mano por el administrador) y el resto con dinero real (tarjeta o monedero de GHL).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularFinanzas, sumarBloques, totalizar, fechaValida, resolverZona, CAMPOS } from '../src/lib/finanzas.js'

const APP = 1 // la app que pregunta
const OTRA = 2

// Constructores de filas del libro (amount con signo, como en credit_entries)
let n = 0
const fila = (o) => ({ id: ++n, location_id: 'L1', amount: 0, reason: null, charge_id: null, card_topup_id: null, dia: '2026-11-10', charge_app_id: null, ...o })
const manual = (amount, o = {}) => fila({ amount, reason: o.reason ?? 'promo', ...o })
const tarjeta = (amount, topupId, o = {}) => fila({ amount, reason: 'recarga con tarjeta', card_topup_id: topupId, ...o })
const monedero = (amount, chargeId, o = {}) => fila({ amount, reason: 'recarga', charge_id: chargeId, charge_app_id: 99, ...o })
const reversion = (amount, chargeId, o = {}) => fila({ amount: -Math.abs(amount), reason: 'reversion_recarga', charge_id: chargeId, charge_app_id: 99, ...o })
const consumo = (amount, chargeId, app = APP, o = {}) => fila({ amount: -Math.abs(amount), reason: 'consumo de cobro', charge_id: chargeId, charge_app_id: app, ...o })
const reembolso = (amount, chargeId, app = APP, o = {}) => fila({ amount: Math.abs(amount), reason: `reembolso del cargo #${chargeId}`, charge_id: chargeId, charge_app_id: app, ...o })

const calc = (filas, extra = {}) => calcularFinanzas({ filas, appId: APP, ...extra })

test('cortesía primero: el consumo se paga con la cortesía aunque haya dinero real', () => {
  const r = calc([manual(10), tarjeta(20, 7), consumo(5, 100)]).L1
  assert.deepEqual(r.saldo, { total: 25, cortesia: 5, real: 20 })
  assert.equal(r.historico.cortesia_concedida, 10)
  assert.equal(r.historico.real_tarjeta, 20)
  assert.equal(r.historico.real_recargado, 20)
  assert.equal(r.historico.consumo_total, 5)
  assert.equal(r.historico.consumo_app, 5)
  assert.equal(r.historico.consumo_app_cortesia, 5)
  assert.equal(r.historico.consumo_app_real, 0)
  assert.equal(r.rango, null) // sin desde/hasta no hay bloque de rango
})

test('un consumo que agota la cortesía cruza al dinero real', () => {
  const r = calc([manual(3), monedero(10, 50), consumo(5, 101)]).L1
  assert.deepEqual(r.saldo, { total: 8, cortesia: 0, real: 8 })
  assert.equal(r.historico.real_monedero, 10)
  assert.equal(r.historico.consumo_app_cortesia, 3)
  assert.equal(r.historico.consumo_app_real, 2)
})

test('reembolso total: vuelve a cada bolsa lo que se gastó de ella y el consumo de la app queda en 0', () => {
  const r = calc([manual(3), monedero(10, 50), consumo(5, 102), reembolso(5, 102)]).L1
  assert.deepEqual(r.saldo, { total: 13, cortesia: 3, real: 10 })
  assert.equal(r.historico.reembolsos_app, 5)
  assert.equal(r.historico.consumo_app, 0)
  assert.equal(r.historico.consumo_app_cortesia, 0)
  assert.equal(r.historico.consumo_app_real, 0)
  assert.equal(r.historico.consumo_total, 0)
})

test('reembolso parcial: proporcional al reparto del consumo; lo que excede lo consumido vuelve como dinero real', () => {
  // consumo de 4: 1 de cortesía y 3 de dinero real
  const base = [manual(1), tarjeta(10, 8), consumo(4, 103)]
  const r1 = calc([...base, reembolso(2, 103)]).L1
  assert.deepEqual(r1.saldo, { total: 9, cortesia: 0.5, real: 8.5 })
  assert.equal(r1.historico.consumo_app, 2)
  assert.equal(r1.historico.consumo_app_cortesia, 0.5)
  assert.equal(r1.historico.consumo_app_real, 1.5)
  assert.equal(r1.historico.reembolsos_app, 2)
  // un segundo reembolso de 3 (queda 2 por devolver): 0,5 a cortesía, 1,5 a real y el exceso de 1 a real
  const r2 = calc([...base, reembolso(2, 103), reembolso(3, 103)]).L1
  assert.deepEqual(r2.saldo, { total: 12, cortesia: 1, real: 11 })
  assert.equal(r2.historico.reembolsos_app, 5)
  assert.equal(r2.historico.consumo_app_cortesia, 0)
  assert.equal(r2.historico.consumo_app_real, 0) // 3 − 1,5 − 2,5 → nunca negativo
  assert.equal(r2.historico.consumo_app, 0)
})

test('reembolso de un cargo sin consumo previo en el libro: todo vuelve como dinero real', () => {
  const r = calc([reembolso(2, 555)]).L1
  assert.deepEqual(r.saldo, { total: 2, cortesia: 0, real: 2 })
  assert.equal(r.historico.reembolsos_app, 2)
})

test('retirada manual mayor que la cortesía: se lleva toda la cortesía y el resto sale del dinero real', () => {
  const r = calc([manual(2), tarjeta(10, 9), manual(-5, { reason: 'corrección' })]).L1
  assert.deepEqual(r.saldo, { total: 7, cortesia: 0, real: 7 })
  assert.equal(r.historico.cortesia_concedida, 2)
  assert.equal(r.historico.cortesia_retirada, 2) // solo lo que salió de la cortesía
  assert.equal(r.historico.real_retirado, 3) // el resto salió del dinero real
  assert.equal(r.historico.real_recargado, 7) // 10 − 3 retirados a mano
})

test('retirada manual de una recarga con tarjeta: es dinero real retirado, la cortesía neta queda en 0', () => {
  const r = calc([tarjeta(10, 10), manual(-10, { reason: 'devolución desde Stripe' })]).L1
  assert.deepEqual(r.saldo, { total: 0, cortesia: 0, real: 0 })
  assert.equal(r.historico.real_tarjeta, 10)
  assert.equal(r.historico.real_retirado, 10)
  assert.equal(r.historico.real_recargado, 0)
  assert.equal(r.historico.cortesia_concedida - r.historico.cortesia_retirada, 0)
})

test('ajuste manual sin motivo o con un texto que empieza por «reembolso» también es cortesía', () => {
  const r = calc([manual(4, { reason: null }), manual(1, { reason: 'reembolso por error nuestro' })]).L1
  assert.deepEqual(r.saldo, { total: 5, cortesia: 5, real: 0 })
  assert.equal(r.historico.cortesia_concedida, 5)
  assert.equal(r.historico.reembolsos_app, 0)
})

test('reversión de recarga: sale del dinero real y, si no llega, de la cortesía', () => {
  const r1 = calc([monedero(10, 60), manual(2), reversion(10, 60)]).L1
  assert.deepEqual(r1.saldo, { total: 2, cortesia: 2, real: 0 })
  assert.equal(r1.historico.real_monedero, 10)
  assert.equal(r1.historico.real_revertido, 10)
  assert.equal(r1.historico.real_recargado, 0)
  // si el dinero real no cubre la reversión, el resto se descuenta de la cortesía
  const r2 = calc([manual(5), monedero(4, 61), reversion(6, 61)]).L1
  assert.deepEqual(r2.saldo, { total: 3, cortesia: 3, real: 0 })
  assert.equal(r2.historico.real_recargado, 0) // 4 − 6 → nunca negativo
})

test('real_recargado = tarjeta + monedero − revertido', () => {
  const r = calc([tarjeta(15, 1), monedero(10, 62), monedero(5, 63), reversion(5, 63)]).L1
  assert.equal(r.historico.real_tarjeta, 15)
  assert.equal(r.historico.real_monedero, 15)
  assert.equal(r.historico.real_revertido, 5)
  assert.equal(r.historico.real_recargado, 25)
  assert.deepEqual(r.saldo, { total: 25, cortesia: 0, real: 25 })
})

test('consumo de otra app: gasta igual cortesía primero pero cuenta en consumo_otras_apps', () => {
  const r = calc([manual(3), tarjeta(10, 2), consumo(4, 200, OTRA), consumo(2, 201, APP)]).L1
  assert.deepEqual(r.saldo, { total: 7, cortesia: 0, real: 7 })
  assert.equal(r.historico.consumo_otras_apps, 4)
  assert.equal(r.historico.consumo_app, 2)
  assert.equal(r.historico.consumo_app_cortesia, 0) // la cortesía ya se la llevó la otra app
  assert.equal(r.historico.consumo_app_real, 2)
  assert.equal(r.historico.consumo_total, 6)
  // y su reembolso resta de consumo_otras_apps, no de los de la app
  const r2 = calc([manual(3), tarjeta(10, 2), consumo(4, 200, OTRA), reembolso(4, 200, OTRA)]).L1
  assert.equal(r2.historico.consumo_otras_apps, 0)
  assert.equal(r2.historico.reembolsos_app, 0)
  assert.deepEqual(r2.saldo, { total: 13, cortesia: 3, real: 10 })
})

test('rango: solo suma lo que cae dentro, pero el reparto de cada consumo usa todo el historial anterior', () => {
  const filas = [
    manual(5, { dia: '2026-10-15' }),
    tarjeta(20, 3, { dia: '2026-10-20' }),
    consumo(8, 300, APP, { dia: '2026-11-03' }),
    consumo(1, 301, APP, { dia: '2026-12-01' }),
  ]
  const r = calc(filas, { desde: '2026-11-01', hasta: '2026-11-30' }).L1
  // en noviembre no se concedió ni se recargó nada…
  assert.equal(r.rango.cortesia_concedida, 0)
  assert.equal(r.rango.real_recargado, 0)
  // …pero el consumo de noviembre se pagó con la cortesía de octubre
  assert.equal(r.rango.consumo_app, 8)
  assert.equal(r.rango.consumo_app_cortesia, 5)
  assert.equal(r.rango.consumo_app_real, 3)
  // el histórico lo incluye todo y el saldo es el de ahora
  assert.equal(r.historico.consumo_app, 9)
  assert.equal(r.historico.cortesia_concedida, 5)
  assert.deepEqual(r.saldo, { total: 16, cortesia: 0, real: 16 })
})

test('rango abierto: solo «desde» = hasta hoy; solo «hasta» = desde el principio', () => {
  const filas = [manual(1, { dia: '2026-01-05' }), manual(2, { dia: '2026-06-05' }), manual(4, { dia: '2026-11-05' })]
  assert.equal(calc(filas, { desde: '2026-06-01' }).L1.rango.cortesia_concedida, 6)
  assert.equal(calc(filas, { hasta: '2026-06-05' }).L1.rango.cortesia_concedida, 3)
})

test('rango: un reembolso dentro del rango de un consumo anterior no deja cifras negativas', () => {
  const filas = [manual(5, { dia: '2026-10-01' }), consumo(2, 400, APP, { dia: '2026-10-30' }), reembolso(2, 400, APP, { dia: '2026-11-02' })]
  const r = calc(filas, { desde: '2026-11-01', hasta: '2026-11-30' }).L1
  assert.equal(r.rango.reembolsos_app, 2)
  for (const k of CAMPOS) assert.ok(r.rango[k] >= 0, `${k} no puede ser negativo`)
  assert.deepEqual(r.saldo, { total: 5, cortesia: 5, real: 0 })
})

test('subcuenta sin movimientos: no aparece; cada subcuenta lleva sus propias bolsas', () => {
  assert.deepEqual(calc([]), {})
  const r = calc([manual(3), fila({ location_id: 'L2', amount: 7, reason: 'recarga con tarjeta', card_topup_id: 11 }), consumo(5, 500, APP, { location_id: 'L2' })])
  assert.deepEqual(Object.keys(r).sort(), ['L1', 'L2'])
  assert.equal(r.L3, undefined)
  assert.deepEqual(r.L1.saldo, { total: 3, cortesia: 3, real: 0 })
  assert.deepEqual(r.L2.saldo, { total: 2, cortesia: 0, real: 2 })
  assert.equal(r.L2.historico.consumo_app_real, 5)
})

test('cobrado_monedero_app: cargos de la app pagados con el monedero de GHL, sin tocar las bolsas', () => {
  const r = calcularFinanzas({
    filas: [], appId: APP, desde: '2026-11-01', hasta: '2026-11-30',
    cargosMonedero: [{ location_id: 'L4', dia: '2026-10-31', amount: '1.5' }, { location_id: 'L4', dia: '2026-11-01', amount: '2.25' }],
  })
  assert.equal(r.L4.historico.cobrado_monedero_app, 3.75)
  assert.equal(r.L4.rango.cobrado_monedero_app, 2.25)
  assert.deepEqual(r.L4.saldo, { total: 0, cortesia: 0, real: 0 })
})

test('importes como texto (numeric de Postgres) y sin errores de coma flotante', () => {
  const filas = [manual('0.1'), manual('0.2'), consumo('0.3', 600)]
  const r = calc(filas).L1
  assert.equal(r.historico.cortesia_concedida, 0.3)
  assert.deepEqual(r.saldo, { total: 0, cortesia: 0, real: 0 })
  const r2 = calc([tarjeta('10.000001', 4), consumo('3.333333', 601)]).L1
  assert.equal(r2.saldo.real, 6.666668)
})

test('otros movimientos del sistema: positivo suma a dinero real, negativo gasta primero cortesía', () => {
  const r = calc([manual(2), fila({ amount: 5, reason: 'algo raro', charge_id: 700, charge_app_id: APP }), fila({ amount: -3, reason: 'otro ajuste', charge_id: 701 })]).L1
  assert.equal(r.historico.otros, 8)
  assert.deepEqual(r.saldo, { total: 4, cortesia: 0, real: 4 })
})

test('sumarBloques suma campo a campo con 6 decimales', () => {
  const a = calc([manual(1.1), consumo(0.2, 800)]).L1.historico
  const b = calc([manual(2.2), consumo(0.4, 801)]).L1.historico
  const t = sumarBloques([a, b])
  assert.equal(t.cortesia_concedida, 3.3)
  assert.equal(t.consumo_app, 0.6)
  assert.deepEqual(Object.keys(t), CAMPOS)
})

test('fechaValida: solo AAAA-MM-DD de días que existen', () => {
  assert.equal(fechaValida('2026-11-01'), true)
  assert.equal(fechaValida('2028-02-29'), true)
  assert.equal(fechaValida('2026-02-29'), false)
  assert.equal(fechaValida('2026-13-01'), false)
  assert.equal(fechaValida('2026-1-01'), false)
  assert.equal(fechaValida('01/11/2026'), false)
  assert.equal(fechaValida(''), false)
  assert.equal(fechaValida(undefined), false)
})

test('resolverZona: nombres IANA válidos; desfases, inventadas o raras → UTC con zona_valida:false', () => {
  assert.deepEqual(resolverZona(undefined), { zona: 'UTC', zona_valida: true })
  assert.deepEqual(resolverZona('Europe/Madrid'), { zona: 'Europe/Madrid', zona_valida: true })
  assert.deepEqual(resolverZona('europe/madrid'), { zona: 'Europe/Madrid', zona_valida: true })
  assert.deepEqual(resolverZona('Marte/Olimpo'), { zona: 'UTC', zona_valida: false })
  assert.deepEqual(resolverZona('+01:00'), { zona: 'UTC', zona_valida: false })
  assert.deepEqual(resolverZona("Europe/Madrid'; DROP TABLE x"), { zona: 'UTC', zona_valida: false })
})

const NOV = { desde: '2026-11-01', hasta: '2026-11-30' }

test('rango: reembolso de un consumo real anterior al rango; las partes no suman más que el consumo neto', () => {
  const r = calc([
    tarjeta(20, 21, { dia: '2026-10-01' }),
    consumo(4, 900, APP, { dia: '2026-10-20' }), // pagado con dinero real
    manual(10, { dia: '2026-11-02' }),
    consumo(10, 901, APP, { dia: '2026-11-03' }), // pagado con cortesía
    reembolso(4, 900, APP, { dia: '2026-11-04' }), // devuelve 4 de dinero real
  ], NOV).L1
  assert.equal(r.rango.consumo_app, 6)
  assert.equal(r.rango.consumo_app_real, 0) // −4 no se puede mostrar: nunca negativo
  assert.equal(r.rango.consumo_app_cortesia, 6)
  assert.equal(r.rango.consumo_app_cortesia + r.rango.consumo_app_real, r.rango.consumo_app)
  assert.equal(r.rango.consumo_total, 6)
  assert.deepEqual(r.saldo, { total: 20, cortesia: 0, real: 20 })
})

test('rango: el dinero real consumido nunca se recorta por un reembolso de cortesía de antes del rango', () => {
  const r = calc([
    manual(4, { dia: '2026-10-01' }),
    consumo(4, 910, APP, { dia: '2026-10-02' }), // pagado con cortesía
    tarjeta(20, 22, { dia: '2026-11-01' }),
    consumo(10, 911, APP, { dia: '2026-11-03' }), // pagado con dinero real
    reembolso(4, 910, APP, { dia: '2026-11-04' }), // devuelve 4 de cortesía
  ], NOV).L1
  assert.equal(r.rango.consumo_app, 6)
  assert.equal(r.rango.consumo_app_real, 10) // los 10 de dinero real se cobraron de verdad
  assert.equal(r.rango.consumo_app_cortesia, 0)
})

test('totales del rango: el reembolso de una subcuenta resta de lo consumido en otra', () => {
  const filas = [
    // A: todo en noviembre
    tarjeta(20, 23, { location_id: 'A', dia: '2026-11-01' }),
    consumo(10, 920, APP, { location_id: 'A', dia: '2026-11-05' }),
    // B: recargas y consumo en octubre; en noviembre solo el reembolso del consumo y la reversión de la recarga
    tarjeta(20, 24, { location_id: 'B', dia: '2026-10-01' }),
    monedero(5, 922, { location_id: 'B', dia: '2026-10-03' }),
    consumo(4, 921, APP, { location_id: 'B', dia: '2026-10-10' }),
    reembolso(4, 921, APP, { location_id: 'B', dia: '2026-11-06' }),
    reversion(5, 922, { location_id: 'B', dia: '2026-11-07' }),
  ]
  const r = calc(filas, NOV)
  assert.equal(r.A.rango.consumo_app_real, 10)
  assert.equal(r.B.rango.consumo_app_real, 0)
  const t = totalizar([r.A.crudo.rango, r.B.crudo.rango])
  assert.equal(t.consumo_app_real, 6)
  assert.equal(t.consumo_app, 6)
  assert.equal(t.reembolsos_app, 4)
  assert.equal(t.real_revertido, 5)
  assert.equal(t.real_recargado, 15) // 20 de A en noviembre − 5 revertidos en B (sumando filas saldría 20)
  assert.equal(t.real_recargado, t.real_tarjeta + t.real_monedero - t.real_revertido)
  for (const k of CAMPOS) assert.ok(t[k] >= 0, `${k} no puede ser negativo`)
  // el histórico total coincide con sumar las filas cuando ninguna sale negativa
  assert.deepEqual(totalizar([r.A.crudo.historico, r.B.crudo.historico]), sumarBloques([r.A.historico, r.B.historico]))
})
