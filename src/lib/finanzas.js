// FINANZAS por subcuenta con la regla «CORTESÍA PRIMERO» (GET /api/v1/finanzas).
// El saldo del marketplace mezcla dos tipos de dinero:
//   · CORTESÍA (C): lo que el administrador añade a mano (regalos, promos, compensaciones). No es dinero real.
//   · REAL (R): lo que el cliente pagó, con tarjeta (Stripe) o desde su monedero de GoHighLevel.
// Cada consumo se paga primero con la cortesía y, cuando se acaba, con el dinero real. Recorriendo el libro
// (credit_entries) en orden se sabe en cada momento cuánto queda en cada bolsa y con qué se pagó cada consumo.
// calcularFinanzas es PURA (sin BD) para poder probarla a fondo; leerFinanzas trae las filas y monta la respuesta.
import { q, numOr } from '../db.js'

export const REGLA = 'cortesia_primero'
export const MONEDA = 'USD'

export const CAMPOS = [
  'cortesia_concedida', 'cortesia_retirada',
  'real_tarjeta', 'real_monedero', 'real_revertido', 'real_retirado', 'real_recargado',
  'consumo_total', 'consumo_app', 'consumo_app_cortesia', 'consumo_app_real', 'reembolsos_app',
  'consumo_otras_apps', 'otros', 'cobrado_monedero_app',
]

// Se trabaja en MICRODÓLARES enteros (el libro guarda numeric(14,6)): sin errores de coma flotante al sumar miles
// de movimientos ni al repartir un reembolso parcial.
const U = 1e6
const micro = (v) => Math.round((numOr(v, 0) ?? 0) * U)
// salida en USD con 6 decimales y nunca negativa (un reembolso dentro del rango de un consumo anterior al rango
// restaría de más: el contrato garantiza cifras ≥ 0)
const usd = (n) => Math.max(0, Math.round(n)) / U

const vacio = () => Object.fromEntries(CAMPOS.map((k) => [k, 0]))

// ¿Cae el día local de la entrada en [desde, hasta]? Las fechas 'AAAA-MM-DD' se comparan como texto.
const enRango = (dia, desde, hasta) => Boolean(dia) && (!desde || dia >= desde) && (!hasta || dia <= hasta)

// Saca `cantidad` de las bolsas en el orden dado sin dejarlas nunca en negativo. Devuelve lo sacado de cada una.
function sacar(b, cantidad, orden) {
  const sacado = { c: 0, r: 0 }
  let resto = cantidad
  for (const k of orden) {
    const t = Math.min(b[k], resto)
    b[k] -= t
    sacado[k] += t
    resto -= t
  }
  return sacado
}

