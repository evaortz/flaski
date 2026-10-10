// Lo que se pega con formato (de Word, Google Docs, Notion, una web, ChatGPT…) → bloques de los apuntes,
// con la negrita, la cursiva, el subrayado, los colores y los enlaces pasados a Markdown.
// Los títulos, listas, casillas, citas, código y tablas pasan a ser bloques de su tipo.
import { newBlock, tableToMarkdown } from './pages.js';
import { fromRuns, paletteFor, COLORS } from './inline.js';

const BLOCK = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BODY', 'CENTER', 'DD', 'DETAILS', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE',
  'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE', 'UL', 'HTML',
  'TBODY', 'THEAD', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION']);
const BLOCK_SEL = [...BLOCK].join(',');
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'TITLE', 'META', 'LINK', 'SVG', 'svg', 'BUTTON', 'SELECT', 'TEXTAREA', 'IFRAME', 'OBJECT', 'CANVAS', 'VIDEO', 'AUDIO', 'IMG', 'PICTURE', 'INPUT', 'MATH']);

// Un color de CSS → [r, g, b, a] (los nombres se traducen con un lienzo)
let ctx = null;
function rgba(css) {
  const v = String(css || '').trim().toLowerCase();
  if (!v || v === 'transparent' || v === 'inherit' || v === 'initial' || v === 'currentcolor' || v === 'windowtext' || v === 'auto') return null;
  let m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
  m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map(c => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  try {
    ctx ||= document.createElement('canvas').getContext('2d');
    ctx.fillStyle = '#010203'; ctx.fillStyle = v;
    const out = ctx.fillStyle;
    if (out === '#010203') return null;
    return rgba(out);
  } catch { return null; }
}
function palette(css, background) {
  const c = rgba(css);
  if (!c || c[3] < 0.3) return '';
  return paletteFor(c[0], c[1], c[2], background);
}
const MONO = /mono|courier|consolas|menlo|monaco|source code/i;
const classColor = (el, pre) => { const m = new RegExp(`(?:^|\\s)${pre}-(${COLORS.join('|')})(?:\\s|$)`).exec(el.className || ''); return m ? m[1] : ''; };
// El formato que añade un elemento al de su padre
function styleOf(el, st) {
  const s = { ...st }, tag = el.tagName, css = el.style || {};
  if (tag === 'B' || tag === 'STRONG') s.b = true;
  if (tag === 'I' || tag === 'EM' || tag === 'CITE' || tag === 'VAR' || tag === 'DFN') s.i = true;
  if (tag === 'U' || tag === 'INS') s.u = true;
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') s.s = true;
  if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP' || tag === 'TT') s.code = true;
  if (tag === 'MARK') s.bg = classColor(el, 'hl') || 'yellow';
  if (tag === 'A' && /^(https?:|mailto:)/i.test(el.getAttribute('href') || '')) { s.href = el.getAttribute('href').replace(/[()\s]/g, encodeURIComponent); s.inLink = true; }
  const fw = css.fontWeight;
  if (fw) { if (/bold|bolder/.test(fw) || +fw >= 600) s.b = true; else if (/normal|lighter/.test(fw) || +fw <= 500) s.b = false; }
  if (css.fontStyle) s.i = /italic|oblique/.test(css.fontStyle);
  const deco = `${css.textDecorationLine || ''} ${css.textDecoration || ''}`;
  if (/underline/.test(deco) && !s.inLink) s.u = true;
  if (/line-through/.test(deco)) s.s = true;
  if (/none/.test(deco) && !/underline|line-through/.test(deco)) { s.u = false; s.s = false; }
  if (css.fontFamily && MONO.test(css.fontFamily) && !s.pre) s.code = true;
  // Colores: los de la app (clases), si no los del estilo; dentro de un enlace, el azul del enlace no cuenta
  const tc = classColor(el, 'tc') || (!s.inLink && css.color ? palette(css.color, false) : null);
  if (tc != null) s.color = tc || undefined;
  const bgv = css.backgroundColor || (/background\s*:/.test(el.getAttribute?.('style') || '') ? css.background : '');
  const bg = classColor(el, 'hl') || (bgv ? palette(bgv, true) : null);
  if (bg != null && tag !== 'MARK') s.bg = bg || undefined;
  return s;
}
const hidden = el => el.style?.display === 'none' || el.hidden || el.getAttribute?.('aria-hidden') === 'true' && !el.textContent.trim()
  || el.classList?.contains('mk') || el.classList?.contains('mw-editsection') || (el.tagName === 'SUP' && el.classList?.contains('reference'))
  || /mso-list\s*:\s*ignore/i.test(el.getAttribute?.('style') || '');

// El texto con formato de un elemento (sin sus bloques de dentro) → tramos
function inlineRuns(node, st, out, stopAtLists = false) {
  for (const n of node.childNodes) {
    if (n.nodeType === 3) {
      const t = st.pre ? n.data : n.data.replace(/[\s ]+/g, ' ');
      if (t) out.push({ text: t, st });
      continue;
    }
    if (n.nodeType !== 1 || SKIP.has(n.tagName) || hidden(n)) continue;
    if (n.tagName === 'BR') { out.push({ text: '\n', st: {} }); continue; }
    if (stopAtLists && (n.tagName === 'UL' || n.tagName === 'OL')) continue;
    const blockish = BLOCK.has(n.tagName);
    if (blockish && out.length && !/\n$/.test(out[out.length - 1].text)) out.push({ text: '\n', st: {} });
    inlineRuns(n, styleOf(n, st), out, stopAtLists);
    if (blockish && out.length && !/\n$/.test(out[out.length - 1].text)) out.push({ text: '\n', st: {} });
  }
  return out;
}
// Tramos → Markdown de una línea de bloque (espacios repetidos fuera, sin saltos al principio ni al final)
function runsToText(runs) {
  const clean = [];
  for (const r of runs) {
    let t = r.text;
    const prev = clean[clean.length - 1];
    if (prev && /[ \n]$/.test(prev.text) && !r.st.pre) t = t.replace(/^ +/, '');
    if (t) clean.push({ text: t, st: Object.fromEntries(Object.entries(r.st).filter(([k, v]) => v && !['pre', 'inLink'].includes(k))) });
  }
  return fromRuns(clean).replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
}
const inlineText = (el, st, stopAtLists = false) => runsToText(inlineRuns(el, st, [], stopAtLists));

// Word escribe las listas como párrafos con «mso-list» (y la viñeta en un texto que se ignora)
function wordList(el) {
  const style = el.getAttribute('style') || '';
  if (!/mso-list/i.test(style) && !/MsoListParagraph/i.test(el.className || '')) return null;
  const ign = el.querySelector('[style*="mso-list"]');
  const bullet = (ign?.textContent || '').trim();
  return /^[\w]{1,4}[.)]$/.test(bullet) ? 'ol' : 'li';
}

