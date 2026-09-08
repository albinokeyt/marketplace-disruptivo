import { q } from '../db.js'
import { requireAdmin } from '../lib/session.js'
import { config } from '../config.js'

// Subida de fotos/vídeos para la vitrina de la tienda. Se guardan en Postgres (tabla assets) y se
// sirven públicamente en /uploads/<id>.<ext>: sin volúmenes ni CDN externo, y persisten entre redeploys.
const ALLOWED = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm',
  'application/pdf': 'pdf',
}
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const assetUrl = (id, mime) => `${config.appBaseUrl || ''}/uploads/${id}.${ALLOWED[mime] || 'bin'}`

export default async function assetRoutes(app) {
  const guard = { preHandler: requireAdmin }

  // multipart con un solo campo "file"
  app.post('/api/admin/uploads', guard, async (req, reply) => {
    const file = await req.file().catch(() => null)
    if (!file) return reply.code(400).send({ error: 'Falta el archivo (campo "file")' })
    if (!ALLOWED[file.mimetype]) {
      await file.toBuffer().catch(() => {}) // drenar el stream antes de responder
      return reply.code(415).send({ error: 'Formato no permitido: usa PNG, JPG, WEBP, GIF, MP4 o WEBM' })
    }
    const data = await file.toBuffer()
    if (file.file.truncated) return reply.code(413).send({ error: `El archivo supera el máximo (${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB)` })
    const { rows: [row] } = await q(
      'INSERT INTO assets (mime, size, data) VALUES ($1,$2,$3) RETURNING id',
      [file.mimetype, data.length, data]
    )
    return reply.code(201).send({ id: row.id, url: assetUrl(row.id, file.mimetype), mime: file.mimetype, size: data.length })
  })

  app.get('/api/admin/uploads', guard, async () => {
    const { rows } = await q('SELECT id, mime, size, created_at FROM assets ORDER BY created_at DESC LIMIT 200')
    return { assets: rows.map((r) => ({ ...r, url: assetUrl(r.id, r.mime) })) }
  })

  app.delete('/api/admin/uploads/:id', guard, async (req, reply) => {
    const id = String(req.params.id)
    if (!UUID.test(id)) return reply.code(404).send({ error: 'No encontrado' })
    const r = await q('DELETE FROM assets WHERE id=$1', [id])
    if (!r.rowCount) return reply.code(404).send({ error: 'No encontrado' })
    return { ok: true }
  })

  // público: la tienda y el portal cargan las imágenes desde aquí
  app.get('/uploads/:name', async (req, reply) => {
    const id = String(req.params.name).split('.')[0]
    if (!UUID.test(id)) return reply.code(404).send({ error: 'No encontrado' })
    const { rows: [row] } = await q('SELECT mime, data FROM assets WHERE id=$1', [id])
    if (!row) return reply.code(404).send({ error: 'No encontrado' })
    // el id es único e inmutable: cachear un año
    reply.header('Cache-Control', 'public, max-age=31536000, immutable')
    return reply.type(row.mime).send(row.data)
  })
}
