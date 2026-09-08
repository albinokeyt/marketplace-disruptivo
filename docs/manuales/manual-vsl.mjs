export default {
  slug: 'vsl-boost',
  app: 'VSL Boost',
  titulo: 'Manual de uso de VSL Boost',
  subtitulo: 'De cero a tu primera VSL montada en una página de GoHighLevel: subir el vídeo, diseñar el player, copiar el código, insertarlo en tu funnel y medir cómo responde tu audiencia. Paso a paso.',
  version: 'Versión 1.0 · septiembre 2026',
  color: '#2f6fed',
  secciones: [
    {
      id: 'antes', titulo: 'Antes de empezar', html: `
<p><b>VSL Boost</b> aloja tus vídeos de venta (VSL) y los sirve con un reproductor propio, rápido y sin buffering, desde dentro de GoHighLevel. Subes el vídeo una vez, eliges cómo se ve el player, copias un código y lo pegas en cualquier página o funnel. Después ves cuánta gente lo carga, le da a play, hasta dónde llega y cuántos pulsan tu botón.</p>
<h3>Qué necesitas</h3>
<ul class="check">
  <li>Tu vídeo en MP4 (o MOV). Cuanta más calidad subas, mejor: la app genera sola las versiones de 240p a 1080p.</li>
  <li>La página o el funnel de GoHighLevel donde irá la VSL.</li>
  <li>10 minutos.</li>
</ul>
<h3>Cómo entrar</h3>
<ol class="pasos">
  <li>Entra en tu subcuenta de GoHighLevel.</li>
  <li>En el menú lateral, abre <span class="ruta">Aplicaciones del mercado</span> y pulsa <span class="ruta">Vsl</span>. El panel se abre dentro de GoHighLevel con tu usuario ya identificado.</li>
  <li>Arriba a la izquierda puedes cambiar el idioma del panel (ES, EN, PT).</li>
</ol>
<figure><img data-src="vslu-panel-pub.png" alt="Panel"><figcaption>El Panel al entrar: total de vídeos, duración combinada, vistas y espectadores únicos del mes, y los vídeos recientes.</figcaption></figure>
<table><tr><th>Sección</th><th>Para qué sirve</th></tr>
<tr><td>Panel</td><td>Resumen: vídeos subidos, duración total, vistas y espectadores únicos.</td></tr>
<tr><td>Videos</td><td>Tu biblioteca: subir, organizar en carpetas, diseñar el player y copiar el código. Pasos 1 a 4.</td></tr>
<tr><td>Analíticas</td><td>Impresiones, plays, tasa de play, finalización, tiempo medio visto y clics en el CTA. Paso 5.</td></tr>
<tr><td>Planes / Facturación</td><td>Tu plan y tu consumo de almacenamiento y ancho de banda.</td></tr>
<tr><td>Configuración</td><td>Tu perfil, seguridad y preferencias.</td></tr>
</table>`
    },
    {
      id: 'paso1', titulo: 'Paso 1 · Sube tu primer vídeo', html: `
<ol class="pasos">
  <li>Entra en <span class="ruta">Videos</span> y pulsa <span class="ruta">Subir Video</span> (arriba a la derecha).</li>
  <li>Arrastra el archivo al recuadro o pulsa <span class="ruta">Seleccionar carpeta</span> para buscarlo en tu ordenador. Puedes soltar varios vídeos a la vez.</li>
  <li><b>Título del Video:</b> el nombre con el que lo reconocerás (por ejemplo «VSL principal · septiembre»).</li>
  <li><b>Descripción</b> (opcional) y <b>Carpeta</b> (si ya tienes carpetas; si no, lo crearás en el Paso 2).</li>
  <li>Pulsa el botón de subir y no cierres la pestaña hasta que termine la subida.</li>
  <li>El vídeo aparece en la biblioteca como <b>Procesando</b> mientras se generan las calidades. En unos minutos (depende de la duración) pasa a <b>Listo</b>. Usa los filtros <b>Todos · Listos · Procesando · Inactivos</b> para verlo.</li>
</ol>
<figure><img data-src="man-vsl-subir-video-pub.png" alt="Subir vídeo"><figcaption>La ventana de subida: archivo, título, descripción y carpeta.</figcaption></figure>
<figure><img data-src="vslu-videos-pub.png" alt="Biblioteca"><figcaption>La biblioteca con las tarjetas de cada vídeo, el buscador, el orden y, arriba, tu plan y el uso de almacenamiento del mes.</figcaption></figure>
<div class="tip"><b>Consejo:</b> sube el vídeo ya editado y con el audio nivelado. La app no edita el vídeo, solo lo prepara para que cargue rápido en cualquier dispositivo.</div>`
    },
    {
      id: 'paso2', titulo: 'Paso 2 · Organiza en carpetas', html: `
<p>Las carpetas te permiten separar vídeos por proyecto, cliente o funnel. No cambian nada en el player: son solo para que encuentres cada vídeo rápido.</p>
<ol class="pasos">
  <li>En <span class="ruta">Videos</span>, en la columna <b>CARPETAS</b>, pulsa el icono de carpeta nueva (a la derecha del título).</li>
  <li>Escribe el nombre de la carpeta y confirma.</li>
  <li>Al subir un vídeo, elige la carpeta en el campo <b>Carpeta</b>; para mover uno ya subido, ábrelo y cámbiale la carpeta desde su edición.</li>
  <li>Pulsa una carpeta para ver solo sus vídeos; <b>Todos los videos</b> vuelve a mostrar la biblioteca completa. <b>Sin categoría</b> reúne los que no tienen carpeta.</li>
</ol>`
    },
    {
      id: 'paso3', titulo: 'Paso 3 · Diseña el player', html: `
<p>Cada vídeo tiene su propio diseño de reproductor. Pulsa sobre la tarjeta del vídeo (o su título) para abrir el editor de diseño.</p>
<ol class="pasos">
  <li>Arriba eliges el modo: <b>Simple</b> (lo esencial) o <b>Experto</b> (todos los ajustes). Empieza por Simple.</li>
  <li><b>Estilo → Elegí un preset visual:</b> Default (equilibrado), Dark (elegante), Glass (translúcido), VSL Rojo (marco rojo clásico con barra de controles) o Minimal (limpio). Pulsa uno y la vista previa cambia al momento.</li>
  <li><b>Formato del video:</b> Horizontal 16:9 (lo normal en una VSL), Vertical 9:16 (móvil) o Clásico 4:3.</li>
  <li><b>Ancho máximo</b> y <b>Esquinas redondeadas:</b> ajustan el tamaño del player en la página y el borde. 1280 px es un buen ancho para escritorio.</li>
  <li><b>Reproducción:</b> Autoplay (arranca solo al cargar la página), Silenciado (obligatorio para que el autoplay funcione en los navegadores) y Loop. Aquí también eliges el <b>Thumbnail / Poster</b>, la imagen que se ve antes de reproducir.</li>
  <li><b>Botón de acción (CTA):</b> el aviso «Presiona para activar el sonido» que aparece sobre el vídeo silenciado, y el <b>CTA temporizado</b>: un botón que aparece en el minuto que tú decidas (por ejemplo, el enlace de compra a los 8 minutos).</li>
  <li><b>Player → Controles:</b> muestra u oculta la barra de controles (en una VSL suele ocultarse para que no adelanten el vídeo).</li>
  <li>Usa los iconos de <b>Vista previa</b> (escritorio y móvil) y el botón <b>Reproducir</b> para comprobar el resultado. <b>Restablecer</b> vuelve al diseño por defecto.</li>
  <li>Pulsa <span class="ruta">Guardar</span>. Con <b>Plantillas de Estilo</b> puedes guardar este diseño y reutilizarlo en otros vídeos.</li>
</ol>
<figure><img data-src="man-vsl-design-simple-pub.png" alt="Editor de diseño"><figcaption>El editor de diseño: presets a la izquierda, vista previa a la derecha, y arriba los botones Copiar Embed y Guardar.</figcaption></figure>
<figure><img data-src="man-vsl-design-scroll-2-pub.png" alt="Formato y tamaño"><figcaption>Formato, ancho máximo, esquinas y los apartados Reproducción, Botón de acción y Player.</figcaption></figure>
<div class="tip"><b>Receta VSL clásica:</b> preset VSL Rojo o Dark, formato 16:9, Autoplay + Silenciado activados, aviso «Presiona para activar el sonido», controles ocultos y un CTA temporizado en el momento de la oferta.</div>`
    },
    {
      id: 'paso4', titulo: 'Paso 4 · Inserta la VSL en tu página de GoHighLevel', html: `
<ol class="pasos">
  <li>En el editor de diseño del vídeo, pulsa <span class="ruta">Copiar Embed</span>. Verás el aviso «Diseño guardado y código iframe copiado»: el código ya está en tu portapapeles.</li>
  <li>En GoHighLevel, ve a <span class="ruta">Sitios → Embudos</span> (o Sitios web), abre el funnel y el paso donde va la VSL, y pulsa <b>Editar</b> para abrir el constructor.</li>
  <li>Coloca el cursor en la sección donde quieres el vídeo y añade un elemento de tipo <b>Código personalizado</b> (Custom Code / HTML).</li>
  <li>Pega el código copiado en el cuadro del elemento y confirma.</li>
  <li>Ajusta el ancho del elemento o de la columna para que el player ocupe lo que quieras (el ancho máximo lo fijaste en el Paso 3).</li>
  <li>Pulsa <span class="ruta">Guardar</span> y después <span class="ruta">Publicar</span>. Abre la URL pública de la página y comprueba que el vídeo carga y arranca como esperas.</li>
</ol>
<figure><img data-src="man-vsl-detalle-embed-pub.png" alt="Copiar Embed"><figcaption>Al pulsar Copiar Embed se guarda el diseño y se copia el código iframe.</figcaption></figure>
<div class="ojo"><b>Si cambias el diseño después,</b> no hace falta volver a pegar nada: el código apunta al vídeo y siempre muestra el último diseño guardado.</div>
<div class="nota"><b>Autoplay en móvil:</b> los navegadores solo permiten arrancar solos los vídeos silenciados. Por eso el aviso «Presiona para activar el sonido» es importante: el visitante toca y el audio se activa.</div>`
    },
    {
      id: 'paso5', titulo: 'Paso 5 · Mide cómo responde tu audiencia', html: `
<p>En <span class="ruta">Analíticas</span> ves el rendimiento de todos tus vídeos; desde la biblioteca, <b>Métricas generales</b> te lleva al mismo sitio, y cada vídeo tiene sus propias cifras.</p>
<ol class="pasos">
  <li>Elige el rango: <b>7D</b>, <b>30D</b>, <b>90D</b> o <b>1Y</b>.</li>
  <li>Lee las seis cifras clave (tabla de abajo) y el gráfico de <b>Reproducciones en el tiempo</b>, con las pestañas Reproducciones, Viewers únicos y Tiempo visto.</li>
  <li>Compara antes y después de cada cambio: un preset distinto, otro thumbnail o mover el CTA temporizado cambian la tasa de play y los clics.</li>
</ol>
<figure><img data-src="vslu-analiticas-pub.png" alt="Analíticas"><figcaption>Las analíticas de tus vídeos con el rango de fechas y las cifras clave.</figcaption></figure>
<table><tr><th>Métrica</th><th>Qué mide</th><th>Cómo mejorarla</th></tr>
<tr><td>Impresiones</td><td>Veces que el vídeo cargó en la página.</td><td>Más tráfico a la página.</td></tr>
<tr><td>Plays</td><td>Veces que le dieron a play.</td><td>Autoplay, buen thumbnail, player visible sin hacer scroll.</td></tr>
<tr><td>Tasa de play</td><td>Plays dividido entre impresiones.</td><td>Thumbnail con cara y texto; titular encima del vídeo.</td></tr>
<tr><td>Finalización</td><td>Cuántos llegan al final.</td><td>Vídeo más corto o más ritmo en los primeros 30 segundos.</td></tr>
<tr><td>Tiempo medio visto</td><td>Cuánto ve cada persona.</td><td>Promesa clara al inicio; sin controles para que no salten.</td></tr>
<tr><td>Clics CTA</td><td>Pulsaciones en tu botón de acción.</td><td>Mostrar el CTA justo después de la oferta.</td></tr>
</table>`
    },
    {
      id: 'plan', titulo: 'Tu plan y tu saldo', html: `
<p>VSL Boost se contrata por suscripción mensual a través de <b>Marketplace Disruptivo</b>, el portal de apps de tu agencia que ves en el menú de tu subcuenta.</p>
<ol class="pasos">
  <li>Abre <span class="ruta">Aplicaciones del mercado → Marketplace Disruptivo</span> en tu subcuenta.</li>
  <li>En <b>Planes disponibles</b>, pulsa <span class="ruta">Contratar con mi saldo</span> en el plan de VSL Boost. Se cobra el primer periodo al momento y se renueva solo.</li>
  <li>El importe sale primero de tu crédito interno y, si no llega, de tu wallet de GoHighLevel. Recarga crédito desde el mismo portal con <span class="ruta">Recargar saldo</span>.</li>
  <li>Si una renovación no se puede cobrar tienes unos días de gracia con acceso mientras recargas.</li>
</ol>
<div class="nota">Las secciones <b>Planes</b> y <b>Facturación</b> dentro de VSL Boost muestran tu consumo de almacenamiento y ancho de banda. Si tu acceso viene del marketplace, no necesitas contratar nada ahí.</div>`
    },
    {
      id: 'problemas', titulo: 'Problemas frecuentes', html: `
<table><tr><th>Qué pasa</th><th>Qué hacer</th></tr>
<tr><td>El vídeo lleva mucho tiempo en «Procesando»</td><td>Es normal en vídeos largos (una hora puede tardar 15-20 minutos). Si pasa de una hora, vuelve a subirlo en MP4 (H.264) o escribe a soporte.</td></tr>
<tr><td>No se ve en la página publicada</td><td>Comprueba que pegaste el código en un elemento de Código personalizado (no en un cuadro de texto) y que publicaste la página. Recarga sin caché.</td></tr>
<tr><td>Arranca sin sonido</td><td>Es el comportamiento del Autoplay silenciado. Activa el aviso «Presiona para activar el sonido» para que el visitante lo active con un toque.</td></tr>
<tr><td>Se ve pequeño o desbordado</td><td>Ajusta el ancho máximo en el diseño y el ancho de la columna en GoHighLevel. En móvil el player se adapta solo.</td></tr>
<tr><td>Las analíticas no suben</td><td>Cuentan solo cargas reales del player publicado; la vista previa del editor y el constructor de GoHighLevel no cuentan.</td></tr>
<tr><td>El panel dice que tu plan no está activo</td><td>Abre Marketplace Disruptivo en tu subcuenta, recarga saldo o contrata el plan. El acceso vuelve al momento.</td></tr>
</table>
<h3>Checklist final</h3>
<ul class="check">
  <li>Vídeo en estado Listo.</li>
  <li>Diseño guardado con preset, formato y autoplay decididos.</li>
  <li>Código pegado en un elemento de Código personalizado y página publicada.</li>
  <li>Reproducción comprobada en escritorio y móvil.</li>
  <li>Primeras cifras visibles en Analíticas.</li>
</ul>`
    },
  ],
}
