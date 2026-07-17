import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, ArrowRight, Sparkles } from 'lucide-react'
import { api } from '../api.js'
import { Stars } from '../components/Stars.jsx'
import { Thumb } from '../components/Media.jsx'

const NOTICE_CLS = {
  info: 'border-gold/30 bg-gold/5',
  success: 'border-ok/30 bg-ok/5',
  warning: 'border-warn/30 bg-warn/5',
  danger: 'border-bad/30 bg-bad/5',
}

function AppCard({ a }) {
  return (
    <Link
      to={`/tienda/${a.slug}`}
      className="group bg-card border border-border rounded-2xl overflow-hidden lift flex flex-col"
    >
      <div className="aspect-video bg-card2 overflow-hidden relative">
        <Thumb item={a.media?.[0]} className="group-hover:scale-105 transition-transform duration-500" />
        {a.badge === 'new' && <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gold text-bg">Nuevo</span>}
        {a.badge === 'coming_soon' && <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-card2 border border-gold/40 text-gold">Próximamente</span>}
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-tight">{a.name}</h3>
          {a.price_text && <span className="text-xs text-gold whitespace-nowrap font-medium">{a.price_text}</span>}
        </div>
        {a.tagline && <p className="text-xs text-ink2 leading-relaxed line-clamp-2">{a.tagline}</p>}
        <div className="mt-auto pt-2 flex items-center justify-between">
          <Stars value={a.rating || 0} count={a.reviews_count} />
          <span className="text-xs text-gold inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            Ver <ArrowRight size={13} />
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function Store() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/store').then(setData).catch((e) => setError(e.message))
  }, [])

  return (
    <div className="min-h-screen relative">
      <div className="app-bg" aria-hidden="true" />
      <div className="relative z-10 max-w-6xl mx-auto px-5 py-10 lg:py-16">
        <header className="text-center mb-10 animate-in">
          <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest text-gold/80 mb-4">
            <Sparkles size={13} /> Departamento Disruptivo
          </span>
          <h1 className="text-4xl lg:text-5xl font-black text-gradient-gold leading-tight">Marketplace Disruptivo</h1>
          <p className="text-ink2 mt-3 max-w-xl mx-auto">
            Las apps del Departamento Disruptivo para tu GoHighLevel. Instálalas en un clic y paga solo por lo que usas.
          </p>
        </header>

        {error && <p className="text-center text-mut">{error}</p>}
        {!data && !error && <p className="text-center text-mut animate-fade">Cargando la tienda…</p>}

        {data?.notices?.length > 0 && (
          <div className="space-y-2 mb-8 max-w-3xl mx-auto">
            {data.notices.map((n, i) => (
              <div key={i} className={`border rounded-xl px-4 py-3 text-sm ${NOTICE_CLS[n.level] || NOTICE_CLS.info}`}>
                <b>{n.title}</b>
                {n.body && <span className="text-ink2"> — {n.body}</span>}
              </div>
            ))}
          </div>
        )}

        {data && data.apps.length === 0 && (
          <div className="text-center text-mut py-16">
            <Wallet size={30} className="mx-auto mb-3 text-border" />
            Aún no hay apps publicadas. Publícalas desde el panel de administración.
          </div>
        )}

        {data && data.apps.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.apps.map((a) => <AppCard key={a.slug} a={a} />)}
          </div>
        )}
      </div>
    </div>
  )
}
