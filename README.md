# Marketplace Disruptivo

El centro de apps del **Departamento Disruptivo**: **tienda pública** de tus apps para GoHighLevel (con fotos/vídeos, reseñas, precios y link de instalación) + **wallet** que las cobra del saldo nativo de GHL + **gestión de accesos y suscripciones** (das acceso por meses aunque paguen por fuera, cortas si no pagan, planes con prueba gratis) + **avisos**. Todo centralizado, y por API tus apps se conectan aquí para consumir el wallet y preguntar si una subcuenta tiene acceso.

```
                         ┌───────────────── Marketplace Disruptivo ─────────────────┐
  Visitante ──▶ Tienda pública (/tienda)                                            │
  Tus apps  ──API key──▶  /api/v1/charges  (cobra del wallet)                        │
            └─────────▶  /api/v1/access    (¿esta subcuenta tiene acceso?)           │
                         Admin: apps+vitrina, planes, suscripciones, cobros, avisos  │
                         └─ OAuth ──▶ Wallet de GHL (subcuenta) · ledger local ──────┘
```

**Cómo llega el dinero:** GHL descuenta del wallet del cliente y liquida al developer vía **Tipalti el día 15 de cada mes** (comisión 0% hasta el 31/12/2026). Esta app centraliza y contabiliza; GHL cobra y te paga.

## Módulos
- **Tienda** (`/tienda`, pública): vitrina de apps con media, estrellas/reseñas, precio, badges «Nuevo»/«Próximamente» y botón «Instalar en GoHighLevel».
- **Wallet**: cobra del wallet de GHL por uso (meters), reconciliación, reembolsos. (ver «API para tus apps»)
- **Accesos y suscripciones**: da acceso de una subcuenta a una app o plan, por meses o indefinido, de pago/prueba/cortesía. Tus apps preguntan con `GET /api/v1/access/<locationId>`.
- **Planes**: bundles de apps con días de prueba y duración.
- **Usuarios y portal**: creas clientes con **login propio** (email+contraseña, aunque no estén en GHL), les asignas subcuentas, y cada uno entra a **su portal** donde ve **su** consumo (gasto por app, histórico), sus accesos activos y los avisos. Tú (admin) ves el de todos.
- **Créditos**: saldo interno por subcuenta que tú concedes (promo, compensación, prepago). Los cobros lo consumen **antes** de tocar el wallet de GHL; si no cubre el importe, ese cobro va al wallet. Ledger auditable de cada movimiento.
- **Avisos**: comunicados internos, banners en la tienda y en el portal del cliente.

## Créditos: cómo se contabilizan
Un cargo guarda con qué se pagó (`paid_with`: `wallet` | `credit`). **«Facturado» en el dashboard = solo `wallet`** (dinero real que cobra GHL); lo cubierto con crédito se muestra aparte para no inflar los ingresos. `GET /api/v1/access/:loc` y `has-funds` incluyen el saldo, así que una app con crédito disponible sabe que puede operar aunque el wallet esté a 0. El crédito solo se aplica a cargos **nuevos**: un reintento pasa por GHL para conservar la deduplicación por `eventId`.

## Roles y acceso
- **Super-admin**: entra con `ADMIN_USER`/`ADMIN_PASS` (o SSO de GHL) → panel completo.
- **Usuarios de tabla** (creados en el panel → Usuarios): entran con su email+contraseña. Rol `admin` (ve todo) o `user` (ve solo sus subcuentas, en el portal). Las sesiones se **revalidan contra la BD** en cada petición: degradar/desactivar/borrar a un usuario surte efecto al instante.

## Stack

Node 22 + Fastify + Postgres + Redis, panel React (Vite + Tailwind v4). Un solo contenedor Docker.

## Despliegue en EasyPanel

1. Crea 3 servicios en un proyecto:
   - **disruptivo-wallet-db** → Postgres 17 (guarda la contraseña)
   - **disruptivo-wallet-redis** → Redis 7
   - **wallet** → App desde este repo de GitHub (build con Dockerfile)
2. Variables de entorno del servicio **wallet** (ver `.env.example`):

| Variable | Valor |
|---|---|
| `PORT` | `8080` |
| `DATABASE_URL` | `postgres://postgres:<pass>@disruptivo-wallet-db:5432/disruptivo_wallet` |
| `REDIS_URL` | `redis://disruptivo-wallet-redis:6379` |
| `ADMIN_USER` / `ADMIN_PASS` | login del panel |
| `APP_BASE_URL` | URL pública, p. ej. `https://wallet.escaladoacelerado.es` |

