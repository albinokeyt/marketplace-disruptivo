# Integrar tu app con Marketplace Disruptivo

Guía para el desarrollador de una app (Hermes Setter, Emails Disruptivo, VSL Boost…) que quiere **cobrar su uso**
desde el saldo del cliente en Marketplace Disruptivo, en lugar de gestionar pagos por su cuenta.

**Qué gana tu app:** no gestionas tarjetas ni suscripciones. El cliente recarga saldo una vez (desde su wallet de
GoHighLevel) y todas las apps consumen de ahí. Tú solo haces una llamada HTTP cuando ocurre algo cobrable.

```
Tu app  ──POST /api/v1/charges──▶  Marketplace Disruptivo  ──▶  crédito del cliente
                                                           └──▶  wallet de GHL (si no hay crédito)
```

---

## 1. Lo que necesitas

| Dato | Cómo lo consigues |
|---|---|
| **URL base** | Te la da el administrador. Hoy: `https://apps-propias-marketplace.f7m8z2.easypanel.host` |
| **API key** | Te la entrega el administrador. Formato `dw_…`. **Solo se muestra una vez.** |
| **Código de tarifa** (`meter`) | Te lo da el administrador, o lo consultas en `GET /api/v1/meters` |
| **`location_id`** | El id de la subcuenta de GoHighLevel a la que cobras. Lo tienes en tu propio OAuth |

Autenticación en **todas** las llamadas (una de las dos, equivalentes):

```
Authorization: Bearer dw_tu_api_key
X-Api-Key: dw_tu_api_key
```

⚠️ `Bearer` va con **B mayúscula y un espacio**: el servidor compara el prefijo literal. Un `bearer` en minúscula
cae al fallback de `X-Api-Key` y, si no la mandas, responde `401`.

Sin cabecera o con clave revocada → `401`. La clave identifica a tu app: cada app **solo ve y reembolsa sus
propios cargos**.

---

## 2. Cobrar (el endpoint que importa)

```http
POST /api/v1/charges
Content-Type: application/json
```

```json
{
  "location_id": "sljtYiFoE1qS7x1sSAQW",
  "meter": "consumo-apps",
  "units": 3,
  "event_id": "hermes-conv842-lote7",
  "price": 0.05,
  "description": "3 mensajes de IA",
  "user_id": "opcional-tu-usuario",
  "event_time": "2026-09-06T12:30:00.000Z"
}
```

| Campo | Obligatorio | Reglas exactas |
|---|---|---|
| `location_id` | **sí** | string; la subcuenta debe estar conectada y en estado `connected` |
| `meter` | **sí** | string: el **código** de la tarifa (p. ej. `consumo-apps`) o el `meterId` de GHL. Debe estar activa |
| `units` | **sí** | número **> 0** y ≤ 1 000 000. Máximo **4 decimales**: la columna es `numeric(12,4)` y Postgres redondea en silencio lo que pase de ahí |
| `event_id` | **sí** | string, máx. **190** caracteres. **Tu** identificador único de la operación → es la clave de la idempotencia. Único por *(app, event_id)*: otra app puede usar el mismo valor sin colisionar |
| `price` | no | Precio por unidad. **Solo** si la tarifa es de tipo `dynamic`; se valida contra su mínimo/máximo (inclusive). En tarifas fijas → `400`. Si la tarifa es dinámica y **no** tiene precio por defecto, `price` es obligatorio |
| `description` | no | máx. 500 caracteres. Por defecto, el nombre de la tarifa |
| `user_id` | no | string libre; se guarda en el ledger |
| `event_time` | no | fecha ISO 8601 válida |

El importe es `units × price_per_unit`, redondeado a 6 decimales. Divisa: **USD** (GHL solo admite USD).

### Respuestas

| HTTP | Cuerpo | Qué significa y qué hacer |
|---|---|---|
| **201** | `{ "test_mode": false, "charge": {…} }` | Cobrado. `charge.status` = `created` (o `test` en modo prueba) |
| **200** | `{ "idempotent": true, "charge": {…} }` | Ese `event_id` ya estaba cobrado. **No es un error**: sigue adelante, no vuelvas a cobrar |
| **200** | `{ "idempotent": true, "reconciled": true, … }` | Un intento anterior sí había cobrado en GHL; se recuperó. No cobres otra vez |
| **400** | `{ "error": "…" }` | Falta un campo o es inválido. Corrige la petición (reintentar igual no sirve) |
| **403** | `{ "error": "…" }` | Tu API key no puede cobrar a esa subcuenta |
| **404** | `{ "error": "…" }` | Tarifa inexistente/inactiva, o subcuenta no conectada |
| **409** | `{ "error": "…", "charge_id": 12 }` | Ese `event_id` tiene un cobro **en curso**. Espera unos segundos y **reintenta con el mismo `event_id`** |
| **429** | `{ "error": "…" }` | Superaste el límite de peticiones/min. Respeta la cabecera `X-RateLimit-Remaining` y reintenta |
| **503** | `{ "error": "…", "charge_id": 12 }` | No se pudo verificar en GHL el intento anterior. **Reintenta con el mismo `event_id`** en unos segundos |
| **502** | `{ "error": "…", "charge": {…} }` | GHL rechazó el cobro (`charge.status` = `failed`) o no lo confirmó (`unknown`). Ver abajo |

