// Tipos de tarjeta: campos personalizables y plantillas que generan tarjetas.
//
// Un TIPO tiene:
//   fields:    [{ id, name, lang, autoplay, help }]       ← lo que rellenas
//   templates: [{ id, name, mode, front:[ids], back:[ids], answer, wrong }]
//              ← cada plantilla genera UNA tarjeta a partir de los campos
// Modos: flip (dar la vuelta) · type (escribir la respuesta) · choice (opción múltiple) · cloze (huecos)
//        draw (escribir a mano) · listen (dictado) · order (ordenar las piezas)
//
// Una NOTA es un conjunto de valores de campos; al guardarla se crea una tarjeta por
// plantilla (por ejemplo, «Doble sentido» crea dos). Las tarjetas hermanas comparten note_id.

export const MODES = [
  { id: 'flip', label: 'Dar la vuelta', help: 'Ves el anverso, piensas la respuesta y das la vuelta.' },
  { id: 'type', label: 'Escribir la respuesta', help: 'Escribes la respuesta y la app te marca los errores letra a letra.' },
  { id: 'choice', label: 'Opción múltiple', help: 'Eliges la correcta entre cuatro opciones.' },
  { id: 'cloze', label: 'Huecos', help: 'Escribe el texto y marca los huecos con {{ }}. Ej.: Ev{{de}}yim' },
  { id: 'draw', label: 'Escribir a mano', help: 'Dibujas la respuesta con el dedo. Con kanji y caracteres chinos se corrige trazo a trazo; con otros alfabetos comparas tu dibujo con la solución.' },
  { id: 'listen', label: 'Dictado', help: 'Escuchas la respuesta y la escribes. El campo necesita un idioma de audio.' },
  { id: 'order', label: 'Ordenar', help: 'Colocas las piezas en orden. Se separan por espacios; si escribes « / » entre piezas (útil en japonés o chino), se usan esas.' },
];
export const NEEDS_ANSWER = ['type', 'choice', 'draw', 'listen', 'order'];

export const LANGS = [
  { id: '', label: 'Sin audio' },
  { id: 'tr-TR', label: 'Turco' }, { id: 'es-ES', label: 'Español' }, { id: 'en-GB', label: 'Inglés (Reino Unido)' },
  { id: 'en-US', label: 'Inglés (EE. UU.)' }, { id: 'fr-FR', label: 'Francés' }, { id: 'de-DE', label: 'Alemán' },
  { id: 'it-IT', label: 'Italiano' }, { id: 'pt-PT', label: 'Portugués' }, { id: 'pt-BR', label: 'Portugués (Brasil)' },
  { id: 'nl-NL', label: 'Neerlandés' }, { id: 'el-GR', label: 'Griego' }, { id: 'ru-RU', label: 'Ruso' },
  { id: 'ar-SA', label: 'Árabe' }, { id: 'ja-JP', label: 'Japonés' }, { id: 'zh-CN', label: 'Chino' }, { id: 'ko-KR', label: 'Coreano' },
  { id: 'ca-ES', label: 'Catalán' }, { id: 'eu-ES', label: 'Euskera' }, { id: 'gl-ES', label: 'Gallego' },
];

const F = (id, name, extra = {}) => ({ id, name, lang: '', autoplay: false, help: '', ...extra });

