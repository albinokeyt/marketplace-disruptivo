export default {
  slug: 'hermes-setter',
  app: 'Hermes Setter',
  titulo: 'Manual de uso de Hermes Setter',
  subtitulo: 'De cero a tu primer setter de IA respondiendo a tus leads por Instagram, WhatsApp, Facebook y SMS desde GoHighLevel: conexión, prompt, comportamiento, activaciones, seguimientos, pruebas y día a día. Paso a paso, sin conocimientos técnicos.',
  version: 'Versión 1.0 · septiembre 2026',
  color: '#b8902a',
  secciones: [
    {
      id: 'antes', titulo: 'Antes de empezar', html: `
<p><b>Hermes</b> es un setter de inteligencia artificial: contesta a las personas que te escriben por Instagram, WhatsApp, Facebook y SMS dentro de GoHighLevel, las cualifica con tus criterios y las lleva a tu objetivo (agendar una cita, enviar un enlace de venta o un recurso). Aprende tu negocio desde un <b>prompt</b> que puedes redactar conversando con su <b>Arquitecto</b>, hace seguimientos automáticos y se aparta cuando una persona de tu equipo entra en la conversación.</p>
<h3>Qué necesitas</h3>
<ul class="check">
  <li>Tu subcuenta de GoHighLevel con Instagram, WhatsApp o Facebook ya conectados en Conversaciones.</li>
  <li>Claro qué vendes, a quién y qué quieres conseguir con cada conversación (agendar, vender, enviar un recurso).</li>
  <li>Tu enlace de calendario si el objetivo es agendar.</li>
  <li>Una hora tranquila para configurar y probar.</li>
</ul>
<h3>Cómo entrar</h3>
<ol class="pasos">
  <li>Entra en tu subcuenta de GoHighLevel.</li>
  <li>En el menú lateral, abre <span class="ruta">Aplicaciones del mercado</span> y pulsa <span class="ruta">HERMES-SETTER</span>. El panel se abre dentro de GoHighLevel con tu usuario ya identificado.</li>
  <li>La primera vez te ofrece un <b>tutorial guiado</b> de 69 pasos que recorre cada sección. Pulsa <b>Sí, empezar</b> si quieres verlo ahora, o <b>Ahora no</b>. Siempre puedes volver a verlo con el botón <span class="ruta">Tutorial</span>, abajo a la izquierda del menú.</li>
</ol>
<figure><img data-src="manh-bienvenida-pub.png" alt="Primera vez"><figcaption>Primera entrada: la oferta del tutorial guiado sobre el Dashboard.</figcaption></figure>
<h3>El menú, de un vistazo</h3>
<table><tr><th>Sección</th><th>Para qué sirve</th></tr>
<tr><td>Dashboard</td><td>Tu resumen: conversaciones, mensajes, agendas, leads por status y gasto de IA del periodo.</td></tr>
<tr><td>Conversaciones</td><td>Todos los chats reales en tiempo real; entra a cualquiera, escribe tú o pausa al setter.</td></tr>
<tr><td>Status</td><td>Tu embudo en tablero: cada lead en su columna (nuevo, en conversación, calificado, agendado…).</td></tr>
<tr><td>Mis agentes</td><td>La pieza central: tu conexión (tu subcuenta) y dentro tus setters. Aquí se configura todo.</td></tr>
<tr><td>Versus</td><td>Pon a competir dos setters con leads reales y mide cuál agenda más.</td></tr>
<tr><td>Probar agente</td><td>Chatea con tu setter como si fueras un cliente antes de soltarlo.</td></tr>
<tr><td>Archivo</td><td>El historial completo de mensajes y comentarios de Instagram, descargable en CSV.</td></tr>
<tr><td>Reportar error</td><td>Avisa al equipo si algo falla, con capturas, y sigue la respuesta.</td></tr>
</table>
<div class="nota"><b>El orden para arrancar</b> (es el que recomienda el propio tutorial): entra en <b>Mis agentes</b>, crea tu setter, redacta su prompt con el <b>Arquitecto</b>, pruébalo en <b>Probar agente</b> y solo entonces actívalo. Este manual sigue exactamente ese orden.</div>`
    },
    {
      id: 'paso1', titulo: 'Paso 1 · Tu conexión (Mis agentes)', html: `
<p>Una <b>conexión</b> es una subcuenta de GoHighLevel enlazada con Hermes. Dentro de la conexión viven tus <b>setters</b>: los asistentes que chatean por ti. Al abrir Hermes desde tu subcuenta, la conexión se crea sola.</p>
<ol class="pasos">
  <li>Entra en <span class="ruta">Mis agentes</span>. Verás una fila con tu subcuenta y el texto <b>GHL conectado</b>.</li>
  <li>En esa fila tienes: los canales que atiende, el estado <b>IA activa</b>, el interruptor de <b>modo test</b> (🧪), el botón <b>Test</b> y el botón <b>Conexión</b>, que abre su configuración.</li>
  <li>Con la flechita de la izquierda despliegas los setters de la conexión.</li>
  <li>¿Quieres Hermes en otra subcuenta? No hace falta crear nada aquí: abre Hermes desde esa otra subcuenta (mismo menú) y se conecta sola. El botón <b>Nueva conexión</b> te lo recuerda.</li>
</ol>
<figure><img data-src="manh-mis-agentes-pub.png" alt="Mis agentes"><figcaption>Mis agentes: tu conexión con GHL conectado, IA activa, Test y el botón Conexión.</figcaption></figure>
<figure><img data-src="manh-nueva-conexion-pub.png" alt="Nueva conexión"><figcaption>Nueva conexión: para otra subcuenta, basta abrir Hermes desde ella.</figcaption></figure>`
    },
    {
      id: 'paso2', titulo: 'Paso 2 · Ajustes de la conexión', html: `
<p>Pulsa <span class="ruta">Conexión</span> en la fila de tu subcuenta. Arriba tienes el interruptor <b>Conexión activa</b> (enciende o apaga TODOS sus setters) y el botón <b>Guardar</b>: <b>nada se guarda solo</b>, pulsa Guardar tras cada cambio.</p>
<figure><img data-src="manh-conexion-setters-pub.png" alt="Pestañas de la conexión"><figcaption>La conexión: pestañas Setters, Ajustes, CTAs y Accesos, y el interruptor Conexión activa.</figcaption></figure>
<h3>Pestaña Setters</h3>
<p>Cada fila es un asistente: si está encendido, qué IA usa, cuántos leads lleva y cuántas agendas consiguió. El marcado como <b>principal</b> atiende a quien no encaje con ningún otro. Desde aquí entras a editar cada setter.</p>
<h3>Pestaña Ajustes</h3>
<ol class="pasos">
  <li><b>Nombre visible (alias):</b> el nombre bonito que ves en el panel. Guárdalo con «Guardar alias».</li>
  <li><b>Limitar horario de respuesta:</b> si lo activas, fuera del horario el asistente no responde: guarda lo pendiente y contesta cuando vuelva a abrir. Elige desde, hasta y tu zona horaria (por ejemplo Europe/Madrid).</li>
  <li><b>Tiempo de inserción (toda la conexión):</b> segundos que esperan los setters antes de procesar el <i>primer</i> mensaje de un lead nuevo. Sirve para que una automatización de GoHighLevel le ponga antes una etiqueta (por ejemplo «a este no le respondas»). 0 = de inmediato.</li>
  <li><b>Reaplicar tras inactividad:</b> si el lead vuelve tras esas horas sin actividad, se aplica de nuevo la espera.</li>
  <li><b>Modo test:</b> con esto activado los setters SOLO responden a contactos que tengan la etiqueta de prueba en GoHighLevel. Perfecto para ensayar con tu propio número antes de abrir el grifo.</li>
  <li><b>Etiqueta para excluir de las IAs:</b> cualquier contacto con esta etiqueta (por defecto <code>sin-ia</code>) queda fuera: ningún setter le responde. Útil para clientes actuales o casos delicados.</li>
  <li><b>Pausar bot si un humano interviene:</b> si alguien de tu equipo responde a mano desde GoHighLevel, el bot se aparta en ese chat. <b>Reactivar el bot tras</b> tantos minutos sin mensaje humano (0 = queda pausado hasta reactivarlo a mano).</li>
  <li><b>Comentarios de Instagram:</b> pega la URL que te da aquí en una automatización de GoHighLevel con el disparador «comentario de Instagram» y todos los comentarios quedarán registrados en el Archivo.</li>
  <li>Pulsa <span class="ruta">Guardar</span>.</li>
</ol>
<figure><img data-src="manh-conexion-ajustes-pub.png" alt="Horario de respuesta"><figcaption>Ajustes: alias y horario de respuesta con zona horaria.</figcaption></figure>
<figure><img data-src="manh-conexion-test-pub.png" alt="Modo test"><figcaption>Ajustes: modo test de toda la conexión, etiqueta de exclusión y pausa si interviene un humano.</figcaption></figure>
<h3>Pestaña CTAs (esperas para anuncios)</h3>
<p>Si el <b>primer mensaje</b> del lead contiene una palabra o frase (la de tu anuncio, por ejemplo «quiero la guía»), el setter espera el tiempo que definas antes de entrar, para no contestar de golpe y parecer un robot. Pulsa <b>Añadir CTA</b>, escribe la palabra clave y los segundos de espera. Deja la palabra vacía para aplicar la espera a cualquier conversación nueva.</p>
<figure><img data-src="manh-conexion-ctas-pub.png" alt="CTAs"><figcaption>CTAs: esperas para los mensajes que llegan desde anuncios.</figcaption></figure>
<h3>Pestaña Accesos</h3>
<p>Quién puede entrar al panel de esta conexión: los usuarios de tu subcuenta en GoHighLevel entran solos; aquí puedes añadir correos extra (por ejemplo, alguien de tu equipo que no usa GoHighLevel).</p>`
    },
    {
      id: 'paso3', titulo: 'Paso 3 · Crea tu setter', html: `
<ol class="pasos">
  <li>En <span class="ruta">Mis agentes</span>, pulsa <span class="ruta">Nuevo setter</span>.</li>
  <li>Elige la <b>Conexión</b> (tu subcuenta) y escribe el <b>Nombre del setter</b>, por ejemplo «Ventas high-ticket» o el nombre de tu asistente.</li>
  <li>Pulsa <span class="ruta">Crear</span>. Se abre el editor del setter.</li>
  <li>Arriba del editor tienes el interruptor <b>Setter activo</b> (déjalo apagado hasta terminar de configurarlo y probarlo) y el botón <b>Guardar cambios</b>. Recuerda: nada se guarda solo.</li>
  <li>El editor tiene seis pestañas, que veremos una a una: <b>Prompt</b> (lo que sabe decir), <b>IA</b> (su cerebro), <b>Comportamiento</b> (cómo y cuándo responde), <b>⚡ Activaciones</b> (entrar por etiqueta), <b>Seguimientos</b> (reenganchar) y <b>✨ Arquitecto</b> (crear el prompt conversando).</li>
</ol>
<figure><img data-src="manh-nuevo-setter-pub.png" alt="Nuevo setter"><figcaption>Nuevo setter: conexión y nombre, y el botón Crear.</figcaption></figure>
<figure><img data-src="manh-setter-pestanas-pub.png" alt="Pestañas del setter"><figcaption>El editor del setter con sus seis pestañas, el interruptor Setter activo y Guardar cambios.</figcaption></figure>`
    },
    {
      id: 'paso4', titulo: 'Paso 4 · El prompt, en 3 bloques (o el Arquitecto lo hace por ti)', html: `
<p>El prompt es el guion completo del asistente. Se divide en tres bloques que Hermes combina automáticamente con la memoria de cada lead y sus reglas de humanización.</p>
<table><tr><th>Bloque</th><th>Qué va aquí</th><th>Ejemplo</th></tr>
<tr><td>1 · Identidad y personalidad</td><td>Quién es: nombre, tono, forma de escribir, qué haría y qué jamás diría.</td><td>«Eres Sofía, la asistente virtual del equipo de Ana. Escribes cercana y natural, mensajes cortos, castellano de España, tú/vosotros. Te presentas como asistente virtual (IA) y nunca afirmas ser humana.»</td></tr>
<tr><td>2 · Negocio y oferta</td><td>Qué vendes, a quién, precios, beneficios, respuestas a preguntas frecuentes y los enlaces que puede enviar.</td><td>«Vendemos un programa online de 8 semanas para X. Precio 497 €. Incluye… No es para… Preguntas frecuentes: …»</td></tr>
<tr><td>3 · Flujo y objetivo</td><td>El paso a paso de la conversación y su OBJETIVO: agendar, enviar un enlace, calificar…</td><td>«1) Saluda y pregunta qué le trajo. 2) Haz estas 3 preguntas de cualificación… 3) Si cumple, ofrece la llamada y envía este enlace de agenda: … 4) Si no cumple, …»</td></tr>
</table>
<h3>Opción A (recomendada): el Arquitecto lo redacta contigo</h3>
<ol class="pasos">
  <li>En el editor del setter, abre la pestaña <span class="ruta">✨ Arquitecto</span> y pulsa <b>Nueva conversación</b>.</li>
  <li>Cuéntale tu negocio y tu cliente ideal como se lo contarías a un empleado nuevo. Te irá haciendo preguntas: qué vendes, precios, objeciones habituales, tu forma de hablar, el objetivo de la conversación.</li>
  <li>Cuando te proponga la versión final de los 3 bloques y te guste, pulsa <b>Aplicar</b>: se guarda en ESTE setter.</li>
  <li>Vuelve a la pestaña <b>Prompt</b> para leerlo y retocar lo que quieras.</li>
</ol>
<figure><img data-src="manh-arquitecto-pub.png" alt="Arquitecto"><figcaption>El Arquitecto: una conversación que termina en los 3 bloques del prompt.</figcaption></figure>
<h3>Opción B: escribirlo tú</h3>
<ol class="pasos">
  <li>Abre la pestaña <span class="ruta">Prompt</span> y rellena los tres bloques con la tabla de arriba como guía.</li>
  <li>Sé concreto: precios reales, enlaces reales, qué NO debe prometer.</li>
  <li>Pulsa <span class="ruta">Guardar cambios</span>.</li>
</ol>
<figure><img data-src="manh-prompt-pub.png" alt="Prompt"><figcaption>La pestaña Prompt con los tres bloques y el botón Historial.</figcaption></figure>
<div class="tip"><b>Historial:</b> cada vez que guardas se crea una versión. Con el botón <b>🕘 Historial</b> puedes ver las anteriores y volver a cualquiera si un cambio no te gustó.</div>
<div class="ojo"><b>IA transparente.</b> El asistente debe presentarse como asistente virtual y confirmarlo si le preguntan. Es lo que exige la normativa europea y, además, funciona mejor: la gente lo agradece.</div>`
    },
    {
      id: 'paso5', titulo: 'Paso 5 · Pestaña IA: su cerebro', html: `
<ol class="pasos">
  <li><b>Modelo de IA:</b> elige la API de texto con la que chatea. Las APIs las prepara tu agencia; si no ves ninguna, pídeselo.</li>
  <li><b>Temperatura:</b> más alta = más creativo; más baja = más literal. 0,7-0,8 es un buen punto de partida para ventas.</li>
  <li><b>Máximo de mensajes por respuesta:</b> en cuántos mensajes seguidos puede dividir cada respuesta (2-3 suena natural).</li>
  <li><b>API de imagen (leer fotos):</b> si lo activas, cuando el lead envía una foto el asistente la «ve» y la usa en la conversación.</li>
  <li><b>API de audio (notas de voz):</b> si lo activas, las notas de voz se convierten en texto y el asistente responde a lo que dijo. Sin esto, pedirá con naturalidad que se lo escriban.</li>
  <li>Pulsa <span class="ruta">Guardar cambios</span>.</li>
</ol>
<figure><img data-src="manh-ia-pub.png" alt="IA"><figcaption>La pestaña IA: modelo, temperatura y máximo de mensajes por respuesta.</figcaption></figure>`
    },
    {
      id: 'paso6', titulo: 'Paso 6 · Pestaña Comportamiento: cómo y cuándo responde', html: `
<ol class="pasos">
  <li><b>Canales que atiende este setter:</b> marca Instagram, WhatsApp, Facebook, SMS o Chat web. Solo responde en los marcados (al menos uno); los mensajes de otros canales se archivan igual.</li>
  <li><b>Espera antes de responder (debounce):</b> segundos de silencio que deja pasar tras el último mensaje del lead para responder a TODO junto, como una persona. Entre 20 y 40 segundos suele ir bien.</li>
  <li><b>Tiempo de inserción:</b> como el de la conexión, pero solo para este setter (si es mayor, manda el suyo).</li>
  <li><b>Reaplicar tras inactividad:</b> horas sin actividad tras las que vuelve a aplicarse la espera.</li>
  <li><b>Calendarios que cuentan como «agenda»:</b> si su objetivo es agendar, marca aquí SUS calendarios: solo esas reservas cuentan como agenda suya. Sin esto, sus citas no se miden. Si su objetivo es otro, déjalo vacío.</li>
  <li><b>Modo test (solo este setter):</b> SOLO este setter queda en pruebas, con su propia etiqueta, mientras los demás siguen normal.</li>
  <li><b>Filtrar por etiquetas (avanzado):</b> para repartir leads entre varios setters: este solo atiende a contactos con ciertas etiquetas, o ignora a los que tengan otras. Vacío = atiende a cualquiera sin dueño.</li>
  <li>Pulsa <span class="ruta">Guardar cambios</span>.</li>
</ol>
<figure><img data-src="manh-canales-pub.png" alt="Canales"><figcaption>Comportamiento: canales y espera antes de responder.</figcaption></figure>
<figure><img data-src="manh-calendarios-pub.png" alt="Calendarios"><figcaption>Los calendarios que cuentan como agenda del setter y el modo test individual.</figcaption></figure>`
    },
    {
      id: 'paso7', titulo: 'Paso 7 · Activaciones por etiqueta', html: `
<p>Es la joya de Hermes: cuando tu workflow de GoHighLevel le pone una etiqueta a un contacto, el setter <b>entra a hablar él solo</b>, con el contexto que tú le des. Cada etiqueta es un punto de entrada distinto: la que pongas tras descargar una guía hace que entre hablando de esa guía; la que pongas tras un formulario, de ese formulario.</p>
<ol class="pasos">
  <li>Abre la pestaña <span class="ruta">⚡ Activaciones</span> y activa <b>Activación externa por etiqueta</b>.</li>
  <li><b>Etiqueta que activa:</b> escribe el nombre exacto de la etiqueta. Con <b>Crear en GHL</b> la crea en tu subcuenta para que la tengas lista en los workflows.</li>
  <li><b>Contexto de esta etiqueta:</b> qué pasó justo antes de que se la pusieran («el lead pidió la guía X pero no la ha abierto; retoma eso»). Estas instrucciones mandan sobre el flujo normal.</li>
  <li><b>Espera (segundos):</b> cuánto tarda en escribir tras recibir la etiqueta (máximo 1 hora). Un par de minutos parece humano.</li>
  <li>Opcional: vincula <b>CTAs</b> a esta activación. Añade tantas etiquetas como puntos de entrada tengas.</li>
  <li>En GoHighLevel, en el workflow que corresponda (por ejemplo tras «Formulario enviado»), añade la acción <b>Añadir etiqueta de contacto</b> con esa misma etiqueta. Publica el workflow.</li>
  <li>Pulsa <span class="ruta">Guardar cambios</span> en Hermes. En <b>Registro en vivo</b> (parte baja de la pestaña) verás cada activación con su cuenta atrás, el mensaje enviado o el motivo si se descartó.</li>
</ol>
<figure><img data-src="manh-activaciones-pub.png" alt="Activaciones"><figcaption>Activaciones: etiqueta, contexto, espera y CTAs vinculados.</figcaption></figure>
<div class="nota"><b>El webhook de etiquetas</b> (para que las etiquetas lleguen a Hermes) lo configura tu agencia una sola vez para todas las subcuentas. Si una activación no dispara, escríbeles.</div>`
    },
    {
      id: 'paso8', titulo: 'Paso 8 · Seguimientos', html: `
<p>Si el lead deja de contestar, el setter lo retoma solo. Cada paso se cancela si el lead responde. Instagram y WhatsApp solo permiten responder dentro de las 24 horas del último mensaje del lead, por eso el máximo de espera es de 23 horas.</p>
<ol class="pasos">
  <li>Abre la pestaña <span class="ruta">Seguimientos</span>.</li>
  <li>Deja activado <b>Revisar con IA antes de cada seguimiento</b>: lee los últimos mensajes y no persigue a quien ya agendó, ya compró, dijo que no le interesa o se despidió.</li>
  <li>En <b>Seguimiento #1</b>, pon las <b>horas de espera</b> (por ejemplo 8) y la <b>instrucción para la IA</b> («retoma con algo del último tema, cero presión, una sola pregunta»).</li>
  <li>Pulsa <b>Añadir seguimiento</b> para el #2, #3… (hasta 5), cada uno con su espera y su instrucción, cada vez más breve y más suave.</li>
  <li>Pulsa <span class="ruta">Guardar cambios</span>.</li>
</ol>
<figure><img data-src="manh-seguimientos-pub.png" alt="Seguimientos"><figcaption>Seguimientos: revisión con IA y pasos con horas de espera e instrucción.</figcaption></figure>`
    },
    {
      id: 'paso9', titulo: 'Paso 9 · Pruébalo antes de soltarlo', html: `
<p>Antes de activar el setter, chatea con él como si fueras un cliente. No gasta leads reales y se comporta exactamente igual que en producción.</p>
<ol class="pasos">
  <li>Entra en <span class="ruta">Probar agente</span>. Arriba elige la conexión y el setter que quieres probar; <b>Reiniciar</b> empieza una conversación de cero.</li>
  <li>Escribe como el lead en el cuadro de abajo. Prueba a mandar varios mensajes seguidos («hola»… «quería info»): espera unos segundos y responde a todo junto, como hará en la vida real.</li>
  <li>A la derecha, <b>Decisión del agente</b> te dice qué status le puso al lead y por qué, y <b>Memoria que va construyendo</b> muestra los datos que apunta (nombre, negocio, dolor, presupuesto…).</li>
  <li>¿Algo no te gustó? Pulsa <b>Importar cambio</b> y dile la corrección como a un empleado («no ofrezcas descuento tan pronto»). Reescribe el prompt él solo y guarda una versión nueva en el historial.</li>
  <li>Cada prueba queda guardada en la lista de la izquierda con la versión del prompt (v1, v2…): retómala o bórrala. En <b>Gastado en pruebas</b> ves lo que consumen.</li>
  <li>Repite hasta que responda como quieres en al menos tres situaciones: un lead interesado, uno con objeciones de precio y uno que pide hablar con una persona.</li>
</ol>
<figure><img data-src="manh-prueba-chat-pub.png" alt="Chat de prueba"><figcaption>Probar agente: escribe como el lead y observa la respuesta.</figcaption></figure>
<figure><img data-src="manh-prueba-decision-pub.png" alt="Decisión del agente"><figcaption>Decisión del agente: el status que asigna y su motivo.</figcaption></figure>
<figure><img data-src="manh-prueba-importar-pub.png" alt="Importar cambio"><figcaption>Importar cambio: corrige el prompt con tus palabras.</figcaption></figure>`
    },
    {
      id: 'paso10', titulo: 'Paso 10 · Actívalo (primero en modo test)', html: `
<ol class="pasos">
  <li>En la conexión (<span class="ruta">Mis agentes → Conexión → Ajustes</span>), activa el <b>Modo test</b> y guarda. Ahora los setters solo responden a contactos con la etiqueta de prueba.</li>
  <li>En GoHighLevel, ponle la etiqueta de prueba a tu propio contacto (tu número o tu cuenta de Instagram).</li>
  <li>En el editor del setter, enciende <b>Setter activo</b> y pulsa <span class="ruta">Guardar cambios</span>. En Mis agentes, comprueba que la conexión muestra <b>IA activa</b>.</li>
  <li>Escríbete desde tu móvil por el canal real. Comprueba en <span class="ruta">Conversaciones</span> que el setter responde, respeta el horario y agenda en el calendario correcto.</li>
  <li>Cuando todo esté bien, vuelve a Ajustes de la conexión, <b>desactiva el Modo test</b> y guarda. A partir de ahora atiende a todos los leads nuevos.</li>
</ol>
<div class="ojo"><b>Nada se guarda solo.</b> Si cambias algo y no ves el efecto, casi siempre es porque falta pulsar Guardar (en la conexión) o Guardar cambios (en el setter).</div>`
    },
    {
      id: 'diaadia', titulo: 'El día a día: Conversaciones, Status y Dashboard', html: `
<h3>Conversaciones</h3>
<ol class="pasos">
  <li>Busca por nombre o correo, o filtra por conexión, setter o status. También puedes ver solo los chats donde intervino un humano.</li>
  <li>Cada fila: quién es, su última actividad, su status y quién lo atiende. Pulsa una para entrar.</li>
  <li>En la cabecera del chat: canal, setter que lo atiende, <b>Ir a GHL</b> (abre la ficha del contacto) y el botón <b>IA</b>, que saca a ese contacto de las IAs para siempre (o lo devuelve).</li>
  <li>Cada burbuja indica quién habló: el lead, el 🤖 asistente, un 👤 humano o una ⚙️ automatización de GoHighLevel.</li>
  <li>Si escribes tú en el cuadro de abajo, el mensaje sale como humano y el asistente se aparta automáticamente en ese chat. Con el control del chat lo pausas o reactivas, y puedes cambiar el status del lead a mano.</li>
  <li>A la derecha ves la <b>memoria</b> del lead y su <b>historial de status</b> con el motivo de cada cambio. «Borrar conversación» hace que el contacto entre de cero (útil al probar).</li>
</ol>
<figure><img data-src="manh-chat-pub.png" alt="Dentro de un chat"><figcaption>Dentro de un chat: cabecera, conversación, memoria e historial de status.</figcaption></figure>
<h3>Status: tu embudo</h3>
<p>El asistente pone el status a cada lead solo y el tablero los muestra por columnas: Nuevo, En conversación, En seguimiento, Calificado, Seguimiento calificado, En conversión, Agendado, Agenda cancelada, Descartado y <b>🚨 Requiere atención humana</b> (alguien pidió hablar con una persona: entra y atiéndelo). Puedes arrastrar o mover cualquier tarjeta a mano y entrar a su chat desde ella.</p>
<figure><img data-src="manh-tablero-pub.png" alt="Tablero"><figcaption>Status: cada columna es un status y cada tarjeta un lead.</figcaption></figure>
<h3>Dashboard</h3>
<p>Elige el periodo (hoy, 7, 30, 90 días o personalizado) y lee los números clave: conversaciones nuevas y activas, mensajes recibidos y enviados, agendas conseguidas y gasto de IA. Las tarjetas de status te llevan al tablero; la tarjeta 🚨 te avisa si alguien pidió una persona. Abajo, la actividad día a día y los últimos movimientos.</p>
<figure><img data-src="manh-dashboard-pub.png" alt="Dashboard"><figcaption>Dashboard: el resumen del periodo.</figcaption></figure>
<h3>Archivo, Versus y Reportar error</h3>
<ul class="check">
  <li><b>Archivo:</b> el historial completo de mensajes (asistente, humanos, automatizaciones) y los comentarios de Instagram, con filtros y <b>Descargar CSV</b>. Aunque el bot esté apagado, aquí se guarda todo.</li>
  <li><b>Versus:</b> pon a competir a dos setters con leads reales. Elige la métrica ganadora (agendas, conversión…), qué leads compiten (todos o con cierta etiqueta) y los setters. Hermes reparte los leads y te dice cuál gana. Ideal para probar dos formas de vender la misma oferta.</li>
  <li><b>Reportar error:</b> elige el tipo, cuenta qué pasó y adjunta capturas. Verás cada reporte con su estado y la respuesta del equipo dentro del propio reporte.</li>
</ul>`
    },
    {
      id: 'saldo', titulo: 'Tu saldo: cómo se cobra Hermes', html: `
<p>Hermes se cobra <b>por uso</b>: <b>0,25 USD por conversación atendida y día</b>, se descuenta del saldo que tienes en <b>Marketplace Disruptivo</b>, el portal de apps de tu agencia que ves en el menú de tu subcuenta. Sin licencias mensuales: si un día no hay conversaciones, no pagas.</p>
<ol class="pasos">
  <li>Abre <span class="ruta">Aplicaciones del mercado → Marketplace Disruptivo</span> en tu subcuenta.</li>
  <li>En <b>Recargar saldo</b> elige un importe: se cobra de tu wallet de GoHighLevel y queda como crédito para todas las apps del marketplace. Ahí mismo ves tu consumo por app y tus accesos.</li>
  <li>Si tu agencia te ha dado una <b>prueba gratuita</b>, no se descuenta nada hasta que termine; lo ves en <b>Mis accesos</b>.</li>
</ol>
<div class="ojo"><b>Sin saldo, el setter no atiende.</b> Si el saldo se agota, Hermes deja de responder a los leads nuevos hasta que recargues (lo reintenta solo durante unas horas). Mantén siempre un colchón.</div>`
    },
    {
      id: 'problemas', titulo: 'Problemas frecuentes', html: `
<table><tr><th>Qué pasa</th><th>Qué revisar</th></tr>
<tr><td>El setter no responde a nadie</td><td>¿Conexión activa y Setter activo encendidos, y guardado? ¿El canal está marcado en Comportamiento? ¿Estás fuera del horario de respuesta? ¿Modo test activo sin la etiqueta de prueba? ¿Hay saldo en Marketplace Disruptivo?</td></tr>
<tr><td>No responde a un contacto concreto</td><td>Tiene la etiqueta de exclusión (<code>sin-ia</code>), alguien de tu equipo le escribió y el bot se pausó, o se le sacó de las IAs con el botón «IA» del chat.</td></tr>
<tr><td>Responde a trozos o parece que interrumpe</td><td>Sube la espera antes de responder (debounce) a 30-45 segundos.</td></tr>
<tr><td>Agenda pero el Dashboard no lo cuenta</td><td>Marca los calendarios del setter en Comportamiento → Calendarios que cuentan como agenda.</td></tr>
<tr><td>No entra cuando el workflow pone la etiqueta</td><td>La etiqueta debe ser exactamente la misma; la activación debe estar encendida y guardada; mira el Registro en vivo. Si nada llega, el webhook de etiquetas lo revisa tu agencia.</td></tr>
<tr><td>Dice cosas que no son (precios, promesas)</td><td>Revisa el bloque 2 (Negocio y oferta): pon lo que NO debe prometer. Baja la temperatura. Corrígelo con «Importar cambio» en Probar agente.</td></tr>
<tr><td>Un lead pidió hablar con una persona</td><td>Aparece en 🚨 Requiere atención humana. Entra al chat y escribe tú; el bot se aparta solo.</td></tr>
<tr><td>Cambié algo y no se nota</td><td>Pulsa Guardar (conexión) o Guardar cambios (setter). Nada se guarda solo.</td></tr>
</table>
<h3>Checklist final</h3>
<ul class="check">
  <li>Conexión con GHL conectado e IA activa.</li>
  <li>Setter creado, con los 3 bloques del prompt guardados (Arquitecto o a mano).</li>
  <li>Canales marcados, debounce entre 20 y 40 s, calendarios de agenda elegidos.</li>
  <li>Al menos una activación por etiqueta enlazada con un workflow publicado.</li>
  <li>Dos o tres seguimientos con revisión por IA.</li>
  <li>Probado en Probar agente y en modo test con tu propio número.</li>
  <li>Modo test desactivado y saldo cargado en Marketplace Disruptivo.</li>
</ul>`
    },
  ],
}
