import { randomBytes } from 'node:crypto'
import { redis } from '../redis.js'
import { config } from '../config.js'
import { q } from '../db.js'

const COOKIE = 'dw_session'
const TTL = 60 * 60 * 24 * 7

// La sesión guarda { userId, role } ('root' = super-admin por env; 'sso:<email>' = admin por SSO).
// crossSite=true para sesiones creadas dentro del iframe de GHL (SSO): SameSite=None; Secure; Partitioned.
export async function createSession(req, reply, { userId, role, crossSite = false } = {}) {
  const token = randomBytes(32).toString('hex')
  await redis.set(`sess:${token}`, JSON.stringify({ userId, role }), 'EX', TTL)
  reply.setCookie(COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: crossSite ? 'none' : 'lax',
    // SameSite=None EXIGE Secure; en directo, transporte real (trustProxy) con APP_BASE_URL de respaldo
    secure: crossSite || req?.protocol === 'https' || config.appBaseUrl.startsWith('https'),
    partitioned: crossSite || undefined, // CHIPS: cookie particionada para el bloqueo de 3rd-party
    maxAge: TTL,
  })
}

export async function destroySession(req, reply) {
  const token = req.cookies?.[COOKIE]
  if (token) await redis.del(`sess:${token}`)
  reply.clearCookie(COOKIE, { path: '/' })
}

// Devuelve { userId, role } o null.
export async function getSession(req) {
  const token = req.cookies?.[COOKIE]
  if (!token) return null
  const raw = await redis.get(`sess:${token}`)
  if (!raw) return null
  try {
    const s = JSON.parse(raw)
    return s && s.role ? s : null
  } catch {
    return null
  }
}

// Resuelve la sesión a la identidad EFECTIVA: los usuarios de tabla se REVALIDAN contra la BD en
// cada petición (rol/active pueden haber cambiado desde el login → degradar/desactivar/borrar surte
// efecto al instante, no en 7 días). 'root' (env) y 'sso:' (admin de agencia) se confían sin BD.
export async function resolveSession(req) {
  const s = await getSession(req)
  if (!s) return null
  const uid = String(s.userId || '')
  if (uid === 'root' || uid.startsWith('sso:')) return s
  const id = Number(uid)
  if (!Number.isInteger(id)) return null
  const { rows: [u] } = await q('SELECT role, active FROM users WHERE id=$1', [id])
  if (!u || !u.active) return null
  return { userId: s.userId, role: u.role }
}

export const isAdmin = async (req) => (await resolveSession(req))?.role === 'admin'

export async function requireAdmin(req, reply) {
  const s = await resolveSession(req)
  if (!s || s.role !== 'admin') return reply.code(401).send({ error: 'No autorizado' })
  req.session = s
}

// Cualquier sesión válida (admin o user), revalidada. Deja la sesión en req.session para el handler.
export async function requireAuth(req, reply) {
  const s = await resolveSession(req)
  if (!s) return reply.code(401).send({ error: 'No autorizado' })
  req.session = s
}