// HTML pegado → bloques. Devuelve null si no merece la pena (sin formato útil: mejor el texto tal cual)
export function htmlToBlocks(html) {
  if (!html || typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;
  if (!body || !body.textContent.trim()) return null;
  // Código copiado de un editor (VS Code…): todo con letra de ancho fijo y espacios tal cual → un bloque de código
  const first = body.firstElementChild;
  if (first && body.children.length <= 2 && /pre/.test(first.style?.whiteSpace || '') && MONO.test(first.style?.fontFamily || '')) {
    return [newBlock('code', first.innerText ?? first.textContent)];
  }
  const out = [];
  let buf = [];   // texto suelto entre bloques
  const flush = st => {
    if (!buf.length) return;
    const text = runsToText(buf);
    buf = [];
    if (text) for (const part of text.split(/\n{2,}/)) out.push(newBlock('p', part));
  };
  const visit = (node, st) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { if (n.data.trim() || buf.length) buf.push({ text: n.data.replace(/[\s ]+/g, ' '), st }); continue; }
      if (n.nodeType !== 1 || SKIP.has(n.tagName) || hidden(n)) continue;
      const tag = n.tagName;
      if (tag === 'BR') { buf.push({ text: '\n', st: {} }); continue; }
      // Un elemento de texto con bloques dentro (Google Docs lo envuelve todo en un <b>): se entra en él
      if (!BLOCK.has(tag) && !n.querySelector(BLOCK_SEL)) { inlineRuns({ childNodes: [n] }, st, buf); continue; }
      flush(st);
      const s = styleOf(n, st);
      // Bloques copiados de los propios apuntes: cada uno con su tipo
      const own = n.classList?.contains('nb') && /(?:^|\s)nb-(p|h1|h2|h3|li|ol|todo|quote|callout)(?:\s|$)/.exec(n.className)?.[1];
      if (own) {
        const tx = n.querySelector('.nb-text'), t = tx ? inlineText(tx, s) : '';
        if (t) out.push(newBlock(own, t, own === 'todo' ? { checked: n.classList.contains('is-done') } : own === 'callout' ? { icon: n.querySelector('.nb-icon')?.textContent || '💡' } : {}));
        continue;
      }
      if (/^H[1-6]$/.test(tag)) { const t = inlineText(n, { ...s, b: false }); if (t) out.push(newBlock(tag === 'H1' ? 'h1' : tag === 'H2' ? 'h2' : 'h3', t.replace(/\n/g, ' '))); continue; }
      if (tag === 'HR') { out.push(newBlock('hr', '')); continue; }
      if (tag === 'PRE') { const t = (n.querySelector('code') || n).textContent.replace(/\n$/, ''); if (t.trim()) out.push(newBlock('code', t)); continue; }
      if (tag === 'BLOCKQUOTE') { const t = inlineText(n, s); if (t) out.push(newBlock('quote', t)); continue; }
      if (tag === 'UL' || tag === 'OL') { list(n, s, tag === 'OL' ? 'ol' : 'li'); continue; }
      if (tag === 'LI') { item(n, s, 'li'); continue; }
      if (tag === 'TABLE') { table(n, s); continue; }
      if (tag === 'DT') { const t = inlineText(n, s); if (t) out.push(newBlock('p', `**${t.replace(/\*\*/g, '')}**`)); continue; }
      if (tag === 'P' || tag === 'DD' || tag === 'FIGCAPTION' || tag === 'SUMMARY') {
        // Un párrafo con solo un título de Google Docs dentro, o un elemento de lista de Word
        const wl = wordList(n);
        const t = inlineText(n, s);
        const pind = Math.min(4, +n.dataset?.ind || 0);
        if (t) out.push(newBlock(wl || 'p', wl ? t.replace(/\n/g, ' ') : t, pind ? { indent: pind } : {}));
        continue;
      }
      visit(n, s);
      flush(s);
    }
  };
  const item = (li, st, type, depth = 0) => {
    const box = li.querySelector(':scope > input[type=checkbox], :scope > p > input[type=checkbox], :scope > label > input[type=checkbox]');
    const checked = box ? box.checked || box.hasAttribute('checked') : /\b(checked|done)\b/.test(li.className || '') && /task|todo|check/.test(li.className || '');
    const isTodo = !!box || !!li.querySelector('.checkbox') || /task-list-item|to-do/.test(li.className || '') || !!li.closest('.to-do-list');
    const done = checked || !!li.querySelector('.checkbox-on');
    const t = inlineText(li, styleOf(li, st), true);
    // La sangría: la de las listas anidadas, o la que traen los bloques copiados de los propios apuntes
    const ind = Math.min(4, Math.max(depth, +li.dataset?.ind || 0));
    if (t) out.push(newBlock(isTodo ? 'todo' : type, t.replace(/\n/g, ' '), { ...(isTodo ? { checked: !!done } : {}), ...(ind ? { indent: ind } : {}) }));
    // Las listas de dentro van detrás, como puntos de la misma lista
    for (const sub of li.querySelectorAll(':scope > ul, :scope > ol, :scope > div > ul, :scope > div > ol')) list(sub, st, sub.tagName === 'OL' ? 'ol' : 'li', depth + 1);
  };
  const list = (el, st, type, depth = 0) => {
    for (const li of el.children) {
      if (li.tagName === 'LI') item(li, st, type, depth);
      else if (li.tagName === 'UL' || li.tagName === 'OL') list(li, st, li.tagName === 'OL' ? 'ol' : 'li', depth + 1);
      else visit({ childNodes: [li] }, st);
    }
  };
  const table = (el, st) => {
    const rows = [...el.querySelectorAll('tr')].filter(tr => tr.closest('table') === el);
    const grid = rows.map(tr => {
      const r = [];
      for (const td of tr.children) {
        if (td.tagName !== 'TD' && td.tagName !== 'TH') continue;
        r.push(inlineText(td, st).replace(/\n/g, ' '));
        for (let k = 1; k < Math.min(+td.getAttribute('colspan') || 1, 20); k++) r.push('');
      }
      return r;
    }).filter(r => r.some(c => c.trim()));
    const cols = Math.max(0, ...grid.map(r => r.length));
    // Tablas que solo sirven para maquetar (una fila o una columna): su contenido, como bloques
    if (grid.length < 2 || cols < 2) { visit(el.querySelector('tbody') || el, st); flush(st); return; }
    out.push(newBlock('table', tableToMarkdown({ head: grid[0], rows: grid.slice(1) })));
  };
  visit(body, {});
  flush({});
  return out.length ? out : null;
}