3. Apunta el dominio al puerto 8080. Las migraciones corren solas al arrancar.
4. Health check para EasyPanel/Docker: `GET /healthz` (verifica Postgres + Redis; 200 si todo OK, 503 si no). El Dockerfile ya trae su `HEALTHCHECK`.

### Autohospedaje / local con Docker Compose

Como alternativa a los 3 servicios de EasyPanel: copia `.env.example` a `.env`, define `ADMIN_PASS` y `POSTGRES_PASSWORD`, y `docker compose up -d` — levanta Postgres, Redis y la app juntos.

## Configurar la app del marketplace de GHL

Los cobros al wallet **exigen una app del marketplace** (un PIT no puede crear cargos):

1. En [marketplace.gohighlevel.com](https://marketplace.gohighlevel.com) crea (o reutiliza) una app con:
   - Distribution: **Sub-Account**
   - Scopes: `charges.write`, `charges.readonly`, `oauth.readonly`, `locations.readonly`
   - Redirect URL: `https://<tu-dominio>/api/oauth/callback` (la ruta no lleva referencias a GHL; el marketplace las rechaza)
2. En **App → Pricing → Billing Meters** crea tus meters (tipo *Custom Event (API)*): unidad, precio por defecto y, si quieres precio variable, tipo *Dynamic* con mínimo/máximo. **Ahí es donde defines tu margen.**
3. En el panel de Disruptivo Wallet → **Configuración** pega `client_id`, `client_secret` y `app_id`.
4. En **Tarifas** registra cada meter con su `meterId` de GHL y un código corto (p. ej. `mensajes-ia`).
5. En **Conexiones → Conectar subcuenta** instala la app en cada subcuenta cliente (OAuth). Con eso ya se le puede cobrar.

> El wallet del cliente se recarga solo (auto-recharge nativo de GHL con su tarjeta): el cliente no gestiona ningún saldo externo. Con el rebilling de agencia activado paga el wallet de la subcuenta; sin él, el de la agencia.

## Auto-login por SSO de GHL (entrar sin contraseña) + snapshot

El panel puede abrirse **embebido dentro de GHL** y autenticar al usuario **automáticamente**, sin pantalla de login. GHL entrega la identidad del usuario **cifrada** (no viaja por la URL, no se puede falsificar) y el panel la canjea por sesión.

**Por qué es seguro (y por qué solo por Custom Page):** este panel maneja dinero, así que el auto-login **solo** confía en el contexto cifrado que GHL envía por `postMessage` desde una **Custom Page** de la app del marketplace. Los *Custom Menu Link* pasan la identidad como parámetros de URL **falsificables**, así que **no** conceden acceso por sí solos. Además, solo entra quien esté **autorizado**; el resto ve la pantalla de login normal.

**Configuración (una vez):**
1. En tu app del marketplace → **Advanced Settings → SSO**, genera el **Shared Secret**.
2. En el panel → **Configuración → Auto-login por SSO**: pega el Shared Secret y copia la **Custom Page URL** (es la raíz del panel).
3. En la app del marketplace añade una **Custom Page** con esa URL.
4. En **Configuración → Auto-login por SSO** define quién entra: tu **Company ID de agencia** (el de arriba entra solo) y/o una **lista de correos**. Si no configuras nada, el SSO queda **desactivado** (fail-closed).

**Meterlo en un snapshot:** en una subcuenta crea un **Custom Menu Link** que apunte a la Custom Page URL e inclúyelo en tu snapshot; al cargar el snapshot en otras subcuentas, el acceso aparece solo. El menu link es solo el atajo para abrir el panel — el **auto-login seguro ocurre por la Custom Page** (identidad cifrada), no por el menu link. *(GHL no permite empujar la Custom Page de una app vía API de snapshots a subcuentas existentes; el snapshot solo transporta el menu link, y la Custom Page llega al instalar la app.)*

## API para tus apps

Autenticación: header `Authorization: Bearer dw_…` (o `X-Api-Key`). Las claves se crean en el panel → **Apps** y solo se muestran una vez.

### Cobrar

```bash
curl -X POST https://wallet.tudominio.com/api/v1/charges \
  -H "Authorization: Bearer dw_..." \
  -H "Content-Type: application/json" \
  -d '{
    "location_id": "ewGlt5YqA8PHR1qJWLhC",
    "meter": "mensajes-ia",
    "units": 3,
    "event_id": "hermes-conv842-lote7",
    "description": "3 mensajes de IA",
    "price": 0.015
  }'
```

- `event_id` es tu identificador único → **idempotencia**: repetir la llamada no duplica el cargo (los fallidos sí se reintentan).
- `price` solo se admite si la tarifa es dinámica, y se valida contra su mínimo/máximo.
- Respuesta `201`: `{ "test_mode": false, "charge": { "id", "status": "created", "ghl_charge_id", "amount", … } }`
- Si GHL **rechaza** el cargo (4xx): `502` y el cargo queda `failed` → reintenta con el mismo `event_id`.
- Si GHL **no confirma** (timeout/red): el cargo queda `unknown` → reintenta con el mismo `event_id`; el gateway consulta primero en GHL si el intento anterior llegó a cobrarse (**reconciliación**) y solo re-ejecuta si GHL confirma que no.

Estados del cargo: `pending` (en vuelo) · `created` (cobrado) · `test` · `failed` (GHL lo rechazó, reintentable) · `unknown` (sin confirmación, se reconcilia al reintentar) · `refunded`.

**Reconciliación automática:** un proceso en segundo plano (cada 60 s) sana los cargos que quedan `unknown` (>3 min) o `pending` huérfanos (>10 min): consulta en GHL si el `eventId` se cobró y, **solo si lo confirma**, los promueve a `created`. Regla de oro anti-doble-cobro: el reconciliador **nunca** marca `failed` por una ausencia en GHL (la lista de GHL no es autoritativa por consistencia eventual); un cargo que sigue sin confirmarse se deja `unknown` para que lo resuelva el reintento del consumidor o el admin. Con varias réplicas solo una barre por ciclo (lock en Redis con dueño único). También puedes reconciliar a mano desde el panel → Cobros → «Reconciliar».

**Límite de peticiones:** la API pública limita a `API_RATE_PER_MIN` (def. 600) peticiones/min por API key; devuelve `429` y la cabecera `X-RateLimit-Remaining`.

### Resto de endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/api/v1/locations/:locationId/has-funds` | ¿Tiene saldo el wallet? Compruébalo antes de servir. |
| `GET` | `/api/v1/charges?location_id=&status=&limit=` | Historial de cobros de tu app |
| `DELETE` | `/api/v1/charges/:id` | Reembolso (borra el cargo en GHL) |
| `GET` | `/api/v1/meters` | Tarifas activas |
| `GET` | `/api/v1/locations` | Subcuentas conectadas |
| `GET` | `/api/v1/access/:locationId` | ¿La subcuenta tiene acceso/suscripción vigente a **tu** app? Devuelve `{access, via, plan, status, ends_at}` |

**Control de acceso (SaaS):** tu app pregunta `GET /api/v1/access/<locationId>` al arrancar/atender y actúa según `access`. Los accesos se conceden desde el panel → **Suscripciones** (por meses, indefinido, prueba o cortesía) o vía **Planes**. Así puedes vender por suscripción, dar prueba gratis, o cortar el acceso si no pagan — sin tocar el código de la app.

### Modo prueba

Tres niveles (global en Configuración, por conexión, por app). En prueba el cobro se registra en el ledger con estado `test` y **no toca el wallet de GHL**. Útil porque GHL no tiene sandbox de billing.

## Desarrollo local

```bash
npm install && cd web && npm install && cd ..
# necesita un Postgres y un Redis (ajusta DATABASE_URL/REDIS_URL)
npm run dev            # API en :8080
cd web && npm run dev  # panel en :5173 con proxy a /api
npm test               # tests unitarios (funciones puras, sin BD)
```

## Notas de seguridad

- Las API keys se guardan hasheadas (SHA-256); solo se muestran al crearlas.
- **Alcance por app**: cada API key puede limitarse a ciertas subcuentas (panel → Apps → «Subcuentas»). Por defecto puede cobrar a todas.
- El OAuth usa `state` anti-CSRF cuando se inicia desde el panel. Para permitir que un cliente instale la app directamente desde GHL (sin pasar por el panel), configura el **Company ID** de tu agencia en Configuración — instalaciones de otras agencias se rechazan.
- Login del panel con límite de intentos (10 fallos / 15 min por IP). El endpoint SSO también va con rate-limit.
- **Auto-login SSO**: solo concede admin a **admins a nivel agencia** (`type=agency`, `role=admin`) de tu agencia o a los **correos** que autorices; nunca a usuarios de subcuenta. Fail-closed si no hay Shared Secret ni autorizados. La sesión SSO usa cookie `SameSite=None; Secure; Partitioned` (necesaria para el iframe de GHL). Riesgo residual conocido: replay de un blob cifrado filtrado (mitigado con rate-limit; requeriría además XSS/MITM del navegador de la víctima) — aceptado, igual que en Hermes.
- Los tokens OAuth de GHL se guardan en Postgres — mantén el repo y la base privados.
- El refresh de tokens es de un solo uso: está serializado con lock en Redis y con timeouts acotados.
- Cobros en USD (única moneda soportada por la Wallet Charges API).
