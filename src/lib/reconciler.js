import { q } from '../db.js'
import { redis } from '../redis.js'
import { reconcileCharge, ghlRefundState, isAlreadyRefundedError, deleteRejected } from './charges.js'
import { creditTopupOnce } from './topup.js'
import { reverseTopupCredit, restoreTopupCredit } from './credits.js'
import * as ghl from './ghl.js'

// Sana el ledger para cargos que quedaron sin confirmar: 'unknown' (timeout/red al cobrar) o
// 'pending' huérfano (proceso muerto a mitad). REGLA DE ORO: el reconciliador SOLO promociona a
// 'created' cuando GHL confirma el cargo. NUNCA fabrica un 'failed' desde una simple ausencia en
// la lista de GHL (que no es autoritativa por consistencia eventual): un 'failed' falso haría que
// el reintento del consumidor re-ejecutara el cobro → doble cargo al wallet.
const UNKNOWN_GRACE_MIN = 3                     // deja a GHL asentar antes de tocar un 'unknown'
export const UNKNOWN_GRACE_MS = UNKNOWN_GRACE_MIN * 60_000 // misma gracia para el «Descartar» manual del admin
const UNKNOWN_GRACE = `interval '${UNKNOWN_GRACE_MIN} minutes'`
const PENDING_ORPHAN = "interval '10 minutes'"  // pending tan viejo = proceso caído mid-flight
const BATCH = 20
const LOCK_KEY = 'reconciler:lock'
const LOCK_TTL_MS = 10 * 60 * 1000 // cubre el peor barrido (BATCH filas con timeouts de GHL)

async function sweepOnce(log) {
  const { rows } = await q(
    `SELECT id, status, connection_id, updated_at FROM charges
     WHERE (status='unknown' AND updated_at < now() - ${UNKNOWN_GRACE})
        OR (status='pending' AND updated_at < now() - ${PENDING_ORPHAN})
     ORDER BY updated_at ASC
     LIMIT ${BATCH}`
  )
  if (!rows.length) return { checked: 0, promoted: 0 }

  let promoted = 0
  for (const row of rows) {
    if (!row.connection_id) continue
    try {
      const rec = await reconcileCharge(row)
      if (rec.verified) {
        promoted++
        // una RECARGA confirmada tarde debe abonar su crédito ya (idempotente)
        if (rec.verified.kind === 'topup') await creditTopupOnce(rec.verified).catch(() => {})
        continue
      }
      // GHL no reconoce el cargo. NO marcar 'failed' (no es autoritativo). Para un 'pending'
      // huérfano lo dejamos claramente ambiguo como 'unknown' (concurrencia optimista: no tocar
      // si algo cambió la fila desde el SELECT, p. ej. un reintento acaba de reclamarla).
      if (rec.absent && row.status === 'pending') {
        await q(
          `UPDATE charges SET status='unknown',
             error='Cargo huérfano sin confirmación de GHL; se resolverá al reintentar o revisar',
             updated_at=now()
           WHERE id=$1 AND status='pending' AND updated_at=$2`,
          [row.id, row.updated_at]
        )
      }
      // 'unknown' ausente o inaccesible: se deja como está. El siguiente ciclo reintenta la
      // promoción (si GHL se vuelve consistente) o lo resuelve el reintento del consumidor / el admin.
    } catch (err) {
      log?.warn?.({ err: err.message, chargeId: row.id }, 'reconciliador: fallo en un cargo')
    }
  }
  return { checked: rows.length, promoted }
}

// Recargas COBRADAS en GHL cuyo crédito no llegó a abonarse (fallo de BD justo después de cobrar,
// o cargo 'unknown' promovido a 'created' por el barrido). Idempotente: creditTopupOnce nunca abona dos veces.
// Se espera 2 min desde el cobro: createTopup aún puede estar alineando el importe con GHL (listCharges ≤30 s)
// y abonar antes dejaría abono ≠ importe real.
async function sweepTopupCredits(log) {
  const { rows } = await q(
    `SELECT c.* FROM charges c
     WHERE c.kind = 'topup' AND c.status = 'created'
       AND c.updated_at < now() - interval '2 minutes'
       AND NOT EXISTS (SELECT 1 FROM credit_entries e WHERE e.charge_id = c.id AND e.reason = 'recarga')
     ORDER BY c.updated_at ASC LIMIT ${BATCH}`
  )
  for (const row of rows) {
    try {
      const r = await creditTopupOnce(row)
      if (r.credited) log?.info?.({ chargeId: row.id, amount: row.amount }, 'recarga: crédito abonado en reconciliación')
    } catch (err) {
      log?.warn?.({ err: err.message, chargeId: row.id }, 'reconciliador: recarga sin abonar')
    }
  }
}

