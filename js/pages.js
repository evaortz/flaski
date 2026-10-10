// Apuntes: una página es una lista de bloques { id, type, text }.
//   type: 'p' (párrafo) · 'h1' · 'h2' · 'h3' (títulos) · 'li' (lista) · 'ol' (lista numerada)
//         · 'todo' (casilla: checked) · 'quote' (cita) · 'callout' (destacado: icon) · 'code' (código)
//         · 'table' (tabla en Markdown) · 'img' (imagen: src = id, text = pie) · 'hr' (separador)
// El id de un bloque no cambia al editarlo: las tarjetas vinculadas guardan (page_id, block_id).
// Sin dependencias de la interfaz, así que se puede probar aparte.
import { toPlain } from './inline.js';

export const BLOCK_TYPES = ['p', 'h1', 'h2', 'h3', 'li', 'ol', 'todo', 'quote', 'callout', 'code', 'table', 'img', 'hr'];
// Para el menú de bloques (/): nombre, para qué sirve, atajo al escribir y palabras con las que se busca
export const BLOCK_MENU = [
  { type: 'p', label: 'Texto', hint: 'Un párrafo normal', keys: 'parrafo texto' },
  { type: 'h1', label: 'Título', hint: 'Título de un tema', md: '#', keys: 'titulo heading h1' },
  { type: 'h2', label: 'Subtítulo', hint: 'Un apartado', md: '##', keys: 'subtitulo apartado h2' },
  { type: 'h3', label: 'Título pequeño', hint: 'Un apartado dentro de otro', md: '###', keys: 'titulo pequeño h3 seccion' },
  { type: 'li', label: 'Lista', hint: 'Puntos sin orden', md: '-', keys: 'lista vinetas puntos bullet' },
  { type: 'ol', label: 'Lista numerada', hint: '1, 2, 3…', md: '1.', keys: 'lista numerada numeros pasos ordenada' },
  { type: 'todo', label: 'Casilla', hint: 'Algo por hacer o por repasar', md: '[]', keys: 'casilla tarea todo pendiente check' },
  { type: 'quote', label: 'Cita', hint: 'Una cita o un ejemplo', md: '>', keys: 'cita quote ejemplo' },
  { type: 'callout', label: 'Destacado', hint: 'Una nota que llama la atención', keys: 'destacado nota aviso importante callout' },
  { type: 'code', label: 'Código', hint: 'Texto tal cual, con letra de ancho fijo', md: '```', keys: 'codigo code formula' },
  { type: 'table', label: 'Tabla', hint: 'Filas y columnas', keys: 'tabla columnas filas' },
  { type: 'img', label: 'Imagen', hint: 'Del dispositivo o pegada', keys: 'imagen foto dibujo' },
  { type: 'hr', label: 'Separador', hint: 'Una línea entre partes', md: '---', keys: 'separador linea division' },
];
// Bloques que no se editan como texto
export const NO_TEXT = ['hr'];
const LISTS = ['li', 'ol', 'todo'];
const IMG_LINE = /^!\[([^\]\n]*)\]\(img:([\w-]{4,64})\)$/;   // una línea que es solo una imagen

/* ---------------- Tablas (Markdown) ----------------
   | Caso | Sufijo |
   | :--- | :---: |
   | Locativo | -de |
   El texto del bloque es la tabla en Markdown; se edita así y se ve como tabla. */
