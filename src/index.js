import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { config } from './config.js'
import { migrate, pool, q } from './db.js'
import { redis } from './redis.js'
import { startReconciler, stopReconciler } from './lib/reconciler.js'
import oauthRoutes from './routes/oauth.js'
import publicApiRoutes from './routes/publicApi.js'
import adminRoutes from './routes/admin.js'
import marketplaceRoutes from './routes/marketplace.js'
import userRoutes from './routes/users.js'

const app = Fastify({ logger: true, trustProxy: true })

await app.register(fastifyCookie)

// salud para EasyPanel / Docker (público, sin auth)
app.get('/healthz', async (req, reply) => {
  const health = { ok: true, db: false, redis: false }
  try { await q('SELECT 1'); health.db = true } catch { health.ok = false }
  try { await redis.ping(); health.redis = true } catch { health.ok = false }
  return reply.code(health.ok ? 200 : 503).send(health)
})

await app.register(oauthRoutes)
await app.register(adminRoutes)
await app.register(marketplaceRoutes)
await app.register(userRoutes)
await app.register(publicApiRoutes, { prefix: '' })

// panel React compilado (web/dist)
const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist')
if (existsSync(distDir)) {
  await app.register(fastifyStatic, { root: distDir, index: ['index.html'] })
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Ruta no encontrada' })
    }
    return reply.sendFile('index.html')
  })
} else {
  app.get('/', async () => ({ ok: true, service: 'disruptivo-wallet', panel: 'sin compilar (web/dist no existe)' }))
}

app.setErrorHandler((err, req, reply) => {
  req.log.error(err)
  const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500
  reply.code(status).send({ error: status === 500 ? 'Error interno' : err.message })
})

// cierre ordenado: Node es PID 1 en el contenedor y sin handler ignoraría el SIGTERM de cada redeploy
let shuttingDown = false
const shutdown = async (signal) => {
  if (shuttingDown) return
  shuttingDown = true
  app.log.info({ signal }, 'cerrando ordenadamente')
  try {
    stopReconciler()
    await app.close() // drena las peticiones en vuelo (cargos incluidos)
    await pool.end()
    await redis.quit()
  } catch (err) {
    app.log.error(err)
  }
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

try {
  await migrate(app.log)
  // fail-fast si Redis no está accesible: sin él no hay sesiones ni locks de token
  await redis.ping().catch((err) => {
    throw new Error(`No se pudo conectar a Redis (${config.redisUrl}): ${err.message}`)
  })
  if (!config.adminPass) {
    app.log.warn('ADMIN_PASS no está definido: el login del panel está deshabilitado hasta configurarlo')
  }
  await app.listen({ port: config.port, host: '0.0.0.0' })
  startReconciler(app.log)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
