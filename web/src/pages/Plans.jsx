import { useEffect, useState } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { api } from '../api.js'
import { Card, Button, Input, Modal, Th, Td, Empty, Toggle, Badge } from '../components/ui.jsx'

const EMPTY = { name: '', description: '', price_text: '', price: '', period_months: 1, app_ids: [], trial_days: 0, duration_months: '', visible: false, active: true }

export default function Plans() {
  const [plans, setPlans] = useState(null)
  const [apps, setApps] = useState([])
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => api.get('/api/admin/plans').then((d) => setPlans(d.plans)).catch((e) => setError(e.message))
  useEffect(() => {
    load()
    api.get('/api/admin/apps').then((d) => setApps(d.apps)).catch(() => {})
  }, [])

  const appName = (id) => apps.find((a) => a.id === id)?.name || `#${id}`

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const body = { ...editing, trial_days: Number(editing.trial_days) || 0, duration_months: editing.duration_months ? Number(editing.duration_months) : null, price: editing.price === '' ? null : Number(editing.price), period_months: Number(editing.period_months) || 1 }
      if (editing.id) await api.patch(`/api/admin/plans/${editing.id}`, body)
      else await api.post('/api/admin/plans', body)
      setEditing(null); load()
    } catch (err) { alert(err.message) } finally { setBusy(false) }
  }

  const remove = async (p) => {
    if (!confirm(`¿Eliminar el plan "${p.name}"? Si tiene suscripciones solo se desactivará.`)) return
    await api.del(`/api/admin/plans/${p.id}`).catch((e) => alert(e.message)); load()
  }

  const set = (k) => (e) => setEditing((s) => ({ ...s, [k]: e.target.value }))
  const toggleApp = (id) => setEditing((s) => ({ ...s, app_ids: s.app_ids.includes(id) ? s.app_ids.filter((x) => x !== id) : [...s.app_ids, id] }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Planes</h1>
        <Button onClick={() => setEditing({ ...EMPTY })}><Plus size={15} className="inline -mt-0.5 mr-1" />Nuevo plan</Button>
      </div>
      <p className="text-sm text-ink2 -mt-3">Agrupa apps en un plan, con prueba gratis y duración. Los planes visibles aparecen en la ficha de sus apps en la tienda.</p>

      {error && <Empty>{error}</Empty>}
      {plans && plans.length === 0 && <Card><Empty>Sin planes todavía.</Empty></Card>}
      {plans && plans.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((p) => (
            <Card key={p.id} className={p.active ? '' : 'opacity-50'}>
              <div className="flex items-start justify-between">
                <div className="font-semibold">{p.name}</div>
                <div className="flex gap-1.5">
                  {p.visible ? <Badge status="active" /> : <span className="text-[11px] text-mut">oculto</span>}
                </div>
              </div>
              {p.price_text && <div className="text-gold font-bold text-lg mt-1">{p.price_text}</div>}
              <div className="text-[11px] text-mut mt-1">
                {p.trial_days > 0 && <span className="text-ok">{p.trial_days}d gratis · </span>}
                {p.duration_months ? `${p.duration_months} meses` : 'sin caducidad'}
              </div>
              {p.description && <p className="text-xs text-ink2 mt-2 line-clamp-2">{p.description}</p>}
              <div className="text-[11px] text-ink2 mt-2">
                {(p.app_ids || []).length ? (p.app_ids || []).map(appName).join(', ') : 'sin apps'}
              </div>
              <div className="flex gap-3 mt-3 pt-3 border-t border-border/60">
                <button className="text-xs text-ink2 hover:text-gold" onClick={() => setEditing({ ...p, duration_months: p.duration_months ?? '', price: p.price ?? '', period_months: p.period_months ?? 1, app_ids: p.app_ids || [] })}>
                  <Pencil size={13} className="inline -mt-0.5" /> Editar
                </button>
                <button className="text-xs text-bad/80 hover:text-bad" onClick={() => remove(p)}>Eliminar</button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? `Editar "${editing.name}"` : 'Nuevo plan'} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-4">
            <Input label="Nombre" value={editing.name} onChange={set('name')} autoFocus />
            <Input label="Precio (texto libre para la tienda, p. ej. «29€/mes»)" value={editing.price_text} onChange={set('price_text')} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Precio a cobrar (USD)" type="number" step="0.01" min="0" value={editing.price} onChange={set('price')} hint="lo que se cobra de verdad al renovar" />
              <Input label="Periodo (meses)" type="number" min="1" value={editing.period_months} onChange={set('period_months')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Días de prueba" type="number" min="0" value={editing.trial_days} onChange={set('trial_days')} />
              <Input label="Duración (meses, vacío = sin fin)" type="number" min="1" value={editing.duration_months} onChange={set('duration_months')} />
            </div>
            <label className="block">
              <span className="block text-xs text-ink2 mb-1.5">Descripción</span>
              <textarea className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-ink outline-none focus:border-gold/60 min-h-20" value={editing.description || ''} onChange={set('description')} />
            </label>
            <div>
              <span className="block text-xs text-ink2 mb-1.5">Apps incluidas</span>
              <div className="flex flex-wrap gap-2">
                {apps.length === 0 && <span className="text-xs text-mut">No hay apps creadas.</span>}
                {apps.map((a) => (
                  <button type="button" key={a.id} onClick={() => toggleApp(a.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border ${editing.app_ids.includes(a.id) ? 'bg-gold/15 border-gold/40 text-gold' : 'border-border text-ink2'}`}>
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-6">
              <Toggle checked={editing.visible} onChange={(v) => setEditing((s) => ({ ...s, visible: v }))} label="Visible en tienda" />
              <Toggle checked={editing.active} onChange={(v) => setEditing((s) => ({ ...s, active: v }))} label="Activo" />
            </div>
            <Button className="w-full" disabled={busy || !editing.name.trim()}>{editing.id ? 'Guardar' : 'Crear plan'}</Button>
          </form>
        </Modal>
      )}
    </div>
  )
}
