import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Card, Button, Input, Toggle, Empty } from '../components/ui.jsx'

export default function Settings() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  // los textareas guardan TEXTO CRUDO (no se parte en cada tecla); se convierte a lista al guardar
  const [ssoText, setSsoText] = useState({ company_ids: '', emails: '' })

  const load = () =>
    api.get('/api/admin/settings').then((d) => {
      setData(d)
      setSsoText({
        company_ids: (d.sso_admins?.company_ids || []).join('\n'),
        emails: (d.sso_admins?.emails || []).join('\n'),
      })
    }).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  if (error) return <Empty>{error}</Empty>
  if (!data) return <Empty>Cargando…</Empty>

  const setGhl = (k) => (e) => setData((d) => ({ ...d, ghl_app: { ...d.ghl_app, [k]: e.target.value } }))
  // recargas: los presets se editan como texto crudo y se convierten al guardar (no en cada tecla)
  const setTopup = (k, v) => setData((d) => ({ ...d, topup: { ...(d.topup || {}), [k]: v } }))
  const setBilling = (k, v) => setData((d) => ({ ...d, subscription_billing: { ...(d.subscription_billing || {}), [k]: v } }))
  const setSso = (k) => (e) => setSsoText((s) => ({ ...s, [k]: e.target.value }))
  const toList = (txt) => txt.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setSaved(false)
    try {
      const sso_admins = { company_ids: toList(ssoText.company_ids), emails: toList(ssoText.emails) }
      const t = data.topup || {}
      const presetsSrc = t.presets_text !== undefined ? t.presets_text : (t.presets || []).join(', ')
      const topup = {
        enabled: t.enabled !== false,
        meter_code: t.meter_code || 'recarga-saldo',
        presets: String(presetsSrc).split(/[,\s]+/).map(Number).filter((n) => n > 0),
        min: Number(t.min) || 5,
        max: Number(t.max) || 5000,
      }
      await api.put('/api/admin/settings', {
        ghl_app: data.ghl_app, sso_admins, test_mode: data.test_mode, topup, subscription_billing: data.subscription_billing,
      })
      setSaved(true)
      load()
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-bold">Configuración</h1>

      <form onSubmit={save} className="space-y-6">
        <Card>
          <h2 className="text-sm font-semibold mb-1">App del marketplace de GHL</h2>
          <p className="text-xs text-ink2 mb-4 leading-relaxed">
            Los cobros al wallet <b>exigen una app del marketplace</b> con scopes{' '}
            <code className="text-gold">charges.write</code> y <code className="text-gold">charges.readonly</code> y sus
            billing meters creados en App → Pricing. Un Private Integration Token (PIT) <b>no puede</b> crear cargos —
            solo sirve para lecturas auxiliares.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Input label="Client ID" value={data.ghl_app.client_id} onChange={setGhl('client_id')} />
            <Input label="Client Secret" type="password" placeholder="(sin cambios)" value={data.ghl_app.client_secret} onChange={setGhl('client_secret')} />
            <Input label="App ID (id de la app en el marketplace)" value={data.ghl_app.app_id} onChange={setGhl('app_id')} />
            <Input
              label="Company ID (agencia, opcional)"
              hint="Solo como respaldo: normalmente llega solo con el OAuth de cada subcuenta."
              value={data.ghl_app.company_id}
              onChange={setGhl('company_id')}
            />
            <Input
              label="PIT de agencia (opcional)"
              type="password"
              placeholder="(sin cambios)"
              hint="Token de integración privada, solo para lecturas auxiliares."
              value={data.ghl_app.pit_token}
              onChange={setGhl('pit_token')}
              className="lg:col-span-2"
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold mb-3">OAuth</h2>
          <div className="text-xs text-ink2 space-y-2">
            <p>
              Redirect URL para pegar en la app del marketplace:{' '}
              <code className="text-gold break-all">{data.redirect_uri}</code>
            </p>
            <p>
              URL base actual: <code className="text-ink">{data.app_base_url || '(define APP_BASE_URL en el entorno)'}</code>
            </p>
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold mb-1">Auto-login por SSO de GHL</h2>
          <p className="text-xs text-ink2 mb-4 leading-relaxed">
            Con esto, quien abra el panel <b>embebido dentro de GHL</b> (Custom Page) entra <b>sin contraseña</b>: GHL
            envía su identidad cifrada y el panel la canjea por sesión. Solo entran los usuarios autorizados de abajo.
            Genera el <b>Shared Secret</b> en tu app del marketplace (Advanced Settings → SSO) y pégalo aquí; añade una
            <b> Custom Page</b> con la URL de abajo. Para snapshots, crea un Custom Menu Link que apunte a esa misma URL.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Input
              label="SSO Shared Secret"
              type="password"
              placeholder="(sin cambios)"
              value={data.ghl_app.sso_secret}
              onChange={setGhl('sso_secret')}
            />
            <Input
              label="Custom Page URL (pegar en GHL)"
              readOnly
              value={data.custom_page_url || ''}
              hint="La URL que GHL cargará embebida. Es la raíz del panel."
            />
            <Input
              label="ID de la Custom Page en GHL"
              value={data.ghl_app.custom_page_id || ''}
              onChange={setGhl('custom_page_id')}
              placeholder="6a9c73161281715fe62d0ed8"
              hint="Al abrir el marketplace dentro de una subcuenta, la URL acaba en …/custom-page-link/<id>. Con él, las apps de terceros pueden enlazar al portal del cliente (campo portal_url de la API)."
              className="lg:col-span-2"
            />
            <label className="block lg:col-span-2">
              <span className="block text-xs text-ink2 mb-1.5">Company IDs de agencia autorizados (uno por línea o separados por comas)</span>
              <textarea
                className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder-mut outline-none focus:border-gold/60 min-h-16"
                value={ssoText.company_ids}
                onChange={setSso('company_ids')}
                placeholder="ewGlt5YqA8PHR1qJWLhC"
              />
              <span className="block text-[11px] text-mut mt-1">Tu Company ID de arriba entra automáticamente; aquí puedes añadir más.</span>
            </label>
            <label className="block lg:col-span-2">
              <span className="block text-xs text-ink2 mb-1.5">Correos autorizados (uno por línea o separados por comas)</span>
              <textarea
                className="w-full bg-bg border border-border rounded-xl px-3.5 py-2.5 text-sm text-ink placeholder-mut outline-none focus:border-gold/60 min-h-16"
                value={ssoText.emails}
                onChange={setSso('emails')}
                placeholder="tu@correo.com"
              />
            </label>
          </div>
          <p className="text-[11px] text-mut mt-2">
            Si no hay Shared Secret ni ningún autorizado, el SSO queda desactivado (nadie entra sin contraseña) — es lo seguro por defecto.
          </p>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold mb-1">Recargas de saldo desde el wallet</h2>
          <p className="text-xs text-ink2 mb-4 leading-relaxed">
            El cliente pulsa «Recargar» en su portal, se le cobra el importe de su <b>wallet de GoHighLevel</b> y recibe ese
            mismo importe como <b>crédito interno</b>. Necesita un billing meter en tu app de GHL de tipo <i>Custom Event</i>,
            precio <b>fijo 1.00 USD por unidad</b>, registrado en Tarifas con el código de abajo.
          </p>
          <Toggle
            checked={(data.topup?.enabled) !== false}
            onChange={(v) => setTopup('enabled', v)}
            label="Recargas activadas"
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Input label="Código de la tarifa de recarga" value={data.topup?.meter_code || 'recarga-saldo'} onChange={(e) => setTopup('meter_code', e.target.value)} />
            <Input
              label="Importes sugeridos (USD, separados por comas)"
              value={data.topup?.presets_text !== undefined ? data.topup.presets_text : (data.topup?.presets || [10, 25, 50, 100]).join(', ')}
              onChange={(e) => setTopup('presets_text', e.target.value)}
            />
            <Input label="Mínimo (USD)" type="number" min="1" value={data.topup?.min ?? 5} onChange={(e) => setTopup('min', e.target.value)} />
            <Input label="Máximo (USD)" type="number" min="1" value={data.topup?.max ?? 5000} onChange={(e) => setTopup('max', e.target.value)} />
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold mb-1">Cobro de suscripciones</h2>
          <p className="text-xs text-ink2 mb-4 leading-relaxed">
            Las suscripciones con precio y renovación automática se cobran solas cada periodo (primero el crédito
            interno, después el wallet), hasta 1 hora antes de vencer. Si el cobro falla, la suscripción entra en
            <b> gracia</b>: el cliente conserva el acceso los días indicados mientras se reintenta cada 24 h; agotada
            la gracia se le corta y, agotados los reintentos, queda <b>impagada</b>. Necesita una tarifa dinámica o
            fija a 1.00 USD por unidad registrada en Tarifas con el código de abajo.
          </p>
          <Toggle
            checked={(data.subscription_billing?.enabled) !== false}
            onChange={(v) => setBilling('enabled', v)}
            label="Cobro automático de suscripciones activado"
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            <Input
              label="Código de la tarifa de suscripciones"
              value={data.subscription_billing?.meter_code ?? 'suscripcion'}
              onChange={(e) => setBilling('meter_code', e.target.value)}
            />
            <Input
              label="Días de gracia tras un impago"
              type="number"
              min="0"
              value={data.subscription_billing?.grace_days ?? 3}
              onChange={(e) => setBilling('grace_days', e.target.value)}
              hint="0 = sin gracia: se corta al vencer."
            />
            <Input
              label="Reintentos diarios antes de impagada"
              type="number"
              min="1"
              value={data.subscription_billing?.max_retries ?? 10}
              onChange={(e) => setBilling('max_retries', e.target.value)}
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold mb-3">Modo prueba global</h2>
          <Toggle
            checked={data.test_mode}
            onChange={(v) => setData((d) => ({ ...d, test_mode: v }))}
            label="Registrar todos los cobros como prueba (no se toca el wallet de GHL)"
          />
        </Card>

        <div className="flex items-center gap-3">
          <Button disabled={busy}>{busy ? 'Guardando…' : 'Guardar configuración'}</Button>
          {saved && <span className="text-ok text-sm">Guardado ✓</span>}
        </div>
      </form>
    </div>
  )
}
