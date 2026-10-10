// Editor de un bloque de los apuntes, al estilo de Obsidian: se escribe Markdown, pero se ve con formato y
// las marcas (**, <u>…) solo aparecen donde está el cursor, para que se vea cómo se hace.
// El texto del elemento es siempre exactamente el Markdown (las marcas están ahí, ocultas), así que el cursor
// se traduce a una posición del texto contando caracteres. Tras cada cambio se vuelve a pintar.
// Para el resto de la app se comporta como un <textarea>: value, selectionStart/End, setSelectionRange y setRangeText.
import { toLiveHTML, toHTML, sliceMarkdown, parse, nodesOf } from './inline.js';

// Posición en el texto de un punto del DOM (nodo, desplazamiento) dentro de root
export function textOffset(root, node, off) {
  const r = document.createRange();
  r.setStart(root, 0);
  try { r.setEnd(node, off); } catch { return 0; }
  return r.toString().length;
}
// La selección dentro de root, como posiciones del texto { a, b } (null si no está dentro)
export function selOffsets(root) {
  const s = getSelection();
  if (!s?.rangeCount) return null;
  const r = s.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  return { a: textOffset(root, r.startContainer, r.startOffset), b: textOffset(root, r.endContainer, r.endOffset) };
}
const hiddenText = n => { const m = n.parentElement?.closest('.mk'); return !!m && !m.parentElement?.classList.contains('on'); };
// Punto del DOM para una posición del texto (en un borde, mejor en un texto que se ve)
function pointAt(root, x) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let at = 0, first = null;
  while (w.nextNode()) {
    const n = w.currentNode, len = n.length;
    if (x >= at && x <= at + len) {
      if (!hiddenText(n)) return [n, x - at];
      first ||= [n, x - at];
    }
    at += len;
  }
  if (first) return first;
  return [root, x <= 0 ? 0 : root.childNodes.length];
}
export function setSelOffsets(root, a, b = a) {
  const s = getSelection();
  if (!s) return;
  const len = root._src?.length ?? root.textContent.length;
  // Un salto de línea al final: el cursor, en la línea nueva (delante del <br> del final)
  const end = x => (x >= len && root._src?.endsWith('\n') && root.lastChild?.nodeName === 'BR' ? [root, root.childNodes.length - 1] : pointAt(root, x));
  const r = document.createRange();
  r.setStart(...end(a));
  r.setEnd(...end(b));
  s.removeAllRanges();
  s.addRange(r);
}

function paint(el, a, b) {
  el.innerHTML = toLiveHTML(el._src, a, b);
  el.classList.toggle('is-empty', !el._src);
  if (document.activeElement === el) setSelOffsets(el, a, b);
}
// Historial propio (al volver a pintar, el del navegador se pierde): Ctrl+Z / Ctrl+Mayús+Z
function record(el, a, b, kind = 'cmd') {
  const h = el._hist, now = Date.now();
  h.length = el._hi + 1;
  const top = h[el._hi];
  if (top.v === el._src) { top.a = a; top.b = b; return; }
  if (kind === 'type' && el._kind === 'type' && now - el._last < 900) Object.assign(top, { v: el._src, a, b });
  else { h.push({ v: el._src, a, b }); el._hi = h.length - 1; if (h.length > 200) { h.shift(); el._hi--; } }
  el._last = now; el._kind = kind;
}
function travel(el, dir) {
  // Si la página lleva su propio historial (el de todo el apunte), lo usa ella
  if (!el.dispatchEvent(new CustomEvent('live-history', { bubbles: true, cancelable: true, detail: dir }))) return;
  const i = el._hi + dir;
  if (i < 0 || i >= el._hist.length) return;
  // Antes de deshacer, lo último escrito queda como un paso propio
  el._hi = i; el._kind = 'cmd';
  const s = el._hist[i];
  el._src = s.v;
  paint(el, s.a, s.b);
  el.dispatchEvent(new CustomEvent('live-change', { bubbles: true }));
}
// Cambia el texto (y la selección) desde fuera: botones de formato, pegar, atajos…
export function liveSet(el, text, a = text.length, b = a) {
  el._src = String(text);
  record(el, a, b);
  paint(el, a, b);
  el.dispatchEvent(new CustomEvent('live-change', { bubbles: true }));
}
// Las marcas que se ven: las de lo que toca la selección
export function refreshMarks(el) {
  const o = selOffsets(el);
  if (!o) return;
  el.querySelectorAll('.fm').forEach(f => { f.classList.toggle('on', +f.dataset.s <= o.b && o.a <= +f.dataset.e); });
}
document.addEventListener('selectionchange', () => {
  const el = document.activeElement;
  if (el?._live) refreshMarks(el);
});

