// Sugerir tarjetas a partir de unos apuntes, sin IA: busca la información que la propia estructura de los
// apuntes señala como importante (definiciones, negritas, tablas, listas con título, fechas, vocabulario…)
// y la convierte en tarjetas del tipo que mejor le va. Cada sugerencia lleva una confianza (0 a 1): las altas
// salen ya marcadas. Sin dependencias de la interfaz, así que se puede probar aparte.
import { BUILTIN_TYPES, activeTemplates, summarize, baseLang } from './cardtypes.js';
import { pageTitle, parseTable } from './pages.js';

export const KINDS = {
  vocab: 'Vocabulario', def: 'Definición', term: 'Concepto', bold: 'Negrita', table: 'Tabla', match: 'Emparejar',
  conj: 'Conjugación', steps: 'Pasos', list: 'Lista', sort: 'Clasificar', date: 'Fecha', phrase: 'Frase', code: 'Código',
};
export const PRESELECT = 0.65;

/* ---------------- Texto ---------------- */
const IMG = /!\[[^\]\n]*\]\(img:[\w-]+\)/g;
// Sin formato: negritas, cursivas, huecos e imágenes fuera (la furigana se queda)
export const plainText = s => String(s ?? '').replace(IMG, '').replace(/\{\{(.+?)(?:::.+?)?\}\}/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2').replace(/\s+/g, ' ').trim();
const norm = s => plainText(s).toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const words = s => plainText(s).split(/\s+/).filter(Boolean);
const capFirst = s => s.charAt(0).toLocaleUpperCase() + s.slice(1);

// Frases de un párrafo, sin cortar en abreviaturas (p. ej., etc., Sr., a. C., EE. UU.…)
const ABBR_WORD = /(?<!\p{L})(?:p|ej|etc|sr|sra|dr|dra|vs|aprox|pág|págs|cap|núm|art|fig|vol|ed|s|a\.\s?C|d\.\s?C|EE\.\s?UU|e\.g|i\.e|approx|nr|bzw|usw|z\.B|ca)\.$/iu;
const INITIAL = /(?<!\p{L})\p{Lu}\.$/u;   // «J. Smith»
const ABBR = { test: s => ABBR_WORD.test(s) || INITIAL.test(s) };
export function sentences(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  const out = [];
  let start = 0;
  const re = /[.!?…]+["»”)]?\s+(?=[¿¡"«“(]?[\p{Lu}\d])/gu;
  let m;
  while ((m = re.exec(t))) {
    const end = m.index + m[0].trimEnd().length;
    const piece = t.slice(start, end);
    if (ABBR.test(piece.replace(/["»”)]+$/, ''))) continue;
    out.push(piece.trim());
    start = m.index + m[0].length;
  }
  if (start < t.length) out.push(t.slice(start).trim());
  return out.filter(Boolean);
}

// Etiquetas que no son conceptos: «Nota: …», «Ejemplo: …»
const LABELS = /^(nota|notas|ejemplo|ejemplos|ej|p\.?\s?ej|importante|ojo|recuerda|atención|cuidado|observación|obs|fuente|ver|véase|consejo|truco|tip|pista|resumen|conclusión|idea|pregunta|respuesta|example|examples|e\.g|note|warning|hint|beispiel|achtung|hinweis|örnek|not|dikkat|nb|ps|pd)\.?$/i;
// Palabras con las que no acaba un término (señal de que el corte está a mitad de frase)
const DANGLING = /\b(de|del|la|las|el|los|y|o|que|en|a|con|por|para|un|una|the|of|and|or|to|in|a|an|der|die|das|und|oder|ve|ile)$/i;
const ARTICLE = /^(el|la|los|las|lo|un|una|unos|unas|the|a|an)\s/i;

/* ---------------- Idioma (para saber qué lado es la traducción) ---------------- */
const ES_WORDS = new Set('el la los las de del que y en un una es son por para con no se lo al como más pero sus su le ya o este esta muy también hay casa agua yo tú él ella nosotros'.split(' '));
export function looksSpanish(s) {
  const w = norm(s).split(' ').filter(Boolean);
  if (!w.length) return 0;
  const hits = w.filter(x => ES_WORDS.has(x)).length + (/[ñáéíóú¿¡]/i.test(s) ? 1 : 0);
  return hits / w.length;
}
const otherLang = s => /[çğışöüäßÄÖÜĞİŞ]|[぀-ヿ一-鿿]|[Ѐ-ӿ]|[Ͱ-Ͽ]|[؀-ۿ]|[가-힯]/.test(s);

/* ---------------- Pronombres (tablas y listas de conjugación) ---------------- */
const PRONOUNS = {
  es: ['yo', 'tú', 'tu', 'él', 'el', 'ella', 'usted', 'él/ella', 'él/ella/usted', 'nosotros', 'nosotras', 'nosotros/as', 'vosotros', 'vosotras', 'vosotros/as', 'ellos', 'ellas', 'ustedes', 'ellos/ellas', 'ellos/ellas/ustedes'],
  de: ['ich', 'du', 'er', 'sie', 'es', 'er/sie/es', 'er/sie', 'wir', 'ihr', 'sie/Sie', 'Sie'],
  tr: ['ben', 'sen', 'o', 'biz', 'siz', 'onlar'],
  en: ['i', 'you', 'he', 'she', 'it', 'he/she', 'he/she/it', 'we', 'they'],
  fr: ['je', "j'", 'tu', 'il', 'elle', 'il/elle', 'on', 'nous', 'vous', 'ils', 'elles', 'ils/elles'],
  it: ['io', 'tu', 'lui', 'lei', 'lui/lei', 'noi', 'voi', 'loro'],
  pt: ['eu', 'tu', 'você', 'ele', 'ela', 'ele/ela', 'nós', 'vós', 'vocês', 'eles', 'elas', 'eles/elas'],
};
const ALL_PRONOUNS = new Set(Object.values(PRONOUNS).flat().map(p => p.toLowerCase()));
const isPronoun = s => ALL_PRONOUNS.has(String(s).trim().toLowerCase().replace(/\s*\/\s*/g, '/'));

/* ---------------- Tipos y vista previa ---------------- */
const TYPE = id => BUILTIN_TYPES.find(t => t.id === id);
const LANG_ONLY = { vocab: 'basic', order: 'basic', conj: 'basic' };
// La sugerencia como nota de un tipo; si el tipo no sirve en un mazo sin idioma, se pasa a «Básica»
function asNote(typeId, fields, isLangDeck) {
  if (!isLangDeck && LANG_ONLY[typeId]) {
    if (typeId === 'vocab') return { typeId: 'basic', fields: { q: fields.w, a: fields.t, n: fields.n || '' } };
    if (typeId === 'order') return { typeId: 'basic', fields: { q: fields.t, a: fields.f, n: fields.n || '' } };
    if (typeId === 'conj') return { typeId: 'basic', fields: { q: [fields.v, fields.k].filter(Boolean).join(' · '), a: fields.f.split('\n').map(l => l.replace(' = ', ' ')).join('\n'), n: '' } };
  }
  return { typeId, fields };
}

/* ---------------- Preguntas ---------------- */
// «La mitosis» → «la mitosis» (los nombres propios y siglas se quedan como están)
const lowerSubject = s => (ARTICLE.test(s) ? s.charAt(0).toLocaleLowerCase() + s.slice(1) : s);
const isProperName = s => !ARTICLE.test(s) && words(s).every(w => /^[\p{Lu}\d]/u.test(w) || /^(de|del|la|y|van|von)$/i.test(w));
// Verbo de una definición → cómo se pregunta (y si la respuesta es el sujeto, como en «se llama»)
const COPULAS = [
  { re: /^(.+?)\s+se\s+(?:llama|llaman|denomina|denominan|conoce\s+como|conocen\s+como)\s+(.+)$/i, ask: s => `¿Cómo se llama ${lowerSubject(s)}?`, reverse: true },
  { re: /^(.+?)\s+se\s+definen?\s+como\s+(.+)$/i, ask: s => `¿Cómo se define ${lowerSubject(s)}?` },
  { re: /^(.+?)\s+consisten?\s+en\s+(.+)$/i, ask: s => `¿En qué consiste ${lowerSubject(s)}?` },
  { re: /^(.+?)\s+significan?\s+(.+)$/i, ask: s => `¿Qué significa ${lowerSubject(s)}?` },
  { re: /^(.+?)\s+se\s+refieren?\s+a\s+(.+)$/i, ask: s => `¿A qué se refiere ${lowerSubject(s)}?` },
  { re: /^(.+?)\s+sirven?\s+para\s+(.+)$/i, ask: s => `¿Para qué sirve ${lowerSubject(s)}?` },
  { re: /^(.+?)\s+fue\s+(.+)$/i, ask: s => (isProperName(s) ? `¿Quién fue ${s}?` : `¿Qué fue ${lowerSubject(s)}?`) },
  { re: /^(.+?)\s+era\s+(.+)$/i, ask: s => (isProperName(s) ? `¿Quién era ${s}?` : `¿Qué era ${lowerSubject(s)}?`) },
  { re: /^(.+?)\s+fueron\s+(.+)$/i, ask: s => (isProperName(s) ? `¿Quiénes fueron ${s}?` : `¿Qué fueron ${lowerSubject(s)}?`) },
  { re: /^(.+?)\s+eran\s+(.+)$/i, ask: s => (isProperName(s) ? `¿Quiénes eran ${s}?` : `¿Qué eran ${lowerSubject(s)}?`) },
  { re: /^(.+?)\s+son\s+(.+)$/i, ask: s => `¿Qué son ${lowerSubject(s)}?` },
  { re: /^(.+?)\s+es\s+(.+)$/i, ask: s => (isProperName(s) && words(s).length <= 3 && /^[\p{Lu}]/u.test(s) ? `¿Quién es ${s}?` : `¿Qué es ${lowerSubject(s)}?`) },
  { re: /^(.+?)\s+is\s+called\s+(.+)$/i, ask: s => `What is ${s.replace(/^(the|a|an)\s/i, m => m.toLowerCase())} called?`, reverse: true },
  { re: /^(.+?)\s+(?:is|are)\s+defined\s+as\s+(.+)$/i, ask: s => `How is ${s} defined?` },
  { re: /^(.+?)\s+means\s+(.+)$/i, ask: s => `What does ${s} mean?` },
  { re: /^(.+?)\s+(?:is|was)\s+(.+)$/i, ask: s => `What is ${s.replace(/^(The|A|An)\s/, m => m.toLowerCase())}?` },
  { re: /^(.+?)\s+are\s+(.+)$/i, ask: s => `What are ${s.replace(/^(The)\s/, 'the ')}?` },
];
// Sujetos que no son un concepto: «Lo importante es…», «Esto es…», «Hoy es…»
const VAGUE = /^(lo|esto|eso|aquello|esta|este|estas|estos|ese|esa|aquí|ahí|hoy|ayer|mañana|también|además|otra|otro|una\s+(?:ventaja|cosa|idea|forma)|el\s+problema|la\s+(?:idea|cosa|clave|razón)|it|this|that|there|here|todo|nada|algo|cada|mi|tu|su|nuestro|nuestra|el\s+objetivo|la\s+respuesta|la\s+pregunta)\b/i;
// Verbos que delatan que el «sujeto» ya es media frase
const VERBISH = /\b(es|son|era|fue|está|están|tiene|tienen|hay|puede|pueden|debe|hace|hacen|se|que|cuando|porque|si|aunque|pero|is|are|was|has|have|can|which|that|because|when)\b/i;

/* ---------------- Reglas ---------------- */
// «Término: definición» (también con =, →, —, – o « - »)
function splitDef(text) {
  const t = String(text).trim();
  const m = /^(.{1,70}?)\s*(?::|=|→|⇒|—|–|\s-\s)\s+(.+)$/s.exec(t);
  if (!m) return null;
  let term = m[1].trim(), def = m[2].trim();
  term = term.replace(/^[-•*]\s*/, '');
  const tp = plainText(term);
  if (!tp || !/\p{L}/u.test(tp) || LABELS.test(tp) || words(tp).length > 7 || DANGLING.test(tp) || /[.?!](\s|$)/.test(tp)) return null;
  if (!plainText(def) || /^\d{1,2}$/.test(plainText(def))) return null;
  return { term, def };
}
// «**Término** es / . / , definición»
function boldLead(text) {
  const m = /^\*\*([^*]{1,70})\*\*\s*(?:[:.,—–-]\s*|\s+(?:es|son|is|are)\s+)(.{8,})$/s.exec(String(text).trim());
  return m && !LABELS.test(m[1].trim()) ? { term: m[1].trim(), def: m[2].trim() } : null;
}

export function suggestCards(page, { lang = '', native = 'es-ES', existing = [] } = {}) {
  const isLangDeck = !!lang;
  const nativeEs = baseLang(native) === 'es';
  const blocks = page?.blocks || [];
  const out = [];
  const seen = new Set(existing.map(c => norm(c.front)).filter(Boolean));
  // Lo que ya es tarjeta en la misma parte del apunte, aunque se retocara el anverso: por su respuesta
  const fromBlock = new Set(existing.filter(c => c.block_id).map(c => c.block_id + '|' + norm(c.back)));
  const used = new Set();   // bloques ya convertidos por una regla más fiable
  const add = (kind, blockId, typeId, fields, score, extra = {}) => {
    const note = asNote(typeId, fields, isLangDeck);
    const type = TYPE(note.typeId);
    const active = activeTemplates(type, note.fields);
    if (!active.length) return false;
    const sum = summarize(type, active[0], note.fields);
    const key = norm(sum.front) + '|' + norm(sum.back);
    if (!norm(sum.front) || seen.has(norm(sum.front)) || seen.has(key) || fromBlock.has(blockId + '|' + norm(sum.back))) return false;
    seen.add(key); seen.add(norm(sum.front));
    out.push({ key: `${kind}:${blockId}:${out.length}`, kind, label: KINDS[kind], blockId, section: sectionOf(blockId), typeId: note.typeId, fields: note.fields,
      front: sum.front, back: sum.back, cards: active.length, score: Math.min(1, score + (calloutIds.has(blockId) ? 0.1 : 0)), ...extra });
    return true;
  };

  // Apartado de cada bloque (los títulos de los que cuelga) y bloques destacados
  const headOf = new Map(), stack = [], calloutIds = new Set();
  for (const b of blocks) {
    const lvl = b.type === 'h1' ? 1 : b.type === 'h2' ? 2 : b.type === 'h3' ? 3 : 0;
    if (lvl) { while (stack.length && stack[stack.length - 1].lvl >= lvl) stack.pop(); stack.push({ lvl, text: plainText(b.text), id: b.id }); }
    headOf.set(b.id, stack.map(s => s.text));
    if (b.type === 'callout') calloutIds.add(b.id);
  }
  const title = plainText(page?.title || '') || pageTitle(page);
  const sectionOf = id => headOf.get(id)?.join(' › ') || title;
  const nearestHeading = id => { const h = headOf.get(id); return h?.length ? h[h.length - 1] : ''; };

  // Grupos seguidos de elementos de lista (con lo que los presenta: un título o un párrafo acabado en «:»)
  const runs = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!['li', 'ol'].includes(b.type)) continue;
    const run = [b];
    while (blocks[i + 1] && blocks[i + 1].type === b.type) run.push(blocks[++i]);
    const prev = blocks[i - run.length];
    runs.push({ type: b.type, items: run, intro: prev && /^(h[1-3]|p)$/.test(prev.type) ? prev : null });
  }
  const shortItem = b => plainText(b.text).length > 0 && plainText(b.text).length <= 120;

  /* 1) Tablas */
  for (const b of blocks.filter(x => x.type === 'table')) {
    const t = parseTable(b.text);
    if (!t || !t.rows.length) continue;
    const head = t.head.map(plainText), rows = t.rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => plainText(c)));
    // Conjugación: la primera columna son pronombres
    if (rows.filter(r => isPronoun(plainText(r[0]))).length >= Math.max(3, rows.length * 0.6) && head.length >= 2) {
      for (let j = 1; j < head.length; j++) {
        const f = rows.filter(r => plainText(r[j])).map(r => `${plainText(r[0])} = ${r[j].trim()}`).join('\n');
        const h = nearestHeading(b.id);
        const verb = (/(?:conjugaci[oó]n|verbo|konjugation|conjugation|fiil)\s+(?:de(?:l verbo)?|von|of|des)?\s*[«"]?([^»"]+?)[»"]?$/i.exec(h) || [])[1] || '';
        add('conj', b.id, 'conj', verb ? { v: verb, k: head[j], t: '', f, n: '' } : { v: head[j] || h, k: head[j] && h !== head[j] ? h : '', t: '', f, n: '' }, 0.85);
      }
      used.add(b.id); continue;
    }
    // Dos columnas cortas en un mazo de idiomas: vocabulario
    const short = c => words(c).length <= 5;
    if (isLangDeck && head.length === 2 && rows.every(r => short(r[0]) && short(r[1]))) {
      for (const r of rows) {
        let [w, tr] = [r[0], r[1]];
        if (nativeEs && looksSpanish(w) > looksSpanish(tr) + 0.2) [w, tr] = [tr, w];
        add('vocab', b.id, 'vocab', { w, t: tr, p: '', e: '', n: '' }, 0.85);
      }
      used.add(b.id); continue;
    }
    // En general: una tarjeta por celda («fila → columna»)
    for (const r of rows) {
      const key = plainText(r[0]);
      if (!key) continue;
      for (let j = 1; j < head.length; j++) {
        if (!plainText(r[j])) continue;
        const col = head[j] ? (ARTICLE.test(head[j]) || /^[\p{Lu}][\p{Ll}]/u.test(head[j]) ? head[j].charAt(0).toLocaleLowerCase() + head[j].slice(1) : head[j]) : '';
        add('table', b.id, 'basic', { q: col ? `${r[0].trim()} → ${col}` : r[0].trim(), a: r[j].trim(), n: head[0] && head[j] ? `${head[0]}: ${key}` : '' }, head.length <= 3 ? 0.8 : 0.7);
      }
    }
    // Alternativa: toda la tabla como emparejar (si es corta y de dos columnas)
    if (head.length === 2 && rows.length >= 3 && rows.length <= 8) {
      add('match', b.id, 'match', { t: head[0] && head[1] ? `Une cada ${head[0].toLocaleLowerCase()} con su ${head[1].toLocaleLowerCase()}` : '', p: rows.map(r => `${plainText(r[0])} = ${plainText(r[1])}`).join('\n'), n: '' }, 0.5);
    }
    used.add(b.id);
  }

  /* 2) Listas con título */
  // Listas hermanas bajo títulos del mismo nivel (Ventajas / Inconvenientes…): clasificar
  const STEPS_RE = /\b(fases|pasos|etapas|orden|proceso|procedimiento|cronolog|secuencia|ciclo|steps|phases|stages|order)\b/i;
  const sectionLists = runs.filter(r => r.type === 'li' && r.intro && /^h[2-3]$/.test(r.intro.type) && !STEPS_RE.test(plainText(r.intro.text)) && r.items.length >= 2 && r.items.length <= 8 && r.items.every(shortItem)
    && blocks[blocks.indexOf(r.items[r.items.length - 1]) + 1]?.type !== 'p');
  for (let i = 0; i < sectionLists.length; i++) {
    const group = [sectionLists[i]];
    while (sectionLists[i + 1] && sectionLists[i + 1].intro.type === sectionLists[i].intro.type
      && String(headOf.get(sectionLists[i + 1].intro.id)?.slice(0, -1)) === String(headOf.get(group[0].intro.id)?.slice(0, -1))
      && blocks.indexOf(sectionLists[i + 1].intro) === blocks.indexOf(group[group.length - 1].items.at(-1)) + 1) group.push(sectionLists[++i]);
    if (group.length < 2 || group.length > 5) continue;
    const parent = headOf.get(group[0].intro.id)?.slice(0, -1).at(-1) || title;
    const g = group.map(r => `${plainText(r.intro.text)}: ${r.items.map(x => plainText(x.text).replace(/[,;:]/g, ' ').trim()).join(', ')}`).join('\n');
    if (add('sort', group[0].intro.id, 'sort', { q: parent ? `${parent}: clasifica cada elemento` : '', g, n: '' }, 0.6)) group.forEach(r => (r.sorted = true));
  }
  for (const r of runs) {
    if (r.items.some(x => used.has(x.id))) continue;
    // Si casi todos los elementos son definiciones («término: …»), se tratan uno a uno más abajo
    if (r.items.filter(x => splitDef(x.text) || boldLead(x.text)).length >= r.items.length * 0.5) continue;
    if (r.items.length < 2 || r.items.length > 10 || !r.items.every(shortItem)) continue;
    const introText = r.intro ? (r.intro.type === 'p' ? sentences(plainText(r.intro.text)).at(-1) || '' : plainText(r.intro.text)) : '';
    const isSteps = r.type === 'ol' || STEPS_RE.test(introText);
    if (isSteps && r.items.length >= 3 && r.intro) {
      const q = introText.replace(/:$/, '');
      add('steps', r.items[0].id, 'steps', { q: /^ordena/i.test(q) ? q : `Ordena: ${q.charAt(0).toLocaleLowerCase() + q.slice(1)}`, s: r.items.map(x => plainText(x.text)).join('\n'), n: '' }, 0.8);
      r.items.forEach(x => used.add(x.id));
      continue;
    }
    if (r.sorted || !r.intro) continue;
    // «Las funciones del hígado son:» → «¿Cuáles son las funciones del hígado?»
    let q;
    const m1 = /^(.+?)\s+(son|eran|fueron|incluyen|are|include)\s*:$/i.exec(introText);
    const m2 = /^(tipos|clases|partes|características|funciones|causas|consecuencias|ventajas|inconvenientes|desventajas|ejemplos|elementos|componentes|tipos de .+|partes de .+)(.*?):?$/i.exec(introText);
    if (m1) q = /^(are|include)$/i.test(m1[2]) ? `What ${m1[2].toLowerCase()} ${m1[1]}?` : `¿Cuáles ${m1[2].toLowerCase() === 'son' ? 'son' : m1[2].toLowerCase()} ${lowerSubject(m1[1])}?`;
    else if (m2) q = `¿Cuáles son ${/^(tipos|clases|partes|ejemplos|elementos|componentes)/i.test(m2[1]) ? 'los' : 'las'} ${(m2[1] + m2[2]).toLocaleLowerCase().replace(/:$/, '')}?`;
    else if (/^h[1-3]$/.test(r.intro.type)) q = `${introText}: ¿cuáles son?`;
    else if (/:$/.test(introText)) q = introText.replace(/:$/, '') + ': ¿cuáles?';
    else continue;
    if (r.intro.type === 'p' && !/:$/.test(introText)) continue;   // un párrafo cualquiera antes de la lista no la presenta
    // Con un título genérico («Causas»), el apartado del que cuelga da el contexto
    const ctx = /^h[1-3]$/.test(r.intro.type) && m2 ? headOf.get(r.intro.id)?.slice(0, -1).at(-1) || title : '';
    add('list', r.items[0].id, 'basic', { q: capFirst(q) + (ctx ? ` — ${ctx}` : ''), a: r.items.map(x => `- ${plainText(x.text)}`).join('\n'), n: '' }, r.items.length <= 6 ? 0.55 : 0.45);
  }

  /* 3) Bloque a bloque: vocabulario, definiciones, negritas, fechas, código */
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (used.has(b.id) || !['p', 'li', 'ol', 'callout', 'quote', 'code'].includes(b.type)) continue;
    const text = String(b.text || '').replace(IMG, '').trim();
    if (!text) continue;

    // Código con su explicación justo antes: «Para deshacer el último commit:» + código
    if (b.type === 'code') {
      const prev = blocks[i - 1];
      const lines = text.split('\n').length;
      if (prev && /^(p|li|h[1-3])$/.test(prev.type) && lines <= 8 && plainText(prev.text).length <= 160) {
        let q = plainText(prev.text).replace(/[:.]$/, '');
        q = /^para\s+/i.test(q) ? `¿Cómo ${q.replace(/^para\s+/i, '')}?` : /^\p{Lu}/u.test(q) && !/\?$/.test(q) ? `${q}?` : q;
        add('code', b.id, 'basic', { q: capFirst(q.replace(/^¿?/, '¿').replace(/^¿(?=[A-Z][a-z]+ [a-z])/, '¿')), a: '```\n' + text + '\n```', n: '' }, 0.7);
      }
      continue;
    }

    const def = splitDef(text) || boldLead(text);
    if (def) {
      const termP = plainText(def.term), defP = plainText(def.def);
      const tw = words(termP).length, dw = words(defP).length;
      // Par corto (≤ 4 y ≤ 6 palabras): vocabulario en mazos de idiomas; si no, pregunta y respuesta
      if (isLangDeck && tw <= 4 && dw <= 6) {
        let [w, tr] = [def.term.replace(/\*\*/g, ''), def.def.replace(/\*\*/g, '')];
        if (nativeEs && looksSpanish(w) > looksSpanish(tr) + 0.2 && !otherLang(w)) [w, tr] = [tr, w];
        // Frases (3 palabras o más en el idioma): ordenar; palabras: vocabulario
        if (words(w).length >= 3) add('phrase', b.id, 'order', { f: w, t: tr, n: '' }, 0.7);
        else add('vocab', b.id, 'vocab', { w, t: tr, p: '', e: '', n: '' }, 0.9);
        continue;
      }
      if (tw <= 6 && dw >= 2) {
        const subj = termP;
        const q = /^(qué|cuál|cómo|quién|por qué|cuándo|dónde|what|how|why|who|when|where)\b/i.test(subj) || /\?$/.test(subj)
          ? capFirst(subj.replace(/^¿?/, '¿').replace(/\??$/, '?'))
          : def.term.replace(/\*\*/g, '').trim();   // el término tal cual, como en una tarjeta de toda la vida
        add('def', b.id, 'basic', { q, a: capFirst(defP), n: '' }, 0.85);
        continue;
      }
    }

    // Frase a frase: concepto con verbo, negritas y fechas
    for (const s of sentences(text)) {
      const sp = plainText(s);
      if (sp.length < 12 || sp.length > 320) continue;
      // Negritas: un hueco por cada una (lo que el autor marcó como importante)
      const bolds = [...s.matchAll(/\*\*([^*]{1,60})\*\*/g)].map(m => m[1].trim()).filter(x => x && !LABELS.test(x));
      if (bolds.length && bolds.length <= 4) {
        for (const bt of bolds) {
          const x = s.replace(/\*\*([^*]{1,60})\*\*/g, (m, inner) => (inner.trim() === bt ? `{{${inner.trim()}}}` : inner)).replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2');
          add('bold', b.id, 'cloze', { x: x.trim(), e: '' }, 0.75);
        }
        continue;
      }
      const sdef = s !== text && !bolds.length && splitDef(s);
      if (sdef && words(plainText(sdef.term)).length <= 5 && words(plainText(sdef.def)).length >= 2 && !/^(\d|[a-z])/.test(plainText(sdef.term))) {
        const tp = plainText(sdef.term);
        if (add('def', b.id, 'basic', { q: tp, a: capFirst(plainText(sdef.def).replace(/[.]$/, '')), n: '' }, 0.8)) continue;
      }
      const body = sp.replace(/[.!?…]+$/, '');
      let done = false;
      for (const c of COPULAS) {
        const m = c.re.exec(body);
        if (!m) continue;
        let [, subj, rest] = m;
        subj = subj.trim(); rest = rest.trim();
        const sw = words(subj).length;
        if (VAGUE.test(subj) || /,/.test(subj) || /^(no|también|ya)\b/i.test(rest)) break;
        if (c.reverse) {
          // «El proceso por el que… se llama fotosíntesis»: la respuesta es el nombre (corto)
          if (sw > 22 || words(rest).length > 5) break;
          done = add('term', b.id, 'basic', { q: c.ask(subj), a: capFirst(rest), n: '' }, 0.7);
          break;
        }
        if (sw > 6 || VERBISH.test(subj) || words(rest).length < 3) break;
        done = add('term', b.id, 'basic', { q: c.ask(subj), a: capFirst(rest), n: '' }, sw <= 3 ? 0.7 : 0.6);
        break;
      }
      if (done) continue;
      // Fechas: un año en la frase → respuesta numérica
      const years = [...sp.matchAll(/(?<![\d.,])(1[0-9]{3}|20[0-9]{2}|[1-9][0-9]{0,2}(?=\s?(?:a\.\s?C|d\.\s?C|BC|AD)))(?![\d.,]\d)/g)];
      if (years.length === 1 && /\b(en|año|desde|hasta|entre|in|year|im|jahr|yılında|siglo|fecha|nació|murió|fundó|llegó|comenzó|terminó|empezó|acabó)\b/i.test(sp)) {
        const y = years[0][1];
        add('date', b.id, 'number', { q: sp.replace(new RegExp(`(?<![\\d.,])${y}(?![\\d.,]\\d)`), '____'), a: y, t: '', u: '', n: '' }, 0.6);
      }
    }
  }

  // Vocabulario suelto en mazos de idiomas: líneas tipo «ev (casa)»
  if (isLangDeck) {
    for (const b of blocks) {
      if (used.has(b.id) || !['li', 'p'].includes(b.type) || out.some(s => s.blockId === b.id)) continue;
      const m = /^([^()]{1,40}?)\s*\(([^()]{1,40})\)\s*$/.exec(plainText(b.text));
      if (m && words(m[1]).length <= 3) add('vocab', b.id, 'vocab', { w: m[1].trim(), t: m[2].trim(), p: '', e: '', n: '' }, 0.75);
    }
  }

  // En el orden en que aparecen en los apuntes
  const pos = new Map(blocks.map((b, i) => [b.id, i]));
  return out.sort((a, b) => (pos.get(a.blockId) ?? 0) - (pos.get(b.blockId) ?? 0)).map(s => ({ ...s, selected: s.score >= PRESELECT }));
}
