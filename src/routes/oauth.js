import { randomBytes } from 'node:crypto'
import { config } from '../config.js'
import { redis } from '../redis.js'
import { getGhlConfig } from '../lib/settings.js'
import { buildAuthUrl, exchangeCode, DEFAULT_SCOPES } from '../lib/ghl.js'
import { requireAdmin } from '../lib/session.js'
import { ourCompanyIds, saveAgencyToken, syncInstalledLocations, upsertConnectionFromToken } from '../lib/installs.js'
import { callbackUriFrom } from '../lib/installRules.js'

const redirectUri = () => `${config.appBaseUrl}/api/oauth/callback`

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const page = (msg, ok = false) => `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Marketplace Disruptivo</title>
<style>body{font-family:system-ui,sans-serif;background:#0f1117;color:#e8e6e0;display:grid;place-items:center;min-height:100vh;margin:0}
.card{background:#181b23;border:1px solid #2a2e3a;border-radius:14px;padding:40px;max-width:480px;text-align:center;line-height:1.55}
.icon{font-size:40px;margin-bottom:12px}b{color:#d9b45b}small{color:#8b8f9c}</style></head>
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
      // (b) es una instalación directa desde GHL y la agencia es la nuestra
      const stateOk = state ? (await redis.del(`oauthstate:${String(state)}`)) === 1 : false
      // el canje usa la URL exacta a la que GHL redirigió (dominio nuevo o el viejo, según la app)
      const tok = await exchangeCode(code, callbackUriFrom(req.hostname, redirectUri()))
      const companyId = String(tok.companyId || tok.company_id || '').trim()
      const { check } = await ourCompanyIds()
      if (!stateOk && !check(companyId)) {
        throw new Error('Instalación no autorizada: inicia la conexión desde el panel, o configura el Company ID de tu agencia en Configuración para permitir instalaciones directas desde GHL.')
      }

      // 1) token de SUBCUENTA (lo instaló un usuario de la subcuenta, o se eligió una sola desde el panel)
      if (tok.locationId) {
        const conn = await upsertConnectionFromToken(tok, { source: stateOk ? 'panel' : 'install', refreshName: true })
        const name = conn.alias || conn.name
        return reply.type('text/html').send(page(
          `Subcuenta conectada correctamente${name ? `: <b>${escapeHtml(name)}</b>` : ` (<b>${escapeHtml(conn.location_id)}</b>)`}.<br>Ya puedes cerrar esta pestaña.`,
          true
        ))
      }

      // 2) token de AGENCIA: GHL fuerza la instalación masiva cuando instala un usuario de agencia. Se guarda
      //    y se conectan todas las subcuentas donde está instalada la app (y las futuras llegarán por webhook).
      if (companyId && tok.access_token) {
        // un token de agencia solo se guarda si es de NUESTRA agencia (aunque la conexión la iniciara el panel)
        if (!check(companyId)) throw new Error('La agencia que instaló la app no es la configurada en Configuración.')
        await saveAgencyToken(tok)
        const s = await syncInstalledLocations({ companyId, log: req.log })
        const ok = [...s.created, ...s.repaired]
        const nombres = ok.map((x) => `<b>${escapeHtml(x.name || x.locationId)}</b>`)
        const fallos = s.failed.filter((f) => f.locationId)
        let msg = 'Instalación registrada para la agencia.'
        if (nombres.length) msg += `<br>Subcuentas conectadas: ${nombres.join(', ')}.`
        else if (s.installed) msg += '<br>Todas las subcuentas donde está instalada ya estaban conectadas.'
        else msg += '<br>Las subcuentas aparecerán en el panel en cuanto GoHighLevel confirme la instalación (unos segundos).'
        if (fallos.length) msg += `<br><small>No se pudieron conectar ${fallos.length}: ${escapeHtml(fallos[0].error)}</small>`
        const agencyErr = s.failed.find((f) => f.companyId)
        if (agencyErr) msg += `<br><small>Aviso: ${escapeHtml(agencyErr.error)}</small>`
        return reply.type('text/html').send(page(`${msg}<br>Ya puedes cerrar esta pestaña.`, !fallos.length && !agencyErr))
      }

      throw new Error('GoHighLevel no devolvió ni la subcuenta ni la agencia en el token.')
    } catch (err) {
      req.log.error({ err: err.message, data: err.data || null }, 'oauth callback')
      return reply.code(500).type('text/html').send(page(`Error al conectar: ${escapeHtml(err.message)}`))
    }
  })
}
