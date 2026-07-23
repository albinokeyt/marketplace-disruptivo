import { useEffect, useState } from 'react'
import { api, fmtUsd, fmtDate } from '../api.js'
import { useCountUp } from '../hooks.js'
import { Card, Badge, Th, Td, Empty } from '../components/ui.jsx'

// barra dorada validada con la skill dataviz contra la superficie negra (#ab8526 sobre #0a0a0c)
const BAR = '#ab8526'

// importe que sube contando al cargar
const Money = ({ n }) => fmtUsd(useCountUp(n))

function BarChart({ series }) {
  const [hover, setHover] = useState(null)
  const W = 720
  const H = 180
  const PAD = { top: 14, right: 8, bottom: 22, left: 8 }
  const iw = W - PAD.left - PAD.right
  const ih = H - PAD.top - PAD.bottom
  const max = Math.max(...series.map((d) => d.amount), 0.01)
  const bw = iw / series.length

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Facturación diaria de los últimos 14 días">
        {[0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + ih - ih * f}
            y2={PAD.top + ih - ih * f}
            stroke="#2a2e3a"
            strokeWidth="1"
          />
        ))}
        {series.map((d, i) => {
          const h = Math.max(d.amount > 0 ? 3 : 0, (d.amount / max) * ih)
          const x = PAD.left + i * bw + 3
          const w = Math.max(bw - 6, 4)
          const y = PAD.top + ih - h
          const r = Math.min(4, h)
          return (
            <g key={d.day}>
              {h > 0 && (
                <path
                  className="bar"
                  style={{ animationDelay: `${i * 35}ms` }}
                  d={`M ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${PAD.top + ih} H ${x} Z`}
                  fill={BAR}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              <rect
                x={PAD.left + i * bw}
                y={PAD.top}
                width={bw}
                height={ih}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
              <text
                x={x + w / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize="9"
                fill={hover === i ? '#e8e6e0' : '#6b7280'}
              >
                {d.day.slice(8)}
              </text>
            </g>
          )
        })}
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + ih} y2={PAD.top + ih} stroke="#2a2e3a" strokeWidth="1" />
      </svg>
      {hover !== null && (
        <div
          className="absolute -top-1 bg-card2 border border-border rounded-lg px-3 py-1.5 text-xs pointer-events-none"
          style={{ left: `${((hover + 0.5) / series.length) * 100}%`, transform: 'translateX(-50%)' }}
        >
          <span className="text-ink2">{series[hover].day.slice(5)}</span>{' '}
          <span className="font-semibold">{fmtUsd(series[hover].amount)}</span>{' '}
          <span className="text-mut">· {series[hover].charges} cobros</span>
        </div>
      )}
    </div>
  )
}

const Stat = ({ label, value, sub }) => (
  <Card className="lift">
    <div className="text-xs text-mut">{label}</div>
    <div className="text-2xl font-bold mt-1.5 tabular-nums text-gradient-gold">{value}</div>
    {sub && <div className="text-[11px] text-ink2 mt-1">{sub}</div>}
  </Card>
)

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/admin/dashboard').then(setData).catch((e) => setError(e.message))
  }, [])

  if (error) return <Empty>{error}</Empty>
  if (!data) return <Empty>Cargando…</Empty>

  const failed = data.by_status.find((s) => s.status === 'failed')?.n || 0
  const unknown = data.by_status.find((s) => s.status === 'unknown')?.n || 0

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Facturado hoy" value={<Money n={data.totals.today} />} />
        <Stat label="Últimos 7 días" value={<Money n={data.totals.last7} />} />
        <Stat label="Últimos 30 días" value={<Money n={data.totals.last30} />} />
        <Stat
          label="Total histórico (wallet)"
          value={<Money n={data.totals.all_time} />}
          sub={`${data.counts.apps} apps · ${data.counts.connections} conexiones · ${data.counts.meters} tarifas${unknown ? ` · ${unknown} sin confirmar` : ''}${failed ? ` · ${failed} fallidos` : ''}`}
        />
      </div>

      <Card>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold">Facturación al wallet · últimos 14 días</h2>
          {data.totals.credit_last30 > 0 && (
            <span className="text-[11px] text-ok">
              + {fmtUsd(data.totals.credit_last30)} cubierto con crédito interno (30 d)
            </span>
          )}
        </div>
        <BarChart series={data.series} />
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 overflow-x-auto">
          <h2 className="text-sm font-semibold mb-2">Últimos cobros</h2>
          {data.recent.length === 0 ? (
            <Empty>Aún no hay cobros. Crea una app y una tarifa para empezar.</Empty>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <Th>App</Th>
                  <Th>Subcuenta</Th>
                  <Th>Tarifa</Th>
                  <Th className="text-right">Importe</Th>
                  <Th>Estado</Th>
                  <Th>Fecha</Th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((c) => (
                  <tr key={c.id}>
                    <Td>{c.app_name}</Td>
                    <Td className="text-ink2">{c.location_name}</Td>
                    <Td className="text-ink2">{c.meter || '—'}</Td>
                    <Td className="text-right tabular-nums">{fmtUsd(c.amount)}</Td>
                    <Td><Badge status={c.status} /></Td>
                    <Td className="text-ink2">{fmtDate(c.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card>
          <h2 className="text-sm font-semibold mb-2">Apps · últimos 30 días</h2>
          {data.top_apps.length === 0 ? (
            <Empty>Sin apps todavía.</Empty>
          ) : (
            <div className="space-y-2.5 mt-3">
              {data.top_apps.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{a.name}</span>
                  <span className="tabular-nums text-ink2">
                    {fmtUsd(a.amount)} <span className="text-mut">· {a.charges}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
