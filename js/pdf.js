// Importar un PDF como apuntes.
// 1) readPdf (navegador): saca de cada página los trozos de texto con su posición, tamaño y si van en
//    negrita, con pdf.js de Mozilla (js/vendor/pdfjs, se carga solo al usarlo). Las páginas sin texto
//    (escaneadas) se guardan como imagen.
// 2) pdfToBlocks (sin interfaz, se prueba aparte): junta los trozos en líneas y las líneas en bloques,
//    adivinando títulos (por tamaño o negrita), listas y párrafos; quita cabeceras, pies y números de página.

/* ---------------- Leer el PDF (navegador) ---------------- */
const CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/';   // tablas de caracteres (CJK) y fuentes estándar, solo si hacen falta
export async function readPdf(bytes, { onPage = () => {}, maxPages = 400 } = {}) {
  // Ruta en una variable: pdf.js no forma parte del arranque de la app (el service worker lo guarda al usarlo)
  const lib = './vendor/pdfjs/pdf.min.mjs';
  const pdfjs = await import(lib);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: bytes, cMapUrl: CDN + 'cmaps/', cMapPacked: true, standardFontDataUrl: CDN + 'standard_fonts/', isEvalSupported: false }).promise;
  const info = (await doc.getMetadata().catch(() => null))?.info || {};
  const n = Math.min(doc.numPages, maxPages), pages = [];
  for (let i = 1; i <= n; i++) {
    onPage(i, n);
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    // El nombre real de cada fuente (para saber si es negrita) se conoce al preparar la página
    const bold = new Map();
    try {
      await page.getOperatorList();
      for (const it of tc.items) {
        if (!it.fontName || bold.has(it.fontName)) continue;
        let name = '';
        try { const f = page.commonObjs.get(it.fontName); name = `${f?.name || ''} ${f?.loadedName || ''}`; if (f?.bold) name += ' bold'; } catch {}
        bold.set(it.fontName, /bold|black|heavy|semibold|demi|w[6-9]\b/i.test(name));
      }
    } catch {}
    const items = tc.items.filter(it => typeof it.str === 'string' && it.str.length).map(it => {
      const [a, b, c, d, x, y] = it.transform;
      return { str: it.str, x, y, w: it.width || 0, h: Math.abs(it.height) || Math.hypot(c, d) || Math.hypot(a, b) || 10, bold: !!bold.get(it.fontName) };
    });
    const out = { width: vp.width, height: vp.height, items };
    // Página escaneada (casi sin texto): se guarda la imagen de la página
    if (items.reduce((s, it) => s + it.str.trim().length, 0) < 20) out.image = await renderPage(page).catch(() => null);
    pages.push(out);
    page.cleanup();
  }
  const total = doc.numPages;
  await doc.destroy();
  return { title: cleanTitle(info.Title), pages, total, truncated: total > n };
}
async function renderPage(page) {
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: Math.min(2, 1400 / base.width) });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85));
}
// Los títulos que pone Word u otros programas no suelen servir («Microsoft Word - tema1.docx», «untitled»)
export function cleanTitle(t) {
  const s = String(t || '').replace(/^Microsoft (Word|PowerPoint) - /i, '').replace(/\.(docx?|pptx?|pdf|odt)$/i, '').trim();
  return !s || /^(untitled|sin título|document\d*|presentation\d*)$/i.test(s) ? '' : s.slice(0, 120);
}

/* ---------------- Trozos de texto → bloques (sin interfaz) ---------------- */
const BULLET = /^[•◦▪▫●○■□‣⁃∙·➢➤►▶✓✔\-–—*](?=\s|$)\s*/;
const NUMBERED = /^(\d{1,2}|[a-zA-Z])[.)]\s+/;
const PAGE_NO = /^(p(á|a)g(ina|e)?\.?\s*)?\d{1,4}(\s*(de|of|\/)\s*\d{1,4})?$/i;
const round = v => Math.round(v * 2) / 2;

