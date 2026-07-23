import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Boxes, Package, BadgeCheck, Receipt, Gauge, Plug, Bell,
  Users2, Coins, Settings as SettingsIcon, LogOut, Store as StoreIcon, ExternalLink,
} from 'lucide-react'
import { api } from './api.js'
import { trySsoLogin } from './sso.js'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Apps from './pages/Apps.jsx'
import Plans from './pages/Plans.jsx'
import Subscriptions from './pages/Subscriptions.jsx'
import Charges from './pages/Charges.jsx'
import Meters from './pages/Meters.jsx'
import Connections from './pages/Connections.jsx'
import Credits from './pages/Credits.jsx'
import UsersPage from './pages/Users.jsx'
import Notices from './pages/Notices.jsx'
import Settings from './pages/Settings.jsx'
import Store from './pages/Store.jsx'
import StoreDetail from './pages/StoreDetail.jsx'
import UserPortal from './pages/UserPortal.jsx'

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/apps', icon: Boxes, label: 'Apps' },
  { to: '/planes', icon: Package, label: 'Planes' },
  { to: '/suscripciones', icon: BadgeCheck, label: 'Suscripciones' },
  { to: '/usuarios', icon: Users2, label: 'Usuarios' },
  { to: '/creditos', icon: Coins, label: 'Créditos' },
  { to: '/cobros', icon: Receipt, label: 'Cobros' },
  { to: '/tarifas', icon: Gauge, label: 'Tarifas' },
  { to: '/conexiones', icon: Plug, label: 'Conexiones' },
  { to: '/avisos', icon: Bell, label: 'Avisos' },
  { to: '/configuracion', icon: SettingsIcon, label: 'Configuración' },
]

export default function App() {
  const location = useLocation()
  // La tienda es PÚBLICA (sin login); el resto es el panel de administración.
  if (location.pathname.startsWith('/tienda')) {
    return (
      <Routes location={location}>
        <Route path="/tienda" element={<Store />} />
        <Route path="/tienda/:slug" element={<StoreDetail />} />
      </Routes>
    )
  }
  return <AdminApp location={location} />
}

function AdminApp({ location }) {
  const [me, setMe] = useState(null) // null = cargando · false = sin sesión · { role, email, name }

  const loadMe = async () => {
    try { return await api.get('/api/admin/me') } catch { return null }
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      let m = await loadMe()
      if (!m) { if (await trySsoLogin()) m = await loadMe() }
      if (alive) setMe(m || false)
    })()
    return () => { alive = false }
  }, [])

  const logout = async () => {
    await api.post('/api/admin/logout').catch(() => {})
    setMe(false)
  }

  if (me === null) {
    return (
      <div className="min-h-screen grid place-items-center relative">
        <div className="app-bg" aria-hidden="true" />
        <div className="relative z-10 flex flex-col items-center gap-3 text-mut text-sm">
          <span className="w-8 h-8 rounded-full border-2 border-border border-t-gold spin" />
          Entrando…
        </div>
      </div>
    )
  }
  if (!me) return <Login onLogin={async () => setMe((await loadMe()) || false)} />
  if (me.role === 'user') return <UserPortal me={me} onLogout={logout} />

  return (
    <div className="min-h-screen relative">
      <div className="app-bg" aria-hidden="true" />
      <div className="min-h-screen flex relative z-10">
        <aside className="w-60 shrink-0 border-r border-border bg-card/40 backdrop-blur-sm flex flex-col">
          <div className="px-5 py-6 flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-gold/15 border border-gold/30 grid place-items-center glow-gold">
              <StoreIcon size={18} className="text-gold" />
            </span>
            <div>
              <div className="font-bold text-sm leading-tight text-gradient-gold">Marketplace Disruptivo</div>
              <div className="text-[11px] text-mut leading-tight">Centro de apps + wallet</div>
            </div>
          </div>
          <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
            {NAV.map(({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    isActive ? 'bg-gold/10 text-gold' : 'text-ink2 hover:bg-card2 hover:text-ink'
                  }`
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>
          <a
            href="/tienda"
            target="_blank"
            rel="noreferrer"
            className="mx-3 mt-1 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-gold/90 hover:bg-gold/10"
          >
            <ExternalLink size={15} /> Ver tienda
          </a>
          <button
            onClick={logout}
            className="m-3 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-ink2 hover:bg-card2 hover:text-ink"
          >
            <LogOut size={16} />
            Salir
          </button>
        </aside>
        <main className="flex-1 min-w-0 p-6 lg:p-8 overflow-x-hidden">
          <div key={location.pathname} className="animate-in">
            <Routes location={location}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/apps" element={<Apps />} />
              <Route path="/planes" element={<Plans />} />
              <Route path="/suscripciones" element={<Subscriptions />} />
              <Route path="/usuarios" element={<UsersPage />} />
              <Route path="/creditos" element={<Credits />} />
              <Route path="/cobros" element={<Charges />} />
              <Route path="/tarifas" element={<Meters />} />
              <Route path="/conexiones" element={<Connections />} />
              <Route path="/avisos" element={<Notices />} />
              <Route path="/configuracion" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  )
}
