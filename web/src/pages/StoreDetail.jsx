import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, ExternalLink } from 'lucide-react'
import { api, fmtDate } from '../api.js'
import { Stars } from '../components/Stars.jsx'
import { Media, Thumb } from '../components/Media.jsx'

export default function StoreDetail() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    setData(null); setActive(0)
    api.get(`/api/store/app/${slug}`).then(setData).catch((e) => setError(e.message))
  }, [slug])

  return (
    <div className="min-h-screen relative">
      <div className="app-bg" aria-hidden="true" />
      <div className="relative z-10 max-w-5xl mx-auto px-5 py-8 lg:py-12">
        <Link to="/tienda" className="inline-flex items-center gap-1.5 text-sm text-ink2 hover:text-gold mb-6">
          <ArrowLeft size={15} /> Volver a la tienda
        </Link>

        {error && <p className="text-mut">{error}</p>}
        {!data && !error && <p className="text-mut animate-fade">Cargando…</p>}

        {data && (
          <div className="animate-in space-y-8">
            <div className="grid lg:grid-cols-5 gap-8">
              {/* galería */}
              <div className="lg:col-span-3 space-y-3">
                <div className="rounded-2xl overflow-hidden border border-border bg-card2 aspect-video">
                  {data.app.media?.length ? <Media item={data.app.media[active]} className="!rounded-none h-full" /> : <div className="w-full h-full grid place-items-center text-mut text-sm">sin multimedia</div>}
                </div>
                {data.app.media?.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {data.app.media.map((m, i) => (
                      <button
                        key={i}
                        onClick={() => setActive(i)}
                        className={`w-24 shrink-0 aspect-video rounded-lg overflow-hidden border-2 ${i === active ? 'border-gold' : 'border-border'}`}
                      >
                        <Thumb item={m} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ficha */}
              <div className="lg:col-span-2 space-y-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-bold text-gradient-gold">{data.app.name}</h1>
                    {data.app.badge === 'new' && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-gold text-bg">Nuevo</span>}
                    {data.app.badge === 'coming_soon' && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-gold/40 text-gold">Próximamente</span>}
                  </div>
                  {data.app.tagline && <p className="text-ink2 mt-1">{data.app.tagline}</p>}
                </div>
                <Stars value={data.app.rating || 0} count={data.app.reviews_count} size={18} />
                {data.app.price_text && (
                  <div className="text-lg font-semibold text-gold">{data.app.price_text}</div>
                )}
                {data.app.badge === 'coming_soon' ? (
                  <div className="w-full text-center px-4 py-3 rounded-xl border border-gold/40 text-gold font-semibold">Próximamente</div>
                ) : data.app.install_url ? (
                  <a
                    href={data.app.install_url}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gold text-bg font-semibold hover:bg-[#e5c470] transition-colors glow-gold"
                  >
                    Instalar en GoHighLevel <ExternalLink size={16} />
                  </a>
                ) : (
                  <div className="text-sm text-mut">Instalación no disponible todavía.</div>
                )}
                {data.app.features?.length > 0 && (
                  <ul className="space-y-1.5 pt-2">
                    {data.app.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-ink2">
                        <Check size={15} className="text-ok mt-0.5 shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {data.app.description && (
              <section className="bg-card border border-border rounded-2xl p-6">
                <h2 className="font-semibold mb-2">Descripción</h2>
                <p className="text-sm text-ink2 leading-relaxed whitespace-pre-wrap">{data.app.description}</p>
              </section>
            )}

            {data.plans?.length > 0 && (
              <section>
                <h2 className="font-semibold mb-3">Planes</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.plans.map((p, i) => (
                    <div key={i} className="bg-card border border-border rounded-2xl p-5 lift">
                      <div className="font-semibold">{p.name}</div>
                      {p.price_text && <div className="text-gold text-lg font-bold mt-1">{p.price_text}</div>}
                      {p.trial_days > 0 && <div className="text-[11px] text-ok mt-1">{p.trial_days} días gratis</div>}
                      {p.description && <p className="text-xs text-ink2 mt-2 leading-relaxed">{p.description}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {data.reviews?.length > 0 && (
              <section>
                <h2 className="font-semibold mb-3">Reseñas</h2>
                <div className="space-y-3">
                  {data.reviews.map((r, i) => (
                    <div key={i} className="bg-card border border-border rounded-2xl p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{r.author}</span>
                        <Stars value={r.rating} showNumber={false} size={13} />
                      </div>
                      {r.text && <p className="text-sm text-ink2 mt-2 leading-relaxed">{r.text}</p>}
                      <div className="text-[11px] text-mut mt-2">{fmtDate(r.created_at)}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
