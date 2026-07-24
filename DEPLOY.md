# Puesta en marcha: EasyPanel + app del marketplace de GHL

Guía completa de cero a funcionando. Orden recomendado: **A** (desplegar) → **B** (app en GHL) →
**C** (conectar) → **D** (primer cobro) → **E** (extras: SSO, tienda, usuarios, créditos).

---

## A. Desplegar en EasyPanel

### A1. Crear el proyecto y los 3 servicios

En EasyPanel, crea un proyecto (p. ej. `marketplace`) y dentro **3 servicios**:

| Servicio | Tipo | Notas |
|---|---|---|
| `marketplace-db` | Postgres **17** | Guarda usuario, contraseña y nombre de BD que te genera |
| `marketplace-redis` | Redis **7** | Sin configuración especial |
| `marketplace` | App | Source: **GitHub** → `albinokeyt/marketplace-disruptivo`, rama `main`, Build: **Dockerfile** |

> Si pones el repo en **privado**, añade tu token de GitHub en EasyPanel (igual que hiciste con
> `publicador-html`) o el build no podrá clonar.

### A2. Variables de entorno del servicio `marketplace`

| Variable | Valor |
|---|---|
| `PORT` | `8080` |
| `DATABASE_URL` | `postgres://<user>:<pass>@<host-interno-db>:5432/<basedatos>` |
| `REDIS_URL` | `redis://<host-interno-redis>:6379` |
| `ADMIN_USER` | tu usuario de super-admin (p. ej. `admin`) |
| `ADMIN_PASS` | **contraseña larga y única** |
| `APP_BASE_URL` | `https://marketplace.tudominio.com` — **sin barra final** |
| `API_RATE_PER_MIN` | *(opcional)* `600` |

El **host interno** de Postgres/Redis te lo muestra EasyPanel en cada servicio (suele ser el nombre
del servicio). Copia la cadena de conexión que te da y ajusta el resto.

### A3. Dominio y despliegue

1. En el servicio `marketplace` → **Domains**: añade tu dominio apuntando al **puerto 8080** y activa HTTPS.
2. Pulsa **Deploy**. El primer build tarda unos minutos (compila el panel React).
3. Las **migraciones (001→004) corren solas** al arrancar. No tienes que ejecutar nada.

### A4. Comprobar que está vivo

Abre `https://tudominio/healthz` → debe responder:

```json
{ "ok": true, "db": true, "redis": true }
```

Si `db` o `redis` salen en `false`, revisa `DATABASE_URL` / `REDIS_URL` (el arranque falla a propósito
si Redis no responde: mira los logs del servicio).

### A5. Primer login

Entra en `https://tudominio/` con `ADMIN_USER` y `ADMIN_PASS`. Ya estás en el panel.

---

## B. Crear la app en el marketplace de GoHighLevel

Los cobros al wallet **exigen una app del marketplace**. Un Private Integration Token (PIT) **no**
puede crear cargos.

### B1. Crear la app

