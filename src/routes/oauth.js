import { randomBytes } from 'node:crypto'
import { q } from '../db.js'
import { config } from '../config.js'
import { redis } from '../redis.js'
import { getGhlConfig } from '../lib/settings.js'
import { buildAuthUrl, exchangeCode, fetchLocationName, DEFAULT_SCOPES } from '../lib/ghl.js'
import { requireAdmin } from '../lib/session.js'

const redirectUri = () => `${config.appBaseUrl}/api/oauth/callback`

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const page = (msg, ok = false) => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Marketplace Disruptivo</title>
<style>body{font-family:system-ui,sans-serif;background:#0f1117;color:#e8e6e0;display:grid;place-items:center;min-height:100vh;margin:0}
.card{background:#181b23;border:1px solid #2a2e3a;border-radius:14px;padding:40px;max-width:440px;text-align:center}
.icon{font-size:40px;margin-bottom:12px}b{color:#d9b45b}</style></head>
<body><div class="card"><div class="icon">${ok ? '✅' : '⚠️'}</div><p>${msg}</p></div></body></html>`

export default async function oauthRoutes(app) {
  app.get('/api/oauth/url', { preHandler: requireAdmin }, async (req, reply) => {
    const cfg = await getGhlConfig()
    if (!cfg.client_id) return reply.code(409).send({ error: 'Configura primero el client_id de la app GHL' })
    if (!config.appBaseUrl) return reply.code(409).send({ error: 'Falta la variable APP_BASE_URL' })
    // state anti-CSRF de un solo uso, ligado a esta instancia (10 min)
    const state = randomBytes(16).toString('hex')
    await redis.set(`oauthstate:${state}`, '1', 'EX', 600)
    return { url: buildAuthUrl(cfg, redirectUri(), { state }), redirect_uri: redirectUri(), scopes: DEFAULT_SCOPES }
  })

  app.get('/api/oauth/callback', async (req, reply) => {
    const { code, state } = req.query
    if (!code) return reply.code(400).type('text/html').send(page('Falta el código de autorización.'))
    try {
      // válido si: (a) trae un state emitido por el panel (consumido atómicamente), o
      // (b) es una instalación directa desde GHL y el companyId coincide con la agencia configurada
      const stateOk = state ? (await redis.del(`oauthstate:${String(state)}`)) === 1 : false
      const tok = await exchangeCode(code, redirectUri())
      const locationId = tok.locationId
      if (!locationId) {
        throw new Error('GHL no devolvió locationId. Revisa que la app permita instalación en subcuentas (Sub-Account).')
      }
      if (!stateOk) {
        const cfg = await getGhlConfig()
        if (!cfg.company_id || tok.companyId !== cfg.company_id) {
          throw new Error('Instalación no autorizada: inicia la conexión desde el panel, o configura el Company ID de tu agencia en Configuración para permitir instalaciones directas desde GHL.')
        }
      }
      const expiresAt = new Date(Date.now() + ((Number(tok.expires_in) || 3600) - 60) * 1000)
      const { rows: [conn] } = await q(
        `INSERT INTO connections (location_id, company_id, access_token, refresh_token, token_expires_at, status)
         VALUES ($1,$2,$3,$4,$5,'connected')
         ON CONFLICT (location_id) DO UPDATE SET
           company_id = COALESCE(EXCLUDED.company_id, connections.company_id),
           access_token = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token,
           token_expires_at = EXCLUDED.token_expires_at,
           status = 'connected',
           updated_at = now()
         RETURNING *`,
        [locationId, tok.companyId || null, tok.access_token, tok.refresh_token || null, expiresAt]
      )
      const name = await fetchLocationName(conn.id, locationId)
      if (name) await q('UPDATE connections SET name=$1, updated_at=now() WHERE id=$2', [name, conn.id])
      return reply.type('text/html').send(
        page(`Subcuenta conectada correctamente${name ? `: <b>${escapeHtml(name)}</b>` : ` (<b>${escapeHtml(locationId)}</b>)`}.<br>Ya puedes cerrar esta pestaña.`, true)
      )
    } catch (err) {
      req.log.error(err)
      return reply.code(500).type('text/html').send(page(`Error al conectar: ${escapeHtml(err.message)}`))
    }
  })
}
