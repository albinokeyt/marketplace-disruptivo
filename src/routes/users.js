import { q, numOr } from '../db.js'
import { requireAdmin, requireAuth } from '../lib/session.js'
import { hashPassword, randomPassword } from '../lib/crypto.js'
import { checkAccess } from '../lib/access.js'

const publicUser = (u) => ({
  id: u.id, email: u.email, name: u.name, role: u.role,
  location_ids: u.location_ids || [], active: u.active, created_at: u.created_at,
})

const normLocs = (v) => (Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))] : [])

export default async function userRoutes(app) {
  const guard = { preHandler: requireAdmin }

  // ---------------- ADMIN: gestión de usuarios ----------------
  app.get('/api/admin/users', guard, async () => {
    const { rows } = await q('SELECT * FROM users ORDER BY created_at DESC')
    return { users: rows.map(publicUser) }
  })

  app.post('/api/admin/users', guard, async (req, reply) => {
    const b = req.body || {}
    const email = String(b.email || '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply.code(400).send({ error: 'Email inválido' })
    const role = b.role === 'admin' ? 'admin' : 'user'
    const password = b.password && String(b.password).length >= 6 ? String(b.password) : randomPassword()
    try {
      const { rows: [u] } = await q(
        `INSERT INTO users (email, password_hash, name, role, location_ids)
         VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING *`,
        [email, hashPassword(password), b.name ? String(b.name).slice(0, 120) : null, role, JSON.stringify(normLocs(b.location_ids))]
      )
      // la contraseña se muestra UNA vez (generada o la que puso el admin)
      return reply.code(201).send({ user: publicUser(u), password })
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: 'Ya existe un usuario con ese email' })
      throw err
    }
  })

  app.patch('/api/admin/users/:id', guard, async (req, reply) => {
    const id = numOr(req.params.id)
    const b = req.body || {}
    const role = b.role && ['admin', 'user'].includes(b.role) ? b.role : null
    const locsSet = 'location_ids' in b
    const { rows: [u] } = await q(
      `UPDATE users SET
         name = COALESCE($1, name),
         role = COALESCE($2, role),
         location_ids = CASE WHEN $3 THEN $4::jsonb ELSE location_ids END,
         active = COALESCE($5, active)
       WHERE id=$6 RETURNING *`,
      [b.name ?? null, role, locsSet, JSON.stringify(normLocs(b.location_ids)), typeof b.active === 'boolean' ? b.active : null, id]
    )
    if (!u) return reply.code(404).send({ error: 'Usuario no encontrado' })
    return { user: publicUser(u) }
  })

  app.post('/api/admin/users/:id/password', guard, async (req, reply) => {
    const id = numOr(req.params.id)
    const password = req.body?.password && String(req.body.password).length >= 6 ? String(req.body.password) : randomPassword()
    const { rowCount } = await q('UPDATE users SET password_hash=$1 WHERE id=$2', [hashPassword(password), id])
    if (!rowCount) return reply.code(404).send({ error: 'Usuario no encontrado' })
    return { password }
  })

  app.delete('/api/admin/users/:id', guard, async (req, reply) => {
    const { rowCount } = await q('DELETE FROM users WHERE id=$1', [numOr(req.params.id)])
    if (!rowCount) return reply.code(404).send({ error: 'Usuario no encontrado' })
    return { deleted: true }
  })

  // ---------------- PORTAL DEL USUARIO (cualquier sesión) ----------------
  // Devuelve las location_ids del solicitante. 'root'/'sso' (admin) ven TODAS.
  async function scopeFor(session) {
    if (session.role === 'admin') return { all: true, locs: [] }
    const { rows: [u] } = await q('SELECT location_ids, active FROM users WHERE id=$1', [numOr(session.userId)])
    if (!u || !u.active) return { all: false, locs: [] }
    return { all: false, locs: Array.isArray(u.location_ids) ? u.location_ids : [] }
  }

  // Mi perfil + mis subcuentas
  app.get('/api/me', { preHandler: requireAuth }, async (req) => {
    const scope = await scopeFor(req.session)
    const locs = scope.all ? [] : scope.locs
    const { rows } = locs.length
      ? await q(`SELECT location_id, COALESCE(NULLIF(alias,''), name, location_id) AS name FROM connections WHERE location_id = ANY($1)`, [locs])
      : { rows: [] }
    return { role: req.session.role, locations: rows }
  })

  // Mi gasto: solo mis subcuentas (un usuario nunca ve el de otro)
  app.get('/api/me/usage', { preHandler: requireAuth }, async (req, reply) => {
    const scope = await scopeFor(req.session)
    if (!scope.all && scope.locs.length === 0) return { totals: { last30: 0, all_time: 0 }, by_app: [], recent: [] }
    const locFilter = scope.all ? '' : 'AND c.location_id = ANY($1)'
    const params = scope.all ? [] : [scope.locs]
    const [totals, byApp, recent] = await Promise.all([
      q(`SELECT COALESCE(SUM(amount) FILTER (WHERE created_at >= now() - interval '30 days'),0) AS last30,
                COALESCE(SUM(amount),0) AS all_time
         FROM charges c WHERE status='created' ${locFilter}`, params),
      q(`SELECT a.name AS app_name, COALESCE(SUM(c.amount) FILTER (WHERE c.status='created'),0) AS amount, COUNT(c.id)::int AS charges
         FROM charges c JOIN apps a ON a.id=c.app_id
         WHERE c.created_at >= now() - interval '30 days' ${locFilter}
         GROUP BY a.name ORDER BY amount DESC`, params),
      q(`SELECT c.units, c.amount, c.status, c.created_at, c.description, a.name AS app_name,
                COALESCE(NULLIF(k.alias,''), k.name, c.location_id) AS location_name
         FROM charges c JOIN apps a ON a.id=c.app_id
         LEFT JOIN connections k ON k.id=c.connection_id
         WHERE c.status IN ('created','test') ${locFilter}
         ORDER BY c.created_at DESC LIMIT 30`, params),
    ])
    return {
      totals: { last30: numOr(totals.rows[0].last30, 0), all_time: numOr(totals.rows[0].all_time, 0) },
      by_app: byApp.rows.map((r) => ({ ...r, amount: numOr(r.amount, 0) })),
      recent: recent.rows.map((r) => ({ ...r, amount: numOr(r.amount, 0), units: numOr(r.units) })),
    }
  })

  // Mis accesos: qué apps/planes tengo y hasta cuándo (por subcuenta)
  app.get('/api/me/access', { preHandler: requireAuth }, async (req) => {
    const scope = await scopeFor(req.session)
    if (!scope.all && scope.locs.length === 0) return { access: [] }
    const where = scope.all ? '' : 'WHERE s.location_id = ANY($1)'
    const params = scope.all ? [] : [scope.locs]
    const { rows } = await q(
      `SELECT s.location_id, s.status, s.starts_at, s.ends_at, a.name AS app_name, p.name AS plan_name,
              COALESCE(NULLIF(k.alias,''), k.name, s.location_id) AS location_name
       FROM subscriptions s
       LEFT JOIN apps a ON a.id=s.app_id
       LEFT JOIN plans p ON p.id=s.plan_id
       LEFT JOIN connections k ON k.location_id=s.location_id
       ${where}
       ORDER BY s.ends_at DESC NULLS FIRST`, params)
    const now = Date.now()
    const active = rows.filter((r) => ['trial', 'active', 'comped'].includes(r.status) && (!r.ends_at || new Date(r.ends_at).getTime() > now))
    return { access: active }
  })

  // Avisos activos (novedades de las apps)
  app.get('/api/me/notices', { preHandler: requireAuth }, async () => {
    const { rows } = await q(`SELECT title, body, level, created_at FROM notices WHERE active ORDER BY created_at DESC LIMIT 20`)
    return { notices: rows }
  })
}
