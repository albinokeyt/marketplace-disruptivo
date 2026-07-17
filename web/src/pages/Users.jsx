import { useEffect, useState } from 'react'
import { Plus, Copy, Check, KeyRound } from 'lucide-react'
import { api, fmtDate } from '../api.js'
import { Card, Button, Input, Select, Badge, Modal, Th, Td, Empty, Toggle } from '../components/ui.jsx'

function PasswordReveal({ email, password, onClose }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => { await navigator.clipboard.writeText(password); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <Modal title="Contraseña del usuario" onClose={onClose}>
      <p className="text-sm text-ink2 mb-3">Guárdala y pásasela a <b>{email}</b>: <b className="text-warn">solo se muestra una vez</b>. Entra con su email y esta contraseña en la pantalla de login.</p>
      <div className="flex gap-2">
        <code className="flex-1 bg-bg border border-border rounded-xl px-3 py-2.5 text-sm break-all">{password}</code>
        <Button variant="ghost" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}</Button>
      </div>
    </Modal>
  )
}

function UserModal({ user, conns, onClose, onSaved, onPassword }) {
  const isNew = !user.id
  const [f, setF] = useState({
    email: user.email || '', name: user.name || '', role: user.role || 'user', password: '',
    location_ids: new Set(user.location_ids || []),
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const toggleLoc = (id) => setF((s) => { const n = new Set(s.location_ids); n.has(id) ? n.delete(id) : n.add(id); return { ...s, location_ids: n } })

  const save = async (e) => {
    e.preventDefault(); setBusy(true)
    try {
      const body = { name: f.name, role: f.role, location_ids: [...f.location_ids] }
      if (isNew) {
        body.email = f.email
        if (f.password) body.password = f.password
        const d = await api.post('/api/admin/users', body)
        onSaved()
        onPassword({ email: d.user.email, password: d.password })
      } else {
        await api.patch(`/api/admin/users/${user.id}`, body)
        onSaved()
      }
      onClose()
    } catch (err) { alert(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={isNew ? 'Nuevo usuario' : `Editar ${user.email}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        {isNew && <Input label="Email (será su usuario)" type="email" value={f.email} onChange={set('email')} autoFocus />}
        <Input label="Nombre" value={f.name} onChange={set('name')} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Rol" value={f.role} onChange={set('role')}>
            <option value="user">Usuario (ve su cuenta)</option>
            <option value="admin">Admin (ve todo)</option>
          </Select>
          {isNew && <Input label="Contraseña (vacío = se genera)" value={f.password} onChange={set('password')} placeholder="mín. 6 caracteres" />}
        </div>
        {f.role === 'user' && (
          <div>
            <span className="block text-xs text-ink2 mb-1.5">Subcuentas que puede ver (su consumo y accesos)</span>
            <div className="space-y-1.5 max-h-44 overflow-y-auto border border-border rounded-xl p-3">
              {conns.length === 0 && <p className="text-xs text-mut">No hay conexiones todavía.</p>}
              {conns.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={f.location_ids.has(c.location_id)} onChange={() => toggleLoc(c.location_id)} />
                  <span>{c.alias || c.name || c.location_id}</span>
                  <code className="text-[10px] text-mut">{c.location_id}</code>
                </label>
              ))}
            </div>
          </div>
        )}
        <Button className="w-full" disabled={busy || (isNew && !f.email.trim())}>{isNew ? 'Crear usuario' : 'Guardar'}</Button>
      </form>
    </Modal>
  )
}

export default function Users() {
  const [users, setUsers] = useState(null)
  const [conns, setConns] = useState([])
  const [editing, setEditing] = useState(null)
  const [reveal, setReveal] = useState(null)
  const [error, setError] = useState('')

  const load = () => api.get('/api/admin/users').then((d) => setUsers(d.users)).catch((e) => setError(e.message))
  useEffect(() => { load(); api.get('/api/admin/connections').then((d) => setConns(d.connections)).catch(() => {}) }, [])

  const patch = async (u, body) => { await api.patch(`/api/admin/users/${u.id}`, body).catch((e) => alert(e.message)); load() }
  const resetPass = async (u) => {
    if (!confirm(`¿Generar una contraseña nueva para ${u.email}?`)) return
    const d = await api.post(`/api/admin/users/${u.id}/password`).catch((e) => alert(e.message))
    if (d) setReveal({ email: u.email, password: d.password })
  }
  const remove = async (u) => { if (!confirm(`¿Eliminar al usuario ${u.email}?`)) return; await api.del(`/api/admin/users/${u.id}`).catch((e) => alert(e.message)); load() }
  const locNames = (ids) => (ids || []).map((id) => conns.find((c) => c.location_id === id)?.alias || conns.find((c) => c.location_id === id)?.name || id)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Usuarios</h1>
        <Button onClick={() => setEditing({})}><Plus size={15} className="inline -mt-0.5 mr-1" />Nuevo usuario</Button>
      </div>
      <p className="text-sm text-ink2 -mt-3">Crea clientes con login propio (email + contraseña) aunque no estén en GHL. Cada usuario ve el consumo y los accesos de las subcuentas que le asignes.</p>

      {error && <Empty>{error}</Empty>}
      {users && users.length === 0 && <Card><Empty>Sin usuarios. El super-admin entra con las credenciales del entorno; aquí creas los demás.</Empty></Card>}
      {users && users.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><Th>Usuario</Th><Th>Rol</Th><Th>Subcuentas</Th><Th>Activo</Th><Th></Th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <Td>
                    <div className="font-medium">{u.name || u.email}</div>
                    <div className="text-[11px] text-mut">{u.email} · {fmtDate(u.created_at)}</div>
                  </Td>
                  <Td>{u.role === 'admin' ? <Badge status="active" /> : <span className="text-xs text-ink2">usuario</span>}</Td>
                  <Td className="text-ink2 text-xs max-w-56 truncate" title={locNames(u.location_ids).join(', ')}>
                    {u.role === 'admin' ? 'todas' : (u.location_ids?.length ? locNames(u.location_ids).join(', ') : '—')}
                  </Td>
                  <Td><Toggle checked={u.active} onChange={(v) => patch(u, { active: v })} /></Td>
                  <Td className="text-right whitespace-nowrap">
                    <button className="text-xs text-ink2 hover:text-gold mr-3" onClick={() => setEditing(u)}>Editar</button>
                    <button className="text-xs text-ink2 hover:text-gold mr-3" onClick={() => resetPass(u)}><KeyRound size={13} className="inline -mt-0.5" /> Clave</button>
                    <button className="text-xs text-bad/80 hover:text-bad" onClick={() => remove(u)}>Eliminar</button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editing && <UserModal user={editing} conns={conns} onClose={() => setEditing(null)} onSaved={load} onPassword={setReveal} />}
      {reveal && <PasswordReveal email={reveal.email} password={reveal.password} onClose={() => setReveal(null)} />}
    </div>
  )
}
