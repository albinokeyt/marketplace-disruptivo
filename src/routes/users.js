import { q, numOr } from '../db.js'
import { requireAdmin, requireAuth } from '../lib/session.js'
import { hashPassword, randomPassword } from '../lib/crypto.js'
import { checkAccess } from '../lib/access.js'
import { rateLimit } from '../lib/ratelimit.js'
import { publicCharge } from '../lib/charges.js'
import { createTopup, getTopupConfig } from '../lib/topup.js'
import { purchasePlan } from '../lib/billing.js'

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
  // Devuelve las location_ids del solicitante. 'root'/'sso' (admin) ven TODAS — salvo que el admin pida
  // «ver como cliente» una subcuenta concreta (?location_id=): entonces queda limitado a ella y en solo
  // lectura (preview), para ver exactamente lo que ve ese cliente sin poder cobrarle por error.
  async function scopeFor(session, previewLoc = null) {
    if (session.role === 'admin') {
      const loc = previewLoc ? String(previewLoc).trim() : ''
      if (!loc) return { all: true, locs: [] }
      const { rows: [k] } = await q('SELECT location_id FROM connections WHERE location_id=$1', [loc])
      return { all: false, locs: k ? [k.location_id] : [], preview: true }
    }
    // cliente entrado por SSO desde su subcuenta de GHL: solo ve ESA subcuenta, y solo mientras la app
    // siga instalada (conexión existente) — si se desinstala, deja de ver datos aunque la sesión viva
    if (String(session.userId || '').startsWith('sso:')) {
      const locs = Array.isArray(session.locs) ? session.locs.map(String).filter(Boolean) : []
      if (!locs.length) return { all: false, locs: [] }
      const { rows } = await q('SELECT location_id FROM connections WHERE location_id = ANY($1)', [locs])
      return { all: false, locs: rows.map((r) => r.location_id) }
    }
    const { rows: [u] } = await q('SELECT location_ids, active FROM users WHERE id=$1', [numOr(session.userId)])
    if (!u || !u.active) return { all: false, locs: [] }
    return { all: false, locs: Array.isArray(u.location_ids) ? u.location_ids : [] }
  }

  // solo un admin puede «ver como cliente»; para cualquier otro la query se ignora
  const previewOf = (req) => (req.session?.role === 'admin' && req.query?.location_id ? String(req.query.location_id) : null)

  // Mi perfil + mis subcuentas
  app.get('/api/me', { preHandler: requireAuth }, async (req) => {
    const scope = await scopeFor(req.session, previewOf(req))
    const locs = scope.all ? [] : scope.locs
    const { rows } = locs.length
      ? await q(`SELECT location_id, COALESCE(NULLIF(alias,''), name, location_id) AS name FROM connections WHERE location_id = ANY($1)`, [locs])
      : { rows: [] }
    return { role: req.session.role, locations: rows, preview: Boolean(scope.preview) }
  })

  // Mi gasto: solo mis subcuentas (un usuario nunca ve el de otro)
  app.get('/api/me/usage', { preHandler: requireAuth }, async (req, reply) => {
    const scope = await scopeFor(req.session, previewOf(req))
    if (!scope.all && scope.locs.length === 0) {
      return { totals: { last30: 0, all_time: 0 }, credit: 0, credit_used: { last30: 0, all_time: 0 }, topups: { last30: 0, all_time: 0 }, by_app: [], recent: [] }
    }
    const locFilter = scope.all ? '' : 'AND c.location_id = ANY($1)'
    const params = scope.all ? [] : [scope.locs]
    const [totals, byApp, recent] = await Promise.all([
      // consumo = solo cargos de USO (las recargas son entradas de saldo, no gasto: se reportan aparte)
      q(`SELECT COALESCE(SUM(amount) FILTER (WHERE kind='usage' AND created_at >= now() - interval '30 days'),0) AS last30,
                COALESCE(SUM(amount) FILTER (WHERE kind='usage'),0) AS all_time,
                COALESCE(SUM(amount) FILTER (WHERE kind='usage' AND paid_with='credit' AND created_at >= now() - interval '30 days'),0) AS credit_last30,
                COALESCE(SUM(amount) FILTER (WHERE kind='usage' AND paid_with='credit'),0) AS credit_all_time,
                COALESCE(SUM(amount) FILTER (WHERE kind='topup' AND created_at >= now() - interval '30 days'),0) AS topup_last30,
                COALESCE(SUM(amount) FILTER (WHERE kind='topup'),0) AS topup_all_time
         FROM charges c WHERE status='created' ${locFilter}`, params),
      q(`SELECT a.name AS app_name, COALESCE(SUM(c.amount) FILTER (WHERE c.status='created'),0) AS amount, COUNT(c.id)::int AS charges
         FROM charges c JOIN apps a ON a.id=c.app_id
         WHERE c.kind='usage' AND c.created_at >= now() - interval '30 days' ${locFilter}
         GROUP BY a.name ORDER BY amount DESC`, params),
      q(`SELECT c.units, c.amount, c.status, c.created_at, c.description, a.name AS app_name,
                COALESCE(NULLIF(k.alias,''), k.name, c.location_id) AS location_name
         FROM charges c JOIN apps a ON a.id=c.app_id
         LEFT JOIN connections k ON k.id=c.connection_id
         WHERE c.kind='usage' AND c.status IN ('created','test') ${locFilter}
         ORDER BY c.created_at DESC LIMIT 30`, params),
    ])
    // saldo de crédito disponible (suma de sus subcuentas)
    const credit = scope.all
      ? await q('SELECT COALESCE(SUM(balance),0) AS c FROM credits')
      : await q('SELECT COALESCE(SUM(balance),0) AS c FROM credits WHERE location_id = ANY($1)', [scope.locs])
    return {
      totals: { last30: numOr(totals.rows[0].last30, 0), all_time: numOr(totals.rows[0].all_time, 0) },
      credit: numOr(credit.rows[0].c, 0),
      credit_used: { last30: numOr(totals.rows[0].credit_last30, 0), all_time: numOr(totals.rows[0].credit_all_time, 0) },
      topups: { last30: numOr(totals.rows[0].topup_last30, 0), all_time: numOr(totals.rows[0].topup_all_time, 0) },
      by_app: byApp.rows.map((r) => ({ ...r, amount: numOr(r.amount, 0) })),
      recent: recent.rows.map((r) => ({ ...r, amount: numOr(r.amount, 0), units: numOr(r.units) })),
    }
  })

  // Mis accesos: qué apps/planes tengo y hasta cuándo (por subcuenta)
  app.get('/api/me/access', { preHandler: requireAuth }, async (req) => {
    const scope = await scopeFor(req.session, previewOf(req))
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

  // ---------------- RECARGAR SALDO desde el wallet de GHL ----------------
  // El cliente (o el admin en su nombre) paga X del wallet de GHL y recibe X de crédito interno.
  // Planes contratables desde el portal (visibles, activos y con precio), con las apps que incluyen
  app.get('/api/me/plans', { preHandler: requireAuth }, async () => {
    const { rows: plans } = await q(
      `SELECT id, name, description, price, period_months, price_text, trial_days, app_ids
       FROM plans WHERE visible AND active AND price > 0 ORDER BY price ASC, id ASC`)
    const { rows: apps } = await q(`SELECT id, name, slug, icon_url FROM apps WHERE status='active' AND system=false`)
    const byId = new Map(apps.map((a) => [a.id, a]))
    return {
      plans: plans.map((p) => ({
        ...p,
        price: numOr(p.price),
        apps: (Array.isArray(p.app_ids) ? p.app_ids : []).map(Number).map((id) => byId.get(id)).filter(Boolean),
      })),
    }
  })

  // Contratar un plan con el saldo: cobra el primer periodo ya y activa el acceso (renovación automática)
  app.post('/api/me/subscriptions', { preHandler: requireAuth }, async (req, reply) => {
    const locationId = String(req.body?.location_id || '').trim()
    const planId = numOr(req.body?.plan_id)
    if (!locationId || !planId) return reply.code(400).send({ error: 'Faltan location_id o plan_id' })
    const scope = await scopeFor(req.session, previewOf(req))
    if (scope.preview) {
      return reply.code(403).send({ error: '«Ver como cliente» es solo lectura: para activar un plan en su nombre usa Suscripciones' })
    }
    if (!scope.all && !scope.locs.includes(locationId)) {
      return reply.code(403).send({ error: 'No tienes acceso a esa subcuenta' })
    }
    const rl = await rateLimit(`buy:${req.session.userId}`, 3, 60)
    if (!rl.ok) return reply.code(429).send({ error: 'Demasiados intentos seguidos; espera un minuto' })
    try {
      const r = await purchasePlan({ locationId, planId, userId: String(req.session.userId), log: req.log })
      return reply.code(201).send(r)
    } catch (err) {
      return reply.code(err.statusCode || 502).send({ error: err.message })
    }
  })

  app.get('/api/me/topup-config', { preHandler: requireAuth }, async () => {
    const cfg = await getTopupConfig()
    const { rows: [m] } = await q('SELECT 1 FROM meters WHERE code=$1 AND active=true', [cfg.meter_code])
    return { enabled: Boolean(cfg.enabled && m), presets: cfg.presets, min: cfg.min, max: cfg.max, currency: 'USD' }
  })

  app.post('/api/me/topup', { preHandler: requireAuth }, async (req, reply) => {
    const locationId = String(req.body?.location_id || '').trim()
    if (!locationId) return reply.code(400).send({ error: 'Falta location_id' })
    const scope = await scopeFor(req.session, previewOf(req))
    if (scope.preview) {
      return reply.code(403).send({ error: '«Ver como cliente» es solo lectura: para recargar en nombre del cliente usa Créditos → Recargar desde wallet' })
    }
    if (!scope.all && !scope.locs.includes(locationId)) {
      return reply.code(403).send({ error: 'No tienes acceso a esa subcuenta' })
    }
    // anti-abuso: pocas recargas seguidas por sesión
    const rl = await rateLimit(`topup:${req.session.userId}`, 5, 60)
    if (!rl.ok) return reply.code(429).send({ error: 'Demasiadas recargas seguidas; espera un minuto' })
    try {
      const r = await createTopup({ locationId, amount: req.body?.amount, userId: String(req.session.userId), log: req.log })
      return reply.code(201).send({ ...r, charge: publicCharge(r.charge) })
    } catch (err) {
      return reply.code(err.statusCode || 502).send({ error: err.message, charge: err.charge ? publicCharge(err.charge) : undefined })
    }
  })
}