export const BUILTIN_TYPES = [
  {
    id: 'basic', builtin: true, name: 'Básica', icon: '', lucide: 'layers',
    description: 'Pregunta y respuesta.',
    fields: [F('q', 'Pregunta'), F('a', 'Respuesta'), F('n', 'Nota')],
    templates: [{ id: 't1', name: 'Pregunta → Respuesta', mode: 'flip', front: ['q'], back: ['a', 'n'] }],
  },
  {
    id: 'reverse', builtin: true, name: 'Doble sentido', icon: '', lucide: 'repeat-2',
    description: 'Crea dos tarjetas: de A a B y de B a A.',
    fields: [F('a', 'Anverso'), F('b', 'Reverso'), F('n', 'Nota')],
    templates: [
      { id: 't1', name: 'Anverso → Reverso', mode: 'flip', front: ['a'], back: ['b', 'n'] },
      { id: 't2', name: 'Reverso → Anverso', mode: 'flip', front: ['b'], back: ['a', 'n'] },
    ],
  },
  {
    id: 'typing', builtin: true, name: 'Escribir la respuesta', icon: '', lucide: 'keyboard',
    description: 'Escribes la respuesta y se corrige letra a letra.',
    fields: [F('q', 'Pregunta'), F('a', 'Respuesta'), F('n', 'Nota')],
    templates: [{ id: 't1', name: 'Escribir', mode: 'type', front: ['q'], back: ['n'], answer: 'a' }],
  },
  {
    id: 'cloze', builtin: true, name: 'Huecos', icon: '', lucide: 'puzzle',
    description: 'Oculta partes del texto. Marca cada hueco con {{ }}.',
    fields: [F('x', 'Texto con huecos', { help: 'Ejemplo: Ev{{de}}yim. Para dar una pista: {{de::lugar}}' }), F('e', 'Extra')],
    templates: [{ id: 't1', name: 'Huecos', mode: 'cloze', front: ['x'], back: ['e'] }],
  },
  {
    id: 'choice', builtin: true, name: 'Opción múltiple', icon: '', lucide: 'list-checks',
    description: 'Eliges la respuesta correcta entre cuatro.',
    fields: [F('q', 'Pregunta'), F('a', 'Respuesta correcta'),
      F('w', 'Respuestas incorrectas (opcional)', { help: 'Separadas por ; Si lo dejas vacío, se usan respuestas de otras tarjetas del mazo.' }), F('n', 'Nota')],
    templates: [{ id: 't1', name: 'Elegir', mode: 'choice', front: ['q'], back: ['n'], answer: 'a', wrong: 'w' }],
  },
  {
    id: 'vocab', builtin: true, name: 'Vocabulario', icon: '', lucide: 'languages',
    description: 'Palabra, traducción, pronunciación y ejemplo. Crea dos tarjetas: reconocer y recordar escribiendo.',
    fields: [F('w', 'Palabra', { lang: 'tr-TR', autoplay: true }), F('t', 'Traducción', { lang: 'es-ES' }),
      F('p', 'Pronunciación'), F('e', 'Ejemplo', { lang: 'tr-TR' }), F('n', 'Notas')],
    templates: [
      { id: 't1', name: 'Reconocer (palabra → traducción)', mode: 'flip', front: ['w'], back: ['t', 'p', 'e', 'n'] },
      { id: 't2', name: 'Recordar (traducción → escribir palabra)', mode: 'type', front: ['t'], back: ['p', 'e', 'n'], answer: 'w' },
    ],
  },
  {
    id: 'kanji', builtin: true, name: 'Kanji', icon: '', lucide: 'brush',
    description: 'Reconocer el kanji y escribirlo a mano trazo a trazo, con el orden correcto.',
    fields: [F('k', 'Kanji', { lang: 'ja-JP' }), F('m', 'Significado', { lang: 'es-ES' }), F('on', 'Lectura on (カタカナ)', { lang: 'ja-JP' }),
      F('kun', 'Lectura kun (ひらがな)', { lang: 'ja-JP' }), F('e', 'Ejemplo', { lang: 'ja-JP', help: 'Puedes añadir furigana así: 水[みず]を 飲[の]む' })],
    templates: [
      { id: 't1', name: 'Reconocer (kanji → significado)', mode: 'flip', front: ['k'], back: ['m', 'on', 'kun', 'e'] },
      { id: 't2', name: 'Escribir (significado → kanji a mano)', mode: 'draw', front: ['m', 'kun', 'on'], back: ['e'], answer: 'k', guide: false },
    ],
  },
  {
    id: 'de-noun', builtin: true, name: 'Sustantivo alemán', icon: '', lucide: 'languages',
    description: 'Artículo, palabra y plural. Crea dos tarjetas: elegir der, die o das, y escribir la palabra (con su mayúscula).',
    fields: [F('g', 'Artículo', { help: 'der, die o das' }), F('w', 'Palabra', { lang: 'de-DE', autoplay: true, help: 'Sin artículo y con mayúscula: Haus' }),
      F('pl', 'Plural', { lang: 'de-DE', help: 'Ej.: die Häuser' }), F('t', 'Traducción', { lang: 'es-ES' }), F('n', 'Notas')],
    templates: [
      { id: 't1', name: 'Género (palabra → der, die o das)', mode: 'choice', front: ['w'], back: ['t', 'pl', 'n'], answer: 'g', choices: ['der', 'die', 'das'] },
      { id: 't2', name: 'Escribir (traducción → palabra)', mode: 'type', front: ['t'], back: ['g', 'pl', 'n'], answer: 'w' },
    ],
  },
  {
    id: 'handwrite', builtin: true, name: 'Escribir a mano', icon: '', lucide: 'pencil',
    description: 'Dibujas la respuesta con el dedo: kanji, hanzi, alfabeto árabe, coreano, griego, ruso…',
    fields: [F('q', 'Pregunta'), F('a', 'Lo que hay que escribir'), F('n', 'Nota')],
    templates: [{ id: 't1', name: 'Escribir a mano', mode: 'draw', front: ['q'], back: ['n'], answer: 'a', guide: false }],
  },
  {
    id: 'listen', builtin: true, name: 'Dictado', icon: '', lucide: 'headphones',
    description: 'Escuchas una palabra o frase y la escribes. Cambia el idioma del audio en «Gestionar tipos».',
    fields: [F('x', 'Texto que se escucha', { lang: 'tr-TR' }), F('t', 'Traducción'), F('n', 'Nota')],
    templates: [{ id: 't1', name: 'Dictado', mode: 'listen', front: [], back: ['t', 'n'], answer: 'x' }],
  },
  {
    id: 'order', builtin: true, name: 'Ordenar frase', icon: '', lucide: 'blocks',
    description: 'Colocas las palabras en el orden correcto. Ideal para practicar el orden de la frase.',
    fields: [F('f', 'Frase correcta', { lang: 'tr-TR', help: 'Se separa por espacios. Para elegir tú las piezas, sepáralas con « / »: Ben / eve / gidiyorum' }), F('t', 'Traducción'), F('n', 'Nota')],
    templates: [{ id: 't1', name: 'Ordenar', mode: 'order', front: ['t'], back: ['n'], answer: 'f' }],
  },
];

