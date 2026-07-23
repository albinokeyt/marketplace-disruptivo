import { useCallback, useEffect, useState } from 'react'
import { api, fmtUsd, fmtDate } from '../api.js'
import { Card, Button, Badge, Select, Input, Th, Td, Empty } from '../components/ui.jsx'

const PAGE = 50

export default function Charges() {
  const [charges, setCharges] = useState(null)
  const [apps, setApps] = useState([])
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ app_id: '', status: '', location_id: '', from: '', to: '' })
  const [offset, setOffset] = useState(0)

  const load = useCallback(async (off = 0) => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v)
    params.set('limit', PAGE)
    params.set('offset', off)
    try {
      const d = await api.get(`/api/admin/charges?${params}`)
      if (d.charges.length === 0 && off > 0) {
        // página vacía al final de la lista: retrocede en vez de dejar al usuario atascado
        return load(Math.max(0, off - PAGE))
      }
      setCharges(d.charges)
      setOffset(off)
    } catch (e) {
      setError(e.message)
    }
  }, [filters])

  useEffect(() => {
    api.get('/api/admin/apps').then((d) => setApps(d.apps)).catch(() => {})
  }, [])
  useEffect(() => { load(0) }, [load])

  const refund = async (c) => {
    const destino = c.paid_with === 'credit'
      ? 'Se devuelve el importe al saldo de crédito interno de la subcuenta.'
      : 'Se borra el cargo en GHL y se devuelve el saldo al wallet.'
    if (!confirm(`¿Reembolsar el cargo #${c.id} (${fmtUsd(c.amount)}) de ${c.app_name}? ${destino}`)) return
    await api.post(`/api/admin/charges/${c.id}/refund`).catch((e) => alert(e.message))
    load(offset)
  }

  const reconcile = async (c) => {
    try {
      const d = await api.post(`/api/admin/charges/${c.id}/reconcile`)
      alert(d.result === 'cobrado'
        ? 'GHL confirma el cobro: marcado como cobrado.'
        : (d.message || 'GHL no reconoce el cargo todavía; reintenta más tarde.'))
      load(offset)
    } catch (e) {
      alert(e.message)
    }
  }

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Cobros</h1>

      <Card>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Select label="App" value={filters.app_id} onChange={set('app_id')}>
            <option value="">Todas</option>
            {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <Select label="Estado" value={filters.status} onChange={set('status')}>
            <option value="">Todos</option>
            <option value="created">Cobrado</option>
            <option value="test">Prueba</option>
            <option value="pending">En curso</option>
            <option value="unknown">Sin confirmar</option>
            <option value="failed">Fallido</option>
            <option value="refunded">Reembolsado</option>
          </Select>
          <Input label="Location ID" placeholder="ewGlt5…" value={filters.location_id} onChange={set('location_id')} />
          <Input label="Desde" type="date" value={filters.from} onChange={set('from')} />
          <Input label="Hasta" type="date" value={filters.to} onChange={set('to')} />
        </div>
      </Card>

      {error && <Empty>{error}</Empty>}
      {charges && charges.length === 0 && <Card><Empty>No hay cobros con esos filtros.</Empty></Card>}
      {charges && charges.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th>#</Th>
                <Th>App</Th>
                <Th>Subcuenta</Th>
                <Th>Tarifa</Th>
                <Th className="text-right">Unidades</Th>
                <Th className="text-right">Importe</Th>
                <Th>Estado</Th>
                <Th>Fecha</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {charges.map((c) => (
                <tr key={c.id}>
                  <Td className="text-mut text-xs">{c.id}</Td>
                  <Td>{c.app_name}</Td>
                  <Td className="text-ink2">
                    {c.location_name}
                    {c.description && <div className="text-[11px] text-mut max-w-56 truncate" title={c.description}>{c.description}</div>}
                    {c.error && <div className="text-[11px] text-bad max-w-56 truncate" title={c.error}>{c.error}</div>}
                  </Td>
                  <Td className="text-ink2">{c.meter || '—'}</Td>
                  <Td className="text-right tabular-nums">{c.units}</Td>
                  <Td className="text-right tabular-nums">
                    {fmtUsd(c.amount)}
                    <div className="text-[10px] text-mut">{c.paid_with === 'credit' ? 'crédito' : 'wallet'}</div>
                  </Td>
                  <Td><Badge status={c.status} /></Td>
                  <Td className="text-ink2 whitespace-nowrap">{fmtDate(c.created_at)}</Td>
                  <Td className="text-right whitespace-nowrap">
                    {(c.status === 'unknown' || c.status === 'pending') && (
                      <button className="text-xs text-warn/90 hover:text-warn mr-3" onClick={() => reconcile(c)}>Reconciliar</button>
                    )}
                    {(c.status === 'created' || c.status === 'test') && (
                      <button className="text-xs text-bad/80 hover:text-bad" onClick={() => refund(c)}>Reembolsar</button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between items-center mt-4">
            <Button variant="ghost" disabled={offset === 0} onClick={() => load(Math.max(0, offset - PAGE))}>← Anteriores</Button>
            <span className="text-xs text-mut">{offset + 1} – {offset + charges.length}</span>
            <Button variant="ghost" disabled={charges.length < PAGE} onClick={() => load(offset + PAGE)}>Siguientes →</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
