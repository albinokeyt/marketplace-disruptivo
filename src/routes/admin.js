import { q, numOr } from '../db.js'
import { config } from '../config.js'
import { redis } from '../redis.js'
import { safeEqual, generateApiKey, verifyPassword } from '../lib/crypto.js'
import { rateLimit } from '../lib/ratelimit.js'
import { createSession, destroySession, requireAdmin, requireAuth } from '../lib/session.js'
import { getSetting, setSetting, getGhlConfig } from '../lib/settings.js'
import { refundCharge, reconcileCharge, publicCharge } from '../lib/charges.js'
import { decryptGhlSso, ssoAuthorized } from '../lib/sso.js'
import * as ghl from '../lib/ghl.js'

const LOGIN_MAX_FAILS = 10
const LOGIN_WINDOW_S = 900

export default async function adminRoutes(app) {
  // ---------- auth ----------
  app.post('/api/admin/login', async (req, reply) => {
    const body = req.body || {}
    const ident = String(body.email || body.user || '').trim().toLowerCase()
    const pass = body.pass || ''
    // anti fuerza bruta por IP (trustProxy ya resuelve la IP real)
    const failKey = `login:fail:${req.ip}`
    const fails = numOr(await redis.get(failKey), 0)
    if (fails >= LOGIN_MAX_FAILS) {
      return reply.code(429).send({ error: 'Demasiados intentos fallidos: espera 15 minutos' })
    }
    const fail = async () => {
      const n = await redis.incr(failKey)
      if (n === 1) await redis.expire(failKey, LOGIN_WINDOW_S)
      return reply.code(401).send({ error: 'Credenciales incorrectas' })
    }

    // 1) super-admin por variables de entorno
    if (config.adminPass && safeEqual(ident, String(config.adminUser).toLowerCase()) && safeEqual(pass, config.adminPass)) {
      await redis.del(failKey)
      await createSession(req, reply, { userId: 'root', role: 'admin' })
      return { ok: true, role: 'admin' }
    }
    // 2) usuario de la tabla users (creado por un admin, aunque no esté en GHL)
    if (ident) {
      const { rows: [u] } = await q('SELECT * FROM users WHERE email=$1 AND active=true', [ident])
      if (u && verifyPassword(pass, u.password_hash)) {
        await redis.del(failKey)
        await createSession(req, reply, { userId: String(u.id), role: u.role })
        return { ok: true, role: u.role }
      }
    }
    return fail()
  })

  // Auto-login por SSO de GHL: la app, embebida en una Custom Page, recibe el contexto de usuario
  // CIFRADO por GHL (postMessage) y lo canjea aquí por una sesión admin. Sin contraseña, sin URL
  // falsificable. Solo entra quien esté autorizado (agencia dueña o lista blanca).
  app.post('/api/admin/sso', async (req, reply) => {
    // rate-limit por IP (mitiga replay/abuso del endpoint, que crea sesión admin)
    const rl = await rateLimit(`sso:${req.ip}`, 30, 60)
    if (!rl.ok) return reply.code(429).send({ error: 'Demasiados intentos; espera un momento' })
    const encrypted = req.body?.encrypted
    if (!encrypted) return reply.code(400).send({ error: 'Falta el contexto cifrado de GHL' })
    const cfg = await getGhlConfig()
    if (!cfg.sso_secret) return reply.code(503).send({ error: 'SSO no configurado: falta el Shared Secret en Configuración' })
    let identity
    try {
      identity = decryptGhlSso(encrypted, cfg.sso_secret)
    } catch {
      return reply.code(401).send({ error: 'No se pudo verificar la identidad de GHL' })
    }
    const admins = (await getSetting('sso_admins')) || {}
    if (!ssoAuthorized(identity, admins, cfg)) {
      return reply.code(403).send({ error: 'Tu usuario de GHL no está autorizado para este panel' })
    }
    // sesión cross-site: la cookie viaja en el iframe de GHL (SameSite=None; Secure; Partitioned)
    await createSession(req, reply, { userId: `sso:${String(identity.email || '').toLowerCase()}`, role: 'admin', crossSite: true })
    return { ok: true }
  })

  app.post('/api/admin/logout', async (req, reply) => {
    await destroySession(req, reply)
    return { ok: true }
  })

  app.get('/api/admin/me', { preHandler: requireAuth }, async (req, reply) => {
    const s = req.session
    if (s.role === 'admin') {
      const email = s.userId === 'root' ? config.adminUser : (String(s.userId).startsWith('sso:') ? String(s.userId).slice(4) : null)
      return { ok: true, role: 'admin', email }
    }
    const { rows: [u] } = await q('SELECT email, name, role FROM users WHERE id=$1 AND active=true', [numOr(s.userId)])
    if (!u) return reply.code(401).send({ error: 'No autorizado' })
    return { ok: true, role: 'user', email: u.email, name: u.name }
  })

  // todo lo demás requiere sesión admin
  const guard = { preHandler: requireAdmin }

  // ---------- dashboard ----------
  app.get('/api/admin/dashboard', guard, async () => {
    const [totals, byStatus, series, topApps, recent, counts] = await Promise.all([
      // "Facturado" = solo lo cobrado al WALLET (dinero real). Lo pagado con crédito interno
      // (saldo regalado/prepagado) se reporta aparte para no inflar los ingresos.
      q(`SELECT
           COALESCE(SUM(amount) FILTER (WHERE paid_with='wallet' AND created_at >= date_trunc('day', now())), 0) AS today,
           COALESCE(SUM(amount) FILTER (WHERE paid_with='wallet' AND created_at >= now() - interval '7 days'), 0) AS last7,
           COALESCE(SUM(amount) FILTER (WHERE paid_with='wallet' AND created_at >= now() - interval '30 days'), 0) AS last30,
           COALESCE(SUM(amount) FILTER (WHERE paid_with='wallet'), 0) AS all_time,
           COALESCE(SUM(amount) FILTER (WHERE paid_with='credit' AND created_at >= now() - interval '30 days'), 0) AS credit_last30,
           COALESCE(SUM(amount) FILTER (WHERE paid_with='credit'), 0) AS credit_all_time
         FROM charges WHERE status = 'created'`),
      q(`SELECT status, COUNT(*)::int AS n FROM charges GROUP BY status`),
      q(`SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
                COALESCE(SUM(c.amount) FILTER (WHERE c.status='created' AND c.paid_with='wallet'), 0) AS amount,
                COALESCE(SUM(c.amount) FILTER (WHERE c.status='created' AND c.paid_with='credit'), 0) AS credit,
                COUNT(c.id) FILTER (WHERE c.status='created')::int AS charges
         FROM generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') AS d(day)
         LEFT JOIN charges c ON date_trunc('day', c.created_at) = d.day
         GROUP BY d.day ORDER BY d.day`),
      q(`SELECT a.id, a.name,
                COALESCE(SUM(c.amount) FILTER (WHERE c.status='created' AND c.paid_with='wallet'), 0) AS amount,
                COALESCE(SUM(c.amount) FILTER (WHERE c.status='created' AND c.paid_with='credit'), 0) AS credit,
                COUNT(c.id)::int AS charges
         FROM apps a
         LEFT JOIN charges c ON c.app_id = a.id AND c.created_at >= now() - interval '30 days'
         GROUP BY a.id, a.name ORDER BY amount DESC LIMIT 8`),
      q(`SELECT c.*, a.name AS app_name, m.code AS meter_code,
                COALESCE(NULLIF(k.alias,''), k.name, c.location_id) AS location_name
         FROM charges c
         JOIN apps a ON a.id = c.app_id
         LEFT JOIN meters m ON m.id = c.meter_id
         LEFT JOIN connections k ON k.id = c.connection_id
         ORDER BY c.created_at DESC LIMIT 12`),
      q(`SELECT
           (SELECT COUNT(*)::int FROM apps WHERE status='active') AS apps,
           (SELECT COUNT(*)::int FROM connections WHERE status='connected') AS connections,
           (SELECT COUNT(*)::int FROM meters WHERE active=true) AS meters`),
    ])
    return {
      totals: Object.fromEntries(Object.entries(totals.rows[0]).map(([k, v]) => [k, numOr(v, 0)])),
      by_status: byStatus.rows,
      series: series.rows.map((r) => ({ day: r.day, amount: numOr(r.amount, 0), credit: numOr(r.credit, 0), charges: r.charges })),
      top_apps: topApps.rows.map((r) => ({ ...r, amount: numOr(r.amount, 0) })),
      recent: recent.rows.map((r) => ({ ...publicCharge(r), app_name: r.app_name, location_name: r.location_name })),
      counts: counts.rows[0],
    }
  })

  // ---------- apps consumidoras ----------
  app.get('/api/admin/apps', guard, async () => {
    const { rows } = await q(
      `SELECT a.*, COUNT(c.id)::int AS charges_count,
              COALESCE(SUM(c.amount) FILTER (WHERE c.status='created' AND c.paid_with='wallet'), 0) AS amount_total,
              COALESCE(SUM(c.amount) FILTER (WHERE c.status='created' AND c.paid_with='credit'), 0) AS credit_total
       FROM apps a LEFT JOIN charges c ON c.app_id = a.id
       GROUP BY a.id ORDER BY a.created_at DESC`
    )
    return { apps: rows.map((r) => ({ ...r, key_hash: undefined, amount_total: numOr(r.amount_total, 0), credit_total: numOr(r.credit_total, 0) })) }
  })

  app.post('/api/admin/apps', guard, async (req, reply) => {
    const name = String(req.body?.name || '').trim()
    if (!name) return reply.code(400).send({ error: 'Falta el nombre de la app' })
    const { key, prefix, hash } = generateApiKey()
    const { rows: [row] } = await q(
      `INSERT INTO apps (name, key_prefix, key_hash) VALUES ($1,$2,$3) RETURNING *`,
      [name, prefix, hash]
    )
    // la API key solo se muestra UNA vez
    return reply.code(201).send({ app: { ...row, key_hash: undefined }, api_key: key })
  })

  app.post('/api/admin/apps/:id/regenerate', guard, async (req, reply) => {
    const { key, prefix, hash } = generateApiKey()
    const { rows: [row] } = await q(
      `UPDATE apps SET key_prefix=$1, key_hash=$2, status='active' WHERE id=$3 RETURNING *`,
      [prefix, hash, numOr(req.params.id)]
    )
    if (!row) return reply.code(404).send({ error: 'App no encontrada' })
    return { app: { ...row, key_hash: undefined }, api_key: key }
  })

  app.patch('/api/admin/apps/:id', guard, async (req, reply) => {
    const id = numOr(req.params.id)
    const { name, test_mode, status } = req.body || {}
    if (status && !['active', 'revoked'].includes(status)) return reply.code(400).send({ error: 'status inválido' })
    // allowed_location_ids: ausente = sin cambios; null = todas; array = solo esas
    let allowedSql = false
    let allowedVal = null
    if ('allowed_location_ids' in (req.body || {})) {
      const v = req.body.allowed_location_ids
      if (v !== null && (!Array.isArray(v) || v.some((x) => typeof x !== 'string'))) {
        return reply.code(400).send({ error: 'allowed_location_ids debe ser null (todas) o un array de location_id' })
      }
      allowedSql = true
      allowedVal = v === null ? null : JSON.stringify(v)
    }
    const { rows: [row] } = await q(
      `UPDATE apps SET
         name = COALESCE($1, name),
         test_mode = COALESCE($2, test_mode),
         status = COALESCE($3, status),
         allowed_location_ids = CASE WHEN $4 THEN $5::jsonb ELSE allowed_location_ids END
       WHERE id=$6 RETURNING *`,
      [name ?? null, typeof test_mode === 'boolean' ? test_mode : null, status ?? null, allowedSql, allowedVal, id]
    )
    if (!row) return reply.code(404).send({ error: 'App no encontrada' })
    return { app: { ...row, key_hash: undefined } }
  })

  // ---------- tarifas (meters) ----------
  app.get('/api/admin/meters', guard, async () => {
    const { rows } = await q(
      `SELECT m.*, COUNT(c.id)::int AS charges_count
       FROM meters m LEFT JOIN charges c ON c.meter_id = m.id
       GROUP BY m.id ORDER BY m.created_at DESC`
    )
    return { meters: rows }
  })

  const meterBody = (body) => {
    const code = String(body?.code || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    return {
      code,
      ghl_meter_id: String(body?.ghl_meter_id || '').trim(),
      name: String(body?.name || '').trim(),
      unit_label: String(body?.unit_label || 'unidad').trim(),
      price_type: body?.price_type === 'dynamic' ? 'dynamic' : 'fixed',
      default_price: numOr(body?.default_price),
      min_price: numOr(body?.min_price),
      max_price: numOr(body?.max_price),
    }
  }

  app.post('/api/admin/meters', guard, async (req, reply) => {
    const m = meterBody(req.body)
    if (!m.code || !m.ghl_meter_id || !m.name) {
      return reply.code(400).send({ error: 'code, ghl_meter_id y name son obligatorios' })
    }
    if (m.price_type === 'fixed' && m.default_price === null) {
      return reply.code(400).send({ error: 'Una tarifa de precio fijo necesita default_price (sin él, los cargos quedarían sin importe en el ledger)' })
    }
    try {
      const { rows: [row] } = await q(
        `INSERT INTO meters (code, ghl_meter_id, name, unit_label, price_type, default_price, min_price, max_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [m.code, m.ghl_meter_id, m.name, m.unit_label, m.price_type, m.default_price, m.min_price, m.max_price]
      )
      return reply.code(201).send({ meter: row })
    } catch (err) {
      if (err.code === '23505') return reply.code(409).send({ error: `Ya existe una tarifa con el código "${m.code}"` })
      throw err
    }
  })

  app.patch('/api/admin/meters/:id', guard, async (req, reply) => {
    const id = numOr(req.params.id)
    const body = req.body || {}
    if ('price_type' in body && !['fixed', 'dynamic'].includes(body.price_type)) {
      return reply.code(400).send({ error: 'price_type debe ser "fixed" o "dynamic"' })
    }
    const { rows: [current] } = await q('SELECT * FROM meters WHERE id=$1', [id])
    if (!current) return reply.code(404).send({ error: 'Tarifa no encontrada' })
    // semántica parcial real: solo se toca lo que viene en el body (distinguiendo ausente de null explícito)
    const m = meterBody(body)
    const merged = {
      code: 'code' in body && m.code ? m.code : current.code,
      ghl_meter_id: 'ghl_meter_id' in body && m.ghl_meter_id ? m.ghl_meter_id : current.ghl_meter_id,
      name: 'name' in body && m.name ? m.name : current.name,
      unit_label: 'unit_label' in body && m.unit_label ? m.unit_label : current.unit_label,
      price_type: 'price_type' in body ? m.price_type : current.price_type,
      default_price: 'default_price' in body ? m.default_price : numOr(current.default_price),
      min_price: 'min_price' in body ? m.min_price : numOr(current.min_price),
      max_price: 'max_price' in body ? m.max_price : numOr(current.max_price),
      active: typeof body.active === 'boolean' ? body.active : current.active,
    }
    if (merged.price_type === 'fixed' && merged.default_price === null) {
      return reply.code(400).send({ error: 'Una tarifa de precio fijo necesita default_price' })
    }
    const { rows: [row] } = await q(
      `UPDATE meters SET code=$1, ghl_meter_id=$2, name=$3, unit_label=$4, price_type=$5,
         default_price=$6, min_price=$7, max_price=$8, active=$9
       WHERE id=$10 RETURNING *`,
      [merged.code, merged.ghl_meter_id, merged.name, merged.unit_label, merged.price_type,
       merged.default_price, merged.min_price, merged.max_price, merged.active, id]
    )
    return { meter: row }
  })

  app.delete('/api/admin/meters/:id', guard, async (req, reply) => {
    const id = numOr(req.params.id)
    const { rows: [used] } = await q('SELECT 1 FROM charges WHERE meter_id=$1 LIMIT 1', [id])
    if (used) {
      const { rows: [row] } = await q('UPDATE meters SET active=false WHERE id=$1 RETURNING *', [id])
      if (!row) return reply.code(404).send({ error: 'Tarifa no encontrada' })
      return { meter: row, deactivated: true }
    }
    const { rowCount } = await q('DELETE FROM meters WHERE id=$1', [id])
    if (!rowCount) return reply.code(404).send({ error: 'Tarifa no encontrada' })
    return { deleted: true }
  })

  // ---------- conexiones (subcuentas GHL) ----------
  app.get('/api/admin/connections', guard, async () => {
    const { rows } = await q(
      `SELECT k.id, k.location_id, k.company_id, k.alias, k.name, k.test_mode, k.status,
              k.created_at, k.updated_at, (k.refresh_token IS NOT NULL) AS has_tokens,
              COUNT(c.id)::int AS charges_count,
              COALESCE(SUM(c.amount) FILTER (WHERE c.status='created' AND c.paid_with='wallet'), 0) AS amount_total,
              COALESCE(SUM(c.amount) FILTER (WHERE c.status='created' AND c.paid_with='credit'), 0) AS credit_total
       FROM connections k LEFT JOIN charges c ON c.connection_id = k.id
       GROUP BY k.id ORDER BY k.created_at DESC`
    )
    return { connections: rows.map((r) => ({ ...r, amount_total: numOr(r.amount_total, 0), credit_total: numOr(r.credit_total, 0) })) }
  })

  app.patch('/api/admin/connections/:id', guard, async (req, reply) => {
    const id = numOr(req.params.id)
    const { alias, test_mode } = req.body || {}
    const { rows: [row] } = await q(
      `UPDATE connections SET
         alias = COALESCE($1, alias),
         test_mode = COALESCE($2, test_mode),
         updated_at = now()
       WHERE id=$3 RETURNING id, location_id, alias, name, test_mode, status`,
      [alias ?? null, typeof test_mode === 'boolean' ? test_mode : null, id]
    )
    if (!row) return reply.code(404).send({ error: 'Conexión no encontrada' })
    return { connection: row }
  })

  app.post('/api/admin/connections/:id/check-funds', guard, async (req, reply) => {
    const id = numOr(req.params.id)
    try {
      const data = await ghl.hasFunds(id)
      return { hasFunds: Boolean(data?.hasFunds) }
    } catch (err) {
      return reply.code(502).send({ error: err.message })
    }
  })

  app.post('/api/admin/connections/:id/refresh-name', guard, async (req, reply) => {
    const id = numOr(req.params.id)
    const { rows: [conn] } = await q('SELECT * FROM connections WHERE id=$1', [id])
    if (!conn) return reply.code(404).send({ error: 'Conexión no encontrada' })
    const name = await ghl.fetchLocationName(id, conn.location_id)
    if (!name) return reply.code(502).send({ error: 'No se pudo leer el nombre (¿scope locations.readonly concedido?)' })
    await q('UPDATE connections SET name=$1, updated_at=now() WHERE id=$2', [name, id])
    return { name }
  })

  app.delete('/api/admin/connections/:id', guard, async (req, reply) => {
    const id = numOr(req.params.id)
    const { rows: [row] } = await q(
      `UPDATE connections SET status='disconnected', access_token=NULL, refresh_token=NULL,
       token_expires_at=NULL, updated_at=now() WHERE id=$1 RETURNING id`,
      [id]
    )
    if (!row) return reply.code(404).send({ error: 'Conexión no encontrada' })
    return { disconnected: true }
  })

  // ---------- cobros ----------
  app.get('/api/admin/charges', guard, async (req) => {
    const { app_id, location_id, status, from, to } = req.query
    const limit = Math.min(Math.max(Math.trunc(numOr(req.query.limit, 50) ?? 50), 1), 200)
    const offset = Math.max(Math.trunc(numOr(req.query.offset, 0) ?? 0), 0)
    const where = ['true']
    const params = []
    if (app_id) { params.push(numOr(app_id)); where.push(`c.app_id = $${params.length}`) }
    if (location_id) { params.push(location_id); where.push(`c.location_id = $${params.length}`) }
    if (status) { params.push(status); where.push(`c.status = $${params.length}`) }
    if (from) { params.push(from); where.push(`c.created_at >= $${params.length}`) }
    if (to) { params.push(to); where.push(`c.created_at < ($${params.length}::date + interval '1 day')`) }
    params.push(limit, offset)
    const { rows } = await q(
      `SELECT c.*, a.name AS app_name, m.code AS meter_code,
              COALESCE(NULLIF(k.alias,''), k.name, c.location_id) AS location_name
       FROM charges c
       JOIN apps a ON a.id = c.app_id
       LEFT JOIN meters m ON m.id = c.meter_id
       LEFT JOIN connections k ON k.id = c.connection_id
       WHERE ${where.join(' AND ')}
       ORDER BY c.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    )
    return { charges: rows.map((r) => ({ ...publicCharge(r), app_name: r.app_name, location_name: r.location_name })) }
  })

  app.post('/api/admin/charges/:id/refund', guard, async (req, reply) => {
    const { rows: [row] } = await q('SELECT * FROM charges WHERE id=$1', [numOr(req.params.id)])
    if (!row) return reply.code(404).send({ error: 'Cargo no encontrado' })
    try {
      const updated = await refundCharge(row)
      return { charge: publicCharge(updated) }
    } catch (err) {
      return reply.code(err.statusCode || 502).send({ error: err.message })
    }
  })

  // Resolver manualmente un cargo 'unknown': pregunta a GHL si de verdad se cobró
  app.post('/api/admin/charges/:id/reconcile', guard, async (req, reply) => {
    const { rows: [row] } = await q('SELECT * FROM charges WHERE id=$1', [numOr(req.params.id)])
    if (!row) return reply.code(404).send({ error: 'Cargo no encontrado' })
    if (!['unknown', 'pending'].includes(row.status)) {
      return reply.code(409).send({ error: `Solo se reconcilian cargos sin confirmar (estado actual: ${row.status})` })
    }
    if (!row.connection_id) return reply.code(409).send({ error: 'El cargo no tiene conexión asociada' })
    try {
      const rec = await reconcileCharge(row)
      if (rec.verified) return { result: 'cobrado', charge: publicCharge(rec.verified) }
      if (rec.absent) return { result: 'no_encontrado', message: 'GHL no reconoce este cargo. Puede seguir asentándose; reintenta más tarde o pide a la app que reintente con el mismo event_id.' }
      return reply.code(502).send({ result: 'sin_respuesta', error: 'GHL no respondió; inténtalo de nuevo' })
    } catch (err) {
      return reply.code(err.statusCode || 502).send({ error: err.message })
    }
  })

  // ---------- configuración ----------
  app.get('/api/admin/settings', guard, async () => {
    const ghlApp = await getGhlConfig()
    const admins = (await getSetting('sso_admins')) || {}
    return {
      ghl_app: {
        client_id: ghlApp.client_id || '',
        client_secret: ghlApp.client_secret ? '••••••' + String(ghlApp.client_secret).slice(-4) : '',
        app_id: ghlApp.app_id || '',
        company_id: ghlApp.company_id || '',
        pit_token: ghlApp.pit_token ? '••••••' + String(ghlApp.pit_token).slice(-4) : '',
        sso_secret: ghlApp.sso_secret ? '••••••' + String(ghlApp.sso_secret).slice(-4) : '',
      },
      sso_admins: { company_ids: admins.company_ids || [], emails: admins.emails || [] },
      test_mode: Boolean(await getSetting('test_mode')),
      app_base_url: config.appBaseUrl,
      redirect_uri: config.appBaseUrl ? `${config.appBaseUrl}/api/oauth/callback` : '(define APP_BASE_URL)',
      custom_page_url: config.appBaseUrl ? `${config.appBaseUrl}/` : '(define APP_BASE_URL)',
    }
  })

  app.put('/api/admin/settings', guard, async (req, reply) => {
    const body = req.body || {}
    if (body.ghl_app) {
      const current = await getGhlConfig()
      const inp = body.ghl_app
      // ausente/null = conservar; '' explícito = borrar; '••••…' (máscara) = conservar
      const keep = (val, prev) => {
        if (val === undefined || val === null) return prev || ''
        const s = String(val).trim()
        if (!s) return ''
        return s.startsWith('••••') ? (prev || '') : s
      }
      await setSetting('ghl_app', {
        client_id: String(inp.client_id ?? current.client_id ?? '').trim(),
        client_secret: keep(inp.client_secret, current.client_secret),
        app_id: String(inp.app_id ?? current.app_id ?? '').trim(),
        company_id: String(inp.company_id ?? current.company_id ?? '').trim(),
        pit_token: keep(inp.pit_token, current.pit_token),
        sso_secret: keep(inp.sso_secret, current.sso_secret),
      })
    }
    if (body.sso_admins && typeof body.sso_admins === 'object') {
      const norm = (arr) => (Array.isArray(arr) ? arr.map((x) => String(x).trim()).filter(Boolean) : [])
      await setSetting('sso_admins', {
        company_ids: norm(body.sso_admins.company_ids),
        emails: norm(body.sso_admins.emails).map((e) => e.toLowerCase()),
      })
    }
    if (typeof body.test_mode === 'boolean') await setSetting('test_mode', body.test_mode)
    return { ok: true }
  })
}
