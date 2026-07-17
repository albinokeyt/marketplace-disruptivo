import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { api } from '../api.js'
import { Card, Button, Input } from '../components/ui.jsx'

export default function Login({ onLogin }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/api/admin/login', { user, pass })
      onLogin()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-4 relative">
      <div className="app-bg" aria-hidden="true" />
      <Card className="w-full max-w-sm relative z-10 animate-in">
        <div className="flex flex-col items-center mb-6 mt-2">
          <span className="w-12 h-12 rounded-2xl bg-gold/15 border border-gold/30 grid place-items-center mb-3 glow-gold">
            <Wallet size={22} className="text-gold" />
          </span>
          <h1 className="font-bold text-lg text-gradient-gold">Disruptivo Wallet</h1>
          <p className="text-xs text-mut mt-1">Panel de administración</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Usuario o email" value={user} onChange={(e) => setUser(e.target.value)} autoFocus />
          <Input label="Contraseña" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
          {error && <p className="text-bad text-xs">{error}</p>}
          <Button className="w-full" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
