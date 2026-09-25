// Webhooks de la app del marketplace de GHL: AppInstall / AppUninstall.
// La URL NO puede llevar «ghl» ni «highlevel»: el validador del marketplace las rechaza.
// Se configura en la app de GHL → Advanced Settings → Webhooks: https://<dominio>/api/webhooks/app
import { redis } from '../redis.js'
import { verifyGhlSignature } from '../lib/installRules.js'
import { handleAppEvent } from '../lib/installs.js'

export default async function webhookRoutes(app) {
  // solo en este contexto: el JSON llega como texto para poder verificar la firma sobre el cuerpo CRUDO
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    req.rawBody = body
    try {
      done(null, body ? JSON.parse(body) : {})
    } catch (err) {
      err.statusCode = 400
      done(err)
    }
  })

  app.post('/api/webhooks/app', async (req, reply) => {
    if (!verifyGhlSignature(req.rawBody || '', req.headers)) {
      req.log.warn({ type: req.body?.type || null }, 'webhook de app con firma inválida')
      return reply.code(401).send({ error: 'Firma inválida' })
    }
    const p = req.body || {}
    // GHL reintenta: el webhookId evita procesar dos veces el mismo aviso
    if (p.webhookId) {
      const first = await redis.set(`wh:app:${p.webhookId}`, '1', 'EX', 86_400, 'NX').catch(() => 'OK')
      if (!first) return { ok: true, duplicado: true }
    }
    // se responde 200 al momento y se procesa en segundo plano (pedir tokens a GHL tarda); si el proceso
    // se reiniciara a mitad, la sincronización periódica lo completa igualmente
    setImmediate(() => {
      handleAppEvent(p, req.log).catch((err) => req.log.error({ err: err.message, type: p.type, locationId: p.locationId || null }, 'webhook de app: fallo al procesar'))
    })
    return { ok: true }
  })
}
