// Mapa de lo que sabes: agrupa las preguntas de una lista, carpeta o tema en casillas y da a cada una su estado.
// Sin dependencias de la interfaz, así que se puede probar aparte.
import { toPlain } from './inline.js';
import { stripRuby } from './cardtypes.js';

// Texto de una casilla: sin imágenes, huecos, furigana (学校[がっこう] → 学校) ni « / » de las frases para ordenar
const clean = s => stripRuby(toPlain(String(s ?? '').replace(/!\[[^\]]*\]\([^)]*\)/g, '')).replace(/\{\{(.+?)(?:::.+?)?\}\}/g, '$1'))
  .replace(/\s+\/\s+/g, ' ').replace(/([　-ヿ㐀-鿿＀-￯])\s+(?=[　-ヿ㐀-鿿＀-￯])/g, '$1').replace(/\s+/g, ' ').trim();
// «Artículo 1 · El Estado y sus valores» → «El Estado y sus valores» (el título sin el artículo, que ya lo dice la casilla)
const ART_HEAD = /^\s*(?:art[ií]culos?|arts?)\.?\s*[\d\s,ya–-]+(?:\s*[·.:–-]\s*|\s+(?=\D))/i;
export const withoutArt = s => String(s ?? '').replace(ART_HEAD, '').trim();

/* ===================== artículos ===================== */
// «art. 14», «arts. 14 y 15», «artículos 14 a 16», «artículo 1.1»… El número termina ahí: «art. 14» no es «art. 140».
const ART = /\b(?:art[ií]culos?|arts?)\.?\s*(\d+(?:\s*(?:,|y|e|a|al|-|–)\s*\d+)*)(?![\d\p{L}])/giu;
// La ley que va detrás: «de la Constitución», «CE», «de la LOTC», «de la Ley Orgánica 2/1979…»
const LAW = /^(?:\.\d+)*\s*(?:,\s*)?(?:(?:del?|de la|de el)\s+)?(Constituci[oó]n(?:\s+Espa[nñ]ola)?|CE\b|Ley\s+Org[aá]nica(?:\s+\d+\/\d+)?(?:\s+del?\s+[A-ZÁÉÍÓÚ][^,.;:()\d]{0,50})?|L\.?\s?O\.?\s*\d+\/\d+|[A-Z]{2,6}\b)/;
const MAX_RANGE = 5;
const lawName = s => (/^(constituci|ce$)/i.test(s) ? 'Constitución' : s.replace(/\s+/g, ' ').trim());
// [{ law, n }] sin repetir. En un rango de más de 5 artículos, solo cuenta el primero.
export function citedArticles(text) {
  const t = String(text ?? ''), out = [], seen = new Set();
  for (const m of t.matchAll(ART)) {
    const law = lawName(LAW.exec(t.slice(m.index + m[0].length))?.[1] || '');
    const nums = [];
    // «14 y 15», «14, 15», «14 a 16», «14-16»
    const parts = m[1].split(/\s*(,|\by\b|\be\b|\bal?\b|-|–)\s*/);
    for (let i = 0; i < parts.length; i += 2) {
      const n = Number(parts[i]), sep = parts[i - 1];
      if (!Number.isFinite(n)) continue;
      if (sep && /^(a|al|-|–)$/.test(sep) && nums.length) {
        const lo = nums[nums.length - 1];
        if (n > lo && n - lo + 1 <= MAX_RANGE) for (let k = lo + 1; k <= n; k++) nums.push(k);
        continue;
      }
      nums.push(n);
    }
    for (const n of nums) { const k = `${law}|${n}`; if (!seen.has(k)) { seen.add(k); out.push({ law, n }); } }
  }
  return out;
}

