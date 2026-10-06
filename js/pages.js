// Apuntes: una página es una lista de bloques { id, type, text }.
//   type: 'p' (párrafo) · 'h1' · 'h2' (títulos) · 'li' (lista)
// El id de un bloque no cambia al editarlo: las tarjetas vinculadas guardan (page_id, block_id).
// Sin dependencias de la interfaz, así que se puede probar aparte.

export const BLOCK_TYPES = ['p', 'h1', 'h2', 'li', 'table'];

/* ---------------- Tablas (Markdown, como en Obsidian) ----------------
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

export function blockId() {
  return 'b' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
}
export const newBlock = (type = 'p', text = '') => ({ id: blockId(), type, text });

// Atajos al escribir al principio de un párrafo: «# » título, «## » subtítulo, «- » o «* » lista
export function shortcut(text) {
  const m = /^(#{1,2}|[-*•]) /.exec(text);
  if (!m) return null;
  const type = m[1] === '#' ? 'h1' : m[1] === '##' ? 'h2' : 'li';
  return { type, text: text.slice(m[0].length) };
}

// Texto de varias líneas (pegado, o importado) → bloques. Las líneas vacías separan párrafos;
// las líneas seguidas de un mismo párrafo se juntan.
export function textToBlocks(text) {
  const out = [];
  let para = null, table = null;
  for (const raw of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    // Líneas seguidas que empiezan y acaban por «|»: una tabla
    if (isRow(line)) {
      if (table) table.text += '\n' + line.trim();
      else { table = newBlock('table', line.trim()); out.push(table); }
      para = null; continue;
    }
    if (table && !isTableText(table.text)) table.type = 'p';   // no era una tabla: queda como párrafo
    table = null;
    if (!line.trim()) { para = null; continue; }
    const sc = shortcut(line.trimStart());
    if (sc) { out.push(newBlock(sc.type, sc.text.trim())); para = null; continue; }
    if (para) para.text += ' ' + line.trim();
    else { para = newBlock('p', line.trim()); out.push(para); }
  }
  if (table && !isTableText(table.text)) table.type = 'p';
  return out;
}

// Parte un bloque por el cursor (Enter): el bloque se queda con lo de antes y devuelve uno nuevo con lo
// de después. Tras un título se sigue con un párrafo; en una lista, con otro elemento de lista.
export function splitBlock(block, at) {
  const after = newBlock(block.type === 'li' ? 'li' : 'p', block.text.slice(at));
  return [{ ...block, text: block.text.slice(0, at) }, after];
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

// Título que se muestra: el escrito o, si no hay, el principio del primer bloque
export function pageTitle(page) {
  const t = String(page?.title || '').trim();
  if (t) return t;
  const first = (page?.blocks || []).find(b => b.text.trim());
  return first ? first.text.replace(/[*_{}[\]|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) : 'Sin título';
}

// Texto para buscar en una página
export const pageSearchText = page => `${page.title || ''} ${(page.blocks || []).map(b => b.text).join(' ')}`;