// Trozos de una página → líneas { text, size, bold, x, y, w } en orden de lectura (con dos columnas, primero la izquierda)
export function pageLines(page) {
  // Los trozos que son solo espacios se descartan: pdf.js los usa para rellenar huecos (también entre columnas de una tabla)
  const items = page.items.filter(it => it.str.trim());
  const mid = page.width / 2, chars = items.reduce((s, it) => s + it.str.length, 0) || 1;
  const left = items.filter(it => it.x + it.w <= mid + 4), right = items.filter(it => it.x >= mid - 4);
  const cross = items.filter(it => it.x < mid - 4 && it.x + it.w > mid + 4);
  const share = list => list.reduce((s, it) => s + it.str.length, 0) / chars;
  // En un texto a dos columnas, las líneas de cada mitad ocupan casi todo su ancho (en una tabla, no)
  const fill = (list, from, to) => {
    const rows = new Map();
    for (const it of list) { const k = Math.round(it.y); const r = rows.get(k) || { a: Infinity, b: -Infinity }; r.a = Math.min(r.a, it.x); r.b = Math.max(r.b, it.x + it.w); rows.set(k, r); }
    const w = [...rows.values()].map(r => r.b - r.a).sort((a, b) => a - b);
    return w.length ? w[Math.floor(w.length / 2)] / Math.max(1, to - from) : 0;
  };
  const twoCols = share(cross) < 0.08 && share(left) > 0.2 && share(right) > 0.2
    && fill(left, Math.min(...left.map(it => it.x)), mid) > 0.6 && fill(right, mid, Math.max(...right.map(it => it.x + it.w))) > 0.6;
  const groups = twoCols ? [[...cross, ...left.filter(it => !cross.includes(it))], right.filter(it => !left.includes(it) && !cross.includes(it))] : [items];
  const lines = [];
  for (const g of groups) {
    const sorted = [...g].sort((a, b) => b.y - a.y || a.x - b.x);
    let cur = null;
    for (const it of sorted) {
      if (cur && Math.abs(cur.y - it.y) <= Math.max(2, Math.min(cur.h, it.h) * 0.5)) cur.items.push(it);
      else { cur = { y: it.y, h: it.h, items: [it] }; lines.push(cur); }
    }
  }
  return lines.map(l => {
    const its = l.items.sort((a, b) => a.x - b.x);
    let text = '', boldChars = 0, all = 0, end = null;
    const cells = [];
    for (const it of its) {
      const gap = end == null ? 0 : it.x - end;
      if (text && gap > it.h * 0.15 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += ' ';
      text += it.str;
      // Un hueco grande separa celdas (salvo detrás de una viñeta o un número de lista)
      const cell = cells[cells.length - 1];
      if (!cell || (gap > Math.max(it.h * 1.2, 6) && !/^\s*([•◦▪●○■‣\-–*]|\d{1,2}[.)]|[a-z][.)])\s*$/.test(cell.text))) cells.push({ text: it.str, x: it.x, x2: it.x + it.w });
      else { cell.text += (gap > it.h * 0.15 && !/\s$/.test(cell.text) && !/^\s/.test(it.str) ? ' ' : '') + it.str; cell.x2 = it.x + it.w; }
      end = it.x + it.w;
      const n = it.str.trim().length; all += n; if (it.bold) boldChars += n;
    }
    const size = round(Math.max(...its.map(it => it.h)));
    return { text: text.replace(/\s+/g, ' ').trim(), size, bold: all > 0 && boldChars / all > 0.7, x: its[0].x, y: l.y, w: end - its[0].x,
      cells: cells.map(c => ({ ...c, text: c.text.replace(/\s+/g, ' ').trim() })).filter(c => c.text) };
  }).filter(l => l.text);
}

/* ---------------- Tablas ----------------
   En un PDF una tabla son líneas seguidas con huecos grandes entre trozos que caen siempre en las mismas
   columnas. Las líneas de una sola celda justo debajo son el resto de una celda que no cabía. */