/* ===================== estado ===================== */
// Estado de una pregunta: 'new' (sin empezar) · 'resiste' · 'medias' · 'sabes'
// evs: sus respuestas, de la más antigua a la más reciente (solo las del último año)
export function cardMapState(p, evs = [], now = Date.now()) {
  if (!p) return 'new';
  const last5 = evs.slice(-5), last = evs[evs.length - 1];
  // Con las dos últimas acertadas ya no se resiste (como mucho, «A medias»)
  const twoOk = evs.length >= 2 && evs.slice(-2).every(e => e.grade >= 3);
  if (!twoOk && (last5.filter(e => e.grade === 1).length >= 3 || last?.grade === 1)) return 'resiste';
  if (twoOk && last5.filter(e => e.grade === 1).length >= 3) return 'medias';
  if (!last && p.interval === 0) return 'medias';
  if (last?.grade === 2 || p.due <= now) return 'medias';
  return 'sabes';
}
const RANK = { resiste: 3, medias: 2, sabes: 1 };
// El de una casilla: el peor de sus preguntas empezadas; con alguna sin empezar, como mucho «A medias»
export function cellState(states) {
  const started = states.filter(s => s !== 'new');
  if (!started.length) return 'new';
  const worst = started.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
  return worst === 'sabes' && started.length < states.length ? 'medias' : worst;
}