function onInput(e) {
  const el = e.currentTarget;
  el._src = el.textContent;
  if (e.isComposing) return;   // escribiendo con un IME (japonés, el teclado del móvil…): al acabar
  const o = selOffsets(el) || { a: el._src.length, b: el._src.length };
  record(el, o.a, o.b, /^(insertText|deleteContent)/.test(e.inputType || '') ? 'type' : 'cmd');
  paint(el, o.a, o.b);
}
// Si detrás del cursor solo quedan marcas de cierre hasta el final de la línea («**», «]]», «](url)»),
// el cursor va detrás de ellas: así lo que se escribe al final no cae dentro de la negrita o del enlace
export function snapLineEnd(el) {
  const o = selOffsets(el), v = el._src;
  if (!o || o.a !== o.b) return;
  let end = v.indexOf('\n', o.a);
  if (end < 0) end = v.length;
  if (end === o.a) return;
  const closers = nodesOf(parse(v)).filter(n => n.ce < n.e).map(n => [n.ce, n.e]);
  for (let k = o.a; k < end; k++) if (!closers.some(([x, y]) => x <= k && k < y)) return;
  setSelOffsets(el, end);
  refreshMarks(el);
}
function onKey(e) {
  const el = e.currentTarget, mod = e.ctrlKey || e.metaKey;
  if (e.key === 'End' && !e.shiftKey) setTimeout(() => snapLineEnd(el), 0);
  if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); return travel(el, e.shiftKey ? 1 : -1); }
  if (mod && !e.altKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); return travel(el, 1); }
  // Mayús+Enter: salto de línea dentro del bloque (Enter solo lo parte, eso lo hace la app)
  if (e.key === 'Enter' && e.shiftKey && !e.isComposing) { e.preventDefault(); el.setRangeText('\n', el.selectionStart, el.selectionEnd, 'end'); }
}
// Paréntesis, corchetes y comillas se cierran solos; con texto seleccionado, *, _, ~, =, ` y ( [ " lo envuelven
const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', '«': '»' };
const CLOSERS = new Set(Object.values(PAIRS));
const WRAP = new Set(['*', '_', '~', '=', '`', ...Object.keys(PAIRS)]);
function autoPair(e, el) {
  const o = selOffsets(el), v = el._src;
  if (!o || e.isComposing) return false;
  const { a, b } = o;
  if (e.inputType === 'deleteContentBackward' && a === b && a > 0 && PAIRS[v[a - 1]] && v[a] === PAIRS[v[a - 1]] && v[a - 1] !== v[a]) {
    liveSet(el, v.slice(0, a - 1) + v.slice(a + 1), a - 1);
    return true;
  }
  if (e.inputType !== 'insertText' || !e.data || e.data.length !== 1) return false;
  const ch = e.data;
  if (a < b && WRAP.has(ch)) { liveSet(el, v.slice(0, a) + ch + v.slice(a, b) + (PAIRS[ch] || ch) + v.slice(b), a + 1, b + 1); return true; }
  if (a !== b) return false;
  // El cierre que ya está justo detrás del cursor: se pasa por encima
  if (CLOSERS.has(ch) && v[a] === ch && (ch !== '"' || (v.slice(0, a).split('"').length % 2 === 0))) { setSelOffsets(el, a + 1); refreshMarks(el); el.dispatchEvent(new CustomEvent('live-change', { bubbles: true })); return true; }
  if (PAIRS[ch]) {
    const next = v[a] || '', prev = v[a - 1] || '';
    if (next && !/[\s)\]}.,;:!?»]/.test(next)) return false;
    if (ch === '"' && /[\p{L}\p{N}]/u.test(prev)) return false;
    liveSet(el, v.slice(0, a) + ch + PAIRS[ch] + v.slice(a), a + 1);
    return true;
  }
  return false;
}
function onBeforeInput(e) {
  const el = e.currentTarget;
  if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') { e.preventDefault(); travel(el, e.inputType === 'historyUndo' ? -1 : 1); }
  if (autoPair(e, el)) { e.preventDefault(); return; }
  // Que el navegador no meta negritas por su cuenta
  if (/^format/.test(e.inputType)) e.preventDefault();
  // Los saltos de línea los mete el navegador como <br> o <div> (y se perderían): se escriben como texto
  const data = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
  const br = e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak';
  if (br || (/^insert/.test(e.inputType) && /[\r\n]/.test(data))) {
    e.preventDefault();
    el.setRangeText(br ? '\n' : data.replace(/\r\n?/g, '\n'), el.selectionStart, el.selectionEnd, 'end');
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  }
}
// Copiar: el Markdown del trozo (y, para otras apps, también con formato)
function onCopy(e) {
  const el = e.currentTarget, o = selOffsets(el);
  if (!o || o.a === o.b || !e.clipboardData) return;
  e.preventDefault();
  const md = sliceMarkdown(el._src, o.a, o.b);
  e.clipboardData.setData('text/plain', md);
  e.clipboardData.setData('text/html', toHTML(md));
  if (e.type === 'cut') el.setRangeText('', o.a, o.b, 'start');
}

