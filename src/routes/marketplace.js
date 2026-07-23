import { q, numOr } from '../db.js'
import { requireAdmin } from '../lib/session.js'
import { derivedStatus } from '../lib/access.js'
import { grantCredit } from '../lib/credits.js'

const slugify = (s, id) =>
  (String(s || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app') + '-' + id

// suma meses de CALENDARIO (no 30 días fijos) a una fecha base
const addMonths = (base, n) => { const d = new Date(base.getTime()); d.setMonth(d.getMonth() + n); return d }
// meses válido = entero >= 1; devuelve el número o null
const validMonths = (v) => { const n = numOr(v); return n !== null && Number.isInteger(n) && n >= 1 ? n : null }

const publicApp = (a) => ({
  slug: a.slug,
  name: a.name,
  tagline: a.tagline,
  description: a.description,
  install_url: a.install_url,
  price_text: a.price_text,
  badge: a.badge || null, // 'new' | 'coming_soon' | null
  media: a.media || [],
  features: a.features || [],
  rating: a.rating ? Number(Number(a.rating).toFixed(1)) : null,
  reviews_count: a.reviews_count || 0,
})

export default async function marketplaceRoutes(app) {
  // ---------------- TIENDA PÚBLICA (sin auth) ----------------
  app.get('/api/store', async () => {
    const [apps, notices] = await Promise.all([
      q(`SELECT a.*, ROUND(AVG(r.rating), 2) AS rating, COUNT(r.id) FILTER (WHERE r.visible)::int AS reviews_count
         FROM apps a LEFT JOIN reviews r ON r.app_id = a.id AND r.visible
         WHERE a.visible = true
         GROUP BY a.id ORDER BY a.created_at DESC`),
      q(`SELECT title, body, level FROM notices WHERE active AND show_in_store ORDER BY created_at DESC LIMIT 5`),
    ])
    return { apps: apps.rows.map(publicApp), notices: notices.rows }
  })

  app.get('/api/store/app/:slug', async (req, reply) => {
    const { rows: [a] } = await q(
      `SELECT a.*, ROUND(AVG(r.rating), 2) AS rating, COUNT(r.id) FILTER (WHERE r.visible)::int AS reviews_count
       FROM apps a LEFT JOIN reviews r ON r.app_id = a.id AND r.visible
       WHERE a.slug = $1 AND a.visible = true GROUP BY a.id`,
      [req.params.slug]
    )
    if (!a) return reply.code(404).send({ error: 'App no encontrada' })
    const { rows: reviews } = await q(
      `SELECT author, rating, text, created_at FROM reviews WHERE app_id = $1 AND visible ORDER BY created_at DESC LIMIT 50`,
      [a.id]
    )
    const { rows: plans } = await q(
      `SELECT name, description, price_text, trial_days, duration_months FROM plans
       WHERE visible AND active AND app_ids @> $1::jsonb ORDER BY created_at`,
      [JSON.stringify([a.id])]
    )
    return { app: publicApp(a), reviews, plans }
  })

  // ---------------- ADMIN ----------------
  const guard = { preHandler: requireAdmin }

  // Vitrina: editar los campos de tienda de cada app (las apps ya existen en la tabla apps)
  app.patch('/api/admin/apps/:id/listing', guard, async (req, reply) => {
    const id = numOr(req.params.id)
    const b = req.body || {}
    const { rows: [cur] } = await q('SELECT id, name, slug FROM apps WHERE id=$1', [id])
    if (!cur) return reply.code(404).send({ error: 'App no encontrada' })
    const media = Array.isArray(b.media) ? b.media.slice(0, 12) : undefined
    const features = Array.isArray(b.features) ? b.features.slice(0, 20).map(String) : undefined
    // badge: '' o null lo borra; solo 'new'/'coming_soon' válidos
    let badge; let setBadge = false
    if ('badge' in b) { setBadge = true; badge = ['new', 'coming_soon'].includes(b.badge) ? b.badge : null }
    const { rows: [row] } = await q(
      `UPDATE apps SET
         slug = COALESCE($1, slug),
         tagline = COALESCE($2, tagline),
         description = COALESCE($3, description),
         install_url = COALESCE($4, install_url),
         price_text = COALESCE($5, price_text),
         media = COALESCE($6::jsonb, media),
         features = COALESCE($7::jsonb, features),
         visible = COALESCE($8, visible),
         badge = CASE WHEN $10 THEN $11 ELSE badge END
       WHERE id=$9 RETURNING *`,
      [
        b.slug ? slugify(b.slug, id) : (cur.slug || slugify(cur.name, id)),
        b.tagline ?? null, b.description ?? null, b.install_url ?? null, b.price_text ?? null,
        media ? JSON.stringify(media) : null,
        features ? JSON.stringify(features) : null,
        typeof b.visible === 'boolean' ? b.visible : null, id,
        setBadge, badge ?? null,
      ]
    )
    return { app: { ...row, key_hash: undefined } }
  })

  // Reseñas (las crea el admin: pega las reales de sus clientes)
  app.get('/api/admin/apps/:id/reviews', guard, async (req) => {
    const { rows } = await q('SELECT * FROM reviews WHERE app_id=$1 ORDER BY created_at DESC', [numOr(req.params.id)])
    return { reviews: rows }
  })
  app.post('/api/admin/apps/:id/reviews', guard, async (req, reply) => {
    const id = numOr(req.params.id)
    const { author, rating, text } = req.body || {}
    const r = numOr(rating)
    if (!author || r === null || r < 1 || r > 5) return reply.code(400).send({ error: 'author y rating (1-5) obligatorios' })
    const { rows: [row] } = await q(
      `INSERT INTO reviews (app_id, author, rating, text) VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, String(author).slice(0, 120), Math.round(r), text ? String(text).slice(0, 1000) : null]
    )
    return reply.code(201).send({ review: row })
  })
  app.delete('/api/admin/reviews/:id', guard, async (req, reply) => {
    const { rowCount } = await q('DELETE FROM reviews WHERE id=$1', [numOr(req.params.id)])
    if (!rowCount) return reply.code(404).send({ error: 'Reseña no encontrada' })
    return { deleted: true }
  })

  // Planes (bundles de apps, trial + duración)
  app.get('/api/admin/plans', guard, async () => {
    const { rows } = await q(`SELECT * FROM plans ORDER BY created_at DESC`)
    return { plans: rows }
  })
  const planBody = (b) => ({
    name: String(b?.name || '').trim(),
    description: b?.description ? String(b.description) : null,
    price_text: b?.price_text ? String(b.price_text) : null,
    app_ids: Array.isArray(b?.app_ids) ? b.app_ids.map(Number).filter((n) => Number.isInteger(n)) : [],
    trial_days: Math.max(0, Math.trunc(numOr(b?.trial_days, 0) ?? 0)),
    duration_months: b?.duration_months ? Math.max(1, Math.trunc(numOr(b.duration_months))) : null,
    visible: Boolean(b?.visible),
    active: b?.active === undefined ? true : Boolean(b.active),
  })
  app.post('/api/admin/plans', guard, async (req, reply) => {
    const p = planBody(req.body)
    if (!p.name) return reply.code(400).send({ error: 'Falta el nombre del plan' })
    const { rows: [row] } = await q(
      `INSERT INTO plans (name, description, price_text, app_ids, trial_days, duration_months, visible, active)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8) RETURNING *`,
      [p.name, p.description, p.price_text, JSON.stringify(p.app_ids), p.trial_days, p.duration_months, p.visible, p.active]
    )
    return reply.code(201).send({ plan: row })
  })
  app.patch('/api/admin/plans/:id', guard, async (req, reply) => {
    const p = planBody(req.body)
    if (!p.name) return reply.code(400).send({ error: 'Falta el nombre del plan' })
    const { rows: [row] } = await q(
      `UPDATE plans SET name=$1, description=$2, price_text=$3, app_ids=$4::jsonb, trial_days=$5,
         duration_months=$6, visible=$7, active=$8 WHERE id=$9 RETURNING *`,
      [p.name, p.description, p.price_text, JSON.stringify(p.app_ids), p.trial_days, p.duration_months, p.visible, p.active, numOr(req.params.id)]
    )
    if (!row) return reply.code(404).send({ error: 'Plan no encontrado' })
    return { plan: row }
  })
  app.delete('/api/admin/plans/:id', guard, async (req, reply) => {
    const id = numOr(req.params.id)
    const { rows: [used] } = await q('SELECT 1 FROM subscriptions WHERE plan_id=$1 LIMIT 1', [id])
    if (used) {
      await q('UPDATE plans SET active=false, visible=false WHERE id=$1', [id])
      return { deactivated: true }
    }
    const { rowCount } = await q('DELETE FROM plans WHERE id=$1', [id])
    if (!rowCount) return reply.code(404).send({ error: 'Plan no encontrado' })
    return { deleted: true }
  })

  // Suscripciones / accesos manuales (dar acceso por meses aunque paguen por fuera, cortar, prorrogar)
  app.get('/api/admin/subscriptions', guard, async (req) => {
    const { location_id, status } = req.query
    const where = ['true']; const params = []
    if (location_id) { params.push(location_id); where.push(`s.location_id = $${params.length}`) }
    const { rows } = await q(
      `SELECT s.*, a.name AS app_name, p.name AS plan_name,
              COALESCE(NULLIF(k.alias,''), k.name, s.location_id) AS location_name
       FROM subscriptions s
       LEFT JOIN apps a ON a.id = s.app_id
       LEFT JOIN plans p ON p.id = s.plan_id
       LEFT JOIN connections k ON k.location_id = s.location_id
       WHERE ${where.join(' AND ')} ORDER BY s.updated_at DESC LIMIT 300`,
      params
    )
    let out = rows.map((s) => ({ ...s, derived: derivedStatus(s) }))
    if (status) out = out.filter((s) => s.derived === status)
    return { subscriptions: out }
  })
  app.post('/api/admin/subscriptions', guard, async (req, reply) => {
    const b = req.body || {}
    const locationId = String(b.location_id || '').trim()
    const appId = b.app_id ? numOr(b.app_id) : null
    const planId = b.plan_id ? numOr(b.plan_id) : null
    if (!locationId) return reply.code(400).send({ error: 'Falta location_id' })
    if (!appId && !planId) return reply.code(400).send({ error: 'Indica una app o un plan' })
    const status = ['active', 'trial', 'comped'].includes(b.status) ? b.status : 'active'
    let endsAt = b.ends_at ? new Date(b.ends_at) : null
    if (endsAt && Number.isNaN(endsAt.getTime())) return reply.code(400).send({ error: 'ends_at inválido' })
    // atajo: months=N (entero>=1) → ends_at = ahora + N meses de calendario
    if (!endsAt && b.months != null && b.months !== '') {
      const months = validMonths(b.months)
      if (months === null) return reply.code(400).send({ error: 'months debe ser un entero >= 1' })
      endsAt = addMonths(new Date(), months)
    }
    const { rows: [row] } = await q(
      `INSERT INTO subscriptions (location_id, app_id, plan_id, status, ends_at, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [locationId, appId, planId, status, endsAt, b.notes ? String(b.notes).slice(0, 500) : null]
    )
    return reply.code(201).send({ subscription: { ...row, derived: derivedStatus(row) } })
  })
  app.patch('/api/admin/subscriptions/:id', guard, async (req, reply) => {
    const id = numOr(req.params.id)
    const b = req.body || {}
    const { rows: [cur] } = await q('SELECT * FROM subscriptions WHERE id=$1', [id])
    if (!cur) return reply.code(404).send({ error: 'Suscripción no encontrada' })
    const status = b.status && ['active', 'trial', 'comped', 'canceled'].includes(b.status) ? b.status : null
    let endsAt; let setEnds = false
    if ('ends_at' in b) { setEnds = true; endsAt = b.ends_at ? new Date(b.ends_at) : null; if (endsAt && Number.isNaN(endsAt.getTime())) return reply.code(400).send({ error: 'ends_at inválido' }) }
    if ('months' in b && b.months != null && b.months !== '') {
      const months = validMonths(b.months)
      if (months === null) return reply.code(400).send({ error: 'months debe ser un entero >= 1' })
      // PRORROGAR = sumar sobre el tiempo restante (nunca acortar): base = max(ends_at actual, ahora)
      const base = cur.ends_at && new Date(cur.ends_at) > new Date() ? new Date(cur.ends_at) : new Date()
      setEnds = true; endsAt = addMonths(base, months)
    }
    const { rows: [row] } = await q(
      `UPDATE subscriptions SET
         status = COALESCE($1, status),
         ends_at = CASE WHEN $2 THEN $3 ELSE ends_at END,
         notes = COALESCE($4, notes),
         updated_at = now()
       WHERE id=$5 RETURNING *`,
      [status, setEnds, endsAt ?? null, b.notes ?? null, id]
    )
    return { subscription: { ...row, derived: derivedStatus(row) } }
  })
  app.delete('/api/admin/subscriptions/:id', guard, async (req, reply) => {
    const { rows: [row] } = await q(
      `UPDATE subscriptions SET status='canceled', ends_at=now(), updated_at=now() WHERE id=$1 RETURNING *`,
      [numOr(req.params.id)]
    )
    if (!row) return reply.code(404).send({ error: 'Suscripción no encontrada' })
    return { canceled: true }
  })

  // ---------------- Créditos (saldo interno por subcuenta) ----------------
  app.get('/api/admin/credits', guard, async () => {
    const { rows } = await q(
      `SELECT k.location_id,
              COALESCE(NULLIF(k.alias,''), k.name, k.location_id) AS location_name,
              COALESCE(c.balance, 0) AS balance,
              COALESCE(g.granted, 0) AS granted,
              COALESCE(g.spent, 0) AS spent,
              COALESCE(g.refunded, 0) AS refunded
       FROM connections k
       LEFT JOIN credits c ON c.location_id = k.location_id
       LEFT JOIN (
         SELECT location_id,
                SUM(amount) FILTER (WHERE amount > 0 AND charge_id IS NULL) AS granted,
                -SUM(amount) FILTER (WHERE amount < 0) AS spent,
                SUM(amount) FILTER (WHERE amount > 0 AND charge_id IS NOT NULL) AS refunded
         FROM credit_entries GROUP BY location_id
       ) g ON g.location_id = k.location_id
       ORDER BY COALESCE(c.balance,0) DESC, k.created_at DESC`
    )
    return {
      credits: rows.map((r) => ({
        location_id: r.location_id, location_name: r.location_name,
        balance: numOr(r.balance, 0), granted: numOr(r.granted, 0), spent: numOr(r.spent, 0),
        refunded: numOr(r.refunded, 0),
      })),
    }
  })

  app.post('/api/admin/credits', guard, async (req, reply) => {
    const b = req.body || {}
    const locationId = String(b.location_id || '').trim()
    const amount = numOr(b.amount)
    if (!locationId) return reply.code(400).send({ error: 'Falta location_id' })
    if (amount === null || amount === 0) return reply.code(400).send({ error: 'Importe inválido' })
    if (Math.abs(amount) > 1_000_000) return reply.code(400).send({ error: 'Importe fuera de rango' })
    const { rows: [conn] } = await q('SELECT 1 FROM connections WHERE location_id=$1', [locationId])
    if (!conn) return reply.code(404).send({ error: 'Subcuenta no conectada' })
    try {
      const r = await grantCredit(locationId, amount, b.reason)
      return { balance: r.balance, applied: r.applied }
    } catch (err) {
      // solo se traducen los errores de validación propios; lo inesperado va al handler global
      if (err.statusCode >= 400 && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message })
      throw err
    }
  })

  app.get('/api/admin/credits/:locationId/entries', guard, async (req) => {
    const { rows } = await q(
      `SELECT amount, reason, charge_id, created_at FROM credit_entries
       WHERE location_id=$1 ORDER BY created_at DESC LIMIT 100`, [req.params.locationId])
    return { entries: rows.map((r) => ({ ...r, amount: numOr(r.amount, 0) })) }
  })

  // Avisos / notificaciones
  app.get('/api/admin/notices', guard, async () => {
    const { rows } = await q('SELECT * FROM notices ORDER BY created_at DESC')
    return { notices: rows }
  })
  app.post('/api/admin/notices', guard, async (req, reply) => {
    const b = req.body || {}
    if (!b.title) return reply.code(400).send({ error: 'Falta el título' })
    const level = ['info', 'success', 'warning', 'danger'].includes(b.level) ? b.level : 'info'
    const { rows: [row] } = await q(
      `INSERT INTO notices (title, body, level, show_in_store, active) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [String(b.title).slice(0, 200), b.body ? String(b.body).slice(0, 2000) : null, level, Boolean(b.show_in_store), b.active === undefined ? true : Boolean(b.active)]
    )
    return reply.code(201).send({ notice: row })
  })
  app.patch('/api/admin/notices/:id', guard, async (req, reply) => {
    const b = req.body || {}
    const level = b.level && ['info', 'success', 'warning', 'danger'].includes(b.level) ? b.level : null
    const { rows: [row] } = await q(
      `UPDATE notices SET
         title = COALESCE($1, title), body = COALESCE($2, body), level = COALESCE($3, level),
         show_in_store = COALESCE($4, show_in_store), active = COALESCE($5, active)
       WHERE id=$6 RETURNING *`,
      [b.title ?? null, b.body ?? null, level, typeof b.show_in_store === 'boolean' ? b.show_in_store : null,
       typeof b.active === 'boolean' ? b.active : null, numOr(req.params.id)]
    )
    if (!row) return reply.code(404).send({ error: 'Aviso no encontrado' })
    return { notice: row }
  })
  app.delete('/api/admin/notices/:id', guard, async (req, reply) => {
    const { rowCount } = await q('DELETE FROM notices WHERE id=$1', [numOr(req.params.id)])
    if (!rowCount) return reply.code(404).send({ error: 'Aviso no encontrado' })
    return { deleted: true }
  })
}