/* ===================== casillas ===================== */
const HEADS = ['h1', 'h2', 'h3'];
const KINDS = ['Kanji', 'Palabras', 'Frases', 'Otras'];
const LONG = 40;
// cards: [{ id, note_id, page_id, block_id, front, back, fields, template, position }]
// pages: Map id → { id, title, blocks }
// opts.label(card): el campo principal de la nota (la palabra, el kanji…); opts.kind(card): 'Kanji' · 'Palabras' · 'Frases' · 'Otras'
// Devuelve { mode: 'art' | 'idea' | 'note' | 'card', sections: [{ name, loose, cells: [{ key, label, title, ids }] }] } o null (sin mapa)
export function groupCards(cards, pages = new Map(), { artShare = 0.3, label = null, kind = null } = {}) {
  if (!cards.length) return null;
  const list = [...cards].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const text = c => [c.front, c.back, ...Object.values(c.fields || {})].map(clean).join(' \n ');
  // Apartado de cada pregunta unida a un apunte: el título más cercano por encima de su bloque
  const ideaOf = c => {
    const p = c.page_id && pages.get(c.page_id), blocks = p?.blocks || [];
    const i = blocks.findIndex(b => b.id === c.block_id);
    if (!p || i < 0) return null;
    const pageName = clean(p.title) || 'Sin título';
    const h1s = blocks.filter(b => b.type === 'h1').length, subs = blocks.some(b => b.type === 'h2' || b.type === 'h3');
    let head = null, top = null;
    for (let k = i; k >= 0; k--) {
      const b = blocks[k];
      if (!HEADS.includes(b.type)) continue;
      if (!head && !(h1s && subs && b.type === 'h1')) head = { b, k };
      if (b.type === 'h1' && !top) top = b;
      if (head && (top || !h1s)) break;
    }
    return { pageId: p.id, pageName, top: h1s && subs ? clean(top?.text || '') : '', head: head ? clean(head.b.text) : '', at: head ? head.k : -1 };
  };
  const ideas = new Map(list.map(c => [c.id, ideaOf(c)]));
  // Los artículos que cita; si no cita ninguno, los del título de su apartado («Artículo 3 · Las lenguas»)
  const arts = new Map(list.map(c => { const a = citedArticles(text(c)); return [c.id, a.length ? a : citedArticles(ideas.get(c.id)?.head || '')]; }));
  const withArt = list.filter(c => arts.get(c.id).length);
  const multiPage = new Set(list.map(c => ideas.get(c.id)?.pageId).filter(Boolean)).size > 1;
  const cellsBy = (ids, keyOf) => {
    const m = new Map();
    for (const id of ids) { const k = keyOf(id); if (!k) continue; if (!m.has(k.key)) m.set(k.key, { ...k, ids: [] }); m.get(k.key).ids.push(id); }
    return [...m.values()];
  };
  // La casilla por apartado (o null si la pregunta no está unida a ningún apartado)
  const ideaCell = id => {
    const x = ideas.get(id);
    if (!x) return null;
    const label = x.head || x.pageName;
    return { key: `i|${x.pageId}|${x.at}`, label, section: multiPage ? x.pageName : x.top || '', order: x.at };
  };
  // Hermanas de una nota (vocabulario, kanji): la palabra del primer campo
  const byId = new Map(list.map(c => [c.id, c]));
  const noteCell = id => {
    const c = byId.get(id), sis = c.note_id ? list.filter(x => x.note_id === c.note_id) : [c];
    const first = sis.find(x => x.template === 't1') || sis[0];
    const main = clean(label?.(first) || '') || clean((first.fields && Object.values(first.fields).find(v => clean(v))) || first.front);
    return { key: `n|${c.note_id || c.id}`, label: main, section: kind?.(first) || '' };
  };
  const cardCell = id => ({ key: `c|${id}`, label: clean(byId.get(id).front), section: kind?.(byId.get(id)) || '' });
  const sectionsOf = cells => {
    const m = new Map();
    for (const cell of cells) { const s = cell.section || ''; if (!m.has(s)) m.set(s, []); m.get(s).push(cell); }
    return [...m].map(([name, cs]) => ({ name, cells: cs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) }));
  };
  const tooLong = cells => cells.filter(c => c.label.length > LONG).length > cells.length / 2;

  // 1. Artículos (si al menos el 30 % citan alguno)
  if (withArt.length && withArt.length >= list.length * artShare) {
    const laws = new Map();
    for (const c of withArt) for (const { law, n } of arts.get(c.id)) {
      if (!laws.has(law)) laws.set(law, new Map());
      const cells = laws.get(law);
      if (!cells.has(n)) cells.set(n, { key: `a|${law}|${n}`, label: String(n), n, law, ids: [], title: '' });
      cells.get(n).ids.push(c.id);
    }
    const sections = [...laws].map(([law, cells]) => ({ name: law || 'Artículos', cells: [...cells.values()].sort((a, b) => a.n - b.n) }));
    for (const s of sections) for (const cell of s.cells) cell.title = withoutArt(cell.ids.map(id => ideas.get(id)?.head).find(Boolean) || '');
    const rest = list.filter(c => !arts.get(c.id).length).map(c => c.id);
    if (rest.length) sections.push({ name: 'Sin artículo', loose: true, cells: cellsBy(rest, id => { const x = ideaCell(id); return x ? { ...x, section: '' } : noteCell(id); }) });
    return { mode: 'art', sections };
  }
  // 2. Apartados del apunte (si al menos la mitad están unidas a uno)
  const linked = list.filter(c => ideas.get(c.id));
  if (linked.length && linked.length >= list.length / 2) {
    const cells = cellsBy(linked.map(c => c.id), ideaCell);
    const sections = sectionsOf(cells);
    const rest = list.filter(c => !ideas.get(c.id)).map(c => c.id);
    if (rest.length) sections.push({ name: 'Fuera de los apuntes', loose: true, cells: cellsBy(rest, noteCell) });
    return { mode: 'idea', sections };
  }
  // 3. Notas con varias preguntas; 4. una casilla por pregunta (sin mapa si casi todas son largas)
  const notes = list.some(c => c.note_id && list.some(x => x !== c && x.note_id === c.note_id));
  const cells = cellsBy(list.map(c => c.id), notes ? noteCell : cardCell);
  if (tooLong(cells)) return null;
  // En las listas de idiomas, por secciones (Kanji, Palabras, Frases, Otras), cada una en el orden de la lista
  const kinds = new Set(cells.map(c => c.section));
  if (!kinds.has('Kanji') && !kinds.has('Palabras') || kinds.size < 2) return { mode: notes ? 'note' : 'card', sections: [{ name: '', cells }] };
  const sections = KINDS.filter(k => kinds.has(k)).map(k => ({ name: k, cells: cells.filter(c => c.section === k) }));
  return { mode: notes ? 'note' : 'card', sections };
}
// «arts. 159–165» o «16 artículos» bajo el nombre de una sección de artículos
export function artRange(cells) {
  const ns = cells.map(c => c.n).filter(Number.isFinite);
  if (!ns.length) return '';
  const lo = Math.min(...ns), hi = Math.max(...ns);
  return hi - lo + 1 === ns.length && ns.length > 1 ? `arts. ${lo}–${hi}` : ns.length === 1 ? `art. ${lo}` : `${ns.length} artículos`;
}