// Aplica UNA entrada del libro a las bolsas de su subcuenta y devuelve su efecto en el bloque (en microdólares).
function aplicar(f, s, appId) {
  const b = s.bolsas
  const a = micro(f.amount)
  const abs = Math.abs(a)
  const chargeId = f.charge_id ?? null
  const topupId = f.card_topup_id ?? null
  const reason = String(f.reason ?? '')
  const deLaApp = appId !== null && f.charge_app_id !== null && f.charge_app_id !== undefined && Number(f.charge_app_id) === appId
  const e = {}

  if (topupId !== null) {
    // recarga con TARJETA: dinero real
    b.r = Math.max(0, b.r + a)
    e.real_tarjeta = a
  } else if (chargeId !== null && reason === 'recarga') {
    // recarga desde el MONEDERO de GHL: dinero real
    b.r = Math.max(0, b.r + a)
    e.real_monedero = a
  } else if (reason === 'reversion_recarga') {
    // se deshace una recarga reembolsada: sale del dinero real y, si no llega, de la cortesía
    sacar(b, abs, ['r', 'c'])
    e.real_revertido = abs
  } else if (chargeId !== null && reason === 'consumo de cobro') {
    // CONSUMO: primero la cortesía, el resto con dinero real. Se guarda el reparto para sus reembolsos.
    const { c } = sacar(b, abs, ['c', 'r'])
    const r = abs - c // lo que no cubre la cortesía es dinero real (aunque al libro le falte algo)
    const prev = s.repartos.get(chargeId) || { c: 0, r: 0 }
    s.repartos.set(chargeId, { c: prev.c + c, r: prev.r + r })
    e.consumo_total = abs
    if (deLaApp) Object.assign(e, { consumo_app: abs, consumo_app_cortesia: c, consumo_app_real: r })
    else e.consumo_otras_apps = abs
  } else if (a > 0 && chargeId !== null && reason.startsWith('reembolso')) {
    // REEMBOLSO de un consumo: vuelve a las bolsas en la proporción en que se pagó (lo que exceda, a dinero real)
    const rep = s.repartos.get(chargeId)
    const base = rep ? rep.c + rep.r : 0
    let vC = 0
    let vR = 0
    if (base > 0) {
      const cubierto = Math.min(a, base)
      vC = Math.round((cubierto * rep.c) / base)
      vR = cubierto - vC
      rep.c -= vC
      rep.r -= vR
    }
    vR += a - (vC + vR)
    b.c += vC
    b.r += vR
    e.consumo_total = -a
    if (deLaApp) Object.assign(e, { reembolsos_app: a, consumo_app: -a, consumo_app_cortesia: -vC, consumo_app_real: -vR })
    else e.consumo_otras_apps = -a
  } else if (chargeId === null && topupId === null) {
    // AJUSTE MANUAL del administrador = cortesía (decisión del dueño: todo lo añadido a mano es cortesía)
    if (a > 0) {
      b.c += a
      e.cortesia_concedida = a
    } else {
      // retirada a mano: sale primero de la cortesía y el resto del dinero real (p. ej. al devolver desde Stripe
      // una recarga con tarjeta). Como en el consumo, lo que no cubre la cortesía es dinero real (aunque al libro
      // le falte algo), así en el histórico «cortesía concedida − retirada» ya no puede salir negativa.
      const { c } = sacar(b, abs, ['c', 'r'])
      e.cortesia_retirada = c
      e.real_retirado = abs - c
    }
  } else {
    // cualquier otro movimiento del sistema que no encaja: positivo suma al real, negativo gasta primero cortesía
    e.otros = abs
    if (a > 0) b.r += a
    else sacar(b, abs, ['c', 'r'])
  }
  return e
}

const sumar = (bloque, efecto) => { for (const [k, v] of Object.entries(efecto)) bloque[k] += v }

// Cierra un acumulador en microdólares SIN recortar. Cada cifra se recorta a ≥ 0 por separado, salvo dos partes:
//  · el dinero REAL consumido nunca se recorta contra el total (es dinero de verdad: no se esconde);
//  · la parte de CORTESÍA (y la de otras apps) nunca supera lo que queda del total tras la otra parte, para que
//    las partes no sumen más que el todo cuando un reembolso del rango deja negativa la otra parte.
function cerrar(acc) {
  const out = {}
  for (const k of CAMPOS) out[k] = usd(acc[k])
  out.real_recargado = usd(acc.real_tarjeta + acc.real_monedero - acc.real_revertido - acc.real_retirado)
  const app = Math.max(0, acc.consumo_app)
  const real = Math.max(0, acc.consumo_app_real)
  out.consumo_app_cortesia = usd(Math.min(acc.consumo_app_cortesia, app - real))
  const total = Math.max(0, acc.consumo_total)
  out.consumo_otras_apps = usd(Math.min(acc.consumo_otras_apps, total - app))
  return out
}

// Suma acumuladores crudos (microdólares, sin recortar) de varias subcuentas y cierra el resultado una sola vez:
// un reembolso en una subcuenta resta de lo consumido en otra, como pasa con el dinero de verdad.
export function totalizar(crudos) {
  const acc = vacio()
  for (const c of crudos) if (c) for (const k of CAMPOS) acc[k] += c[k] || 0
  return cerrar(acc)
}