// Reembolsos de recarga que quedaron a medias ('refunding' > 5 min: proceso caído entre pasos).
// Se completa el mismo flujo de forma idempotente: asegurar la reversión del crédito → devolver en GHL → 'refunded'.
// Si el saldo ya no alcanza, se devuelve la fila a 'created' para que el admin decida.
async function sweepRefunding(log) {
  const { rows } = await q(
    `SELECT * FROM charges WHERE kind='topup' AND status='refunding'
       AND updated_at < now() - interval '5 minutes' ORDER BY updated_at ASC LIMIT ${BATCH}`
  )
  const backToCreated = (id, msg) => q(
    `UPDATE charges SET status='created', error=$2, updated_at=now() WHERE id=$1 AND status='refunding'`,
    [id, msg ? String(msg).slice(0, 500) : null])
  for (const row of rows) {
    try {
      // sin cargo de GHL no hay nada que devolver: deshacer cualquier retirada previa y salir de 'refunding'
      if (!row.ghl_charge_id || !row.connection_id) {
        await restoreTopupCredit(row)
        await backToCreated(row.id, 'Reembolso abortado: la recarga no tiene cargo de GHL asociado')
        log?.warn?.({ chargeId: row.id }, 'reembolso de recarga abortado: sin cargo de GHL')
        continue
      }
      const rev = await reverseTopupCredit(row)
      if (!rev.ok) {
        await backToCreated(row.id, rev.reason === 'not_credited'
          ? 'Reembolso abortado: el crédito de la recarga aún no estaba abonado'
          : 'Reembolso abortado: el cliente ya consumió el saldo de la recarga')
        log?.warn?.({ chargeId: row.id, reason: rev.reason }, 'reembolso de recarga abortado')
        continue
      }
      // Una fila en 'refunding' pudo llegar aquí tras un DELETE ambiguo que SÍ devolvió el dinero: preguntar
      // primero a GHL. Nunca repetir el DELETE a ciegas (400 «already refunded» se leería como rechazo →
      // crédito restituido con el dinero ya devuelto; o peor, GHL devolvería dos veces).
      const st = await ghlRefundState(row)
      if (st.unreachable) {
        log?.warn?.({ chargeId: row.id }, 'reembolso de recarga: GHL no respondió; se reintenta en el siguiente ciclo')
        continue
      }
      if (!st.refunded) {
        try {
          await ghl.deleteCharge(row.connection_id, row.ghl_charge_id)
        } catch (err) {
          if (err.status !== 404 && !isAlreadyRefundedError(err)) {
            if (deleteRejected(err)) {
              // GHL rechaza devolver el dinero (o la conexión está rota): el crédito vuelve al cliente y el admin lo ve
              await restoreTopupCredit(row)
              await backToCreated(row.id, err.preSend ? `Reembolso no enviado: ${err.message}` : `Reembolso rechazado por GHL: ${err.message}`)
              log?.error?.({ err: err.message, chargeId: row.id }, 'reembolso de recarga rechazado por GHL; crédito restituido')
              continue
            }
            throw err // ambiguo: se reintenta en el siguiente ciclo (con la comprobación previa)
          }
        }
      }
      await q(`UPDATE charges SET status='refunded', error=NULL, updated_at=now() WHERE id=$1 AND status='refunding'`, [row.id])
      log?.info?.({ chargeId: row.id }, 'reembolso de recarga completado en reconciliación')
    } catch (err) {
      log?.warn?.({ err: err.message, chargeId: row.id }, 'reconciliador: reembolso de recarga pendiente')
    }
  }
}

// Recargas DESCARTADAS por el admin (unknown→failed) cuyo cobro GHL podría asentar tarde (consistencia
// eventual): se vuelven a consultar cada ~10 min durante 24 h. Si GHL acaba listando el cargo, el cliente
// SÍ pagó → 'created' + crédito. Sin esto, un descarte precipitado dejaría un cobro real invisible para siempre.
async function sweepDiscarded(log) {
  const { rows } = await q(
    `SELECT id, status, connection_id, updated_at FROM charges
     WHERE kind='topup' AND status='failed' AND error LIKE 'Descartada por el admin%'
       AND connection_id IS NOT NULL
       AND created_at > now() - interval '24 hours' AND updated_at < now() - interval '10 minutes'
     ORDER BY updated_at ASC LIMIT ${BATCH}`
  )
  for (const row of rows) {
    try {
      const rec = await reconcileCharge(row)
      if (rec.verified) {
        await creditTopupOnce(rec.verified).catch(() => {})
        log?.warn?.({ chargeId: row.id }, 'recarga descartada que GHL SÍ cobró: promovida a cobrada y crédito abonado')
        continue
      }
      // sigue ausente: anotar la revisión (updated_at) para espaciar la siguiente; si GHL no respondió, no tocar
      if (rec.absent) {
        await q(`UPDATE charges SET updated_at=now() WHERE id=$1 AND status='failed' AND updated_at=$2`, [row.id, row.updated_at])
      }
    } catch (err) {
      log?.warn?.({ err: err.message, chargeId: row.id }, 'reconciliador: fallo revisando una recarga descartada')
    }
  }
}

let running = false
let timer = null

export function startReconciler(log, intervalMs = 60_000) {
  if (timer) return
  const tick = async () => {
    if (running) return // no solapar barridos dentro del mismo proceso
    running = true
    const lockVal = `${process.pid}-${Math.random().toString(36).slice(2)}`
    let owned = false
    try {
      owned = Boolean(await redis.set(LOCK_KEY, lockVal, 'PX', LOCK_TTL_MS, 'NX'))
      if (!owned) return // otra réplica está barriendo
      const r = await sweepOnce(log)
      await sweepTopupCredits(log)
      await sweepRefunding(log)
      await sweepDiscarded(log)
      if (r.checked) log?.info?.(r, 'reconciliador: barrido')
    } catch (err) {
      log?.error?.({ err: err.message }, 'reconciliador: barrido falló')
    } finally {
      if (owned) {
        // liberar solo si el lock sigue siendo nuestro (compare-and-delete, como en ghl.js)
        await redis.eval(
          `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end`,
          1, LOCK_KEY, lockVal
        ).catch(() => {})
      }
      running = false
    }
  }
  timer = setInterval(() => { tick() }, intervalMs)
  timer.unref?.() // no bloquear el cierre del proceso
  log?.info?.({ intervalMs }, 'reconciliador iniciado')
}

export function stopReconciler() {
  if (timer) clearInterval(timer)
  timer = null
}
