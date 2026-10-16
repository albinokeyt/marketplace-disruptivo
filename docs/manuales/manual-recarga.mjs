export default {
  slug: 'recargar-saldo',
  app: 'Marketplace Disruptivo',
  titulo: 'Cómo recargar saldo en Marketplace Disruptivo',
  subtitulo: 'Tu saldo paga las apps de tu agencia dentro de GoHighLevel, como tu asistente de IA. Aquí tienes cómo recargarlo con tarjeta en dos minutos, cómo comprobarlo y qué hacer si algo no sale.',
  version: 'Versión 1.0 · octubre 2026',
  color: '#b8902a',
  secciones: [
    {
      id: 'saldo', titulo: '¿Para qué sirve el saldo?', html: `
<p>Las apps de tu agencia dentro de GoHighLevel —por ejemplo <b>Hermes Setter</b>, el asistente que responde a tus clientes potenciales— se pagan con un <b>saldo</b> de tu subcuenta en <b>Marketplace Disruptivo</b>. Cada vez que una app trabaja, descuenta de ahí lo que consume.</p>
<div class="ojo"><b>Si el saldo llega a 0, la app se pausa</b> hasta que recargas. No se pierde nada: en cuanto vuelve a haber saldo, sigue funcionando sola.</div>
<div class="tip"><b>Consejo:</b> recarga antes de que se acabe. En <b>Gasto por app</b> ves cuánto consumes al mes y así sabes cuánto te conviene recargar.</div>
<p>El saldo no caduca: se queda en tu cuenta hasta que tus apps lo usan.</p>`,
    },
    {
      id: 'entrar', titulo: 'Abre Marketplace Disruptivo', html: `
<ol class="pasos">
  <li>Entra en tu cuenta de GoHighLevel.</li>
  <li>En el menú de la izquierda, baja hasta el final y pulsa <span class="ruta">Marketplace Disruptivo</span>.</li>
  <li>Se abre tu portal. Entras directamente, sin usuario ni contraseña.</li>
</ol>
<figure><img data-src="rec-01-menu.png" alt="Menú de GoHighLevel"><figcaption>El menú de GoHighLevel con Marketplace Disruptivo (abajo, resaltado) y tu portal abierto a la derecha.</figcaption></figure>
<div class="nota"><b>¿No ves Marketplace Disruptivo en el menú?</b> Escríbenos y lo activamos en tu cuenta.</div>`,
    },
    {
      id: 'tarjeta', titulo: 'Recarga con tarjeta, paso a paso', html: `
<ol class="pasos">
  <li>En el recuadro <b>Recargar saldo</b>, elige un importe (10, 25, 50 o 100 USD) o escribe otro en <b>Otro</b>, entre 5 y 5.000 USD.</li>
  <li>Pulsa <span class="ruta">Pagar con tarjeta</span>.</li>
  <li>Se abre una <b>pestaña nueva</b> con la página de pago seguro y cifrado. Escribe los datos de tu tarjeta y confirma el pago.</li>
  <li>Al terminar verás <b>«¡Recarga completada!»</b>. Cierra esa pestaña y vuelve a GoHighLevel: el saldo ya está sumado.</li>
</ol>
<figure><img data-src="rec-03-importe.png" alt="Importe elegido"><figcaption>Paso a y b: importe elegido (25 USD) y el botón Pagar con tarjeta.</figcaption></figure>
<figure><img data-src="rec-04-esperando.png" alt="Esperando el pago"><figcaption>Mientras pagas, tu portal muestra «Esperando tu pago…» y se actualiza solo cuando el pago se confirma.</figcaption></figure>
<figure class="s"><img data-src="rec-05-ok.png" alt="Recarga completada"><figcaption>Paso d: la pestaña de pago termina con «¡Recarga completada!».</figcaption></figure>
<div class="tip"><b>¿No se abrió la pestaña de pago?</b> Pulsa <span class="ruta">Abrir el pago</span> en el aviso «Esperando tu pago…».</div>`,
    },
    {
      id: 'comprobar', titulo: 'Comprueba tu saldo y tu consumo', html: `
<p>Todo está en <b>Mi consumo</b>, arriba de tu portal:</p>
<table>
  <tr><th>Dónde</th><th>Qué te dice</th></tr>
  <tr><td>Crédito disponible</td><td>El saldo que te queda ahora mismo.</td></tr>
  <tr><td>Últimos 30 días</td><td>Lo que han consumido tus apps este último mes.</td></tr>
  <tr><td>Total histórico</td><td>Todo lo consumido desde el principio.</td></tr>
  <tr><td>Recargado hasta ahora</td><td>Debajo del recuadro de recarga: la suma de tus recargas.</td></tr>
  <tr><td>Consumo reciente y Gasto por app</td><td>Qué app ha gastado, cuánto y cuándo.</td></tr>
</table>
<figure><img data-src="rec-06-saldo.png" alt="Saldo y consumo"><figcaption>Tras recargar 25 USD: crédito disponible, consumo reciente y gasto por app.</figcaption></figure>`,
    },
    {
      id: 'dudas', titulo: 'Preguntas frecuentes', html: `
<table>
  <tr><th>Pregunta</th><th>Respuesta</th></tr>
  <tr><td>¿En qué moneda pago?</td><td>En dólares (USD). Si tu tarjeta es en euros, tu banco hace el cambio.</td></tr>
  <tr><td>¿Cuánto tarda en aparecer el saldo?</td><td>Unos segundos. Si cierras la pestaña de pago antes de volver, se suma igualmente en un minuto como mucho.</td></tr>
  <tr><td>He pagado y no veo el saldo</td><td>Espera un minuto y vuelve a abrir Marketplace Disruptivo. Si sigue sin aparecer, escríbenos con la fecha y el importe del pago. Nunca se cobra dos veces la misma recarga.</td></tr>
  <tr><td>No veo el botón «Pagar con tarjeta»</td><td>Escríbenos y lo activamos en tu cuenta.</td></tr>
  <tr><td>¿Puedo recargar desde mi monedero de GoHighLevel?</td><td>Muy pronto. Cuando esté disponible verás también el botón «Desde mi monedero de GHL» para pasar saldo de tu monedero de GoHighLevel a Marketplace Disruptivo.</td></tr>
  <tr><td>¿Necesito factura?</td><td>Escríbenos con la fecha y el importe del pago y te la enviamos.</td></tr>
</table>
<div class="nota"><b>Soporte:</b> departamentodisruptivo@gmail.com</div>`,
    },
  ],
}
