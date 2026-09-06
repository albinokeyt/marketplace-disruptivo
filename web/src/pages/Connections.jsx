import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plug, RefreshCw, Wallet, Eye } from 'lucide-react'
import { api, fmtUsd, fmtDate } from '../api.js'
import { Card, Button, Badge, Th, Td, Empty, Toggle } from '../components/ui.jsx'

export default function Connections() {
  const [conns, setConns] = useState(null)
  const [error, setError] = useState('')
  const [funds, setFunds] = useState({}) // id -> true/false/'…'

  const load = () => api.get('/api/admin/connections').then((d) => setConns(d.connections)).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const connect = async () => {
    try {
      const d = await api.get('/api/oauth/url')
      window.open(d.url, '_blank')
    } catch (err) {
      alert(err.message)
    }
  }

  const checkFunds = async (c) => {
    setFunds((f) => ({ ...f, [c.id]: '…' }))
    try {
      const d = await api.post(`/api/admin/connections/${c.id}/check-funds`)
      setFunds((f) => ({ ...f, [c.id]: d.hasFunds }))
    } catch (err) {
      setFunds((f) => ({ ...f, [c.id]: undefined }))
      alert(err.message)
    }
  }

  const rename = async (c) => {
    const alias = prompt(`Alias para ${c.location_id}:`, c.alias || c.name || '')
    if (alias === null) return
    await api.patch(`/api/admin/connections/${c.id}`, { alias }).catch((e) => alert(e.message))
    load()
  }

  const toggleTest = async (c, v) => {
    await api.patch(`/api/admin/connections/${c.id}`, { test_mode: v }).catch((e) => alert(e.message))
    load()
  }

  const disconnect = async (c) => {
    if (!confirm(`¿Desconectar ${c.alias || c.name || c.location_id}? Sus cobros quedarán en el historial pero no se podrá cobrar más.`)) return
    await api.del(`/api/admin/connections/${c.id}`).catch((e) => alert(e.message))
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Conexiones (subcuentas GHL)</h1>
        <Button onClick={connect}><Plug size={15} className="inline -mt-0.5 mr-1" />Conectar subcuenta</Button>
      </div>
      <p className="text-sm text-ink2 -mt-3">
        Cada conexión es una subcuenta de GHL con la app del marketplace instalada (OAuth). A esas subcuentas se les
        puede cobrar del wallet.
      </p>

      {error && <Empty>{error}</Empty>}
      {conns && conns.length === 0 && (
        <Card><Empty>Sin conexiones. Pulsa «Conectar subcuenta» (necesita las credenciales de la app en Configuración).</Empty></Card>
      )}
      {conns && conns.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th>Subcuenta</Th>
                <Th>Location ID</Th>
                <Th className="text-right">Cobros</Th>
                <Th className="text-right">Facturado</Th>
                <Th>Saldo</Th>
                <Th>Prueba</Th>
                <Th>Estado</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {conns.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <button className="font-medium hover:text-gold" title="Cambiar alias" onClick={() => rename(c)}>
                      {c.alias || c.name || <span className="text-mut italic">sin nombre</span>}
                    </button>
                    <div className="text-[11px] text-mut">conectada {fmtDate(c.created_at)}</div>
                  </Td>
                  <Td><code className="text-xs text-ink2">{c.location_id}</code></Td>
                  <Td className="text-right tabular-nums">{c.charges_count}</Td>
                  <Td className="text-right tabular-nums">{fmtUsd(c.amount_total)}</Td>
                  <Td>
                    {funds[c.id] === undefined ? (
                      <button className="text-xs text-ink2 hover:text-gold" onClick={() => checkFunds(c)}>
                        <Wallet size={14} className="inline -mt-0.5" /> Comprobar
                      </button>
                    ) : funds[c.id] === '…' ? (
                      <span className="text-xs text-mut">…</span>
                    ) : funds[c.id] ? (
                      <span className="text-xs text-ok">Con saldo</span>
                    ) : (
                      <span className="text-xs text-bad">Sin saldo</span>
                    )}
                  </Td>
                  <Td><Toggle checked={c.test_mode} onChange={(v) => toggleTest(c, v)} /></Td>
                  <Td><Badge status={c.status} /></Td>
                  <Td className="text-right whitespace-nowrap">
                    <Link
                      to={`/como-cliente/${encodeURIComponent(c.location_id)}`}
                      className="text-xs text-gold/90 hover:text-gold mr-3 inline-flex items-center gap-1"
                      title="Ver el portal exactamente como lo ve esta subcuenta (solo lectura)"
                    >
                      <Eye size={13} /> Ver como cliente
                    </Link>
                    <button
                      className="text-xs text-ink2 hover:text-gold mr-3"
                      title="Releer el nombre desde GHL"
                      onClick={() => api.post(`/api/admin/connections/${c.id}/refresh-name`).then(load).catch((e) => alert(e.message))}
                    >
                      <RefreshCw size={13} className="inline -mt-0.5" />
                    </button>
                    {c.status !== 'disconnected' && (
                      <button className="text-xs text-bad/80 hover:text-bad" onClick={() => disconnect(c)}>Desconectar</button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
