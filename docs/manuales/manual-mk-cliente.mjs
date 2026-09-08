export default {
  slug: 'marketplace-cliente',
  app: 'Marketplace Disruptivo',
  titulo: 'Guía de Marketplace Disruptivo para tu subcuenta',
  subtitulo: 'Tu portal de apps dentro de GoHighLevel: ver tu saldo, recargar, contratar planes, consultar tus accesos y tu consumo, y descargar el manual de cada app. En diez minutos.',
  version: 'Versión 1.0 · septiembre 2026',
  color: '#b8902a',
  secciones: [
    {
      id: 'que-es', titulo: 'Qué es y cómo entrar', html: `
<p><b>Marketplace Disruptivo</b> es el portal desde el que tu agencia te da acceso a sus apps para GoHighLevel (Hermes Setter, Emails Disruptivo, VSL Boost…) y desde el que pagas su uso. Todo se paga con un único <b>saldo</b> por subcuenta: lo recargas cuando quieras y cada app descuenta de ahí.</p>
<ol class="pasos">
  <li>Entra en tu subcuenta de GoHighLevel.</li>
  <li>En el menú lateral, abre <span class="ruta">Aplicaciones del mercado</span> y pulsa <span class="ruta">Marketplace Disruptivo</span>. Entras identificado automáticamente, sin contraseña.</li>
  <li>Verás cuatro bloques: <b>Mi consumo</b>, <b>Recargar saldo</b>, <b>Planes disponibles</b> y <b>Mis accesos</b>, además de los avisos de tu agencia y el enlace a la tienda.</li>
</ol>
<figure><img data-src="mk-portal-1-pub.png" alt="Portal"><figcaption>Tu portal: consumo del mes, saldo y recarga.</figcaption></figure>
<div class="nota"><b>Si no ves Marketplace Disruptivo en el menú,</b> pídele a tu agencia que lo active en tu subcuenta. Sin él no puedes recargar ni contratar (las pruebas gratuitas sí funcionan).</div>`
    },
    {
      id: 'saldo', titulo: 'Tu saldo y cómo recargar', html: `
<p>Tu saldo es un <b>crédito interno</b> que se consume antes que tu wallet de GoHighLevel. Las apps de pago por uso descuentan de él cada consumo; las suscripciones cobran de él cada renovación. Si el crédito no llega, se cobra el resto a tu wallet de GoHighLevel.</p>
<ol class="pasos">
  <li>En <b>Recargar saldo</b>, elige uno de los importes sugeridos o escribe otro (dentro del mínimo y el máximo que verás indicados).</li>
  <li>Pulsa <span class="ruta">Recargar</span>. El importe se cobra a tu <b>wallet de GoHighLevel</b> y aparece al momento como crédito en tu portal.</li>
  <li>En <b>Mi consumo</b> ves el saldo actual, lo gastado en 30 días y el total histórico; abajo, el consumo reciente y el gasto por app.</li>
</ol>
<figure><img data-src="mk-portal-1-pub.png" alt="Recargar"><figcaption>Recargar saldo: importe sugerido o libre, cobrado al wallet de GoHighLevel.</figcaption></figure>
<div class="ojo"><b>Si tu wallet de GoHighLevel no tiene fondos,</b> la recarga se rechaza. Añade fondos al wallet desde Configuración → Facturación de tu subcuenta y vuelve a intentarlo.</div>`
    },
    {
      id: 'planes', titulo: 'Contratar un plan', html: `
<p>Las apps por suscripción (por ejemplo Emails Disruptivo o VSL Boost) se contratan aquí, con tu saldo, sin tarjetas ni pasarelas.</p>
<ol class="pasos">
  <li>En <b>Planes disponibles</b>, lee el nombre, el precio y el periodo de cada plan y las apps que incluye.</li>
  <li>Pulsa <span class="ruta">Contratar con mi saldo</span> y confirma. Se cobra el primer periodo al momento (primero tu crédito, luego tu wallet) y el acceso se activa en el acto.</li>
  <li>Si tienes varias subcuentas en el portal, elige primero para cuál contratas.</li>
  <li>El plan se renueva solo cada periodo. Si una renovación no se puede cobrar, conservas el acceso unos días de gracia mientras recargas; después se corta hasta que haya saldo.</li>
  <li>Para cancelar un plan, pídeselo a tu agencia.</li>
</ol>
<figure><img data-src="mk-portal-2-pub.png" alt="Planes disponibles"><figcaption>Planes disponibles: precio, apps incluidas y el botón Contratar con mi saldo.</figcaption></figure>
<div class="tip"><b>Ya lo tienes:</b> si el botón dice «Ya lo tienes», es que esa app ya está activa para tu subcuenta (por ejemplo, con una prueba gratuita).</div>`
    },
    {
      id: 'accesos', titulo: 'Mis accesos y los manuales', html: `
<p>En <b>Mis accesos</b> ves cada app o plan al que tienes acceso, con su estado y hasta cuándo:</p>
<table><tr><th>Estado</th><th>Qué significa</th></tr>
<tr><td>Activa</td><td>Plan de pago vigente, se renueva solo.</td></tr>
<tr><td>Prueba</td><td>Acceso gratuito hasta la fecha indicada.</td></tr>
<tr><td>Cortesía</td><td>Acceso regalado por tu agencia.</td></tr>
</table>
<ol class="pasos">
  <li>Cada tarjeta tiene el enlace <b>Manual de uso (PDF)</b> de la app: descárgalo y sigue sus pasos.</li>
  <li>Si un acceso caduca, la app te lo dirá al entrar; contrata el plan o pide a tu agencia una prórroga.</li>
</ol>
<figure><img data-src="mk-portal-3-pub.png" alt="Mis accesos"><figcaption>Mis accesos: estado, vencimiento y manual de cada app.</figcaption></figure>`
    },
    {
      id: 'tienda', titulo: 'La tienda', html: `
<p>Desde el enlace <b>Tienda</b> del portal (o en <code>marketplace.escaladoacelerado.es/tienda</code>) ves todas las apps disponibles: descripción, capturas, precio, planes, manual y el botón <b>Instalar en GoHighLevel</b>, que instala la app en tu subcuenta en un clic. Después, vuelve al portal para contratar su plan o recargar saldo si es de pago por uso.</p>
<figure><img data-src="mk-tienda-pub.png" alt="Tienda"><figcaption>La tienda con las apps disponibles.</figcaption></figure>`
    },
    {
      id: 'problemas', titulo: 'Problemas frecuentes', html: `
<table><tr><th>Qué pasa</th><th>Qué hacer</th></tr>
<tr><td>No veo Marketplace Disruptivo en el menú</td><td>Pide a tu agencia que lo active en tu subcuenta.</td></tr>
<tr><td>La recarga se rechaza</td><td>Tu wallet de GoHighLevel no tiene fondos: añádelos desde Configuración → Facturación y repite.</td></tr>
<tr><td>Una app dice que no tengo acceso</td><td>Mira Mis accesos: si caducó, contrata el plan o recarga; si debería estar activo, escribe a tu agencia. Las apps tardan hasta 5 minutos en verlo.</td></tr>
<tr><td>«Tu suscripción está en periodo de gracia»</td><td>La renovación no se pudo cobrar. Recarga saldo: la renovación se reintenta sola cada día.</td></tr>
<tr><td>Un cobro que no reconozco</td><td>En Mi consumo → consumo reciente ves app, fecha e importe. Si no cuadra, escribe a tu agencia con esos datos.</td></tr>
</table>
<p>Soporte: <b>departamentodisruptivo@gmail.com</b>.</p>`
    },
  ],
}
