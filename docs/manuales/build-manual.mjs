// Genera un manual en HTML (autocontenido, imágenes en base64) y su PDF con el Chrome del sistema en modo headless.
// Uso: node build-manual.mjs <contenido.json>
//   contenido.json = { slug, titulo, subtitulo, app, color, version, secciones: [{ id, titulo, html }] }
//   Dentro del html se usa <img data-src="fichero.png"> (ruta relativa al scratchpad) y se sustituye por base64.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const S = 'C:/Users/keytb/AppData/Local/Temp/claude/C--Users-keytb-OneDrive-Escritorio-PROYECTOS-IA-CLAUDE/20e2b22a-3691-42ed-b676-e622d42f4297/scratchpad'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const defFile = path.resolve(process.argv[2])
const def = defFile.endsWith('.mjs') ? (await import('file:///' + defFile.split('\\').join('/'))).default : JSON.parse(readFileSync(defFile, 'utf8'))

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const b64 = (file) => {
  const p = path.isAbsolute(file) ? file : path.join(S, file)
  if (!existsSync(p)) { console.warn('⚠ falta imagen', file); return '' }
  const ext = path.extname(p).slice(1).toLowerCase()
  return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${readFileSync(p).toString('base64')}`
}
const inlineImgs = (html) => html.replace(/<img([^>]*?)data-src="([^"]+)"([^>]*)>/g, (m, a, src, b) => `<img${a}src="${b64(src)}"${b}>`)

const toc = def.secciones.map((s, i) => `<li><a href="#${s.id}"><span class="n">${i + 1}</span>${esc(s.titulo)}</a></li>`).join('')
const body = def.secciones.map((s, i) => `<section id="${s.id}" class="sec"><h2><span class="num">${i + 1}</span>${esc(s.titulo)}</h2>${inlineImgs(s.html)}</section>`).join('\n')

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(def.titulo)}</title>
<style>
  @page { size: A4; margin: 16mm 15mm 18mm 15mm; }
  :root { --c: ${def.color || '#b8902a'}; --ink: #1a1a1a; --mut: #6b6b6b; --bg: #f7f5f0; --line: #e4e0d6; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Inter, Arial, sans-serif; color: var(--ink); font-size: 11.2pt; line-height: 1.5; }
  .cover { height: 257mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; border-left: 10px solid var(--c); padding-left: 22px; }
  .cover .app { color: var(--c); font-weight: 700; letter-spacing: .12em; text-transform: uppercase; font-size: 11pt; }
  .cover h1 { font-size: 34pt; line-height: 1.1; margin: 10px 0 8px; }
  .cover .sub { font-size: 14pt; color: var(--mut); max-width: 150mm; }
  .cover .meta { margin-top: 40px; color: var(--mut); font-size: 10pt; }
  .toc { page-break-after: always; }
  .toc h2 { font-size: 18pt; margin-bottom: 8px; }
  .toc ol { list-style: none; padding: 0; margin: 0; column-count: 1; }
  .toc li { padding: 5px 0; border-bottom: 1px dotted var(--line); }
  .toc a { color: var(--ink); text-decoration: none; }
  .toc .n { display: inline-block; width: 26px; color: var(--c); font-weight: 700; }
  .sec { page-break-before: always; }
  .sec:first-of-type { page-break-before: auto; }
  h2 { font-size: 19pt; margin: 0 0 10px; padding-bottom: 6px; border-bottom: 2px solid var(--c); }
  h2 .num { display: inline-block; min-width: 30px; color: var(--c); }
  h3 { font-size: 13.5pt; margin: 18px 0 6px; color: #333; }
  p { margin: 6px 0 10px; }
  .pasos { margin: 8px 0 12px; padding: 0; list-style: none; counter-reset: paso; }
  .pasos li { position: relative; padding: 5px 0 5px 34px; counter-increment: paso; }
  .pasos li::before { content: counter(paso, lower-alpha) ")"; position: absolute; left: 0; top: 4px; width: 26px; height: 22px; text-align: center; font-weight: 700; color: #fff; background: var(--c); border-radius: 6px; font-size: 10pt; line-height: 22px; }
  figure { margin: 10px 0 16px; page-break-inside: avoid; }
  figure img { width: 100%; border: 1px solid var(--line); border-radius: 6px; }
  figure.s img { width: 70%; }
  figcaption { font-size: 9.5pt; color: var(--mut); margin-top: 4px; }
  .tip, .ojo, .nota { border-left: 4px solid var(--c); background: var(--bg); padding: 8px 12px; margin: 10px 0; border-radius: 0 6px 6px 0; page-break-inside: avoid; }
  .ojo { border-color: #c0392b; background: #fbf1ef; }
  .tip b, .ojo b, .nota b { color: var(--c); }
  .ojo b { color: #c0392b; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 12px; font-size: 10.5pt; page-break-inside: avoid; }
  th, td { border: 1px solid var(--line); padding: 6px 8px; vertical-align: top; text-align: left; }
  th { background: var(--bg); }
  code { background: #f1efe9; padding: 1px 5px; border-radius: 4px; font-size: 10pt; }
  .kbd { display: inline-block; border: 1px solid #bbb; border-bottom-width: 2px; border-radius: 4px; padding: 0 6px; font-size: 10pt; background: #fff; }
  .ruta { color: var(--c); font-weight: 600; }
  .check li { margin: 3px 0; }
  .footer { font-size: 9pt; color: var(--mut); margin-top: 30px; border-top: 1px solid var(--line); padding-top: 8px; }
</style></head><body>
<div class="cover">
  <div class="app">${esc(def.app)}</div>
  <h1>${esc(def.titulo)}</h1>
  <div class="sub">${esc(def.subtitulo)}</div>
  <div class="meta">${esc(def.version)} · Marketplace Disruptivo · Departamento Disruptivo<br>Soporte: departamentodisruptivo@gmail.com</div>
</div>
<div class="toc"><h2>Índice</h2><ol>${toc}</ol></div>
${body}
<div class="footer">${esc(def.titulo)} · ${esc(def.version)} · Si algo no cuadra con lo que ves en pantalla, escribe a departamentodisruptivo@gmail.com.</div>
</body></html>`

const htmlPath = path.join(S, `manual-${def.slug}.html`)
const pdfPath = path.join(S, `manual-${def.slug}.pdf`)
writeFileSync(htmlPath, html)
execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${S}/chrome-pdf-profile`, '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, 'file:///' + htmlPath.replace(/\\/g, '/')], { stdio: 'ignore', timeout: 120000 })
console.log('OK', pdfPath, Math.round(readFileSync(pdfPath).length / 1024) + ' KB')
