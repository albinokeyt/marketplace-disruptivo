export default {
  slug: 'emails-disruptivo',
  app: 'Emails Disruptivo',
  titulo: 'Manual de uso de Emails Disruptivo',
  subtitulo: 'De cero a tus primeros correos enviados desde GoHighLevel con tu propio proveedor: proveedor, dos remitentes, dominio, plantilla, workflow, relay SMTP y buzón. Paso a paso, sin conocimientos técnicos.',
  version: 'Versión 1.0 · septiembre 2026',
  color: '#b8902a',
  secciones: [
    {
      id: 'antes', titulo: 'Antes de empezar', html: `
<p><b>Emails Disruptivo</b> hace que los correos de tus automatizaciones de GoHighLevel salgan por <b>tu propio proveedor de envío</b> (Brevo o cualquier SMTP: Amazon SES, Mailgun, el correo de tu hosting…) con <b>tus remitentes</b>, y te enseña qué pasó con cada correo: entregado, abierto, clic, rebotado.</p>
<h3>Qué necesitas tener a mano</h3>
<ul class="check">
  <li>Una cuenta en un proveedor de envío (Brevo es la opción más sencilla) y sus credenciales: clave de API o usuario y contraseña SMTP.</li>
  <li>Un dominio tuyo (por ejemplo <code>tudominio.com</code>) con acceso a su panel de DNS.</li>
  <li>Unos 15 minutos.</li>
</ul>
<h3>Cómo entrar</h3>
<ol class="pasos">
  <li>Entra en tu subcuenta de GoHighLevel.</li>
  <li>En el menú lateral izquierdo, abre <span class="ruta">Aplicaciones del mercado</span>.</li>
  <li>Pulsa <span class="ruta">Emails</span>. El panel se abre dentro de GoHighLevel, ya identificado: no hay contraseña.</li>
</ol>
<figure><img data-src="emails-resumen-pub.png" alt="Resumen"><figcaption>El panel al entrar: Resumen de los últimos 7 días (enviados, entregados, problemas, aperturas y clics reales).</figcaption></figure>
<h3>El menú, de un vistazo</h3>
<table><tr><th>Sección</th><th>Para qué sirve</th></tr>
<tr><td>Resumen</td><td>Actividad de envío de los últimos 7 días y desglose por estado.</td></tr>
<tr><td>Proveedores</td><td>Los servicios por los que sale el correo (Brevo, SMTP). Paso 1.</td></tr>
<tr><td>Remitentes</td><td>Las direcciones desde las que envías. Cada una elige su proveedor. Paso 2.</td></tr>
<tr><td>Dominios</td><td>Verificar que un dominio es tuyo y enlaces con tu marca. Paso 3.</td></tr>
<tr><td>Plantillas</td><td>Correos preparados con variables, para usarlos en los workflows. Paso 4.</td></tr>
<tr><td>Envíos</td><td>Todo lo que ha salido, con su estado y el detalle de cada correo. Paso 7.</td></tr>
<tr><td>Buzón</td><td>El correo que entra en tus cuentas (IMAP), para leer y responder desde aquí.</td></tr>
<tr><td>Rebotados</td><td>Correos que rebotaron de forma definitiva y el DND automático en GoHighLevel.</td></tr>
<tr><td>Relay SMTP</td><td>Datos SMTP para seguir usando el nodo de email nativo de GoHighLevel. Paso 6.</td></tr>
</table>
<div class="nota"><b>Orden recomendado:</b> Proveedor → Remitentes → Dominio → Plantilla → Workflow (o Relay SMTP) → comprobar en Envíos. Sigue las secciones en ese orden y en 15 minutos tienes el primer correo entregado.</div>`
    },
    {
      id: 'paso1', titulo: 'Paso 1 · Conecta tu proveedor de envío', html: `
<p>El proveedor es la empresa que entrega tus correos. Emails Disruptivo no envía por su cuenta: usa el tuyo. Puedes tener varios (por ejemplo Brevo para marketing y SES para transaccional).</p>
<ol class="pasos">
  <li>En el menú, entra en <span class="ruta">Proveedores</span> y pulsa <span class="ruta">Nuevo proveedor</span>.</li>
  <li><b>Nombre:</b> un nombre para reconocerlo en el panel (por ejemplo «Brevo principal»).</li>
  <li><b>Tipo:</b> elige <b>Brevo</b> (te pedirá tu clave de API) o <b>SMTP</b> (cualquier otro servicio).</li>
  <li>Si es SMTP, rellena <b>Servidor SMTP</b> (por ejemplo <code>smtp-relay.brevo.com</code> o <code>email-smtp.eu-west-1.amazonaws.com</code>), <b>Seguridad</b> (STARTTLS con puerto 587, recomendado; o SSL con puerto 465), <b>Usuario</b> y <b>Contraseña</b>. Estos datos te los da tu proveedor en su apartado «SMTP».</li>
  <li><b>Límite diario</b> (opcional): si tu plan del proveedor tiene tope de correos al día, ponlo aquí y la app dejará de enviar al llegar a él.</li>
  <li>Pulsa <span class="ruta">Guardar</span>.</li>
  <li>En la lista, pulsa <span class="ruta">Probar conexión</span>. Debe quedar en estado <b>Correcto</b>.</li>
  <li>Solo con Brevo: pulsa <span class="ruta">Registrar webhook en Brevo</span>. Así Brevo avisa a la app de entregas, aperturas, clics y rebotes.</li>
</ol>
<figure><img data-src="man-emails-nuevo-proveedor-pub.png" alt="Nuevo proveedor"><figcaption>El formulario de proveedor con tipo SMTP: servidor, seguridad, puerto, usuario y contraseña.</figcaption></figure>
<figure><img data-src="emails-proveedores-pub.png" alt="Lista de proveedores"><figcaption>Tras guardar: estado «Correcto», webhook registrado y los botones Probar conexión, Editar y Eliminar. Abajo, los proveedores que tu agencia te ha cedido (puedes usarlos, no editarlos).</figcaption></figure>
<div class="tip"><b>Dónde están las credenciales.</b> Brevo: <i>Configuración → SMTP y API</i> (crea una «clave SMTP»; el usuario es tu correo de Brevo). Amazon SES: <i>SMTP settings → Create SMTP credentials</i>. Hosting propio: el usuario y la contraseña del buzón y el servidor «mail.tudominio.com».</div>
<div class="ojo"><b>Las credenciales se guardan cifradas y no se vuelven a mostrar.</b> Si cambias la contraseña en el proveedor, edita aquí el proveedor y vuelve a pegarla.</div>`
    },
    {
      id: 'paso2', titulo: 'Paso 2 · Crea tus remitentes (mínimo dos)', html: `
<p>Un remitente es la dirección que ve el destinatario. Cada remitente decide por qué proveedor sale. Te recomendamos <b>dos como mínimo</b>: uno para conversar (<code>hola@tudominio.com</code>) y otro para avisos automáticos (<code>no-responder@tudominio.com</code> o <code>soporte@</code>).</p>
<ol class="pasos">
  <li>Entra en <span class="ruta">Remitentes</span> y pulsa <span class="ruta">Nuevo remitente</span>.</li>
  <li><b>Correo del remitente:</b> la dirección completa, con tu dominio.</li>
  <li><b>Nombre visible:</b> lo que verá el destinatario junto al correo (tu marca o tu nombre).</li>
  <li><b>Proveedor:</b> elige por cuál sale este remitente (los del Paso 1).</li>
  <li><b>Responder a</b> (opcional): si quieres que las respuestas lleguen a otra dirección.</li>
  <li>Activa <b>Usar como remitente por defecto</b> en el que más uses: es el que te proponen los nodos del workflow. Solo puede haber uno por subcuenta.</li>
  <li>Pulsa <span class="ruta">Guardar</span> y repite con el segundo remitente.</li>
</ol>
<figure><img data-src="man-emails-nuevo-remitente-pub.png" alt="Nuevo remitente"><figcaption>El formulario de remitente: correo, nombre visible, proveedor, responder-a y el interruptor «por defecto».</figcaption></figure>
<figure><img data-src="man-emails-remitentes-pub.png" alt="Lista de remitentes"><figcaption>Tus remitentes con su proveedor y el estado del dominio. «Agencia» = lo creó tu agencia para ti; «Panel» = alta manual tuya.</figcaption></figure>
<div class="ojo"><b>El correo tiene que estar autorizado en tu proveedor.</b> Brevo y SES solo envían desde remitentes o dominios que hayas verificado en ellos. Si el envío falla con «sender not verified», verifica primero la dirección o el dominio en el proveedor.</div>`
    },
    {
      id: 'paso3', titulo: 'Paso 3 · Verifica tu dominio (recomendado)', html: `
<p>Los dominios de tus remitentes aparecen solos en <span class="ruta">Dominios</span>. Verificar es opcional (tus correos salen igual), pero al hacerlo el dominio queda registrado como tuyo y <b>ninguna otra subcuenta de la plataforma podrá enviar con direcciones de ese dominio</b>.</p>
<ol class="pasos">
  <li>Entra en <span class="ruta">Dominios</span> y pulsa <span class="ruta">Verificar este dominio</span> junto a tu dominio.</li>
  <li>Copia el registro TXT que te muestra la app.</li>
  <li>En el panel de DNS de tu dominio (donde lo compraste, o Cloudflare), crea un registro <b>TXT</b> con ese nombre y ese valor. Guarda.</li>
  <li>Vuelve a la app y pulsa de nuevo <span class="ruta">Verificar</span>. Los DNS pueden tardar de 5 minutos a unas horas en propagarse.</li>
</ol>
<figure><img data-src="man-emails-dominios-pub.png" alt="Dominios"><figcaption>Tu dominio con el botón «Verificar este dominio» y, abajo, los enlaces con tu marca.</figcaption></figure>
<h3>Enlaces con tu marca (opcional)</h3>
<p>Los enlaces y el píxel de apertura de tus correos usan el dominio de la app. Si prefieres que lleven tu marca, escribe un subdominio tuyo en <b>Subdominio para tus enlaces</b> (por ejemplo <code>link.tudominio.com</code>), pulsa <span class="ruta">Añadir</span> y crea en tu DNS el registro que te indique. Usa un subdominio dedicado que no tenga otros registros.</p>
<div class="nota"><b>Esto no sustituye a la entregabilidad.</b> SPF, DKIM y DMARC se configuran en tu proveedor de envío (Brevo, SES…), como siempre. Sin ellos tus correos pueden acabar en spam aunque aquí todo esté verificado.</div>`
    },
    {
      id: 'paso4', titulo: 'Paso 4 · Prepara una plantilla', html: `
<p>Las plantillas son correos listos para usar desde tus workflows. Admiten variables en el asunto, el preheader y el HTML.</p>
<ol class="pasos">
  <li>Entra en <span class="ruta">Plantillas</span> y pulsa <span class="ruta">Nueva plantilla</span>.</li>
  <li><b>Nombre:</b> para encontrarla luego (por ejemplo «Bienvenida»).</li>
  <li><b>Asunto:</b> puede llevar variables, por ejemplo <code>Hola {{destinatario.nombre}}, ya estás dentro</code>.</li>
  <li><b>Preheader</b> (opcional): el texto de vista previa que se ve en la bandeja de entrada.</li>
  <li><b>HTML:</b> el cuerpo del correo. Pulsa <b>Vista previa</b> para verlo renderizado. Si no sabes HTML, copia el ejemplo que trae y cambia los textos.</li>
  <li><b>Versión en texto plano</b> (opcional): mejora la entregabilidad.</li>
  <li>Incluye siempre el enlace de baja <code>{{baja_url}}</code>: es obligatorio en correos de marketing.</li>
  <li>Pulsa <span class="ruta">Guardar</span>. Con <b>Copiar</b> duplicas una plantilla existente para hacer variantes.</li>
</ol>
<figure><img data-src="man-emails-nueva-plantilla-pub.png" alt="Nueva plantilla"><figcaption>El editor de plantillas con la lista de variables disponibles a la derecha (botón Copiar en cada una).</figcaption></figure>
<table><tr><th>Variable</th><th>Se sustituye por</th></tr>
<tr><td><code>{{destinatario.email}}</code></td><td>El correo del destinatario (campo «Para» del nodo).</td></tr>
<tr><td><code>{{destinatario.nombre}}</code></td><td>El nombre del destinatario (campo «Nombre» del nodo).</td></tr>
<tr><td><code>{{remitente.nombre}}</code> / <code>{{remitente.email}}</code></td><td>El nombre visible y el correo del remitente elegido.</td></tr>
<tr><td><code>{{asunto}}</code> / <code>{{preheader}}</code></td><td>El asunto y el preheader de esta misma plantilla.</td></tr>
<tr><td><code>{{baja_url}}</code></td><td>El enlace de baja. Obligatorio en marketing.</td></tr>
</table>`
    },
    {
      id: 'paso5', titulo: 'Paso 5 · Envía desde tus workflows de GoHighLevel', html: `
<p>Con la app instalada, tus workflows tienen <b>dos acciones nuevas de Emails Disruptivo</b>: una envía una <b>plantilla</b> del Paso 4 y la otra te deja <b>escribir el correo en el propio nodo</b>.</p>
<ol class="pasos">
  <li>En GoHighLevel, ve a <span class="ruta">Automatización → Flujos de trabajo</span> y abre el workflow (o crea uno nuevo con su disparador, por ejemplo «Formulario enviado»).</li>
  <li>Pulsa el <span class="kbd">+</span> que hay debajo del disparador para añadir una acción.</li>
  <li>En el buscador escribe <b>Emails Disruptivo</b> y elige la acción que quieras: <b>enviar plantilla</b> o <b>enviar correo</b>.</li>
  <li><b>Remitente:</b> viene propuesto el remitente por defecto (Paso 2); puedes cambiarlo.</li>
  <li><b>Para</b> y <b>Nombre:</b> deja los del contacto (<code>{{contact.email}}</code> y <code>{{contact.first_name}}</code>); son los que rellenan <code>{{destinatario.email}}</code> y <code>{{destinatario.nombre}}</code> en la plantilla.</li>
  <li>Elige la <b>plantilla</b> (o escribe asunto y texto si usas la acción de correo directo).</li>
  <li>Guarda la acción y pulsa <span class="ruta">Publicar</span> en el workflow.</li>
  <li>Prueba: añade tu propio contacto al workflow (o dispara el formulario) y comprueba que el correo llega. En la sección <span class="ruta">Envíos</span> lo verás con origen «workflow».</li>
</ol>
<div class="tip"><b>Un correo por nodo.</b> Si quieres una secuencia (bienvenida, recordatorio, oferta), añade varias acciones separadas por esperas (acción «Esperar» de GoHighLevel).</div>
<div class="nota"><b>¿No ves la acción?</b> Comprueba que Emails Disruptivo está instalada en <i>esta</i> subcuenta (aparece en el menú lateral) y recarga el editor del workflow. Si sigue sin aparecer, escribe a soporte.</div>`
    },
    {
      id: 'paso6', titulo: 'Paso 6 · Alternativa: Relay SMTP para el email nativo de GoHighLevel', html: `
<p>Si prefieres seguir usando el nodo de email de siempre de GoHighLevel (o sus campañas de email), no cambies tus workflows: conecta el <b>Relay SMTP</b>. GoHighLevel enviará por «un SMTP» que en realidad es Emails Disruptivo, y cada correo saldrá por el proveedor del remitente que lleve.</p>
<ol class="pasos">
  <li>Entra en <span class="ruta">Relay SMTP</span>. Comprueba que el estado del relay está en <b>Activado</b>.</li>
  <li>Copia el <b>Servidor SMTP</b> (<code>ddemail.escaladoacelerado.es</code>), el <b>puerto</b> (587 con TLS/STARTTLS, recomendado; 465 con SSL) y el <b>usuario</b>.</li>
  <li>Pulsa <span class="ruta">Generar nueva</span> en Contraseña y cópiala en ese momento: no se vuelve a mostrar.</li>
  <li>En GoHighLevel, ve a <span class="ruta">Configuración → Servicios de correo electrónico</span> y pulsa <span class="ruta">Agregar servicio → SMTP</span>.</li>
  <li>Pega servidor, puerto, usuario y contraseña. Como correo del remitente pon uno de tus remitentes del Paso 2. Guarda.</li>
  <li>Márcalo como servicio de correo por defecto de la subcuenta si quieres que todo el correo de GoHighLevel salga por aquí.</li>
  <li>En <b>Enrutado → Proveedor por defecto</b> (parte baja de Relay SMTP) elige qué proveedor usar cuando llegue un correo con un remitente que todavía no has dado de alta. Sin proveedor por defecto, esos correos se rechazan temporalmente.</li>
</ol>
<figure><img data-src="emails-relay-smtp-pub.png" alt="Relay SMTP"><figcaption>Los datos del relay para pegar en GoHighLevel y, abajo, el enrutado por defecto.</figcaption></figure>
<div class="tip"><b>Cómo saber que funciona:</b> envía un email de prueba desde GoHighLevel (Conversaciones → correo a tu propio contacto). En <span class="ruta">Envíos</span> aparecerá con origen «Relay SMTP» y estado Entregado.</div>`
    },
    {
      id: 'paso7', titulo: 'Paso 7 · Comprueba que llega', html: `
<p>En <span class="ruta">Envíos</span> está todo el correo de la subcuenta, venga de un nodo del workflow o del relay.</p>
<ol class="pasos">
  <li>Filtra por <b>Estado</b>, <b>Origen</b> (workflow o relay), fechas o busca por correo o asunto, y pulsa <span class="ruta">Filtrar</span>.</li>
  <li>Cada fila muestra fecha, destinatario, asunto, origen y estado. <b>Entregado</b> es el objetivo; debajo verás «Abierto» cuando el destinatario lo abra de verdad.</li>
  <li>Pulsa <span class="ruta">Ver detalle</span> para ver el correo completo: para, responder-a, CC, intentos, primera apertura y primer clic reales, y el id en el proveedor.</li>
</ol>
<figure><img data-src="emails-envios-pub.png" alt="Envíos"><figcaption>El listado de envíos con filtros, origen y estado.</figcaption></figure>
<figure class="s"><img data-src="man-emails-envio-detalle-pub.png" alt="Detalle del envío"><figcaption>El detalle de un envío entregado y abierto.</figcaption></figure>
<table><tr><th>Estado</th><th>Qué significa</th></tr>
<tr><td>En cola / Enviando</td><td>Está saliendo. Normal durante unos segundos.</td></tr>
<tr><td>Entregado</td><td>El servidor del destinatario lo aceptó. «Abierto» y «Clic» solo cuentan aperturas y clics reales (sin proxys ni escáneres).</td></tr>
<tr><td>Reintento / Diferido</td><td>El destinatario pidió esperar; se reintenta solo.</td></tr>
<tr><td>Rebotado</td><td>La dirección no existe o rechaza el correo. Pasa a la sección Rebotados.</td></tr>
<tr><td>Fallo</td><td>El proveedor lo rechazó. Mira el motivo en el detalle (credenciales, remitente no verificado, límite diario…).</td></tr>
</table>`
    },
    {
      id: 'buzon', titulo: 'Buzón: leer y responder desde el panel', html: `
<p>El <span class="ruta">Buzón</span> trae por IMAP el correo que entra en tus cuentas y te deja responder desde aquí con tus remitentes de siempre.</p>
<ol class="pasos">
  <li>Entra en <span class="ruta">Buzón</span> y pulsa <span class="ruta">Cuentas</span>.</li>
  <li>Pulsa <span class="ruta">Añadir cuenta</span>: servidor IMAP, puerto (casi siempre <b>993</b> con TLS), usuario y contraseña. Elige qué carpeta traer y cada cuánto sincronizar.</li>
  <li>Gmail y Outlook no aceptan la contraseña normal: activa la <b>verificación en dos pasos</b> y crea una <b>contraseña de aplicación</b> de 16 caracteres; es la que se pega aquí. Servidores: <code>imap.gmail.com</code> y <code>outlook.office365.com</code>.</li>
  <li>Pulsa <span class="ruta">Probar conexión</span> y luego <span class="ruta">Sincronizar ahora</span>.</li>
  <li>Vuelve al buzón: verás Bandeja de entrada, No leídos y Enviados desde el buzón. Abre un mensaje y responde eligiendo el remitente.</li>
</ol>
<figure><img data-src="man-emails-buzon-cuentas-pub.png" alt="Cuentas de correo"><figcaption>La ventana de cuentas IMAP con el estado de la conexión y la ayuda para Gmail y Outlook.</figcaption></figure>
<div class="nota"><b>Cuota:</b> 200 MB por subcuenta entre mensajes y adjuntos. El indicador de espacio está arriba a la izquierda del buzón.</div>`
    },
    {
      id: 'rebotados', titulo: 'Rebotados y No Molestar automático', html: `
<p>Un correo <b>rebota</b> cuando la dirección no existe o la rechaza. Seguir enviándole daña tu reputación. La sección <span class="ruta">Rebotados</span> los reúne y puede marcar esos contactos como <b>No Molestar (DND)</b> en el canal Email de GoHighLevel; SMS y llamadas no se tocan.</p>
<ol class="pasos">
  <li>Activa <b>DND automático</b> para que cada rebote definitivo marque el contacto al momento.</li>
  <li>Si lo activas más tarde, pulsa <span class="ruta">Activar DND a todos los pendientes</span> para aplicar los rebotes anteriores.</li>
  <li>Filtra por correo o por estado de DND, y descarga la lista con <span class="ruta">Descargar CSV</span> si quieres limpiarla en tu proveedor.</li>
</ol>
<figure><img data-src="emails-rebotados-pub.png" alt="Rebotados"><figcaption>La sección Rebotados con el interruptor de DND automático.</figcaption></figure>`
    },
    {
      id: 'plan', titulo: 'Tu plan y tu saldo', html: `
<p>Emails Disruptivo se contrata por suscripción mensual (plan <b>Pro</b>) a través de <b>Marketplace Disruptivo</b>, el portal de apps de tu agencia que ves en el menú de tu subcuenta.</p>
<ol class="pasos">
  <li>Abre <span class="ruta">Aplicaciones del mercado → Marketplace Disruptivo</span> en tu subcuenta.</li>
  <li>En <b>Planes disponibles</b>, pulsa <span class="ruta">Contratar con mi saldo</span> en el plan de Emails Disruptivo. Se cobra el primer mes al momento y se renueva solo cada mes.</li>
  <li>El saldo se descuenta primero de tu crédito interno y, si no llega, de tu wallet de GoHighLevel. Puedes recargar crédito desde el mismo portal con <span class="ruta">Recargar saldo</span>.</li>
  <li>Si una renovación no se puede cobrar, tienes unos días de gracia con acceso mientras recargas; el panel de Emails te lo avisa arriba.</li>
</ol>
<div class="nota"><b>Prueba gratuita:</b> si tu agencia te ha dado un periodo de prueba, en el pie del menú de Emails verás «Plan: Emails Disruptivo · Pro · prueba hasta…». No tienes que hacer nada hasta esa fecha.</div>`
    },
    {
      id: 'problemas', titulo: 'Problemas frecuentes', html: `
<table><tr><th>Qué pasa</th><th>Qué hacer</th></tr>
<tr><td>«Probar conexión» falla en el proveedor</td><td>Revisa usuario y contraseña (en Brevo, la clave SMTP, no la contraseña de la web), el puerto (587 STARTTLS o 465 SSL) y que el proveedor no bloquee el acceso SMTP.</td></tr>
<tr><td>El correo llega a spam</td><td>Configura SPF, DKIM y DMARC en tu proveedor para tu dominio, verifica el dominio en Dominios y usa un remitente con tu dominio (nunca gmail.com).</td></tr>
<tr><td>Envío en estado «Fallo» con «sender not verified»</td><td>El remitente o su dominio no está verificado en tu proveedor. Verifícalo allí y reenvía.</td></tr>
<tr><td>La acción de Emails Disruptivo no aparece en el workflow</td><td>La app debe estar instalada en esa subcuenta (visible en el menú). Recarga el editor del workflow.</td></tr>
<tr><td>El relay rechaza un correo («rechazado temporalmente»)</td><td>El remitente del correo no está dado de alta y no hay proveedor por defecto. Dalo de alta en Remitentes o elige un proveedor por defecto en Relay SMTP → Enrutado.</td></tr>
<tr><td>El buzón no sincroniza</td><td>Gmail/Outlook: usa una contraseña de aplicación. Correo de tu dominio: confirma servidor IMAP y puerto 993 con tu hosting.</td></tr>
<tr><td>Muchos rebotes</td><td>Activa el DND automático, descarga el CSV y limpia esas direcciones en tu proveedor.</td></tr>
<tr><td>El panel dice que tu plan no está activo</td><td>Abre Marketplace Disruptivo en tu subcuenta, recarga saldo o contrata el plan. El acceso vuelve en el momento.</td></tr>
</table>
<h3>Checklist final</h3>
<ul class="check">
  <li>Proveedor en estado Correcto (y webhook registrado si es Brevo).</li>
  <li>Dos remitentes creados y uno marcado por defecto.</li>
  <li>Dominio verificado y SPF/DKIM/DMARC en el proveedor.</li>
  <li>Una plantilla guardada con <code>{{baja_url}}</code>.</li>
  <li>Un workflow publicado con la acción de Emails Disruptivo (o el Relay SMTP pegado en GoHighLevel).</li>
  <li>Un envío de prueba en estado Entregado en Envíos.</li>
</ul>`
    },
  ],
}
