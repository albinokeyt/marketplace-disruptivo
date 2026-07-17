import { useEffect, useState } from 'react'
import { Plus, KeyRound, Copy, Check, MapPin, Store, Trash2, Star } from 'lucide-react'
import { api, fmtUsd, fmtDate } from '../api.js'
import { Card, Button, Input, Select, Badge, Modal, Th, Td, Empty, Toggle } from '../components/ui.jsx'

function ListingModal({ app, onClose, onSaved }) {
  const [f, setF] = useState({
    tagline: app.tagline || '', price_text: app.price_text || '', install_url: app.install_url || '',
    description: app.description || '', slug: app.slug || '', badge: app.badge || '',
    media: Array.isArray(app.media) ? app.media : [], visible: Boolean(app.visible),
    featuresText: (Array.isArray(app.features) ? app.features : []).join('\n'),
  })
  const [reviews, setReviews] = useState([])
  const [nr, setNr] = useState({ author: '', rating: 5, text: '' })
  const [busy, setBusy] = useState(false)

  const loadReviews = () => api.get(`/api/admin/apps/${app.id}/reviews`).then((d) => setReviews(d.reviews)).catch(() => {})
  useEffect(() => { loadReviews() }, [])

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const setMedia = (i, k, v) => setF((s) => ({ ...s, media: s.media.map((m, j) => j === i ? { ...m, [k]: v } : m) }))
  const addMedia = () => setF((s) => ({ ...s, media: [...s.media, { type: 'image', url: '', caption: '' }] }))
  const rmMedia = (i) => setF((s) => ({ ...s, media: s.media.filter((_, j) => j !== i) }))

  const save = async () => {
    setBusy(true)
    try {
      await api.patch(`/api/admin/apps/${app.id}/listing`, {
        tagline: f.tagline, price_text: f.price_text, install_url: f.install_url, description: f.description,
        slug: f.slug || undefined, visible: f.visible, badge: f.badge || null,
        media: f.media.filter((m) => m.url?.trim()),
        features: f.featuresText.split('\n').map((x) => x.trim()).filter(Boolean),
      })
      onSaved(); onClose()
    } catch (err) { alert(err.message) } finally { setBusy(false) }
  }

  const addReview = async () => {
    if (!nr.author.trim()) return
    await api.post(`/api/admin/apps/${app.id}/reviews`, { ...nr, rating: Number(nr.rating) }).catch((e) => alert(e.message))
    setNr({ author: '', rating: 5, text: '' }); loadReviews()
  }
  const delReview = async (id) => { await api.del(`/api/admin/reviews/${id}`).catch(() => {}); loadReviews() }

  return (
    <Modal title={`Vitrina de "${app.name}"`} onClose={onClose}>
      <div className="space-y-4">
        <Toggle checked={f.visible} onChange={(v) => setF((s) => ({ ...s, visible: v }))} label="Publicada en la tienda" />
        <Input label="Gancho (una línea)" value={f.tagline} onChange={set('tagline')} placeholder="El setter IA que suena humano" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Precio (texto)" value={f.price_text} onChange={set('price_text')} placeholder="desde 0,015€/mensaje" />
          <Input label="Slug (URL)" value={f.slug} onChange={set('slug')} placeholder="hermes-setter" />
        </div>
        <Select label="Etiqueta destacada" value={f.badge} onChange={set('badge')}>
          <option value="">Ninguna</option>
          <option value="new">Nuevo</option>
          <option value="coming_soon">Próximamente</option>
        </Select>
        <Input label="Link de instalación en GHL" value={f.install_url} onChange={set('install_url')} placeholder="https://marketplace.gohighlevel.com/..." />
        <label className="block">
          <span className="block text-xs text-ink2 mb-1.5">Descripción</span>
          <textarea className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-ink outline-none focus:border-gold/60 min-h-24" value={f.description} onChange={set('description')} />
        </label>
        <label className="block">
          <span className="block text-xs text-ink2 mb-1.5">Características (una por línea)</span>
          <textarea className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-ink outline-none focus:border-gold/60 min-h-20" value={f.featuresText} onChange={set('featuresText')} placeholder={'Responde por IG y WhatsApp\nAgenda citas solo'} />
        </label>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-ink2">Fotos y vídeos</span>
            <button className="text-xs text-gold" onClick={addMedia}><Plus size={12} className="inline" /> añadir</button>
          </div>
          <div className="space-y-2">
            {f.media.map((m, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select className="bg-bg border border-border rounded-lg px-2 py-2 text-xs" value={m.type} onChange={(e) => setMedia(i, 'type', e.target.value)}>
                  <option value="image">Imagen</option><option value="video">Vídeo</option>
                </select>
                <input className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-xs" placeholder="URL (imagen, mp4 o YouTube)" value={m.url} onChange={(e) => setMedia(i, 'url', e.target.value)} />
                <button className="text-mut hover:text-bad" onClick={() => rmMedia(i)}><Trash2 size={14} /></button>
              </div>
            ))}
            {f.media.length === 0 && <p className="text-[11px] text-mut">Sin multimedia. La primera imagen es la portada en la tienda.</p>}
          </div>
        </div>

        <Button className="w-full" disabled={busy} onClick={save}>Guardar vitrina</Button>

        <div className="pt-4 border-t border-border">
          <h3 className="text-sm font-semibold mb-2">Reseñas ({reviews.length})</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
            {reviews.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-2 text-xs bg-bg border border-border rounded-lg px-3 py-2">
                <div>
                  <span className="font-medium">{r.author}</span> <span className="text-gold">{'★'.repeat(r.rating)}</span>
                  {r.text && <div className="text-ink2 mt-0.5">{r.text}</div>}
                </div>
                <button className="text-mut hover:text-bad shrink-0" onClick={() => delReview(r.id)}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input className="bg-bg border border-border rounded-lg px-3 py-2 text-xs" placeholder="Autor" value={nr.author} onChange={(e) => setNr((s) => ({ ...s, author: e.target.value }))} />
            <select className="bg-bg border border-border rounded-lg px-2 py-2 text-xs" value={nr.rating} onChange={(e) => setNr((s) => ({ ...s, rating: e.target.value }))}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
            </select>
          </div>
          <input className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs mt-2" placeholder="Texto de la reseña" value={nr.text} onChange={(e) => setNr((s) => ({ ...s, text: e.target.value }))} />
          <Button variant="ghost" className="w-full mt-2" onClick={addReview} disabled={!nr.author.trim()}>Añadir reseña</Button>
        </div>
      </div>
    </Modal>
  )
}

function ScopeModal({ app, onClose, onSaved }) {
  const [conns, setConns] = useState(null)
  const [all, setAll] = useState(!Array.isArray(app.allowed_location_ids))
  const [selected, setSelected] = useState(new Set(Array.isArray(app.allowed_location_ids) ? app.allowed_location_ids : []))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/api/admin/connections').then((d) => setConns(d.connections)).catch(() => setConns([]))
  }, [])

  const toggle = (locId) => {
    setSelected((s) => {
      const n = new Set(s)
      n.has(locId) ? n.delete(locId) : n.add(locId)
      return n
    })
  }

  const save = async () => {
    setBusy(true)
    try {
      await api.patch(`/api/admin/apps/${app.id}`, { allowed_location_ids: all ? null : [...selected] })
      onSaved()
      onClose()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Subcuentas de "${app.name}"`} onClose={onClose}>
      <p className="text-xs text-ink2 mb-4">A qué subcuentas puede cobrar esta API key. Limitar el alcance reduce el daño si la clave se filtra.</p>
      <label className="flex items-center gap-2 text-sm mb-3">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        Todas las subcuentas conectadas (actuales y futuras)
      </label>
      {!all && (
        <div className="space-y-2 max-h-64 overflow-y-auto border border-border rounded-xl p-3">
          {conns === null && <p className="text-xs text-mut">Cargando…</p>}
          {conns?.length === 0 && <p className="text-xs text-mut">No hay conexiones todavía.</p>}
          {conns?.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.has(c.location_id)} onChange={() => toggle(c.location_id)} />
              <span>{c.alias || c.name || c.location_id}</span>
              <code className="text-[10px] text-mut">{c.location_id}</code>
            </label>
          ))}
        </div>
      )}
      <Button className="w-full mt-4" disabled={busy || (!all && selected.size === 0)} onClick={save}>
        Guardar alcance
      </Button>
    </Modal>
  )
}

function KeyReveal({ apiKey, appName, onClose }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Modal title={`API key de "${appName}"`} onClose={onClose}>
      <p className="text-sm text-ink2 mb-3">
        Guárdala ahora: <b className="text-warn">solo se muestra una vez</b>. La app consumidora la envía en el header{' '}
        <code className="text-gold">Authorization: Bearer …</code>
      </p>
      <div className="flex gap-2">
        <code className="flex-1 bg-bg border border-border rounded-xl px-3 py-2.5 text-xs break-all">{apiKey}</code>
        <Button variant="ghost" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}</Button>
      </div>
      <div className="mt-4 text-xs text-mut">
        Ejemplo de cobro:
        <pre className="bg-bg border border-border rounded-xl p-3 mt-2 overflow-x-auto text-[11px] leading-relaxed">{`curl -X POST $BASE/api/v1/charges \\
  -H "Authorization: Bearer ${apiKey.slice(0, 14)}…" \\
  -H "Content-Type: application/json" \\
  -d '{"location_id":"<locationId>","meter":"<codigo>","units":3,"event_id":"pedido-123"}'`}</pre>
      </div>
    </Modal>
  )
}

export default function Apps() {
  const [apps, setApps] = useState(null)
  const [error, setError] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [reveal, setReveal] = useState(null) // { apiKey, appName }
  const [scoping, setScoping] = useState(null) // app en edición de alcance
  const [listing, setListing] = useState(null) // app en edición de vitrina
  const [busy, setBusy] = useState(false)

  const load = () => api.get('/api/admin/apps').then((d) => setApps(d.apps)).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const create = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const d = await api.post('/api/admin/apps', { name: newName })
      setShowNew(false)
      setNewName('')
      setReveal({ apiKey: d.api_key, appName: d.app.name })
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  const regenerate = async (app) => {
    if (!confirm(`¿Regenerar la API key de "${app.name}"? La clave actual dejará de funcionar al instante.`)) return
    const d = await api.post(`/api/admin/apps/${app.id}/regenerate`).catch((e) => alert(e.message))
    if (d) {
      setReveal({ apiKey: d.api_key, appName: d.app.name })
      load()
    }
  }

  const patch = async (app, body) => {
    await api.patch(`/api/admin/apps/${app.id}`, body).catch((e) => alert(e.message))
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Apps consumidoras</h1>
        <Button onClick={() => setShowNew(true)}><Plus size={15} className="inline -mt-0.5 mr-1" />Nueva app</Button>
      </div>
      <p className="text-sm text-ink2 -mt-3">
        Cada app recibe su API key (para cobrar del wallet y preguntar accesos) y su <b>vitrina</b> en la tienda pública.
      </p>

      {error && <Empty>{error}</Empty>}
      {apps && apps.length === 0 && <Card><Empty>Todavía no hay apps. Crea la primera para obtener su API key.</Empty></Card>}
      {apps && apps.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th>App</Th>
                <Th>API key</Th>
                <Th className="text-right">Cobros</Th>
                <Th className="text-right">Facturado</Th>
                <Th>Modo prueba</Th>
                <Th>Estado</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-[11px] text-mut">creada {fmtDate(a.created_at)}</div>
                  </Td>
                  <Td><code className="text-xs text-ink2">{a.key_prefix}</code></Td>
                  <Td className="text-right tabular-nums">{a.charges_count}</Td>
                  <Td className="text-right tabular-nums">{fmtUsd(a.amount_total)}</Td>
                  <Td><Toggle checked={a.test_mode} onChange={(v) => patch(a, { test_mode: v })} /></Td>
                  <Td><Badge status={a.status} /></Td>
                  <Td className="text-right whitespace-nowrap">
                    <button
                      className={`text-xs mr-3 ${a.visible ? 'text-gold' : 'text-ink2 hover:text-gold'}`}
                      title="Vitrina en la tienda"
                      onClick={() => setListing(a)}
                    >
                      <Store size={14} className="inline -mt-0.5" /> {a.visible ? 'Publicada' : 'Vitrina'}
                    </button>
                    <button
                      className="text-xs text-ink2 hover:text-gold mr-3"
                      title="Subcuentas a las que puede cobrar"
                      onClick={() => setScoping(a)}
                    >
                      <MapPin size={14} className="inline -mt-0.5" />{' '}
                      {Array.isArray(a.allowed_location_ids) ? `${a.allowed_location_ids.length} subcuentas` : 'Todas'}
                    </button>
                    <button
                      className="text-xs text-ink2 hover:text-gold mr-3"
                      title="Regenerar API key"
                      onClick={() => regenerate(a)}
                    >
                      <KeyRound size={15} className="inline -mt-0.5" /> Regenerar
                    </button>
                    {a.status === 'active' ? (
                      <button className="text-xs text-bad/80 hover:text-bad" onClick={() => patch(a, { status: 'revoked' })}>
                        Revocar
                      </button>
                    ) : (
                      <button className="text-xs text-ok/80 hover:text-ok" onClick={() => patch(a, { status: 'active' })}>
                        Reactivar
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showNew && (
        <Modal title="Nueva app consumidora" onClose={() => setShowNew(false)}>
          <form onSubmit={create} className="space-y-4">
            <Input
              label="Nombre"
              placeholder="p. ej. Hermes Setter"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <Button className="w-full" disabled={busy || !newName.trim()}>Crear y generar API key</Button>
          </form>
        </Modal>
      )}
      {reveal && <KeyReveal apiKey={reveal.apiKey} appName={reveal.appName} onClose={() => setReveal(null)} />}
      {scoping && <ScopeModal app={scoping} onClose={() => setScoping(null)} onSaved={load} />}
      {listing && <ListingModal app={listing} onClose={() => setListing(null)} onSaved={load} />}
    </div>
  )
}