// FUNCIÓN PURA. Entrada:
//   filas: entradas del libro YA ORDENADAS por (created_at, id), con
//          { id, location_id, amount, reason, charge_id, card_topup_id, dia ('AAAA-MM-DD' local), charge_app_id }
//   appId: la app que pregunta (sus consumos van a consumo_app; los demás, a consumo_otras_apps)
//   desde / hasta: 'AAAA-MM-DD' o null (sin ninguno de los dos, no hay bloque «rango»)
//   cargosMonedero: cargos de la app pagados con el monedero de GHL, { location_id, dia, amount } (pueden venir
//          agrupados por día); es dinero real que NO pasa por el saldo
// Salida: { [location_id]: { saldo: { total, cortesia, real }, historico: BLOQUE, rango: BLOQUE | null } }
// Las bolsas se calculan SIEMPRE con todo el historial (el reparto de un consumo depende de lo anterior); el bloque
// «rango» solo suma los efectos de las entradas cuyo día cae dentro.
export function calcularFinanzas({ filas = [], appId = null, desde = null, hasta = null, cargosMonedero = [] } = {}) {
  const conRango = Boolean(desde || hasta)
  const app = appId === null || appId === undefined ? null : Number(appId)
  const estados = new Map()
  const estado = (loc) => {
    let s = estados.get(loc)
    if (!s) {
      s = { bolsas: { c: 0, r: 0 }, repartos: new Map(), historico: vacio(), rango: conRango ? vacio() : null }
      estados.set(loc, s)
    }
    return s
  }

  for (const f of filas) {
    const s = estado(f.location_id)
    const efecto = aplicar(f, s, app)
    sumar(s.historico, efecto)
    if (s.rango && enRango(f.dia, desde, hasta)) sumar(s.rango, efecto)
  }
  for (const c of cargosMonedero) {
    const s = estado(c.location_id)
    const v = micro(c.amount)
    s.historico.cobrado_monedero_app += v
    if (s.rango && enRango(c.dia, desde, hasta)) s.rango.cobrado_monedero_app += v
  }

  const out = {}
  for (const [loc, s] of estados) {
    out[loc] = {
      saldo: { total: usd(s.bolsas.c + s.bolsas.r), cortesia: usd(s.bolsas.c), real: usd(s.bolsas.r) },
      historico: cerrar(s.historico),
      rango: s.rango ? cerrar(s.rango) : null,
      // acumuladores en microdólares SIN recortar: solo para los totales (no salen en la respuesta)
      crudo: { historico: s.historico, rango: s.rango },
    }
  }
  return out
}

// Suma campo a campo bloques ya cerrados. Ojo: si una fila se recortó a 0, el resultado ya no es el total real
// (la parte negativa se pierde); los totales de la respuesta se calculan con totalizar() sobre los movimientos.
export function sumarBloques(bloques) {
  const acc = Object.fromEntries(CAMPOS.map((k) => [k, 0]))
  for (const b of bloques) for (const k of CAMPOS) acc[k] += micro(b[k])
  return Object.fromEntries(CAMPOS.map((k) => [k, usd(acc[k])]))
}

// 'AAAA-MM-DD' y una fecha que exista (nada de 2026-02-30)
export function fechaValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

// Zona horaria IANA (Europe/Madrid, America/Bogota, UTC…). Solo nombres: un desfase tipo «+01:00» Postgres lo
// interpreta con el signo al revés (POSIX), así que se rechaza. Inválida → UTC y zona_valida:false.
const ZONA_RE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/
export function resolverZona(z) {
  const t = String(z ?? '').trim()
  if (!t) return { zona: 'UTC', zona_valida: true }
  if (t.length > 64 || !ZONA_RE.test(t)) return { zona: 'UTC', zona_valida: false }
  try {
    return { zona: new Intl.DateTimeFormat('en-US', { timeZone: t }).resolvedOptions().timeZone, zona_valida: true }
  } catch {
    return { zona: 'UTC', zona_valida: false }
  }
}