/* ---------------- Utilidades ---------------- */

const strip = s => stripRuby(String(s ?? '')).replace(/\*\*?/g, '').trim();

/* ---------------- Furigana: 漢字[かんじ] ---------------- */
export const RUBY_RE = /([\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF々〆ヶ]+)\[([^\]\n]+)\]/g;
export const stripRuby = s => String(s ?? '').replace(RUBY_RE, '$1');      // solo el kanji
export const readRuby = s => String(s ?? '').replace(RUBY_RE, '$2');       // solo la lectura (para el audio)
const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
export const isCJK = ch => CJK_RE.test(ch);

/* ---------------- Ordenar ---------------- */
export function orderTokens(text) {
  const t = stripRuby(String(text || '')).replace(/\*\*?/g, '').trim();
  if (t.includes('/')) return t.split('/').map(x => x.trim()).filter(Boolean);
  return t.split(/\s+/).filter(Boolean);
}
export function orderJoin(tokens, original) {
  return String(original || '').includes('/') && tokens.some(x => CJK_RE.test(x) || /[\u3040-\u30FF]/.test(x)) ? tokens.join('') : tokens.join(' ');
}
export const CLOZE_RE = /\{\{(.+?)(?:::(.+?))?\}\}/g;
export const hasCloze = s => /\{\{.+?\}\}/.test(String(s || ''));