// Convierte un elemento en el editor, con el texto «src» y el cursor en «caret» (o la selección [caret, end])
export function makeLive(el, src, caret = null, end = caret) {
  el._live = true;
  el._src = String(src ?? '');
  const a = caret == null ? el._src.length : Math.min(caret, el._src.length), b = end == null ? a : Math.min(end, el._src.length);
  el._hist = [{ v: el._src, a, b }]; el._hi = 0; el._last = 0; el._kind = '';
  try { el.contentEditable = 'plaintext-only'; } catch { /* navegadores antiguos */ }
  if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
  el.spellcheck = true;
  el.setAttribute('role', 'textbox');
  el.setAttribute('aria-multiline', 'true');
  Object.defineProperties(el, {
    value: { configurable: true, get: () => el._src, set: v => liveSet(el, String(v ?? '')) },
    selectionStart: { configurable: true, get: () => (selOffsets(el) || { a: el._src.length }).a },
    selectionEnd: { configurable: true, get: () => (selOffsets(el) || { b: el._src.length }).b },
  });
  el.setSelectionRange = (x, y = x) => { if (document.activeElement !== el) el.focus({ preventScroll: true }); setSelOffsets(el, x, y); refreshMarks(el); };
  el.setRangeText = (str, x, y, mode = 'preserve') => {
    const v = el._src, n = String(str).length;
    const text = v.slice(0, x) + str + v.slice(y);
    const [na, nb] = mode === 'select' ? [x, x + n] : mode === 'start' ? [x, x] : [x + n, x + n];
    liveSet(el, text, na, nb);
  };
  el.addEventListener('input', onInput);
  el.addEventListener('compositionend', ev => onInput({ currentTarget: ev.currentTarget, inputType: 'insertText' }));
  el.addEventListener('keydown', onKey);
  el.addEventListener('beforeinput', onBeforeInput);
  el.addEventListener('copy', onCopy);
  el.addEventListener('cut', onCopy);
  el.addEventListener('pointerup', () => setTimeout(() => snapLineEnd(el), 0));
  el.innerHTML = toLiveHTML(el._src, a, b);
  el.classList.toggle('is-empty', !el._src);
  el.focus({ preventScroll: true });
  setSelOffsets(el, a, b);
  if (a === b) snapLineEnd(el);
  el.scrollIntoView?.({ block: 'nearest' });
  return el;
}
