// Cliente mínimo de la API de Stripe (sin SDK). La clave vive SOLO en la variable de entorno STRIPE_SECRET_KEY
// (EasyPanel); basta una clave restringida con permiso de escritura en Checkout Sessions.
const API = 'https://api.stripe.com/v1'

export const stripeKey = () => String(process.env.STRIPE_SECRET_KEY || '').trim()
export const stripeEnabled = () => /^(sk|rk)_(live|test)_/.test(stripeKey())

// Stripe espera form-urlencoded con claves anidadas: a[b][0][c]=valor
export function encodeForm(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? encodeForm(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))))
    else if (typeof v === 'object') encodeForm(v, key, out)
    else out.append(key, String(v))
  }
  return out
}

async function call(method, path, params = null, idempotencyKey = null) {
  const key = stripeKey()
  if (!key) throw Object.assign(new Error('El pago con tarjeta no está configurado (falta STRIPE_SECRET_KEY)'), { statusCode: 503 })
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: params ? encodeForm(params).toString() : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`Stripe: ${data?.error?.message || `HTTP ${res.status}`}`)
    err.status = res.status
    err.statusCode = res.status >= 500 ? 502 : 400
    throw err
  }
  return data
}

export const createCheckoutSession = (params, idempotencyKey) => call('POST', '/checkout/sessions', params, idempotencyKey)
export const getCheckoutSession = (id) => call('GET', `/checkout/sessions/${encodeURIComponent(id)}`)
