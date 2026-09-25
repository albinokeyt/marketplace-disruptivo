import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plug, RefreshCw, Wallet, Eye } from 'lucide-react'
import { api, fmtUsd, fmtDate } from '../api.js'
import { Card, Button, Badge, Th, Td, Empty, Toggle } from '../components/ui.jsx'

const SOURCE = { panel: 'desde el panel', install: 'al instalar', webhook: 'aviso de GHL', sync: 'sincronización', sso: 'al abrir la app' }

export default function Connections() {
  const [conns, setConns] = useState(null)
  const [agencies, setAgencies] = useState([])
  const [error, setError] = useState('')
  const [funds, setFunds] = useState({}) // id -> true/false/'…'
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const load = () => api.get('/api/admin/connections').then((d) => { setConns(d.connections); setAgencies(d.agencies || []) }).catch((e) => setError(e.message))

  // repasa las subcuentas donde está instalada la app y conecta las que falten
  const sync = async (auto = false) => {
    if (!auto) setSyncing(true)
    try {
      const r = await api.post('/api/admin/connections/sync', { auto })
      if (r.skipped) return
      const nuevas = (r.created?.length || 0) + (r.repaired?.length || 0)
      if (nuevas) load()
      if (!auto) {
        const partes = []
        if (!r.agencies) partes.push('Aún no hay token de agencia (mira el aviso de arriba).')
        else partes.push(`${r.installed} subcuenta(s) con la app instalada en GHL.`)
        if (nuevas) partes.push(`${nuevas} conectada(s) ahora.`)
        if (r.failed?.length) partes.push(`${r.failed.length} con error: ${r.failed[0].error}`)
        setSyncMsg(partes.join(' '))
        load()
      }
    } catch (err) {
      if (!auto) setSyncMsg(err.message)
    } finally {
      if (!auto) setSyncing(false)
    }
  }

  useEffect(() => { load(); sync(true) }, [])

  const complete = async (c) => {
    try {
      await api.post(`/api/admin/connections/${c.id}/complete`)
      load()
    } catch (err) {
      if (confirm(`${err.message}\n\n¿Abrir ahora la conexión con GoHighLevel para esta subcuenta?`)) connect()
    }
  }

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
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => sync(false)} disabled={syncing}>
            <RefreshCw size={15} className={`inline -mt-0.5 mr-1 ${syncing ? 'animate-spin' : ''}`} />{syncing ? 'Sincronizando…' : 'Sincronizar'}
          </Button>
          <Button onClick={connect}><Plug size={15} className="inline -mt-0.5 mr-1" />Conectar subcuenta</Button>
        </div>
      </div>
      <p className="text-sm text-ink2 -mt-3">
        Cada subcuenta con la app Marketplace Disruptivo instalada aparece aquí sola: al instalarla, cuando GoHighLevel
        avisa de la instalación, al abrir la app dentro de la subcuenta y en la revisión automática cada 15 minutos.
        A las conectadas se les puede cobrar del wallet.
      </p>

      <Card className={agencies.length ? 'border-ok/30' : 'border-warn/40'}>
        {agencies.length ? (
          <div className="text-sm text-ink2">
            <b className="text-ok">Instalaciones automáticas activas.</b>{' '}
            {agencies[0].last_sync_at ? `Última revisión: ${fmtDate(agencies[0].last_sync_at)}.` : 'Pendiente de la primera revisión.'}
            {agencies.some((a) => !a.oauth_write) && (
              <div className="text-warn text-xs mt-1">
                El token de agencia no tiene el permiso <code>oauth.write</code>: si las subcuentas no se conectan solas,
                añade ese permiso en la app de GHL y vuelve a instalarla desde el panel de agencia.
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-ink2">
            <b className="text-warn">Instalaciones automáticas: falta autorizar la agencia una vez.</b> Instala Marketplace
            Disruptivo desde el panel de agencia de GoHighLevel (App Marketplace → Instalar → elige las subcuentas). A partir
            de ese momento, toda subcuenta con la app instalada aparecerá aquí sola. Mientras tanto, las instalaciones se
            listan como «Instalada · falta token» cuando alguien abre la app dentro de la subcuenta, y puedes completarlas
            con «Conectar subcuenta».
          </div>
        )}
        {syncMsg && <div className="text-xs text-ink2 mt-2">{syncMsg}</div>}
      </Card>

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
                    <div className="text-[11px] text-mut">
                      {c.status === 'uninstalled' ? `desinstalada ${fmtDate(c.uninstalled_at || c.updated_at)}` : `desde ${fmtDate(c.installed_at || c.created_at)}`}
                      {c.source && SOURCE[c.source] ? ` · ${SOURCE[c.source]}` : ''}
                    </div>
                    {c.last_error && c.status !== 'connected' && (
                      <div className="text-[11px] text-bad max-w-72 truncate" title={c.last_error}>{c.last_error}</div>
                    )}
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
                    {['awaiting', 'error', 'uninstalled', 'disconnected'].includes(c.status) && (
                      <button className="text-xs text-gold hover:underline mr-3" onClick={() => complete(c)} title="Pedir el token de esta subcuenta">Completar</button>
                    )}
                    {!['disconnected', 'uninstalled'].includes(c.status) && (
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
