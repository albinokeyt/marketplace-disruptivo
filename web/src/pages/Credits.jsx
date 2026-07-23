import { useEffect, useState } from 'react'
import { Plus, History } from 'lucide-react'
import { api, fmtUsd, fmtDate } from '../api.js'
import { Card, Button, Input, Select, Modal, Th, Td, Empty } from '../components/ui.jsx'

function GrantModal({ credits, preset, onClose, onSaved }) {
  const [f, setF] = useState({ location_id: preset || '', amount: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const save = async (e) => {
    e.preventDefault(); setBusy(true)
    try {
      const pedido = Number(f.amount)
      const d = await api.post('/api/admin/credits', {
        location_id: f.location_id, amount: pedido, reason: f.reason,
      })
      // el backend recorta la retirada para que el saldo no baje de 0: informar del movimiento REAL
      if (d.applied === 0) {
        alert(`No se aplicó ningún movimiento (el saldo ya estaba en 0). Saldo: ${fmtUsd(d.balance)}`)
      } else if (Math.abs(d.applied) < Math.abs(pedido)) {
        alert(`Aplicado ${fmtUsd(d.applied)} de los ${fmtUsd(pedido)} solicitados (el saldo no baja de 0).\nSaldo nuevo: ${fmtUsd(d.balance)}`)
      } else {
        alert(`Saldo nuevo: ${fmtUsd(d.balance)}`)
      }
      onSaved(); onClose()
    } catch (err) { alert(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title="Añadir crédito" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Select label="Subcuenta" value={f.location_id} onChange={set('location_id')}>
          <option value="">— elige —</option>
          {credits.map((c) => <option key={c.location_id} value={c.location_id}>{c.location_name} · {fmtUsd(c.balance)}</option>)}
        </Select>
        <Input
          label="Importe (USD)" type="number" step="0.01" value={f.amount} onChange={set('amount')}
          hint="Positivo para regalar/prepagar saldo. Negativo para retirarlo (nunca baja de 0)."
        />
        <Input label="Motivo (opcional)" value={f.reason} onChange={set('reason')} placeholder="promo de bienvenida, compensación…" />
        <Button className="w-full" disabled={busy || !f.location_id || !f.amount}>Aplicar</Button>
      </form>
    </Modal>
  )
}

function EntriesModal({ row, onClose }) {
  const [entries, setEntries] = useState(null)
  useEffect(() => {
    api.get(`/api/admin/credits/${encodeURIComponent(row.location_id)}/entries`)
      .then((d) => setEntries(d.entries)).catch(() => setEntries([]))
  }, [row.location_id])
  return (
    <Modal title={`Movimientos · ${row.location_name}`} onClose={onClose}>
      {!entries && <Empty>Cargando…</Empty>}
      {entries && entries.length === 0 && <Empty>Sin movimientos.</Empty>}
      {entries && entries.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {entries.map((e, i) => (
            <div key={i} className="flex items-start justify-between gap-3 text-sm bg-bg border border-border rounded-lg px-3 py-2">
              <div>
                <span className={e.amount >= 0 ? 'text-ok font-medium' : 'text-ink2'}>
                  {e.amount >= 0 ? '+' : ''}{fmtUsd(e.amount)}
                </span>
                {e.reason && <div className="text-[11px] text-mut">{e.reason}{e.charge_id ? ` · cargo #${e.charge_id}` : ''}</div>}
              </div>
              <span className="text-[11px] text-mut whitespace-nowrap">{fmtDate(e.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

export default function Credits() {
  const [credits, setCredits] = useState(null)
  const [error, setError] = useState('')
  const [grant, setGrant] = useState(null) // { preset }
  const [entries, setEntries] = useState(null)

  const load = () => api.get('/api/admin/credits').then((d) => setCredits(d.credits)).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const total = credits ? credits.reduce((s, c) => s + c.balance, 0) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Créditos</h1>
        <Button onClick={() => setGrant({ preset: '' })}><Plus size={15} className="inline -mt-0.5 mr-1" />Añadir crédito</Button>
      </div>
      <p className="text-sm text-ink2 -mt-3">
        Saldo interno por subcuenta. Los cobros lo consumen <b>antes</b> de tocar el wallet de GHL: ideal para promos,
        compensaciones o prepago. Cuando el saldo no cubre un cobro, ese cobro va al wallet como siempre.
      </p>

      {error && <Empty>{error}</Empty>}
      {credits && (
        <Card className="lift">
          <div className="text-xs text-mut">Crédito total en circulación</div>
          <div className="text-2xl font-bold mt-1.5 tabular-nums text-gradient-gold">{fmtUsd(total)}</div>
        </Card>
      )}

      {credits && credits.length === 0 && <Card><Empty>No hay subcuentas conectadas todavía.</Empty></Card>}
      {credits && credits.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th>Subcuenta</Th>
                <Th className="text-right">Saldo</Th>
                <Th className="text-right">Concedido</Th>
                <Th className="text-right">Consumido</Th>
                <Th className="text-right">Reembolsado</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {credits.map((c) => (
                <tr key={c.location_id}>
                  <Td>
                    <div className="font-medium">{c.location_name}</div>
                    <code className="text-[10px] text-mut">{c.location_id}</code>
                  </Td>
                  <Td className={`text-right tabular-nums font-semibold ${c.balance > 0 ? 'text-gold' : 'text-mut'}`}>{fmtUsd(c.balance)}</Td>
                  <Td className="text-right tabular-nums text-ink2">{fmtUsd(c.granted)}</Td>
                  <Td className="text-right tabular-nums text-ink2">{fmtUsd(c.spent)}</Td>
                  <Td className="text-right tabular-nums text-mut">{fmtUsd(c.refunded || 0)}</Td>
                  <Td className="text-right whitespace-nowrap">
                    <button className="text-xs text-ink2 hover:text-gold mr-3" onClick={() => setGrant({ preset: c.location_id })}>Añadir</button>
                    <button className="text-xs text-ink2 hover:text-gold" onClick={() => setEntries(c)}>
                      <History size={13} className="inline -mt-0.5" /> Movimientos
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {grant && <GrantModal credits={credits || []} preset={grant.preset} onClose={() => setGrant(null)} onSaved={load} />}
      {entries && <EntriesModal row={entries} onClose={() => setEntries(null)} />}
    </div>
  )
}