// Tarjetas que debe tener una nota: solo las plantillas que tienen contenido
export function activeTemplates(type, fields) {
  return type.templates.filter(t => {
    if (t.mode === 'cloze') return hasCloze(fields[t.front[0]]);
    if (t.mode === 'listen') return !!strip(fields[t.answer]);
    if (t.mode === 'order') return orderTokens(fields[t.answer]).length > 1;
    const front = t.front.some(id => strip(fields[id]));
    if (!front) return false;
    if (t.choices && !t.choices.some(c => c.toLocaleLowerCase() === strip(fields[t.answer]).toLocaleLowerCase())) return false;
    if (NEEDS_ANSWER.includes(t.mode)) return !!strip(fields[t.answer]);
    return t.back.some(id => strip(fields[id]));
  });
}

// Qué le falta a una nota para crear la tarjeta de esta plantilla («Respuesta», «Texto con huecos» con algún {{hueco}}…)
export function missingFor(type, tpl, fields) {
  const name = id => type.fields.find(f => f.id === id)?.name || id;
  const empty = id => !String(fields[id] || '').trim();
  if (tpl.mode === 'cloze') return `«${name(tpl.front[0])}» con algún {{hueco}}`;
  const need = [];
  if (!['listen', 'order'].includes(tpl.mode) && tpl.front.every(empty)) need.push(name(tpl.front[0]));
  if (tpl.answer && empty(tpl.answer)) need.push(name(tpl.answer));
  if (!tpl.answer && tpl.back.every(empty)) need.push(name(tpl.back[0]));
  if (tpl.mode === 'order' && !need.length) return `«${name(tpl.answer)}» con al menos dos piezas`;
  if (tpl.choices && !need.length) return `«${name(tpl.answer)}»: ${tpl.choices.slice(0, -1).join(', ')} o ${tpl.choices.at(-1)}`;
  return need.map(n => `«${n}»`).join(' y ') || 'los campos';
}

// Texto resumen de una tarjeta (para listas, búsqueda, CSV y vistas previas)
export function summarize(type, tpl, fields) {
  const val = id => String(fields[id] ?? '').trim();
  const join = ids => ids.map(val).filter(Boolean).join('\n');
  if (tpl.mode === 'cloze') {
    const text = val(tpl.front[0]);
    return {
      front: text.replace(CLOZE_RE, (_, a, h) => (h ? `[${h}]` : '[…]')),
      back: text.replace(CLOZE_RE, '$1'),
      note: join(tpl.back),
    };
  }
  const answerFirst = tpl.answer ? [tpl.answer, ...tpl.back.filter(id => id !== tpl.answer)] : tpl.back;
  let [main, ...rest] = answerFirst.map(val).filter(Boolean);
  if (tpl.mode === 'order') main = orderJoin(orderTokens(val(tpl.answer)), val(tpl.answer));
  const front = tpl.mode === 'listen' ? (join(tpl.front) || 'Dictado') : tpl.mode === 'order' ? (join(tpl.front) || 'Ordenar') : join(tpl.front);
  return { front, back: main || '', note: rest.join('\n') };
}

// Campos de una tarjeta antigua (solo anverso/reverso) → tipo básico
export function legacyFields(card) {
  return { q: card.front || '', a: card.back || '', n: card.note || '' };
}

// Separa una línea de «creación rápida» en columnas
export function splitQuick(line, sep) {
  if (sep === 'auto') {
    for (const s of ['\t', ' | ', ' = ', ' - ', ' – ', ' — ', ';', ' : ']) if (line.includes(s)) return splitQuick(line, s);
    return [line];
  }
  return line.split(sep).map(x => x.trim());
}

/* ---------------- Corrección de respuestas escritas ---------------- */

