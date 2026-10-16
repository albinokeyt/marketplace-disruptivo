// SSO de GHL para Custom Pages: cuando el panel se carga EMBEBIDO dentro de GHL,
// pedimos a la ventana padre el contexto de usuario cifrado y lo canjeamos por sesión admin.
// Si no estamos embebidos (o falla), no hacemos nada y el panel sigue su flujo normal (login).

function isEmbedded() {
  try { return window.self !== window.top } catch { return true } // cross-origin → embebidos
}

// Pide a GHL el paquete cifrado del usuario (postMessage). Resuelve el string cifrado o null.
function requestGhlUserData(timeoutMs = 5000) {
  return new Promise((resolve) => {
    let done = false
    const finish = (val) => {
      if (done) return
      done = true
      window.removeEventListener('message', onMessage)
      resolve(val || null)
    }
    const onMessage = (e) => {
      const d = e.data
      if (!d) return
      if (typeof d === 'string' && d.length > 24) return finish(d)
      if (d.message === 'REQUEST_USER_DATA_RESPONSE') return finish(d.payload || d.data || null)
    }
    window.addEventListener('message', onMessage)
    try { window.parent.postMessage({ message: 'REQUEST_USER_DATA' }, '*') } catch { /* no embebido */ }
    setTimeout(() => finish(null), timeoutMs)
  })
}

// Devuelve { ok: true } si dejó sesión iniciada por SSO. { ok: false } si no aplica (→ login normal), o
// { ok: false, error, code, error_en } si GHL nos identificó pero el servidor explica por qué no hay acceso
// (p. ej. otra agencia): entonces se muestra ese mensaje en vez del formulario de acceso.
export async function trySsoLogin() {
  if (!isEmbedded()) return { ok: false }
  const encrypted = await requestGhlUserData()
  if (!encrypted) return { ok: false }
  try {
    const res = await fetch('/api/admin/sso', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ encrypted }),
    })
    if (res.ok) return { ok: true }
    const d = await res.json().catch(() => ({}))
    return { ok: false, error: d.error || null, error_en: d.error_en || null, code: d.code || null }
  } catch {
    return { ok: false }
  }
}
