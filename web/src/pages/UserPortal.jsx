import { useEffect, useState } from 'react'
import { Store as StoreIcon, LogOut, ExternalLink, BadgeCheck, Bell } from 'lucide-react'
import { api, fmtUsd, fmtDate } from '../api.js'
import { Card, Th, Td, Empty, Badge } from '../components/ui.jsx'
import { useCountUp } from '../hooks.js'

const Money = ({ n }) => fmtUsd(useCountUp(n))
const STATUS_BADGE = { active: 'active', trial: 'test', comped: 'connected' }

export default function UserPortal({ me, onLogout }) {
  const [usage, setUsage] = useState(null)
  const [access, setAccess] = useState(null)
  const [notices, setNotices] = useState([])

  useEffect(() => {
    api.get('/api/me/usage').then(setUsage).catch(() => setUsage({ totals: { last30: 0, all_time: 0 }, by_app: [], recent: [] }))
    api.get('/api/me/access').then((d) => setAccess(d.access)).catch(() => setAccess([]))
    api.get('/api/me/notices').then((d) => setNotices(d.notices)).catch(() => {})
  }, [])

  return (
    <div className="min-h-screen relative">
      <div className="app-bg" aria-hidden="true" />
      <div className="relative z-10 max-w-5xl mx-auto px-5 py-8">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-gold/15 border border-gold/30 grid place-items-center glow-gold">
              <StoreIcon size={18} className="text-gold" />
            </span>
            <div>
              <div className="font-bold text-sm text-gradient-gold leading-tight">Marketplace Disruptivo</div>
              <div className="text-[11px] text-mut leading-tight">Hola{me?.name ? `, ${me.name}` : ''}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="/tienda" target="_blank" rel="noreferrer" className="text-sm text-gold/90 hover:text-gold inline-flex items-center gap-1.5"><ExternalLink size={14} /> Tienda</a>
            <button onClick={onLogout} className="text-sm text-ink2 hover:text-ink inline-flex items-center gap-1.5"><LogOut size={14} /> Salir</button>
          </div>
        </header>

        {notices.length > 0 && (
          <div className="space-y-2 mb-6">
            {notices.map((n, i) => (
              <div key={i} className="border border-gold/25 bg-gold/5 rounded-xl px-4 py-3 text-sm">
                <Bell size={13} className="inline -mt-0.5 mr-1.5 text-gold" /><b>{n.title}</b>
                {n.body && <span className="text-ink2"> — {n.body}</span>}
              </div>
            ))}
          </div>
        )}

        <h1 className="text-xl font-bold mb-4">Mi consumo</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="lift">
            <div className="text-xs text-mut">Crédito disponible</div>
            <div className="text-2xl font-bold mt-1.5 tabular-nums text-ok">{usage ? <Money n={usage.credit || 0} /> : '…'}</div>
            <div className="text-[11px] text-ink2 mt-1">saldo por subcuenta; se consume antes que tu wallet</div>
          </Card>
          <Card className="lift">
            <div className="text-xs text-mut">Últimos 30 días</div>
            <div className="text-2xl font-bold mt-1.5 tabular-nums text-gradient-gold">{usage ? <Money n={usage.totals.last30} /> : '…'}</div>
            {usage?.credit_used?.last30 > 0 && (
              <div className="text-[11px] text-ok mt-1">{fmtUsd(usage.credit_used.last30)} cubierto con crédito</div>
            )}
          </Card>
          <Card className="lift"><div className="text-xs text-mut">Total histórico</div><div className="text-2xl font-bold mt-1.5 tabular-nums text-gradient-gold">{usage ? <Money n={usage.totals.all_time} /> : '…'}</div></Card>
          <Card className="lift"><div className="text-xs text-mut">Apps con acceso</div><div className="text-2xl font-bold mt-1.5 tabular-nums">{access ? access.length : '…'}</div></Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 overflow-x-auto">
            <h2 className="text-sm font-semibold mb-2">Consumo reciente</h2>
            {usage && usage.recent.length === 0 && <Empty>Todavía sin consumo.</Empty>}
            {usage && usage.recent.length > 0 && (
              <table className="w-full">
                <thead><tr><Th>App</Th><Th>Subcuenta</Th><Th className="text-right">Uds.</Th><Th className="text-right">Importe</Th><Th>Fecha</Th></tr></thead>
                <tbody>
                  {usage.recent.map((c, i) => (
                    <tr key={i}>
                      <Td>{c.app_name}</Td>
                      <Td className="text-ink2">{c.location_name}</Td>
                      <Td className="text-right tabular-nums">{c.units}</Td>
                      <Td className="text-right tabular-nums">{fmtUsd(c.amount)}</Td>
                      <Td className="text-ink2 whitespace-nowrap">{fmtDate(c.created_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card>
            <h2 className="text-sm font-semibold mb-3">Gasto por app · 30 días</h2>
            {usage && usage.by_app.length === 0 && <Empty>Sin datos.</Empty>}
            {usage && usage.by_app.length > 0 && (
              <div className="space-y-2.5">
                {usage.by_app.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="truncate">{a.app_name}</span>
                    <span className="tabular-nums text-ink2">{fmtUsd(a.amount)} <span className="text-mut">· {a.charges}</span></span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <h2 className="text-lg font-bold mt-8 mb-3">Mis accesos</h2>
        {access && access.length === 0 && <Card><Empty>No tienes accesos activos. Explora la <a href="/tienda" className="text-gold">tienda</a>.</Empty></Card>}
        {access && access.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {access.map((s, i) => (
              <Card key={i} className="lift">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{s.app_name || s.plan_name}</div>
                  <BadgeCheck size={16} className="text-ok" />
                </div>
                <div className="text-[11px] text-mut mt-1">{s.location_name}</div>
                <div className="mt-2 flex items-center justify-between">
                  <Badge status={STATUS_BADGE[s.status] || 'active'} />
                  <span className="text-[11px] text-ink2">{s.ends_at ? `hasta ${fmtDate(s.ends_at)}` : 'sin caducidad'}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