### El objeto `charge`

```json
{
  "id": 12,
  "event_id": "hermes-conv842-lote7",
  "location_id": "sljtYiFoE1qS7x1sSAQW",
  "meter": "consumo-apps",
  "units": 3,
  "price_per_unit": 0.05,
  "amount": 0.15,
  "currency": "USD",
  "status": "created",
  "paid_with": "wallet",
  "kind": "usage",
  "ghl_charge_id": "abc123",
  "description": "3 mensajes de IA",
  "error": null,
  "created_at": "2026-09-06T12:30:01.000Z"
}
```

- `paid_with`: `credit` (salió del saldo interno) o `wallet` (se cobró al wallet de GHL). A ti te da igual: en ambos
  casos está cobrado. **Ojo:** si se pagó con crédito, `ghl_charge_id` viene a `null` — eso **no** es un fallo.
- `status`: `created` cobrado · `test` modo prueba (no toca dinero) · `pending` en vuelo · `failed` GHL lo rechazó · `unknown` sin confirmación · `refunded` / `refunding` reembolsado.
- **La verdad del cobro está en `status`, no en el código HTTP.** Ramifica tu lógica de entrega por este campo.
- Guarda el **`id` numérico**: es lo único que acepta `DELETE /api/v1/charges/:id`. No se puede reembolsar por
  `event_id` (si no lo guardaste, recupéralo con `GET /api/v1/charges?event_id=…`).
- Lee las respuestas **por nombre de campo** y tolera campos nuevos: el objeto puede crecer.

---

## 3. Las 7 reglas de oro (léelas antes de escribir código)

1. **Un `event_id` único y ESTABLE por operación cobrable.** Derívalo de tus propios ids, nunca de un random ni
   de la hora: `hermes-conv842-lote7`, `vslboost-video91-transcode`, `emails-envio-55231`. Es lo único que impide
   cobrar dos veces al cliente.

2. **Ante `502`, `503`, `429`, timeout o error de red: reintenta con el MISMO `event_id`.** Nunca generes uno
   nuevo "para desatascar": eso sí duplicaría el cobro. La pasarela, antes de reintentar, le pregunta a GHL si el
   intento anterior llegó a cobrarse y solo re-ejecuta si GHL confirma que no.

3. **`200` con `idempotent: true` es éxito**, no un fallo. Si tratas todo lo que no sea `201` como error, cobrarás
   de más. Acepta `200` y `201` como "cobrado".

4. **`409` significa "espera"**, no "falla". Hay un intento en vuelo para ese `event_id`. Reintenta con backoff:
   normalmente el intento anterior termina en segundos y recibes `200 idempotent`. Si el proceso anterior murió,
   el desbloqueo duro llega a los **90 s**.

5. **No cambies el payload de un `event_id` ya enviado.** Un reintento reescribe la fila con lo que mandes, pero
   GoHighLevel sigue deduplicando por el intento original y acabará mandando el importe **realmente cobrado**. Si
   de verdad cambian las unidades, es otro hecho facturable: usa un `event_id` nuevo.

6. **No mandes `price` si la tarifa es fija.** Devuelve `400`. Consulta el tipo en `GET /api/v1/meters`.

7. **Cobra DESPUÉS de entregar el servicio**, o comprueba fondos antes. Si cobras antes y tu proceso falla,
   tendrás que reembolsar; si entregas primero y el cobro falla, ya sabes qué reintentar.

### Reintento correcto (JavaScript)

```js
const BASE = 'https://apps-propias-marketplace.f7m8z2.easypanel.host'
const KEY  = process.env.MD_API_KEY

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function cobrar({ locationId, meter, units, eventId, price, description }) {
  const body = { location_id: locationId, meter, units, event_id: eventId, price, description }

  for (let intento = 0; intento < 5; intento++) {
    let res, data
    try {
      res = await fetch(`${BASE}/api/v1/charges`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(35_000),
      })
      data = await res.json().catch(() => ({}))
    } catch {
      await sleep(2000 * (intento + 1)); continue          // red/timeout → MISMO event_id
    }

    if (res.status === 201 || res.status === 200) return data.charge   // cobrado (o ya lo estaba)
    if ([409, 429, 502, 503].includes(res.status)) {                   // transitorio → MISMO event_id
      await sleep(2000 * (intento + 1)); continue
    }
    throw new Error(`Cobro rechazado (${res.status}): ${data.error}`)  // 400/403/404 → error de tu petición
  }
  // Sin confirmación tras los reintentos: NO vuelvas a cobrar con otro event_id.
  // El reconciliador lo resolverá solo; consúltalo luego con GET /api/v1/charges?event_id=...
  throw new Error('Cobro sin confirmar; se reconciliará automáticamente')
}
```