const cleanCell = t => String(t).replace(/\|/g, '\\|').trim();
export function buildTable(run) {
  const multi = run.filter(l => l.cells.length >= 2);
  const tol = Math.max(...multi.map(l => l.size)) * 1.5;
  // Columnas: inicios de celda parecidos en distintas filas
  const starts = multi.flatMap(l => l.cells.map(c => c.x)).sort((a, b) => a - b);
  const groups = [];
  for (const x of starts) { const g = groups[groups.length - 1]; if (g && x - g.last <= tol) { g.n++; g.last = x; } else groups.push({ x, last: x, n: 1 }); }
  const cols = groups.filter(g => g.n >= Math.max(2, multi.length * 0.4)).map(g => g.x);
  if (cols.length < 2) return null;
  const colOf = x => { let k = 0; cols.forEach((c, i) => { if (c <= x + tol) k = i; }); return k; };
  // Las celdas tienen que caer en las columnas (si no, es texto con huecos, no una tabla)
  const fits = multi.flatMap(l => l.cells).filter(c => cols.some(x => Math.abs(c.x - x) <= tol) || cols.some((x, i) => c.x > x && c.x < (cols[i + 1] ?? Infinity))).length;
  if (fits < multi.flatMap(l => l.cells).length * 0.85) return null;
  const rows = [];
  let prevY = null;
  for (const l of run) {
    const row = cols.map(() => '');
    for (const c of l.cells) { const k = colOf(c.x); row[k] = row[k] ? row[k] + ' ' + c.text : c.text; }
    // Continuación de la fila de arriba: una sola celda, o sin primera columna y muy pegada
    const cont = rows.length && (l.cells.length < 2 || (!row[0] && prevY - l.y < l.size * 1.4));
    if (cont) rows[rows.length - 1] = rows[rows.length - 1].map((v, i) => (row[i] ? (v ? v + ' ' + row[i] : row[i]) : v));
    else rows.push(row);
    prevY = l.y;
  }
  if (rows.length < 2) return null;
  const line = r => `| ${r.map(cleanCell).join(' | ')} |`;
  return [line(rows[0]), `| ${cols.map(() => '---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
}
// Líneas de una página → las mismas líneas, con las tablas cambiadas por { table: Markdown }
export function withTables(lines) {
  const out = [];
  for (let i = 0; i < lines.length;) {
    if ((lines[i].cells?.length || 0) < 2) { out.push(lines[i++]); continue; }
    const run = [lines[i]];
    let j = i + 1;
    while (j < lines.length) {
      const l = lines[j], prev = run[run.length - 1], gap = prev.y - l.y;
      if (!(gap > 0 && gap < Math.max(prev.size, l.size) * 3)) break;
      if (l.cells.length >= 2 || (l.cells.length === 1 && l.x > run[0].x + l.size * 2 && gap < l.size * 1.6)) { run.push(l); j++; } else break;
    }
    // Las líneas de una sola celda del final no son de la tabla
    while (run.length && run[run.length - 1].cells.length < 2) { run.pop(); j--; }
    const md = run.filter(l => l.cells.length >= 2).length >= 2 ? buildTable(run) : null;
    if (md) { out.push({ table: md, y: run[run.length - 1].y, size: run[0].size, text: '' }); i = j; } else out.push(lines[i++]);
  }
  return out;
}

// pages: [{ width, height, items: [{ str, x, y, w, h, bold }], image? }] → { blocks, title }
// Los bloques son { type, text } (y { type: 'img', image: n } para las páginas escaneadas, que la interfaz guarda)
export function pdfToBlocks(pages, { newBlock = (type, text, extra = {}) => ({ type, text, ...extra }) } = {}) {
  const perPage = pages.map(p => pageLines(p));
  // Cabeceras y pies: lo que se repite arriba o abajo en muchas páginas (con los números cambiados por #)
  const edgeKey = (l, p) => (l.y > p.height * 0.9 || l.y < p.height * 0.1 ? l.text.replace(/\d+/g, '#').toLowerCase() : null);
  const seen = new Map();
  perPage.forEach((lines, i) => new Set(lines.map(l => edgeKey(l, pages[i])).filter(Boolean)).forEach(k => seen.set(k, (seen.get(k) || 0) + 1)));
  const repeated = k => k && pages.length >= 3 && seen.get(k) >= Math.max(2, pages.length * 0.4);
  // Tamaño del texto normal: el más frecuente (contando letras)
  const bySize = new Map();
  for (const lines of perPage) for (const l of lines) bySize.set(l.size, (bySize.get(l.size) || 0) + l.text.length);
  const body = [...bySize].sort((a, b) => b[1] - a[1])[0]?.[0] || 10;

  const blocks = [];
  let last = null;   // { block, line, kind }
  const kindOf = l => {
    const short = l.text.length < 120 && !/[.;,]$/.test(l.text);
    if (short && l.size >= body * 1.6) return 'h1';
    if (short && l.size >= body * 1.3) return 'h2';
    if (short && (l.size >= body * 1.12 || (l.bold && l.text.length < 90 && !/:$/.test(l.text) && /\p{L}/u.test(l.text)))) return 'h3';
    if (BULLET.test(l.text) && l.text.replace(BULLET, '').trim()) return 'li';
    if (NUMBERED.test(l.text) && l.text.length > 4) return 'ol';
    return 'p';
  };
  const join = (a, b) => (/\p{L}-$/u.test(a) && /^\p{Ll}/u.test(b) ? a.slice(0, -1) + b : a + ' ' + b);
  perPage.forEach((lines, pi) => {
    const page = pages[pi];
    if (page.image) { blocks.push(newBlock('img', `Página ${pi + 1}`, { image: pi })); last = null; return; }
    const width = lines.map(l => l.w).sort((a, b) => a - b)[Math.floor(lines.length * 0.75)] || page.width;
    const kept = lines.filter(l => !(repeated(edgeKey(l, page)) || ((l.y > page.height * 0.9 || l.y < page.height * 0.1) && PAGE_NO.test(l.text))));
    withTables(kept).forEach(l => {
      if (l.table) { blocks.push(newBlock('table', l.table)); last = null; return; }
      const kind = kindOf(l);
      const prev = last?.line, samePage = last?.page === pi;
      const gap = prev && samePage ? prev.y - l.y : null;
      // ¿Sigue el bloque anterior?
      if (last && kind === 'p') {
        const b = last.block;
        const cont =
          // Párrafo: misma letra, poco espacio entre líneas y la anterior no acababa a mitad de línea con punto
          (b.type === 'p' && Math.abs(prev.size - l.size) <= 0.6 && (gap == null ? /^\p{Ll}/u.test(l.text) && !/[.:!?]$/.test(b.text) : gap > 0 && gap < l.size * 1.75)
            && !(prev.w < width * 0.7 && /[.:!?]$/.test(prev.text)) && !(gap != null && l.x - prev.x > l.size * 1.2 && /[.:!?]$/.test(prev.text)))
          // Elemento de lista que sigue en la línea de abajo
          || ((b.type === 'li' || b.type === 'ol') && samePage && gap > 0 && gap < l.size * 1.6 && l.x > last.x0 + 2);
        if (cont) { b.text = join(b.text, l.text); last.line = l; return; }
      }
      // Títulos de varias líneas
      if (last && kind === last.block.type && /^h/.test(kind) && samePage && gap > 0 && gap < l.size * 1.6 && Math.abs(prev.size - l.size) < 0.6) {
        last.block.text = join(last.block.text, l.text); last.line = l; return;
      }
      const text = kind === 'li' ? l.text.replace(BULLET, '') : kind === 'ol' ? l.text.replace(NUMBERED, '') : l.text;
      const block = newBlock(kind, text.trim());
      blocks.push(block);
      last = { block, line: l, page: pi, x0: l.x };
    });
  });
  // Título: el primer título grande, si está al principio
  const firstH = blocks.findIndex(b => b.type === 'h1');
  const title = firstH >= 0 && firstH <= 2 ? blocks[firstH].text.slice(0, 120) : '';
  if (title) blocks.splice(firstH, 1);
  return { blocks, title };
}