// Idiomas en los que las mayúsculas forman parte de la respuesta (en alemán, los sustantivos)
const CASE_MATTERS = ['de'];
// Cómo se escriben sin teclado del idioma: valen como «casi» (Difícil), no como fallo
const TRANSLIT = { de: [['ß', 'ss'], ['ä', 'ae'], ['ö', 'oe'], ['ü', 'ue']] };
const baseLang = lang => String(lang || '').split('-')[0].toLowerCase();

const normAnswer = (s, keepCase = false) => {
  const t = strip(s).replace(/\s+/g, ' ').replace(/[.!¡?¿,;:]+$/g, '');
  return keepCase ? t : t.toLocaleLowerCase();
};
const looseAnswer = (s, lang) => (TRANSLIT[baseLang(lang)] || []).reduce((t, [a, b]) => t.replaceAll(a, b), normAnswer(s));

// given: lo que se ha escrito · expected: la respuesta (varias válidas separadas por «/») · lang: idioma del campo
// → { ok, near (casi: solo mayúsculas o ß/ss, ä/ae…), why, expected, diff }
export function checkTyped(given, expected, lang = '') {
  const options = strip(expected).split(/\s*\/\s*/).filter(Boolean);
  const cs = CASE_MATTERS.includes(baseLang(lang));
  const g = normAnswer(given, cs);
  const exact = options.find(o => normAnswer(o, cs) === g);
  if (exact) return { ok: true, near: false, expected: exact, diff: diffChars(g, normAnswer(exact, cs)) };
  const near = options.find(o => looseAnswer(o, lang) === looseAnswer(given, lang));
  const best = near || options[0] || '';
  const why = !near ? '' : normAnswer(near) === normAnswer(given) ? 'Revisa las mayúsculas' : 'Revisa las letras especiales';
  return { ok: false, near: !!near, why, expected: best, diff: diffChars(g, normAnswer(best, cs)) };
}
// Diferencia letra a letra (LCS): [{ t: 'ok'|'miss'|'extra', c }]
function diffChars(a, b) {
  const A = [...a], B = [...b];
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: 'ok', c: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: 'extra', c: A[i] }); i++; }
    else { out.push({ t: 'miss', c: B[j] }); j++; }
  }
  while (i < n) out.push({ t: 'extra', c: A[i++] });
  while (j < m) out.push({ t: 'miss', c: B[j++] });
  return out;
}

/* ---------------- Opción múltiple ---------------- */

export function choiceOptions(tpl, fields, pool) {
  // Opciones fijas (der / die / das): siempre las mismas y en el mismo orden
  if (tpl.choices) {
    const v = String(fields[tpl.answer] || '').trim().toLocaleLowerCase();
    return { correct: tpl.choices.find(c => c.toLocaleLowerCase() === v) || v, opts: [...tpl.choices] };
  }
  const correct = String(fields[tpl.answer] || '').trim();
  let wrong = String(fields[tpl.wrong] || '').split(';').map(s => s.trim()).filter(Boolean);
  if (wrong.length < 3) {
    const extra = [...new Set(pool.map(s => String(s || '').trim()).filter(s => s && s !== correct && !wrong.includes(s)))];
    shuffle(extra);
    wrong = wrong.concat(extra).slice(0, 3);
  }
  const opts = [correct, ...wrong.slice(0, 3)];
  shuffle(opts);
  return { correct, opts };
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* ---------------- Tipos nuevos ---------------- */

export function blankType() {
  return {
    id: '', builtin: false, name: 'Mi tipo', icon: '', lucide: 'layers', description: '',
    fields: [F('f1', 'Anverso'), F('f2', 'Reverso')],
    templates: [{ id: 't1', name: 'Tarjeta 1', mode: 'flip', front: ['f1'], back: ['f2'] }],
  };
}
export function copyType(t) {
  const c = JSON.parse(JSON.stringify(t));
  return { ...c, id: '', builtin: false, name: `${t.name} (personalizado)` };
}
export function nextId(prefix, list) {
  let i = 1;
  while (list.some(x => x.id === prefix + i)) i++;
  return prefix + i;
}