---

## 4. Resto de endpoints

### ¿Tiene fondos esta subcuenta?

```http
GET /api/v1/locations/:locationId/has-funds
→ 200 { "hasFunds": true, "credit": 12.5, "wallet_has_funds": null }
```

`credit` es el saldo interno (se gasta **antes** que el wallet). Si `credit > 0`, `hasFunds` es `true` sin
preguntar a GHL y `wallet_has_funds` viene a `null`. Errores: `404` no conectada · `409` conexión caída ·
`502` GHL no respondió.

**No reserva nada:** el saldo lo comparten todas las apps del marketplace, así que entre tu comprobación y tu
cobro otro puede haberlo consumido. Úsalo como semáforo previo, nunca como garantía.

### ¿Esta subcuenta tiene acceso/suscripción a MI app?

```http
GET /api/v1/access/:locationId
→ { "access": true, "via": "plan", "plan": "Pack Disruptivo", "status": "active",
    "starts_at": "…", "ends_at": null, "subscription_id": 3, "credit": 12.5 }
→ { "access": false, "credit": 0 }
```

Úsalo si vendes por suscripción: el administrador da o corta el acceso desde el panel y tu app se entera sola.
`status` puede ser `trial`, `active` o `comped` (cortesía). `ends_at: null` = sin caducidad.

### Historial de tus cobros

```http
GET /api/v1/charges?location_id=…&event_id=…&status=…&limit=50&offset=0
→ { "charges": [ {…}, … ] }
```

`limit` entre 1 y 200 (por defecto 50). Filtra por `event_id` para saber cómo acabó un cobro dudoso.

### Reembolsar un cobro tuyo

```http
DELETE /api/v1/charges/:id
→ { "charge": { …, "status": "refunded" } }
```

Solo cargos de tu propia app y en estado cobrable. Devuelve el dinero al wallet (o el saldo al crédito interno).

### Tarifas y subcuentas disponibles

```http
GET /api/v1/meters     → { "meters": [ { "code", "name", "unit_label", "price_type", "default_price", "min_price", "max_price" } ] }
GET /api/v1/locations  → { "locations": [ { "location_id", "name", "test_mode", "status" } ] }
```

---

## 5. Modo prueba (desarrollo sin gastar dinero)

El administrador puede activar el modo prueba a tres niveles: **global**, **por subcuenta** o **por app**. Con
cualquiera activo, tus cobros se registran con `status: "test"` y **no tocan el wallet ni el crédito**. La
respuesta trae `test_mode: true`.

Pídele al administrador que active el modo prueba de tu app mientras integras, y que lo desactive al pasar a producción.

---

## 6. Límites y detalles operativos

- **Rate limit:** 600 peticiones/min por API key (configurable). Respuesta `429` y cabecera `X-RateLimit-Remaining`
  en todas las respuestas.
- **Aislamiento:** con tu API key solo ves tus cargos; `GET /api/v1/charges` filtra por tu app siempre.
- **Alcance por subcuenta:** el administrador puede limitar tu clave a subcuentas concretas. Fuera de esa lista
  recibes `403` y `GET /api/v1/locations` solo lista las permitidas.
- **Reconciliación automática:** un proceso en segundo plano revisa cada 60 s los cargos `unknown` (>3 min) y los
  `pending` huérfanos (>10 min), pregunta a GHL y los cierra correctamente. Por eso un cobro "sin confirmar"
  nunca se pierde ni se duplica: consúltalo más tarde por `event_id`.
- **Rotación de claves:** si la clave se filtra, el administrador la regenera en el panel y la anterior deja de
  funcionar al instante (`401`). Guárdala en una variable de entorno, nunca en el repositorio.

---

## 7. Checklist antes de dar por integrada tu app

- [ ] La clave vive en una variable de entorno, no en el código.
- [ ] Cada operación cobrable tiene un `event_id` único y reproducible.
- [ ] Tratas `200` y `201` como éxito.
- [ ] Reintentas `409/429/502/503`/timeout **con el mismo `event_id`** y con backoff.
- [ ] Los errores `400/403/404` los tratas como bug de tu petición, no los reintentas en bucle.
- [ ] Probaste el flujo completo con el **modo prueba** activado.
- [ ] Probaste un cobro real pequeño y lo viste en el panel → **Cobros**.
- [ ] Si vendes por suscripción, tu app consulta `GET /api/v1/access/:locationId`.
