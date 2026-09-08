export default {
  slug: 'marketplace-admin',
  app: 'Marketplace Disruptivo · Administrador',
  titulo: 'Manual del administrador de Marketplace Disruptivo',
  subtitulo: 'Cómo funciona el marketplace por dentro y cómo se gestiona desde el panel: configuración, conexiones, apps, tarifas, planes, suscripciones, créditos, cobros, avisos, usuarios y tienda. Paso a paso.',
  version: 'Versión 1.0 · septiembre 2026',
  color: '#b8902a',
  secciones: [
    {
      id: 'que-es', titulo: 'Qué es Marketplace Disruptivo y cómo entrar', html: `
<p><b>Marketplace Disruptivo</b> es la tienda de apps de la agencia para GoHighLevel y, a la vez, el sistema que las cobra. Tiene cuatro piezas:</p>
<table><tr><th>Pieza</th><th>Quién la usa</th><th>Qué hace</th></tr>
<tr><td><b>Tienda pública</b> (<code>/tienda</code>)</td><td>Cualquiera</td><td>Escaparate de las apps: descripción, capturas, precio, planes, manual y botón de instalación.</td></tr>
<tr><td><b>Portal del cliente</b></td><td>Cada subcuenta</td><td>Se abre dentro de GoHighLevel (Custom Page). El cliente ve su saldo, recarga, contrata planes y consulta sus accesos y consumo.</td></tr>
<tr><td><b>Panel de administración</b></td><td>Tú</td><td>Todo lo que explica este manual.</td></tr>
<tr><td><b>API pública</b> (<code>/api/v1</code>)</td><td>Las apps</td><td>Las apps preguntan si una subcuenta tiene acceso y, las de pago por uso, cobran contra su saldo.</td></tr>
</table>
<h3>Cómo se cobra: dos modelos que conviven</h3>
<ul class="check">
  <li><b>Por uso:</b> la app cobra cada vez que el cliente consume (por ejemplo Hermes: 0,25 USD por conversación y día). El importe sale del saldo del cliente.</li>
  <li><b>Por suscripción:</b> el marketplace cobra un plan cada mes (por ejemplo Emails Disruptivo · Pro, 29 USD/mes) y renueva el acceso solo. La app no cobra nada: solo pregunta si hay acceso.</li>
</ul>
<p>En los dos casos el dinero sale del <b>saldo del cliente</b>: primero de su <b>crédito interno</b> (recargas y regalos) y, si no llega, de su <b>wallet de GoHighLevel</b>, a través de los billing meters de tu app del marketplace de GHL.</p>
<h3>Cómo entrar al panel</h3>
<ol class="pasos">
  <li>Abre <code>https://marketplace.escaladoacelerado.es</code> y entra con tu usuario y contraseña de administrador.</li>
  <li>También puedes entrar sin contraseña desde GoHighLevel: abre <span class="ruta">Aplicaciones del mercado → Marketplace Disruptivo</span> en cualquier subcuenta. Si tu agencia o tu correo están autorizados en Configuración → SSO, verás el panel de administración; un cliente vería su portal.</li>
  <li>El menú lateral: Dashboard, Apps, Planes, Suscripciones, Usuarios, Créditos, Cobros, Tarifas, Conexiones, Avisos y Configuración. Arriba, el enlace a la Tienda y a este manual.</li>
</ol>
<figure><img data-src="mk-admin-dashboard-pub.png" alt="Dashboard"><figcaption>El Dashboard: facturación, cobros recientes y estado general.</figcaption></figure>
<div class="nota"><b>Orden recomendado la primera vez:</b> Configuración → Tarifas → Conexiones → Apps → Planes → Suscripciones. Después, el día a día es Suscripciones, Créditos y Cobros.</div>`
    },
    {
      id: 'config', titulo: 'Paso 1 · Configuración inicial (una sola vez)', html: `
<p>Todo esto ya está hecho en la instalación actual. Lo dejamos documentado para que sepas qué es cada cosa y puedas cambiarla.</p>
<h3>App del marketplace de GHL</h3>
<p>Los cobros al wallet exigen una app registrada en el marketplace de GoHighLevel con los permisos <code>charges.write</code> y <code>charges.readonly</code>. Aquí van su <b>Client ID</b>, <b>Client Secret</b>, <b>App ID</b> y el <b>Company ID</b> de la agencia. La <b>Redirect URL</b> que muestra el panel es la que se pega en la app de GHL.</p>
<h3>Auto-login por SSO</h3>
<ol class="pasos">
  <li><b>SSO Shared Secret:</b> se genera en la app de GHL (Advanced Settings → SSO) y se pega aquí.</li>
  <li><b>Custom Page URL:</b> la raíz del panel; se añade en la app de GHL como Custom Page. Es lo que hace que el marketplace aparezca en el menú de cada subcuenta.</li>
  <li><b>ID de la Custom Page:</b> el id que aparece en la URL al abrir el marketplace dentro de una subcuenta (…/custom-page-link/&lt;id&gt;). Las apps lo usan para enlazar al portal del cliente.</li>
  <li><b>Company IDs y correos autorizados:</b> quién entra como administrador por SSO. Cualquier otra persona que abra la página desde una subcuenta verá el portal de cliente de esa subcuenta.</li>
</ol>
<h3>Recargas de saldo desde el wallet</h3>
<p>Activadas o no, código de la tarifa de recarga (<code>recarga-saldo</code>, fija 1,00 USD por unidad), importes sugeridos y mínimo/máximo. Con esto el cliente pulsa «Recargar» en su portal, se le cobra del wallet y recibe el mismo importe como crédito.</p>
<h3>Cobro de suscripciones</h3>
<p>Interruptor del cobro automático, código de la tarifa (<code>suscripcion</code>), <b>días de gracia</b> tras un impago (3 por defecto) y <b>reintentos diarios</b> antes de marcar la suscripción como impagada (10 por defecto).</p>
<h3>Modo prueba global</h3>
<p>Registra todos los cobros como prueba, sin tocar ningún wallet. Úsalo solo para ensayar. Hay modos de prueba más finos por conexión y por app.</p>
<figure><img data-src="mk-admin-config-1-pub.png" alt="Configuración"><figcaption>Configuración: app de GHL y OAuth.</figcaption></figure>
<figure><img data-src="mk-admin-config-3-pub.png" alt="Recargas y suscripciones"><figcaption>Configuración: recargas y cobro de suscripciones (gracia y reintentos).</figcaption></figure>
<h3>Tarifas (billing meters)</h3>
<p>Una <b>tarifa</b> es un billing meter creado en tu app del marketplace de GHL. Aquí se registran con su código, su id de GHL, su tipo (<b>fija</b>: precio por unidad; <b>dinámica</b>: la app decide el precio dentro de un rango) y si está activa. Hoy hay tres: <code>recarga-saldo</code> (fija 1,00), <code>consumo-apps</code> (dinámica, para el pago por uso) y <code>suscripcion</code> (fija 1,00, para los planes). Para añadir una: crea el meter en GHL, copia su id y pulsa <span class="ruta">Nueva tarifa</span>.</p>
<figure><img data-src="mk-admin-tarifas-pub.png" alt="Tarifas"><figcaption>Tarifas registradas y el formulario de nueva tarifa.</figcaption></figure>`
    },
    {
      id: 'conexiones', titulo: 'Paso 2 · Conexiones: instalar el marketplace en las subcuentas', html: `
<p>Una <b>conexión</b> es una subcuenta de GoHighLevel con Marketplace Disruptivo instalado. Sin conexión no se puede cobrar a su wallet (sí se le pueden dar pruebas y cortesías).</p>
<ol class="pasos">
  <li>Ve a <span class="ruta">Conexiones</span> y pulsa <span class="ruta">Conectar subcuenta</span>. Te lleva a GoHighLevel: elige la subcuenta y autoriza la app. Al volver aparece como <b>Conectada</b>.</li>
  <li>Otra forma: instala la app directamente desde GoHighLevel con el <b>enlace de instalación</b> que tienes en <span class="ruta">Apps → Marketplace Disruptivo → Vitrina → Link de instalación</span>. Es lo que harás para los clientes: abres el enlace, eliges su subcuenta y autorizas.</li>
  <li>Tras instalarla, la subcuenta ve <b>Marketplace Disruptivo</b> en su menú de Aplicaciones del mercado y su portal funciona con SSO.</li>
  <li>En cada fila puedes poner un <b>alias</b> (el nombre que verás en todo el panel), activar el <b>modo prueba</b> de esa conexión (sus cobros no tocan el wallet) y abrir <span class="ruta">Ver como cliente</span>.</li>
  <li><b>Desconectar</b> elimina la conexión; el cliente deja de poder pagar hasta reinstalar.</li>
</ol>
<figure><img data-src="mk-admin-conexiones-pub.png" alt="Conexiones"><figcaption>Conexiones: subcuentas conectadas, alias, modo prueba y Ver como cliente.</figcaption></figure>
<h3>Ver como cliente</h3>
<p>Abre el portal exactamente como lo ve esa subcuenta, en solo lectura: puedes comprobar qué accesos, saldo y planes ve, pero los botones de recargar y contratar están desactivados para que no cobres nada por error. Arriba puedes cambiar de subcuenta y volver al panel.</p>
<figure><img data-src="mk-admin-como-cliente-pub.png" alt="Ver como cliente"><figcaption>Ver como cliente: el portal de una subcuenta en solo lectura.</figcaption></figure>
<div class="ojo"><b>La tienda no muestra Marketplace Disruptivo a propósito.</b> Lo instalas tú en cada subcuenta con el enlace de la vitrina; los clientes no lo instalan por su cuenta.</div>`
    },
    {
      id: 'apps', titulo: 'Paso 3 · Apps: registrar una app y su vitrina', html: `
<h3>Registrar una app consumidora</h3>
<ol class="pasos">
  <li>Ve a <span class="ruta">Apps</span> y pulsa <span class="ruta">Nueva app</span>. Escribe su nombre y pulsa <b>Crear y generar API key</b>.</li>
  <li>Copia la <b>API key</b> en ese momento: no se vuelve a mostrar. Se la entregas al desarrollador junto con la guía de integración (<code>https://marketplace.escaladoacelerado.es/guia</code>).</li>
  <li>En la fila de la app tienes los interruptores que mandan sobre ella:
    <ul class="check">
      <li><b>Puede cobrar:</b> si lo apagas, la app deja de poder cobrar (recibe un error claro) pero sigue consultando accesos. Es el freno de emergencia.</li>
      <li><b>Modo prueba:</b> sus cobros se registran como prueba, sin tocar wallets. Úsalo mientras el desarrollador integra. Ojo: también afecta a las renovaciones de suscripción de esa app.</li>
      <li><b>Subcuentas a las que puede cobrar:</b> por defecto todas; puedes limitarla a una lista.</li>
      <li><b>Regenerar API key:</b> invalida la anterior al instante.</li>
      <li><b>Estado:</b> activa o revocada.</li>
    </ul>
  </li>
</ol>
<figure><img data-src="mk-admin-apps-pub.png" alt="Apps"><figcaption>Apps: cada app con su estado, interruptores, vitrina y consumo acumulado.</figcaption></figure>
<h3>La vitrina (ficha en la tienda)</h3>
<ol class="pasos">
  <li>Pulsa <span class="ruta">Vitrina</span> (o «Publicada») en la fila de la app.</li>
  <li><b>Publicada en la tienda:</b> si está apagado, la app no aparece en la tienda (así está Marketplace Disruptivo).</li>
  <li><b>Gancho</b> (una línea), <b>Precio (texto)</b> de escaparate, <b>Slug</b> (la URL de la ficha), <b>Etiqueta</b> (Nuevo / Próximamente).</li>
  <li><b>Link de instalación en GHL:</b> el enlace del botón «Instalar». Cada desarrollador te dice cuál usar.</li>
  <li><b>Descripción</b> y <b>Características</b> (una por línea).</li>
  <li><b>Fotos y vídeos:</b> súbelos con «subir archivo» (PNG, JPG, WEBP, GIF, MP4, WEBM; 25 MB) o pega una URL. Ordénalos y bórralos desde la lista.</li>
  <li><b>Icono</b> (512×512), <b>Correo de soporte</b> y <b>Manual de uso (PDF)</b>: «subir PDF» crea el botón «Descargar manual» en la ficha y en el portal del cliente.</li>
  <li><b>Reseñas:</b> pega las reales de tus clientes (autor, estrellas, texto).</li>
  <li>Pulsa <span class="ruta">Guardar vitrina</span>.</li>
</ol>
<figure><img data-src="mk-admin-apps-vitrina-pub.png" alt="Vitrina"><figcaption>La vitrina de una app: textos, imágenes, icono, soporte y manual.</figcaption></figure>`
    },
    {
      id: 'planes', titulo: 'Paso 4 · Planes', html: `
<p>Un <b>plan</b> es un producto de suscripción: una o varias apps por un precio cada N meses. Los planes visibles con precio salen en la tienda y en el portal del cliente con el botón «Contratar con mi saldo».</p>
<ol class="pasos">
  <li>Ve a <span class="ruta">Planes</span> y pulsa <span class="ruta">Nuevo plan</span>.</li>
  <li><b>Nombre</b> (por ejemplo «Emails Disruptivo · Pro»), <b>Descripción</b> y <b>Texto de precio</b> de escaparate («29 USD/mes»).</li>
  <li><b>Precio</b> real en USD y <b>Periodo</b> en meses: es lo que se cobra en cada renovación.</li>
  <li><b>Apps incluidas:</b> una o varias. Un plan de una sola app se cobra en nombre de esa app (ella lo ve en su historial); un pack de varias lo firma la app interna del sistema.</li>
  <li><b>Días de prueba</b> y <b>Duración</b> (opcionales), <b>Visible</b> (en tienda y portal) y <b>Activo</b>.</li>
  <li>Pulsa <span class="ruta">Crear plan</span>. Un plan que ya tiene suscripciones no se puede borrar: desactívalo.</li>
</ol>
<figure><img data-src="mk-admin-planes-pub.png" alt="Planes"><figcaption>Planes: precio, periodo, apps incluidas, visible y activo.</figcaption></figure>
<div class="tip"><b>Plan oculto:</b> si lo dejas no visible, solo tú puedes activarlo a un cliente desde Suscripciones. Útil para precios negociados.</div>`
    },
    {
      id: 'suscripciones', titulo: 'Paso 5 · Suscripciones: dar, prorrogar y cortar accesos', html: `
<p>Una <b>suscripción</b> es el acceso de una subcuenta a una app o a un plan, con su estado y su fecha de fin. Las apps consultan esto en cada uso. Siempre son <b>por subcuenta</b>, nunca por usuario.</p>
<ol class="pasos">
  <li>Ve a <span class="ruta">Suscripciones</span> y pulsa <span class="ruta">Dar acceso</span>.</li>
  <li><b>Subcuenta:</b> escribe el location_id de GoHighLevel (o elígela si está conectada). No hace falta que esté conectada para pruebas y cortesías.</li>
  <li><b>App o plan</b> al que das acceso.</li>
  <li><b>Estado:</b> <b>Activa</b> (de pago), <b>Prueba</b> (gratis, con fin) o <b>Cortesía</b> (gratis, indefinida si quieres).</li>
  <li><b>Meses:</b> duración inicial. <b>Notas:</b> por ejemplo el nombre del cliente si la subcuenta no está conectada.</li>
  <li>Para una suscripción de pago: <b>Precio</b>, <b>Periodo</b>, <b>Renovación automática</b> y <b>Cobrar ahora</b> (cobra el primer periodo al momento). Sin renovación automática, el acceso simplemente caduca al vencer.</li>
  <li>Pulsa <span class="ruta">Conceder acceso</span>. La app lo ve en menos de 5 minutos.</li>
</ol>
<figure><img data-src="mk-admin-suscripciones-pub.png" alt="Suscripciones"><figcaption>Suscripciones: subcuenta, app o plan, estado, vencimiento y renovación.</figcaption></figure>
<figure><img data-src="mk-admin-suscripciones-nueva-pub.png" alt="Dar acceso"><figcaption>Dar acceso: el formulario de nueva suscripción.</figcaption></figure>
<h3>Gestionar una suscripción existente</h3>
<ul class="check">
  <li><b>Prorrogar:</b> suma meses sobre el tiempo restante (nunca acorta). <b>Hacer indefinido:</b> quita la fecha de fin.</li>
  <li><b>Cancelar:</b> corta el acceso al momento. La app lo ve en menos de 5 minutos.</li>
  <li><b>Editar precio/periodo/renovación</b> en caliente: por ejemplo, un descuento a un cliente concreto.</li>
</ul>
<table><tr><th>Estado</th><th>Qué significa</th></tr>
<tr><td>Activa / Prueba / Cortesía</td><td>Con acceso hasta la fecha de fin (o indefinido).</td></tr>
<tr><td>Programada</td><td>Empieza más adelante.</td></tr>
<tr><td>Caducada</td><td>Venció y no se renovó. Sin acceso.</td></tr>
<tr><td>Cancelada</td><td>La cortaste tú o el cliente. Sin acceso.</td></tr>
<tr><td>Impago · en gracia</td><td>La renovación falló; el cliente conserva el acceso los días de gracia mientras se reintenta cada 24 h.</td></tr>
<tr><td>Impagada</td><td>Se agotaron los reintentos. Sin acceso hasta que la reactives (edítala y vuelve a programar el cobro).</td></tr>
</table>
<h3>Cómo funciona el cobro recurrente</h3>
<p>La renovación se intenta hasta 1 hora antes de vencer. Si se cobra, el acceso se extiende otro periodo. Si falla, entra en gracia (3 días por defecto), se reintenta cada 24 h con el mismo identificador (nunca se cobra dos veces) y, agotados los reintentos, queda impagada. Todo se ve en la columna de estado y en el detalle de la suscripción.</p>`
    },
    {
      id: 'creditos', titulo: 'Paso 6 · Créditos y recargas', html: `
<p>El <b>crédito interno</b> es el saldo de cada subcuenta dentro del marketplace. Se consume <b>antes</b> que el wallet de GoHighLevel. Tiene dos orígenes:</p>
<ol class="pasos">
  <li><span class="ruta">Añadir crédito</span>: regalas o ajustas saldo a una subcuenta sin cobrar nada (bonos, compensaciones). Indica subcuenta, importe y motivo.</li>
  <li><span class="ruta">Recargar desde wallet</span>: cobras un importe al wallet de GoHighLevel de la subcuenta (con la tarifa de recarga) y se lo abonas como crédito. Es lo mismo que hace el cliente desde su portal con «Recargar saldo».</li>
  <li>La tabla muestra el saldo actual por subcuenta y el historial de movimientos (recargas, consumos, regalos, reembolsos).</li>
</ol>
<figure><img data-src="mk-admin-creditos-pub.png" alt="Créditos"><figcaption>Créditos: saldo por subcuenta, Añadir crédito y Recargar desde wallet.</figcaption></figure>
<figure class="s"><img data-src="mk-admin-creditos-dar-pub.png" alt="Añadir crédito"><figcaption>Añadir crédito: importe y motivo, sin cobro.</figcaption></figure>
<div class="nota"><b>Recarga desde el portal del cliente:</b> el cliente elige un importe sugerido o escribe otro (entre el mínimo y el máximo de Configuración). Si el wallet no tiene fondos, GoHighLevel rechaza el cobro y el cliente ve el error.</div>`
    },
    {
      id: 'cobros', titulo: 'Paso 7 · Cobros: qué se ha cobrado y qué hacer si algo falla', html: `
<p>En <span class="ruta">Cobros</span> está cada cargo: app, subcuenta, tarifa, unidades, importe, con qué se pagó (crédito o wallet) y su estado. Filtra por app, subcuenta, estado o fechas.</p>
<table><tr><th>Estado</th><th>Qué significa</th><th>Qué hacer</th></tr>
<tr><td>Creado</td><td>Cobrado en el wallet de GHL (o con crédito).</td><td>Nada. Puedes reembolsarlo si procede.</td></tr>
<tr><td>Prueba</td><td>Registrado en modo prueba, sin dinero.</td><td>Nada.</td></tr>
<tr><td>Pendiente</td><td>En curso (segundos).</td><td>Esperar. Si se queda colgado, el reconciliador lo cierra solo.</td></tr>
<tr><td>Desconocido</td><td>GHL no confirmó ni negó (timeout).</td><td>Pulsa <b>Reconciliar</b>: consulta a GHL y lo deja en creado o fallido. Se hace solo cada minuto.</td></tr>
<tr><td>Fallido</td><td>GHL lo rechazó (sin fondos, etc.).</td><td>Nada que devolver. La app lo reintenta según su política.</td></tr>
<tr><td>Reembolsado</td><td>Devuelto al wallet o al crédito.</td><td>Nada.</td></tr>
</table>
<ol class="pasos">
  <li><b>Reembolsar:</b> devuelve el cargo (al wallet si se cobró al wallet; al crédito si se pagó con crédito). Úsalo para errores o cortesías.</li>
  <li><b>Reconciliar:</b> para cargos desconocidos o pendientes antiguos, pregunta a GHL el estado real.</li>
  <li><b>Descartar:</b> marca como fallido un pendiente huérfano tras el periodo de gracia, si sabes que no se cobró.</li>
</ol>
<figure><img data-src="mk-admin-cobros-pub.png" alt="Cobros"><figcaption>Cobros: el historial con estados y acciones.</figcaption></figure>
<div class="tip"><b>Cada cargo lleva un identificador único de la app</b> (event_id), así que un reintento nunca cobra dos veces. Si un desarrollador te pregunta por un cargo, dale el id numérico y el event_id.</div>`
    },
    {
      id: 'avisos-usuarios', titulo: 'Avisos y usuarios', html: `
<h3>Avisos</h3>
<p>Mensajes cortos para tus clientes: novedades de una app, mantenimientos, promociones. Se muestran en el portal del cliente y, si lo marcas, también en la tienda. Pulsa <span class="ruta">Nuevo aviso</span>: título, texto, nivel (info, éxito, aviso, peligro), activo y «mostrar en tienda».</p>
<figure><img data-src="mk-admin-avisos-pub.png" alt="Avisos"><figcaption>Avisos: título, texto, nivel y dónde se muestra.</figcaption></figure>
<h3>Usuarios</h3>
<p>Normalmente nadie necesita usuario: los clientes entran por SSO desde su subcuenta y tú por SSO o con el usuario de administrador. Crea usuarios en <span class="ruta">Usuarios → Nuevo usuario</span> solo para:</p>
<ul class="check">
  <li>Un cliente que quiera entrar a su portal <b>fuera de GoHighLevel</b> (correo, contraseña y las subcuentas que puede ver).</li>
  <li>Un <b>administrador adicional</b> con contraseña (rol admin).</li>
</ul>
<p>La contraseña se muestra una sola vez; puedes regenerarla o desactivar el usuario cuando quieras.</p>
<figure><img data-src="mk-admin-usuarios-pub.png" alt="Usuarios"><figcaption>Usuarios del portal y administradores adicionales.</figcaption></figure>`
    },
    {
      id: 'tienda', titulo: 'La tienda pública', html: `
<p><code>https://marketplace.escaladoacelerado.es/tienda</code> muestra las apps publicadas con su tarjeta (icono, gancho, precio, etiqueta) y, en cada ficha, las capturas, la descripción, las características, los planes visibles, el manual en PDF, el correo de soporte, las reseñas y el botón <b>Instalar en GoHighLevel</b>. Es pública: puedes enlazarla desde tu web o tus redes.</p>
<figure><img data-src="mk-tienda-pub.png" alt="Tienda"><figcaption>La tienda pública con las apps publicadas.</figcaption></figure>
<figure><img data-src="mk-tienda-detalle-pub.png" alt="Ficha"><figcaption>La ficha de una app: instalar, manual, soporte, planes y reseñas.</figcaption></figure>
<div class="nota"><b>Los planes se contratan desde el portal del cliente</b> (dentro de su subcuenta), no desde la tienda: la tienda solo los muestra. Así el pago sale siempre del saldo de la subcuenta correcta.</div>`
    },
    {
      id: 'integrar', titulo: 'Cómo incorporar una app nueva (resumen del flujo)', html: `
<ol class="pasos">
  <li><b>Registra la app</b> en Apps y copia su API key. Déjala en <b>modo prueba</b>.</li>
  <li><b>Entrega al desarrollador</b> la API key y la guía: <code>https://marketplace.escaladoacelerado.es/guia</code>. Decide con él el modelo: por uso (su app cobra con <code>POST /api/v1/charges</code>) o por suscripción (su app solo consulta <code>GET /api/v1/access</code> y tú creas el plan).</li>
  <li><b>Pide la ficha de vuelta:</b> dónde comprueba el acceso, cada cuánto (máximo 5 minutos de caché), qué hace sin red, en qué puntos corta, y una subcuenta de pruebas.</li>
  <li><b>Prueba con él</b>: dale una prueba gratuita a la subcuenta de pruebas (debe ver acceso), cancélala (debe bloquear en menos de 5 minutos) y restáurala. Si es por uso, revisa en Cobros sus cargos de prueba.</li>
  <li><b>Sube la vitrina:</b> descripción, capturas, icono, soporte, manual, link de instalación, precio. Crea el plan si es por suscripción.</li>
  <li><b>Apaga el modo prueba</b> de la app y publícala en la tienda.</li>
</ol>
<div class="tip"><b>Cambiar precios</b> no requiere tocar la app: los planes se editan en Planes y las suscripciones existentes conservan su precio hasta que las edites. En el pago por uso, el precio lo fija la app dentro del rango de la tarifa dinámica.</div>`
    },
    {
      id: 'problemas', titulo: 'Problemas frecuentes', html: `
<table><tr><th>Qué pasa</th><th>Qué hacer</th></tr>
<tr><td>Un cliente no ve Marketplace Disruptivo en su menú</td><td>La app no está instalada en esa subcuenta. Instálala con el link de instalación de la vitrina (Apps → Marketplace Disruptivo).</td></tr>
<tr><td>El cliente ve el panel de administración en vez de su portal</td><td>Su correo o su agencia está en Configuración → SSO como administrador. Quítalo de la lista.</td></tr>
<tr><td>Una app dice que el cliente no tiene acceso</td><td>Mira Suscripciones: ¿existe una activa/prueba/cortesía para esa subcuenta y esa app (o un plan que la incluya) y no está caducada? La app tarda hasta 5 minutos en verlo.</td></tr>
<tr><td>Una renovación no se cobra</td><td>La subcuenta no está conectada, o no tiene saldo ni fondos en el wallet. Con gracia el cliente sigue entrando unos días: avísale para que recargue. Tras los reintentos queda impagada.</td></tr>
<tr><td>Un cargo se quedó en Desconocido</td><td>Pulsa Reconciliar. El reconciliador automático lo revisa cada minuto de todos modos.</td></tr>
<tr><td>Quiero cortar los cobros de una app ya</td><td>Apps → apaga «Puede cobrar». Sigue funcionando para consultar accesos.</td></tr>
<tr><td>Quiero regalar saldo</td><td>Créditos → Añadir crédito. No cobra nada.</td></tr>
<tr><td>Un cliente pagó por error</td><td>Cobros → Reembolsar en ese cargo.</td></tr>
</table>
<h3>Checklist de puesta en marcha de un cliente nuevo</h3>
<ul class="check">
  <li>Marketplace Disruptivo instalado en su subcuenta (aparece en Conexiones).</li>
  <li>Acceso dado en Suscripciones (prueba, cortesía o plan de pago con renovación) o saldo recargado si es pago por uso.</li>
  <li>Le has enseñado dónde está su portal y le has pasado el manual de cada app.</li>
</ul>`
    },
  ],
}
