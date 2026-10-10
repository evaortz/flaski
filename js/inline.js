// Formato dentro de un texto. Todo se guarda en Markdown (con las etiquetas HTML que también entiende Obsidian):
//   **negrita** · *cursiva* · <u>subrayado</u> · ~~tachado~~ · `código` · ==resaltado==
//   · <span style="color:red">texto en color</span> · <mark style="background:blue">fondo de color</mark>
//   · [enlace](https://…) · \* (un asterisco tal cual)
// Además, lo que ya había: imágenes ![pie](img:id) y furigana 漢字[かんじ].
// Sirve para pintar (apuntes y tarjetas), para el editor de los apuntes (que enseña las marcas solo donde
// está el cursor) y para convertir lo que se pega. Sin dependencias de la interfaz: se prueba aparte.

// Los colores de Notion (se guardan con su nombre en inglés, que también es un color de CSS)
export const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
export const COLOR_LABEL = { gray: 'Gris', brown: 'Marrón', orange: 'Naranja', yellow: 'Amarillo', green: 'Verde', blue: 'Azul', purple: 'Morado', pink: 'Rosa', red: 'Rojo' };
const colorName = v => { const c = String(v || '').toLowerCase(); return c === 'grey' ? 'gray' : COLORS.includes(c) ? c : ''; };