// Trae del libro y de los cargos lo necesario y monta la respuesta completa del endpoint.
//   locationIds: null = todas las subcuentas; array = solo esas (alcance de la API key o ?location_id)
export async function leerFinanzas({ appId, locationIds = null, desde = null, hasta = null, zona = 'UTC', zonaValida = true }) {
  const conFiltro = Array.isArray(locationIds)
  const consultar = async (tz) => {
    // cada consulta lleva solo los parámetros que usa (Postgres no admite parámetros sin referenciar)
    const filas = await q(
      `SELECT e.id, e.location_id, e.amount, e.reason, e.charge_id, e.card_topup_id,
              (e.created_at AT TIME ZONE $1)::date::text AS dia,
              ch.app_id AS charge_app_id
       FROM credit_entries e
       LEFT JOIN charges ch ON ch.id = e.charge_id
       ${conFiltro ? 'WHERE e.location_id = ANY($2::text[])' : ''}
       ORDER BY e.location_id, e.created_at, e.id`,
      conFiltro ? [tz, locationIds] : [tz])
    const cargos = await q(
      `SELECT c.location_id, (c.created_at AT TIME ZONE $1)::date::text AS dia, SUM(c.amount) AS amount
       FROM charges c
       WHERE c.app_id = $2 AND c.paid_with = 'wallet' AND c.status = 'created'
             ${conFiltro ? 'AND c.location_id = ANY($3::text[])' : ''}
       GROUP BY 1, 2`,
      conFiltro ? [tz, appId, locationIds] : [tz, appId])
    return { filas: filas.rows, cargos: cargos.rows }
  }

  let tz = zona
  let valida = zonaValida
  let datos
  try {
    datos = await consultar(tz)
  } catch (err) {
    // zona que Intl conoce pero el Postgres no (tzdata distinta): se responde en UTC y se avisa
    if (err.code !== '22023' || tz === 'UTC') throw err
    tz = 'UTC'
    valida = false
    datos = await consultar(tz)
  }

  const porLocation = calcularFinanzas({ filas: datos.filas, appId, desde, hasta, cargosMonedero: datos.cargos })
  const ids = Object.keys(porLocation)
  const nombres = new Map()
  const registrados = new Map()
  if (ids.length) {
    const [conns, saldos] = await Promise.all([
      q(`SELECT location_id, COALESCE(NULLIF(alias, ''), name, location_id) AS name
         FROM connections WHERE location_id = ANY($1::text[])`, [ids]),
      q('SELECT location_id, balance FROM credits WHERE location_id = ANY($1::text[])', [ids]),
    ])
    for (const r of conns.rows) nombres.set(r.location_id, r.name)
    for (const r of saldos.rows) registrados.set(r.location_id, micro(r.balance))
  }

  const locations = ids.map((id) => {
    const p = porLocation[id]
    const registrado = usd(registrados.get(id) ?? 0)
    return {
      location_id: id,
      name: nombres.get(id) || id,
      saldo: { ...p.saldo, registrado, descuadre: Math.abs(p.saldo.total - registrado) > 0.01 },
      historico: p.historico,
      rango: p.rango,
    }
  }).sort((a, b) => String(a.name).localeCompare(String(b.name), 'es') || a.location_id.localeCompare(b.location_id))

  const sumaSaldo = (k) => usd(locations.reduce((s, l) => s + micro(l.saldo[k]), 0))
  const conRango = Boolean(desde || hasta)
  return {
    regla: REGLA,
    moneda: MONEDA,
    zona: tz,
    zona_valida: valida,
    desde: desde || null,
    hasta: hasta || null,
    locations,
    totales: {
      saldo: { total: sumaSaldo('total'), cortesia: sumaSaldo('cortesia'), real: sumaSaldo('real'), registrado: sumaSaldo('registrado') },
      // con los movimientos, no con las filas: un reembolso del rango de un consumo anterior resta de verdad
      historico: totalizar(ids.map((id) => porLocation[id].crudo.historico)),
      rango: conRango ? totalizar(ids.map((id) => porLocation[id].crudo.rango)) : null,
    },
  }
}