En [marketplace.gohighlevel.com](https://marketplace.gohighlevel.com) → **My Apps → Create App**:

- **Distribution Type**: `Sub-Account` (¡es inmutable después!)
- **Scopes**: `charges.write`, `charges.readonly`, `oauth.readonly`, `locations.readonly`
- **Redirect URL**: `https://tudominio/api/oauth/callback`

> La ruta no lleva la palabra "ghl" a propósito: el marketplace rechaza redirect URLs que
> referencian a HighLevel.

Apunta el **Client ID**, el **Client Secret** y el **App ID**.

### B2. Crear los Billing Meters (aquí defines tu margen)

En la app → **Pricing → Billing Meters** → *Create Meter*:

- **Module Type**: `Custom Event (API)`
- **Unit**: la unidad que cobras (mensaje, minuto, informe…)
- **Price Type**: `Fixed` (precio único) o `Dynamic` (con **Minimum** y **Maximum**, si el coste varía)
- **Default Price per Unit**: tu precio al cliente (tu coste + tu margen)

Copia el **meterId** que te genera (aparece en la página de pricing de la app).

> ⚠️ **Sin documentar por GHL**: no está publicado si una app **privada** puede usar billing meters.
> Antes de montar todo encima, valida con un cargo de prueba real (paso D). Si no funciona en
> privada, publica la app (review ~10 días hábiles).

### B3. Cobro y payouts

GHL cobra al wallet del cliente y te liquida a ti vía **Tipalti**, el **día 15** de cada mes por lo
del mes anterior. Comisión **0% hasta el 31/12/2026** (presupuesta ~15% a partir de 2027).

---

## C. Conectar el marketplace con GHL

### C1. Credenciales

Panel → **Configuración → App del marketplace de GHL**:

- `Client ID`, `Client Secret`, `App ID` (de B1)
- `Company ID`: el ID de tu agencia (recomendado — habilita el auto-login por SSO de tu agencia y
  sirve de respaldo al cobrar)

Guarda. En esa misma pantalla verás la **Redirect URL** exacta para pegar en GHL, por si acaso.

### C2. Registrar tus tarifas

Panel → **Tarifas → Nueva tarifa**:

- **Código**: alias corto que usarán tus apps (p. ej. `mensajes-ia`)
- **Meter ID de GHL**: el de B2
- **Nombre**, **Unidad**, **Tipo de precio** y **Precio por defecto** — deben **coincidir con el meter de GHL**

### C3. Conectar la primera subcuenta

Panel → **Conexiones → Conectar subcuenta**. Se abre el OAuth de GHL: eliges la subcuenta e instalas.
Al volver, aparecerá en la lista como *Conectada*. Repite por cada cliente.

Puedes pulsar **Comprobar** en la columna *Saldo* para ver si su wallet tiene fondos.

---

## D. Primer cobro (probar sin gastar dinero)

### D1. Crear la app consumidora y su API key

Panel → **Apps → Nueva app** (p. ej. `Hermes Setter`). Se genera una **API key** que **solo se
muestra una vez** — guárdala.

Opcional pero recomendado: pulsa **Todas/Subcuentas** y limita a qué subcuentas puede cobrar esa key.

### D2. Cobro en modo prueba

Activa **Configuración → Modo prueba global** (o el toggle de esa app). En modo prueba el cargo se
registra en el ledger con estado `test` y **no toca el wallet de GHL**.

```bash
curl -X POST https://tudominio/api/v1/charges \
  -H "Authorization: Bearer dw_TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"location_id":"<locationId>","meter":"mensajes-ia","units":3,"event_id":"prueba-1"}'
```

Compruébalo en **Cobros**. Repite la misma llamada: debe responder `idempotent: true` sin duplicar.

### D3. Cobro real

Desactiva el modo prueba y repite con otro `event_id`. El cargo debe quedar en `created` y aparecer
también en el wallet de esa subcuenta dentro de GHL.

**Estados**: `pending` (en vuelo) · `created` (cobrado) · `test` · `failed` (GHL lo rechazó,
reintentable) · `unknown` (sin confirmación — se reconcilia solo) · `refunded`.

### D4. Conectar tus apps de verdad

En tu app (p. ej. Hermes), en el punto donde ocurre lo cobrable:

```
POST /api/v1/charges     → cobra  { location_id, meter, units, event_id, price? }
GET  /api/v1/access/:loc → ¿tiene suscripción/acceso vigente? (+ saldo de crédito)
GET  /api/v1/locations/:loc/has-funds → ¿puede pagar? (crédito o wallet)
```

Regla de oro: el `event_id` debe ser **único y estable por operación** (p. ej.
`conv842-lote7`). Es lo que garantiza que un reintento nunca cobre dos veces.

---

## E. Extras

### E1. Auto-login por SSO (entrar sin contraseña desde GHL)

1. En la app del marketplace → **Advanced Settings → SSO**: genera el **Shared Secret**.
2. Panel → **Configuración → Auto-login por SSO**: pega el secret y copia la **Custom Page URL**.
3. En la app del marketplace → añade una **Custom Page** con esa URL.
4. En esa misma sección define quién entra: tu **Company ID** (ya entra solo) y/o correos concretos.

Solo la **Custom Page** entrega la identidad cifrada. Un *Custom Menu Link* pasa la identidad por URL
(falsificable) y **no** concede acceso por sí solo.

**Snapshot**: crea en una subcuenta un *Custom Menu Link* apuntando a la Custom Page URL e inclúyelo
en tu snapshot; así el acceso aparece solo al cargarlo en otras subcuentas.

### E2. Publicar la tienda

Panel → **Apps → Vitrina** de cada app: gancho, precio, descripción, características, **fotos/vídeos**
(imagen, mp4 o YouTube), **link de instalación** y etiqueta **Nuevo / Próximamente**. Activa
*Publicada en la tienda*. Añade **reseñas** si las tienes.

La tienda pública queda en `https://tudominio/tienda` (sin login).

### E3. Clientes con su propio portal

Panel → **Usuarios → Nuevo usuario**: email + contraseña (se genera y **se muestra una vez**), rol
`user`, y marca **sus subcuentas**. Ese cliente entra por la misma pantalla de login con su email y
ve **su** portal: su consumo, sus accesos y los avisos. Rol `admin` para tu equipo.

### E4. Accesos, planes y créditos

- **Suscripciones**: das acceso de una subcuenta a una app o plan, por meses o indefinido
  (pago/prueba/cortesía). *Prorrogar* **suma** al tiempo restante; *Cortar* revoca.
- **Planes**: bundles de apps con días de prueba y duración.
- **Créditos**: das saldo interno a una subcuenta; los cobros lo consumen **antes** del wallet. Si no
  cubre el importe, ese cobro va al wallet.
- **Avisos**: comunicados internos, banner en la tienda y en el portal del cliente.

---

## Resolución de problemas

| Síntoma | Causa probable |
|---|---|
| El contenedor no arranca | `DATABASE_URL`/`REDIS_URL` mal, o `ADMIN_PASS` sin definir (el login queda deshabilitado; mira los logs) |
| `/healthz` devuelve 503 | Postgres o Redis inaccesibles desde el contenedor |
| El OAuth falla | `APP_BASE_URL` con barra final o distinta del dominio real; Redirect URL distinta en GHL |
| «Instalación no autorizada» al conectar | Inicia la conexión **desde el panel**, o configura tu `Company ID` para permitir instalaciones directas |
| Cobro `failed` con "Falta el app_id" | Falta el **App ID** en Configuración |
| Cobro `failed` con "no tiene companyId" | Reconecta esa subcuenta (o define `Company ID`) |
| Cargos en `unknown` | GHL no confirmó; se reconcilian solos cada 60 s (o botón **Reconciliar**) |
| El cliente no entra por SSO | Falta el Shared Secret, o no es una **Custom Page**, o su usuario no está autorizado |

## Seguridad

- Pon el repo en **privado** cuando puedas.
- `ADMIN_PASS` largo y único; el login tiene límite de 10 intentos / 15 min por IP.
- Las API keys se guardan hasheadas y solo se ven al crearlas: si se filtra una, **Regenerar**.
- Los tokens OAuth de GHL viven en tu Postgres: protege las copias de seguridad.