const IMG = /!\[([^\]\n]*)\]\(img:([\w-]{4,64})\)/y;
const KANJI = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF々〆ヶ]/;
const RUBY = /([\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF々〆ヶ]+)\[([^\]\n]+)\]/y;
const LINK = /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s()<>]+)\)/y;
const TAG = /<(\/?)(u|span|mark)((?:\s+style\s*=\s*"[^"<>]*")?)\s*>/yi;
const ESCAPABLE = '\\*_~=`[]<>!#|';
const isWS = c => !c || /\s/.test(c);
const isPunct = c => !!c && /[\p{P}\p{S}]/u.test(c);

// Lo que va en un hueco de un delimitador (*, _, ~, =): ¿puede abrir?, ¿puede cerrar? (reglas de CommonMark)
function flank(src, i, n, ch) {
  const prev = src[i - 1], next = src[i + n];
  const left = !isWS(next) && (!isPunct(next) || isWS(prev) || isPunct(prev));
  const right = !isWS(prev) && (!isPunct(prev) || isWS(next) || isPunct(next));
  if (ch === '_') return { open: left && (!right || isPunct(prev)), close: right && (!left || isPunct(next)) };
  return { open: left, close: right };
}
const runLen = (s, i, ch) => { let j = i; while (s[j] === ch) j++; return j - i; };
// Siguiente tanda de exactamente n acentos graves (para cerrar un `código`)
function findTicks(s, from, n, limit) {
  for (let j = from; j < limit;) {
    if (s[j] !== '`') { j++; continue; }
    const k = runLen(s, j, '`');
    if (k === n && j + k <= limit) return j;
    j += k;
  }
  return -1;
}
function tagInfo(m) {
  const name = m[2].toLowerCase(), style = m[3] || '';
  if (m[1]) return { name, close: true };
  if (name === 'u') return style ? null : { name };
  if (name === 'span') { const c = colorName(/(?:^|[\s";])color\s*:\s*([a-z]+)/i.exec(style)?.[1]); return c ? { name, v: c } : null; }
  const bg = /background(?:-color)?\s*:\s*([a-z]+)/i.exec(style)?.[1];
  if (style && !colorName(bg)) return null;
  return { name, v: colorName(bg) || 'yellow' };
}

/* ---------------- El análisis ----------------
   parse(texto) → árbol de nodos { t, s, cs, ce, e, v, kids }:
     [s, cs) es la marca de apertura, [cs, ce) el contenido y [ce, e) la marca de cierre.
   t: 'b' 'i' 's' 'u' 'bg' (v = color; «==» es amarillo) 'color' (v) 'link' (v = dirección)
      'code' 'esc' (\*) 'img' (alt, id) 'ruby' (base [s, ce), lectura [rs, re)) */
export function parse(src) {
  src = String(src ?? '');
  const atoms = [], tags = [], links = [], delims = [];
  const ends = [];   // enlaces abiertos: al llegar al final de su texto se salta «](dirección)»
  for (let i = 0; i < src.length;) {
    if (ends.length && i >= ends[ends.length - 1].ce) { i = ends.pop().e; continue; }
    const limit = ends.length ? ends[ends.length - 1].ce : src.length;
    const ch = src[i];
    if (ch === '\\' && i + 1 < limit && ESCAPABLE.includes(src[i + 1])) { atoms.push({ t: 'esc', s: i, cs: i + 1, ce: i + 2, e: i + 2 }); i += 2; continue; }
    if (ch === '`') {
      const n = runLen(src, i, '`'), j = findTicks(src, i + n, n, limit);
      if (j > i + n) { atoms.push({ t: 'code', s: i, cs: i + n, ce: j, e: j + n }); i = j + n; } else i += n;
      continue;
    }
    if (ch === '!' && src[i + 1] === '[') {
      IMG.lastIndex = i; const m = IMG.exec(src);
      if (m && i + m[0].length <= limit) { atoms.push({ t: 'img', s: i, cs: i, ce: i + m[0].length, e: i + m[0].length, alt: m[1], id: m[2] }); i += m[0].length; continue; }
    }
    if (KANJI.test(ch) && !KANJI.test(src[i - 1] || '')) {
      RUBY.lastIndex = i; const m = RUBY.exec(src);
      if (m && i + m[0].length <= limit) {
        const ce = i + m[1].length;
        atoms.push({ t: 'ruby', s: i, cs: i, ce, rs: ce + 1, re: i + m[0].length - 1, e: i + m[0].length });
        i += m[0].length; continue;
      }
    }
    if (ch === '[') {
      LINK.lastIndex = i; const m = LINK.exec(src);
      if (m && i + m[0].length <= limit) { const l = { t: 'link', s: i, cs: i + 1, ce: i + 1 + m[1].length, e: i + m[0].length, v: m[2] }; links.push(l); ends.push(l); i++; continue; }
    }
    if (ch === '<') {
      TAG.lastIndex = i; const m = TAG.exec(src), info = m && tagInfo(m);
      if (info && i + m[0].length <= limit) { tags.push({ ...info, s: i, e: i + m[0].length }); i += m[0].length; continue; }
    }
    if ('*_~='.includes(ch)) {
      const n = runLen(src, i, ch), f = flank(src, i, n, ch);
      delims.push({ ch, s: i, n, lo: i, hi: i + n, open: f.open, close: f.close });
      i += n; continue;
    }
    i++;
  }
  // Etiquetas: cada cierre con su apertura (las que no casan se quedan como texto)
  const stack = [], containers = [...links];
  for (const tg of tags) {
    if (!tg.close) { stack.push(tg); continue; }
    let k = stack.length - 1;
    while (k >= 0 && stack[k].name !== tg.name) k--;
    if (k < 0) continue;
    const o = stack[k]; stack.length = k;
    containers.push({ t: o.name === 'u' ? 'u' : o.name === 'span' ? 'color' : 'bg', s: o.s, cs: o.e, ce: tg.s, e: tg.e, v: o.v });
  }
  // Las que se cruzan con otra (mal anidadas) no cuentan
  containers.sort((a, b) => a.s - b.s || b.e - a.e);
  const ok = [], open = [];
  for (const c of containers) {
    while (open.length && open[open.length - 1].e <= c.s) open.pop();
    const top = open[open.length - 1];
    if (top && (c.s < top.cs || c.e > top.ce)) continue;
    ok.push(c); open.push(c);
  }
  // Énfasis (*, _, ~~, ==): por separado dentro de cada etiqueta o enlace
  const groups = new Map();
  for (const d of delims) {
    let box = null;
    for (const c of ok) if (c.cs <= d.s && d.s + d.n <= c.ce && (!box || c.s >= box.s)) box = c;
    if (!groups.has(box)) groups.set(box, []);
    groups.get(box).push(d);
  }
  const emph = [];
  for (const list of groups.values()) emphasis(list, emph);
  return tree(src, [...atoms, ...ok, ...emph]);
}
// El algoritmo de CommonMark (simplificado): cada cierre busca hacia atrás su apertura
function emphasis(ds, out) {
  for (let ci = 0; ci < ds.length; ci++) {
    const c = ds[ci];
    if (!c.close) continue;
    while (c.hi > c.lo) {
      let oi = ci - 1;
      for (; oi >= 0; oi--) {
        const o = ds[oi];
        if (o.ch !== c.ch || o.hi <= o.lo || !o.open) continue;
        if (c.ch === '~' || c.ch === '=') { if (o.hi - o.lo >= 2 && c.hi - c.lo >= 2) break; continue; }
        if ((o.close || c.open) && (o.n + c.n) % 3 === 0 && !(o.n % 3 === 0 && c.n % 3 === 0)) continue;
        break;
      }
      if (oi < 0) break;
      const o = ds[oi];
      const two = c.ch === '~' || c.ch === '=' || (o.hi - o.lo >= 2 && c.hi - c.lo >= 2);
      const k = two ? 2 : 1;
      const t = c.ch === '~' ? 's' : c.ch === '=' ? 'bg' : two ? 'b' : 'i';
      out.push({ t, s: o.hi - k, cs: o.hi, ce: c.lo, e: c.lo + k, ...(t === 'bg' ? { v: 'yellow' } : {}) });
      o.hi -= k; c.lo += k;
      for (let m = oi + 1; m < ci; m++) ds[m].hi = ds[m].lo;   // los de en medio ya no pueden cerrarse
    }
  }
}
function tree(src, nodes) {
  nodes.sort((a, b) => a.s - b.s || b.e - a.e);
  const root = { t: 'root', s: 0, cs: 0, ce: src.length, e: src.length, kids: [] };
  const stack = [root];
  for (const n of nodes) {
    n.kids = [];
    while (stack.length > 1 && !(stack[stack.length - 1].cs <= n.s && n.e <= stack[stack.length - 1].ce)) stack.pop();
    stack[stack.length - 1].kids.push(n);
    stack.push(n);
  }
  return root;
}
const ATOMS = ['code', 'esc', 'img', 'ruby'];
// Recorre el árbol: texto suelto → onText(desde, hasta); nodo → onNode(nodo, () => su contenido ya pintado)
function walk(src, node, onNode, onText) {
  let out = '', at = node.cs;
  for (const k of node.kids) {
    out += onText(at, k.s);
    out += onNode(k, () => walk(src, k, onNode, onText));
    at = k.e;
  }
  return out + onText(at, node.ce);
}
// Todos los nodos, en una lista
export function nodesOf(root) {
  const out = [];
  const go = n => { for (const k of n.kids) { out.push(k); go(k); } };
  go(root);
  return out;
}

/* ---------------- Pintar ---------------- */
export const escHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const imgTag = (id, alt = '') => `<img class="media" data-img="${id}" alt="${escHTML(alt)}" loading="lazy" decoding="async">`;
const safeHref = u => (/^(https?:\/\/|mailto:)/i.test(u) ? escHTML(u) : '#');
const TAGS = { b: 'b', i: 'i', s: 's', u: 'u' };
function inner(src, n, html) {
  if (TAGS[n.t]) return `<${TAGS[n.t]}>${html}</${TAGS[n.t]}>`;
  if (n.t === 'bg') return `<mark class="hl hl-${n.v}">${html}</mark>`;
  if (n.t === 'color') return `<span class="tc tc-${n.v}">${html}</span>`;
  if (n.t === 'link') return `<a href="${safeHref(n.v)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
  return html;
}
// Texto con formato → HTML para leer (sin las marcas)
export function toHTML(src) {
  src = String(src ?? '');
  const text = (a, b) => escHTML(src.slice(a, b)).replace(/\n/g, '<br>');
  return walk(src, parse(src), (n, kids) => {
    if (n.t === 'code') return `<code>${escHTML(src.slice(n.cs, n.ce))}</code>`;
    if (n.t === 'esc') return escHTML(src[n.cs]);
    if (n.t === 'img') return imgTag(n.id, n.alt);
    if (n.t === 'ruby') return `<ruby>${escHTML(src.slice(n.s, n.ce))}<rt>${escHTML(src.slice(n.rs, n.re))}</rt></ruby>`;
    return inner(src, n, kids());
  }, text);
}
// Para el editor: el mismo texto, carácter a carácter (las marcas van en <span class="mk">, que se ocultan),
// así que el texto del HTML es exactamente el Markdown. Las marcas de los nodos que tocan la selección
// [a, b] se ven («on»). Sin selección (a = -1), todas ocultas: se ve igual que el texto con formato.
export function toLiveHTML(src, a = -1, b = a) {
  src = String(src ?? '');
  const raw = (x, y) => escHTML(src.slice(x, y));
  const mk = (x, y) => (x < y ? `<span class="mk">${raw(x, y)}</span>` : '');
  const on = n => a >= 0 && n.s <= b && a <= n.e;
  const box = (n, html) => `<span class="fm fm-${n.t}${on(n) ? ' on' : ''}" data-s="${n.s}" data-e="${n.e}">${html}</span>`;
  const out = walk(src, parse(src), (n, kids) => {
    if (n.t === 'code') return box(n, `${mk(n.s, n.cs)}<code>${raw(n.cs, n.ce)}</code>${mk(n.ce, n.e)}`);
    if (n.t === 'esc') return box(n, `${mk(n.s, n.cs)}${raw(n.cs, n.ce)}`);
    if (n.t === 'img') return box(n, `${mk(n.s, n.e)}${imgTag(n.id, n.alt).replace('<img ', '<img contenteditable="false" ')}`);
    if (n.t === 'ruby') return box(n, `<ruby>${raw(n.s, n.ce)}${mk(n.ce, n.rs)}<rt>${raw(n.rs, n.re)}</rt>${mk(n.re, n.e)}</ruby>`);
    return box(n, `${mk(n.s, n.cs)}${inner(src, n, kids())}${mk(n.ce, n.e)}`);
  }, raw);
  // Un salto de línea al final no se vería sin algo detrás
  return src.endsWith('\n') ? out + '<br>' : out;
}
// Solo el texto, sin marcas (para buscar, títulos, vistas previas…)
export function toPlain(src) {
  src = String(src ?? '');
  return walk(src, parse(src), (n, kids) => {
    if (n.t === 'code') return src.slice(n.cs, n.ce);
    if (n.t === 'esc') return src[n.cs];
    if (n.t === 'img') return '';
    if (n.t === 'ruby') return src.slice(n.s, n.e);
    return kids();
  }, (a, b) => src.slice(a, b));
}

/* ---------------- Tramos con estilo (para pegar y copiar) ----------------
   [{ text, st: { b, i, u, s, code, bg, color, href }, raw }] ⇄ Markdown */
export function toRuns(src) {
  src = String(src ?? '');
  const out = [];
  const go = (node, st) => {
    let at = node.cs;
    const text = (x, y) => { if (y > x) out.push({ text: src.slice(x, y), st, s: x }); };
    for (const n of node.kids) {
      text(at, n.s);
      if (n.t === 'code') out.push({ text: src.slice(n.cs, n.ce), st: { ...st, code: true }, s: n.cs });
      else if (n.t === 'esc') out.push({ text: src[n.cs], st, s: n.cs });
      else if (n.t === 'img' || n.t === 'ruby') out.push({ text: src.slice(n.s, n.e), st, s: n.s, raw: true });
      else go(n, { ...st, [n.t === 'link' ? 'href' : n.t]: n.v || true });
      at = n.e;
    }
    text(at, node.ce);
  };
  go(parse(src), {});
  return out;
}
// Solo una parte del texto [a, b), con su formato (al copiar un trozo)
export function sliceMarkdown(src, a, b) {
  const runs = [];
  for (const r of toRuns(src)) {
    const x = Math.max(a, r.s), y = Math.min(b, r.s + r.text.length);
    if (r.raw) { if (r.s < b && r.s + r.text.length > a) runs.push(r); continue; }
    if (y > x) runs.push({ ...r, text: r.text.slice(x - r.s, y - r.s) });
  }
  return fromRuns(runs);
}
const ORDER = ['href', 'color', 'bg', 'u', 's', 'b', 'i', 'code'];
const opener = (k, v) => ({ b: '**', i: '*', s: '~~', u: '<u>', href: '[', color: `<span style="color:${v}">`, bg: v === 'yellow' ? '==' : `<mark style="background:${v}">` }[k]);
const closer = (k, v) => ({ b: '**', i: '*', s: '~~', u: '</u>', href: `](${v})`, color: '</span>', bg: v === 'yellow' ? '==' : '</mark>' }[k]);
// Lo que podría confundirse con una marca se escribe con «\» delante
export const escapeMd = t => String(t).replace(/[\\*`]/g, '\\$&').replace(/~~/g, '\\~~').replace(/==/g, '\\==')
  .replace(/(^|[^\p{L}\p{N}])_|_(?=[^\p{L}\p{N}]|$)/gu, (m) => m.replace('_', '\\_'))
  .replace(/<(?=\/?(?:u|span|mark)\b)/gi, '\\<');
const same = (x, y) => ORDER.every(k => (x[k] || false) === (y[k] || false));
export function fromRuns(input) {
  // Los espacios de los bordes, fuera de las marcas («**hola** mundo», no «**hola **mundo»)
  const runs = [];
  const common = (x, y) => Object.fromEntries(ORDER.filter(k => x[k] && x[k] === y?.[k]).map(k => [k, x[k]]));
  input.forEach((r, i) => {
    if (!r.text) return;
    if (r.raw || !ORDER.some(k => r.st[k])) { runs.push(r); return; }
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(r.text);
    if (!m[2]) { runs.push({ text: r.text, st: common(r.st, input[i - 1]?.st || {}) }); return; }
    if (m[1]) runs.push({ text: m[1], st: common(r.st, input[i - 1]?.st || {}) });
    runs.push({ ...r, text: m[2] });
    if (m[3]) runs.push({ text: m[3], st: common(r.st, input[i + 1]?.st || {}) });
  });
  // Tramos seguidos con el mismo formato, juntos
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && !last.raw && !r.raw && same(last.st, r.st)) last.text += r.text;
    else merged.push({ ...r });
  }
  let out = '';
  const stack = [];
  for (const r of merged) {
    const want = ORDER.filter(k => k !== 'code' && r.st[k]).map(k => ({ k, v: r.st[k] }));
    let keep = 0;
    while (keep < stack.length && want.some(w => w.k === stack[keep].k && w.v === stack[keep].v)) keep++;
    while (stack.length > keep) { const x = stack.pop(); out += closer(x.k, x.v); }
    for (const w of want) if (!stack.some(x => x.k === w.k)) { out += opener(w.k, w.v); stack.push(w); }
    if (r.st.code) { const n = Math.max(0, ...(r.text.match(/`+/g) || []).map(x => x.length)) + 1; out += '`'.repeat(n) + r.text + '`'.repeat(n); }
    else out += r.raw ? r.text : escapeMd(r.text);
  }
  while (stack.length) { const x = stack.pop(); out += closer(x.k, x.v); }
  return out;
}

/* ---------------- Dar y quitar formato (botones y atajos del editor) ----------------
   toggleMark(texto, a, b, tipo, color) → { text, a, b } con la selección nueva (el contenido, sin las marcas).
   tipo: 'b' 'i' 'u' 's' 'code' 'color' 'bg'. Con color 'default' se quita el color (o el fondo). */
const MARKS = {
  b: () => ['**', '**'], i: () => ['*', '*'], u: () => ['<u>', '</u>'], s: () => ['~~', '~~'], code: () => ['`', '`'],
  color: v => [`<span style="color:${v}">`, '</span>'], bg: v => (v === 'yellow' ? ['==', '=='] : [`<mark style="background:${v}">`, '</mark>']),
};
export const marksFor = (kind, v) => MARKS[kind](v);
// Envuelve un texto con marcas, dejando fuera los espacios de los bordes
function wrapText(text, [o, c]) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  return m[2] ? m[1] + o + m[2] + c + m[3] : text;
}
const WORD = /[\p{L}\p{N}_'’-]/u;
export function toggleMark(src, a, b, kind, v = '') {
  src = String(src ?? '');
  if (a > b) [a, b] = [b, a];
  const all = nodesOf(parse(src));
  const isKind = n => n.t === kind;
  const sameV = n => !['color', 'bg'].includes(kind) || n.v === v;
  const off = ['color', 'bg'].includes(kind) && (!v || v === 'default');
  while (a < b && /\s/.test(src[a])) a++;
  while (b > a && /\s/.test(src[b - 1])) b--;
  if (a === b) {
    // Sin selección: dentro de algo con ese formato, se quita; dentro de una palabra, se le da a la palabra;
    // si no, se ponen las marcas vacías y el cursor entre ellas (para escribir ya con formato)
    const n = all.filter(x => isKind(x) && x.cs <= a && a <= x.ce).pop();
    if (n) return { text: src.slice(0, n.s) + src.slice(n.cs, n.ce) + src.slice(n.e), a: a - (n.cs - n.s), b: a - (n.cs - n.s) };
    let x = a, y = a;
    while (x > 0 && WORD.test(src[x - 1])) x--;
    while (y < src.length && WORD.test(src[y])) y++;
    if (y > x) { a = x; b = y; } else {
      if (off) return { text: src, a, b };
      const [o, c] = marksFor(kind, v);
      return { text: src.slice(0, a) + o + c + src.slice(a), a: a + o.length, b: a + o.length };
    }
  }
  // Que la selección no corte otros formatos por la mitad: se amplía hasta abarcarlos
  for (let changed = true; changed;) {
    changed = false;
    for (const n of all) {
      const inside = n.cs <= a && b <= n.ce && !ATOMS.includes(n.t);
      if (inside || b <= n.s || a >= n.e || (a <= n.s && n.e <= b)) continue;
      a = Math.min(a, n.s); b = Math.max(b, n.e); changed = true;
    }
  }
  // Ya tiene ese formato alrededor: se quita solo de lo seleccionado (lo de los lados lo conserva)
  const anc = all.filter(n => isKind(n) && n.cs <= a && b <= n.ce).pop();
  if (anc) {
    const marks = [src.slice(anc.s, anc.cs), src.slice(anc.ce, anc.e)];
    const left = wrapText(src.slice(anc.cs, a), marks), mid = src.slice(a, b), right = wrapText(src.slice(b, anc.ce), marks);
    let text = src.slice(0, anc.s) + left + mid + right + src.slice(anc.e);
    let na = anc.s + left.length, nb = na + mid.length;
    // Otro color: se quita el que había y se pone el nuevo
    if (!sameV(anc) && !off) { const [o, c] = marksFor(kind, v); text = text.slice(0, na) + o + mid + c + text.slice(nb); na += o.length; nb += o.length; }
    return { text, a: na, b: nb };
  }
  // Dentro de la selección: si todo tiene ya ese formato, se quita; si no, se pone a todo
  const innerNodes = all.filter(n => isKind(n) && a <= n.s && n.e <= b);
  const covered = !off && [...src.slice(a, b)].every((ch, k) => /\s/.test(ch) || innerNodes.some(n => sameV(n) && n.cs <= a + k && a + k < n.ce)
    || innerNodes.some(n => sameV(n) && ((n.s <= a + k && a + k < n.cs) || (n.ce <= a + k && a + k < n.e))));
  const cut = innerNodes.flatMap(n => [[n.s, n.cs], [n.ce, n.e]]).sort((x, y) => x[0] - y[0]);
  let mid = '', at = a;
  for (const [x, y] of cut) { mid += src.slice(at, x); at = y; }
  mid += src.slice(at, b);
  if (covered || off) return { text: src.slice(0, a) + mid + src.slice(b), a, b: a + mid.length };
  const [o, c] = marksFor(kind, v);
  return { text: src.slice(0, a) + o + mid + c + src.slice(b), a: a + o.length, b: a + o.length + mid.length };
}
// Los formatos que tiene un punto (o toda una selección) del texto: { b: true, color: 'red', … }
export function marksAt(src, a, b = a) {
  const all = nodesOf(parse(src)), out = {};
  for (const n of all) if (['b', 'i', 'u', 's', 'code', 'color', 'bg', 'link'].includes(n.t) && n.cs <= a && b <= n.ce) out[n.t] = n.v || true;
  return out;
}

/* ---------------- Colores al pegar ---------------- */
// Un color de CSS (r, g, b) → el color de Notion más parecido, o '' si es el de siempre (negro, gris, blanco)
export function paletteFor(r, g, b, background = false) {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255, l = (max + min) / 2;
  const d = max - min, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < (background ? 0.2 : 0.25) || l < 0.12 || (!background && l > 0.93) || (background && l > 0.97)) return '';
  let h;
  const R = r / 255, G = g / 255, B = b / 255;
  if (max === R) h = ((G - B) / d) % 6; else if (max === G) h = (B - R) / d + 2; else h = (R - G) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 14 || h >= 345) return 'red';
  if (h < 42) return (!background && (l < 0.36 || s < 0.45)) ? 'brown' : 'orange';
  if (h < 70) return 'yellow';
  if (h < 170) return 'green';
  if (h < 250) return 'blue';
  if (h < 290) return 'purple';
  return 'pink';
}
