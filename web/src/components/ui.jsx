import { X } from 'lucide-react'

export const Card = ({ children, className = '' }) => (
  <div className={`bg-card border border-border rounded-2xl p-5 card-hover ${className}`}>{children}</div>
)

export const Button = ({ children, variant = 'primary', className = '', ...props }) => {
  const styles = {
    primary: 'bg-gold text-bg hover:bg-[#e5c470] font-semibold',
    ghost: 'bg-card2 text-ink hover:bg-border border border-border',
    danger: 'bg-bad/10 text-bad border border-bad/30 hover:bg-bad/20',
  }
  return (
    <button
      className={`px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export const Input = ({ label, hint, className = '', ...props }) => (
  <label className={`block ${className}`}>
    {label && <span className="block text-xs text-ink2 mb-1.5">{label}</span>}
    <input
      className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder-mut outline-none focus:border-gold/60"
      {...props}
    />
    {hint && <span className="block text-[11px] text-mut mt-1">{hint}</span>}
  </label>
)

export const Select = ({ label, children, className = '', ...props }) => (
  <label className={`block ${className}`}>
    {label && <span className="block text-xs text-ink2 mb-1.5">{label}</span>}
    <select
      className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-ink outline-none focus:border-gold/60"
      {...props}
    >
      {children}
    </select>
  </label>
)

export const Toggle = ({ checked, onChange, label }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="flex items-center gap-2.5 text-sm text-ink2"
  >
    <span
      className={`w-10 h-5.5 rounded-full p-0.5 transition-colors ${checked ? 'bg-gold' : 'bg-border'}`}
      style={{ height: 22, width: 40 }}
    >
      <span
        className="block h-full aspect-square rounded-full bg-bg transition-transform"
        style={{ transform: checked ? 'translateX(18px)' : 'translateX(0)' }}
      />
    </span>
    {label}
  </button>
)

const STATUS = {
  created: { label: 'Cobrado', cls: 'bg-ok/10 text-ok border-ok/30' },
  test: { label: 'Prueba', cls: 'bg-gold/10 text-gold border-gold/30' },
  pending: { label: 'En curso', cls: 'bg-warn/10 text-warn border-warn/30' },
  unknown: { label: 'Sin confirmar', cls: 'bg-warn/10 text-warn border-warn/40' },
  failed: { label: 'Fallido', cls: 'bg-bad/10 text-bad border-bad/30' },
  refunded: { label: 'Reembolsado', cls: 'bg-mut/10 text-ink2 border-border' },
  refunding: { label: 'Reembolsando', cls: 'bg-warn/10 text-warn border-warn/30' },
  active: { label: 'Activa', cls: 'bg-ok/10 text-ok border-ok/30' },
  revoked: { label: 'Revocada', cls: 'bg-bad/10 text-bad border-bad/30' },
  connected: { label: 'Conectada', cls: 'bg-ok/10 text-ok border-ok/30' },
  disconnected: { label: 'Desconectada', cls: 'bg-mut/10 text-ink2 border-border' },
  error: { label: 'Error', cls: 'bg-bad/10 text-bad border-bad/30' },
}

export const Badge = ({ status }) => {
  const s = STATUS[status] || { label: status, cls: 'bg-mut/10 text-ink2 border-border' }
  return <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
}

export const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4" onClick={onClose}>
    <div
      className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button onClick={onClose} className="text-mut hover:text-ink">
          <X size={18} />
        </button>
      </div>
      {children}
    </div>
  </div>
)

export const Th = ({ children, className = '' }) => (
  <th className={`text-left text-[11px] uppercase tracking-wide text-mut font-medium px-3 py-2 ${className}`}>
    {children}
  </th>
)

export const Td = ({ children, className = '' }) => (
  <td className={`px-3 py-2.5 text-sm border-t border-border/60 ${className}`}>{children}</td>
)

export const Empty = ({ children }) => (
  <div className="text-center text-mut text-sm py-10">{children}</div>
)