export const TABLE_TEMPLATE = '| Columna 1 | Columna 2 |\n| --- | --- |\n|  |  |';
const isRow = l => /^\s*\|.*\|\s*$/.test(l);
const isSep = l => /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{0,}:?\s*\|?\s*$/.test(l) && l.includes('-');
// Celdas de una fila; «\|» es una barra dentro de la celda
const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
export function isTableText(text) {
  const lines = String(text ?? '').trim().split('\n');
  return lines.length >= 2 && isRow(lines[0]) && isSep(lines[1]);
}
// → { head: [...], align: ['left'|'center'|'right'|''], rows: [[...]] } o null si no es una tabla
export function parseTable(text) {
  if (!isTableText(text)) return null;
  const lines = String(text).trim().split('\n').filter(l => l.trim());
  const head = cells(lines[0]);
  const align = cells(lines[1]).map(c => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : ''));
  const rows = lines.slice(2).map(l => { const r = cells(l); while (r.length < head.length) r.push(''); return r.slice(0, head.length); });
  return { head, align: head.map((_, i) => align[i] || ''), rows };
}
// { head, align, rows } → tabla en Markdown (lo que se guarda). Las barras dentro de una celda van como «\|».
export function tableToMarkdown({ head, align = [], rows = [] }) {
  const n = Math.max(1, head.length, ...rows.map(r => r.length));
  const cell = v => String(v ?? '').replace(/\n/g, ' ').replace(/\|/g, '\\|').trim();
  const line = r => `| ${Array.from({ length: n }, (_, i) => cell(r[i])).join(' | ')} |`;
  const sep = Array.from({ length: n }, (_, i) => ({ left: ':---', center: ':---:', right: '---:' }[align[i]] || '---'));
  return [line(head), `| ${sep.join(' | ')} |`, ...rows.map(line)].join('\n');
}
// Texto copiado de una hoja de cálculo (columnas con tabulador, filas por línea) → filas de celdas
export function gridFromPaste(text) {
  const t = String(text ?? '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!t.includes('\t') && !t.includes('\n')) return null;
  return t.split('\n').map(l => l.split('\t').map(c => c.trim()));
}

export function blockId() {
  return 'b' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
}
export const newBlock = (type = 'p', text = '', extra = {}) => ({ id: blockId(), type, text, ...extra });
export const imageBlock = (src, caption = '') => ({ id: blockId(), type: 'img', text: caption, src });

// Atajos al escribir al principio de un párrafo: «# », «## », «### » títulos · «- » lista · «1. » numerada
// · «[] » casilla · «> » cita · «```» código · «---» separador
export function shortcut(text) {
  if (text === '```') return { type: 'code', text: '' };
  if (/^(---|___|\*\*\*)$/.test(text)) return { type: 'hr', text: '' };
  const m = /^(#{1,3}|[-*•]|\d{1,3}[.)]|\[ ?\]|\[[xX]\]|>) /.exec(text);
  if (!m) return null;
  const k = m[1], rest = text.slice(m[0].length);
  if (k[0] === '#') return { type: ['h1', 'h2', 'h3'][k.length - 1], text: rest };
  if (k[0] === '[') return { type: 'todo', text: rest, checked: /x/i.test(k) };
  if (k === '>') return { type: 'quote', text: rest };
  if (/\d/.test(k)) return { type: 'ol', text: rest };
  return { type: 'li', text: rest };
}
// Un elemento de lista Markdown con casilla: «- [ ] repasar» / «- [x] hecho»
const TODO_LINE = /^[-*] \[([ xX])\] (.*)$/;
const CALLOUT_LINE = /^> ?\[!(\w+)\][-+]? ?(.*)$/;

// Texto de varias líneas (pegado, o importado) → bloques. Las líneas vacías separan párrafos;
// las líneas seguidas de un mismo párrafo se juntan.
export function textToBlocks(text) {
  const out = [];
  let para = null, table = null, code = null, quote = null;
  for (const raw of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    // Código entre ```: tal cual, con sus saltos de línea
    if (code) {
      if (/^```\s*$/.test(line.trim())) { code = null; continue; }
      code.text += (code.text || code.started ? '\n' : '') + raw; code.started = true; continue;
    }
    if (/^```/.test(line.trim())) { code = newBlock('code', ''); out.push(code); para = quote = null; continue; }
    // Citas y destacados: las líneas seguidas que empiezan por «>» van juntas
    if (/^>/.test(line.trim())) {
      const l = line.trim(), co = CALLOUT_LINE.exec(l);
      if (co) { quote = newBlock('callout', co[2].trim(), { icon: '💡' }); out.push(quote); }
      else if (quote) quote.text += (quote.text ? '\n' : '') + l.replace(/^> ?/, '');
      else { quote = newBlock('quote', l.replace(/^> ?/, '')); out.push(quote); }
      para = null; continue;
    }
    quote = null;
    // Líneas seguidas que empiezan y acaban por «|»: una tabla
    if (isRow(line)) {
      if (table) table.text += '\n' + line.trim();
      else { table = newBlock('table', line.trim()); out.push(table); }
      para = null; continue;
    }
    if (table && !isTableText(table.text)) table.type = 'p';   // no era una tabla: queda como párrafo
    table = null;
    if (!line.trim()) { para = null; continue; }
    const im = IMG_LINE.exec(line.trim());
    if (im) { out.push(imageBlock(im[2], im[1])); para = null; continue; }
    const td = TODO_LINE.exec(line.trim());
    if (td) { out.push(newBlock('todo', td[2].trim(), { checked: td[1] !== ' ' })); para = null; continue; }
    const sc = shortcut(line.trim());
    if (sc) { out.push(newBlock(sc.type, sc.text.trim(), sc.type === 'todo' ? { checked: sc.checked } : {})); para = null; continue; }
    if (para) para.text += ' ' + line.trim();
    else { para = newBlock('p', line.trim()); out.push(para); }
  }
  if (table && !isTableText(table.text)) table.type = 'p';
  for (const b of out) delete b.started;
  return out;
}

// Parte un bloque por el cursor (Enter): el bloque se queda con lo de antes y devuelve uno nuevo con lo
// de después. Tras un título se sigue con un párrafo; en una lista (o casillas), con otro elemento igual.
export function splitBlock(block, at) {
  const list = LISTS.includes(block.type);
  const after = newBlock(list ? block.type : 'p', block.text.slice(at), block.type === 'todo' ? { checked: false } : {});
  return [{ ...block, text: block.text.slice(0, at) }, after];
}
// Número de cada elemento de una lista numerada (se cuenta desde el primero de cada lista seguida)
export function olNumbers(blocks) {
  const out = new Map();
  let n = 0;
  for (const b of blocks) { n = b.type === 'ol' ? n + 1 : 0; if (n) out.set(b.id, n); }
  return out;
}

// Junta un bloque con el anterior (Retroceso al principio). Devuelve el bloque unido y dónde queda el cursor.
export function mergeBlocks(prev, cur) {
  return { block: { ...prev, text: prev.text + cur.text }, caret: prev.text.length };
}

// Texto de un bloque con la parte seleccionada convertida en hueco: «Ev{{de}}yim». Si la selección
// aparece más de una vez, se usa la posición indicada (o la primera).
export function clozeFrom(text, selected, at = -1) {
  const sel = String(selected ?? '').trim();
  if (!sel) return null;
  let i = at >= 0 && text.slice(at, at + sel.length) === sel ? at : text.indexOf(sel);
  if (i < 0) return null;
  return text.slice(0, i) + '{{' + sel + '}}' + text.slice(i + sel.length);
}

/* ---------------- Cómo llevas cada parte ---------------- */

// Estado de un grupo de tarjetas (las de un bloque o un apartado), a partir de su progreso
// (null = sin estudiar). Por prioridad:
//   'weak' te cuesta (fallada hace poco o muchas veces) · 'due' toca repasar · 'new' sin estudiar · 'ok' al día
export const STATUS = [
  { id: 'ok', label: 'Al día' }, { id: 'due', label: 'Toca repasar' },
  { id: 'weak', label: 'Te cuesta' }, { id: 'new', label: 'Sin estudiar' },
];
export function cardsStatus(states, now = Date.now()) {
  if (!states.length) return null;
  const seen = states.filter(Boolean);
  // Aún en aprendizaje (fallada, o «Difícil» siendo nueva) o fallada muchas veces: te cuesta
  if (seen.some(s => s.interval === 0 || (s.lapses >= 3 && s.interval < 21))) return 'weak';
  if (seen.some(s => s.due <= now)) return 'due';
  if (seen.length < states.length) return 'new';
  return 'ok';
}

// Bloques de un apartado: el título y lo que hay debajo hasta el siguiente título de su nivel o superior.
// Un bloque que no es título es un apartado de un solo bloque.
const level = t => (t === 'h1' ? 1 : t === 'h2' ? 2 : t === 'h3' ? 3 : 9);
export function sectionIds(blocks, id) {
  const i = blocks.findIndex(b => b.id === id);
  if (i < 0) return [];
  const L = level(blocks[i].type), out = [id];
  if (L === 9) return out;
  for (let j = i + 1; j < blocks.length && level(blocks[j].type) > L; j++) out.push(blocks[j].id);
  return out;
}

// Título que se muestra: el escrito o, si no hay, el principio del primer bloque
export function pageTitle(page) {
  const t = String(page?.title || '').trim();
  if (t) return t;
  const first = (page?.blocks || []).find(b => !['img', 'hr', 'code'].includes(b.type) && b.text.trim());
  return first ? toPlain(first.text).replace(/[*_{}[\]|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) : 'Sin título';
}

// La página en Markdown (para descargarla o llevarla a otra app)
export function pageToMarkdown(page) {
  const t = String(page?.title || '').trim();
  let md = t ? `# ${t}` : '', prev = t ? 'h1' : null;
  const nums = olNumbers(page?.blocks || []);
  const quoted = t => t.split('\n').map(l => `> ${l}`).join('\n');
  for (const b of page?.blocks || []) {
    let line;
    if (b.type === 'img') { if (!b.src) continue; line = `![${b.text.replace(/[\]\n]/g, ' ')}](img:${b.src})`; }
    else if (b.type === 'hr') line = '---';
    else if (!b.text.trim()) continue;
    // Cada título con su nivel: al pegarlo de nuevo, el primer «# » vuelve a ser el título del apunte
    else line = {
      h1: `# ${b.text}`, h2: `## ${b.text}`, h3: `### ${b.text}`, li: `- ${b.text}`, ol: `${nums.get(b.id)}. ${b.text}`,
      todo: `- [${b.checked ? 'x' : ' '}] ${b.text}`, quote: quoted(b.text), callout: `> [!note] ${b.text.replace(/\n/g, '\n> ')}`,
      code: `\`\`\`\n${b.text}\n\`\`\``,
    }[b.type] ?? b.text;
    // Los puntos de una lista van seguidos; el resto, separados por una línea en blanco
    md += !md ? line : (prev === b.type && LISTS.includes(b.type) ? '\n' : '\n\n') + line;
    prev = b.type;
  }
  return md + '\n';
}

// Primer texto de la página que no es título (para la vista previa en la lista)
export function pageSnippet(page, n = 110) {
  const b = (page?.blocks || []).find(x => x.text.trim() && ['p', 'li', 'ol', 'todo', 'quote', 'callout'].includes(x.type));
  const s = b ? toPlain(b.text).replace(/\*\*?|\{\{|\}\}|::[^}]*|\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim() : '';
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// Texto para buscar en una página
export const pageSearchText = page => `${page.title || ''} ${(page.blocks || []).map(b => b.text).join(' ')}`;
