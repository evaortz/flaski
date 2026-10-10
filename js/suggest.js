// Sugerir tarjetas a partir de unos apuntes, sin IA: busca la información que la propia estructura de los
// apuntes señala como importante (definiciones, negritas, tablas, listas con título, fechas, vocabulario…)
// y la convierte en tarjetas del tipo que mejor le va. Cada sugerencia lleva una confianza (0 a 1): las altas
// salen ya marcadas. Sin dependencias de la interfaz, así que se puede probar aparte.
import { BUILTIN_TYPES, activeTemplates, summarize, baseLang } from './cardtypes.js';
import { pageTitle, parseTable } from './pages.js';
import { toPlain } from './inline.js';

export const KINDS = {
  vocab: 'Vocabulario', def: 'Definición', term: 'Concepto', bold: 'Negrita', table: 'Tabla', match: 'Emparejar',
  conj: 'Conjugación', steps: 'Pasos', list: 'Lista', sort: 'Clasificar', date: 'Fecha', phrase: 'Frase', code: 'Código',
  section: 'Apartado', qa: 'Pregunta',
};
export const PRESELECT = 0.65;

/* ---------------- Texto ---------------- */
const IMG = /!\[[^\]\n]*\]\(img:[\w-]+\)/g;
// Sin formato: negritas, cursivas, huecos e imágenes fuera (la furigana se queda)
export const plainText = s => toPlain(String(s ?? '').replace(IMG, '')).replace(/\{\{(.+?)(?:::.+?)?\}\}/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2').replace(/\s+/g, ' ').trim();
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
const LABELS = /^(nota|notas|ejemplo|ejemplos|ej|p\.?\s?ej|importante|ojo|recuerda|atención|cuidado|observación|obs|fuente|fuentes|ver|véase|véase también|ver también|artículo principal|consejo|truco|tip|pista|resumen|conclusión|idea|pregunta|respuesta|respuesta correcta|solución|figura|fig|tabla|imagen|foto|gráfico|mapa|documento|texto|actividad|ejercicio|example|examples|e\.g|note|warning|hint|see also|figure|source|beispiel|achtung|hinweis|örnek|not|dikkat|nb|ps|pd|código \d+|criterios de codificación)\.?$/i;
// Prefijos de aviso en apuntes y manuales («Importante: …», «Recuerda: …»)
export const CALLOUT_PRE = /^(?:importante|recuerda|recuerde|ojo|atenci[oó]n|nota|notas|aviso|cuidado|ten(?:er)?\s+en\s+cuenta|important|note|remember|warning)\s*[:.–—-]\s*/iu;
// Palabras con las que no acaba un término (señal de que el corte está a mitad de frase)
const DANGLING = /(?<![\p{L}])(de|del|la|las|el|los|y|o|que|en|a|con|por|para|un|una|the|of|and|or|to|in|a|an|der|die|das|und|oder|ve|ile)$/iu;
const ARTICLE = /^(el|la|los|las|lo|un|una|unos|unas|the|a|an)\s/i;
// Sujeto sin artículo: solo si es un nombre propio («Luis XVI», «ADN») o muy corto («Mitosis»)
const properOrShort = h => ARTICLE.test(h) || words(h).length <= 2 && /^\p{Lu}/u.test(h) || words(h).every(w => /^[\p{Lu}\d]/u.test(w) || /^(de|del|la|y|van|von|el)$/i.test(w));

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
const dePrep = s => (/^el\s/i.test(s) ? 'del ' + s.slice(3) : 'de ' + lowerSubject(s));
const isProperName = s => !ARTICLE.test(s) && words(s).every(w => /^[\p{Lu}\d]/u.test(w) || /^(de|del|la|y|van|von)$/i.test(w));
// Verbo de una definición → cómo se pregunta (y si la respuesta es el sujeto, como en «se llama»)
const COPULAS = [
  { re: /^(.+?)\s+se\s+(?:llama|llaman|denomina|denominan|conoce\s+como|conocen\s+como)\s+(.+)$/i, ask: s => `¿Cómo se llama ${lowerSubject(s)}?`, reverse: true },
  { re: /^(.+?)\s+se\s+definen?\s+como\s+(.+)$/i, ask: s => `¿Cómo se define ${lowerSubject(s)}?` },
  { re: /^(.+?)\s+consisten?\s+en\s+(.+)$/i, ask: s => `¿En qué consiste ${lowerSubject(s)}?` },
  { re: /^(.+?)\s+significan?\s+(.+)$/i, ask: s => `¿Qué significa ${lowerSubject(s)}?` },
  { re: /^(.+?)\s+se\s+refieren?\s+a\s+(.+)$/i, ask: s => `¿A qué se refiere ${lowerSubject(s)}?` },
  { re: /^(.+?)\s+sirven?\s+para\s+(.+)$/i, ask: s => `¿Para qué sirve ${lowerSubject(s)}?` },
  { re: /^(.+?)\s+tiene\s+(?:como\s+)?funci[oó]n\s+(.+)$/i, ask: s => `¿Cuál es la función ${dePrep(s)}?` },
  { re: /^(.+?)\s+tienen\s+(?:como\s+)?funci[oó]n\s+(.+)$/i, ask: s => `¿Cuál es la función ${dePrep(s)}?` },
  { re: /^(.+?)\s+tiene\s+como\s+objetivo\s+(.+)$/i, ask: s => `¿Cuál es el objetivo ${dePrep(s)}?` },
  { re: /^(.+?)\s+tienen\s+como\s+objetivo\s+(.+)$/i, ask: s => `¿Cuál es el objetivo ${dePrep(s)}?` },
  { re: /^(.+?)\s+se\s+(?:encarga|encargan)\s+de\s+(.+)$/i, ask: s => `¿De qué se encarga ${lowerSubject(s)}?` },
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
// Sujetos que no son un concepto: «Lo importante es…», «Esto es…», «Hoy es…», «Dicho proceso…»
const VAGUE = /^(lo|esto|eso|aquello|esta|este|estas|estos|ese|esa|aquí|ahí|hoy|ayer|mañana|también|además|otra|otro|una\s+(?:ventaja|cosa|idea|forma)|el\s+problema|la\s+(?:idea|cosa|clave|razón)|it|this|that|there|here|todo|nada|algo|cada|mi|tu|su|sus|nuestro|nuestra|el\s+objetivo|la\s+respuesta|la\s+pregunta|dich[oas]|amb[oas]|(?:el|la|los|las)\s+mism[oas]|(?:este|esta|estos|estas)\s+[uú]ltim[oas])(?![\p{L}\d])/iu;
const GENERIC_SUBJECT = /^(el|la|los|las|un|una|unos|unas)\s+(resultado|siguiente|primer[oa]?|segund[oa]|tercer[oa]?|últim[oa]|objetivo|razón|diferencia|mayoría|mayor\s+parte|problema|cosa|idea|clave|verdad|realidad|principal|forma|manera|caso|ejemplo|tipo|parte|consecuencia|causa|motivo|finalidad|tema|punto|hecho|cuestión|respuesta|pregunta|fin|base)\b|^(un[oa]|alguno|alguna|muchos|muchas|varios|varias|pocos|pocas|ambos|ambas)\s+de(?![\p{L}])/iu;
const LEAD_PHRASE = /^(así\s+pues|de\s+hecho|por\s+tanto|por\s+ello|por\s+eso|sin\s+embargo|en\s+cambio|es\s+decir|por\s+ejemplo|en\s+general|en\s+resumen|en\s+este\s+sentido|en\s+este\s+caso|en|para|según|durante|tras|desde|con|por|sin|además|también|así|hoy|actualmente|generalmente|normalmente|técnicamente|históricamente|finalmente|luego|entonces|pues|in|for|according|during|by|however|thus)(?![\p{L}\d])/iu;
// «En biología, la mitosis» → «la mitosis» · «La cariocinesis (del griego…), mitosis astral» → «La cariocinesis»
function subjectHead(raw) {
  let t = String(raw).replace(/^\s*(?:\d+(?:\.\d+)*\s*[.)\-–]+\s*|[a-z]\)\s+|[•\-–*]\s*)/i, '').trim();
  if ((t.match(/\(/g) || []).length !== (t.match(/\)/g) || []).length) return '';
  if (/[,(]/.test(t)) {
    const before = t.split(/\s*[,(]/)[0].trim();
    const after = t.includes(',') ? t.slice(t.lastIndexOf(',') + 1).replace(/\)/g, '').trim() : '';
    t = after && LEAD_PHRASE.test(before) && (ARTICLE.test(after) || /^\p{Lu}/u.test(after)) ? after : before;
  }
  return t.trim();
}
const validSubject = h => {
  const n = words(h).length;
  return n >= 1 && n <= 6 && /^[\p{L}¿]/u.test(h) && properOrShort(h) && !VAGUE.test(h) && !GENERIC_SUBJECT.test(h)
    && !VERBISH.test(h) && !/\p{L}+mente(?![\p{L}])/u.test(h) && !/(?<![\p{L}])no(?![\p{L}])/iu.test(h) && !DANGLING.test(h) && !LEAD_PHRASE.test(h);
};
// Lo que sigue a «es / son / fue…» tiene que definir: empieza por artículo («un proceso», «la división…»)
const DEFINING = /^(un|una|unos|unas|el|la|los|las|lo\s+que|aquel\p{L}*|aquell\p{L}*|cada|cualquier|parte|uno|toda?s?|considerad[oa]s?|conocid[oa]s?|a(?!\s+(?:menudo|veces|partir|través|pesar|diferencia|lo\s|la\s|los\s|las\s))|an|the|one|part)(?![\p{L}])/iu;
// Restos que no son parte de la respuesta: llamadas a notas («actual.15»), etimologías a medias al principio
export const cleanAnswer = a => String(a)
  .replace(/(\p{L})[.,;](\d{1,3})(?=\s|$)/gu, '$1.')
  .replace(/^\(?(?:del\s+)?(?:latín|griego|árabe|francés|inglés)(?:\s+[^)\s]+){0,4}\)?\s+(?=(?:la|el|los|las|un|una)\s)/iu, '')
  .trim();
const COPULAR = new Set(['es', 'son', 'era', 'eran', 'fue', 'fueron', 'is', 'are', 'was', 'were']);
// Respuestas muy largas: hasta la primera coma a partir de 60 letras
function trimAnswer(a) {
  let t = cleanAnswer(a).split(/;\s/)[0].trim();
  if (t.length > 220) { const k = t.indexOf(', ', 60); if (k > 0 && k < 220) t = t.slice(0, k); }
  return t;
}
// Una frase → tarjeta de concepto { q, a, score } (o null)
function conceptCard(sp) {
  const body = sp.replace(/[.!?…]+$/, '').replace(/^\s*(?:\d+(?:\.\d+)*\s*[.)\-–]+\s*)/, '');
  // «Se llama cariocinesis a la formación de los dos núcleos…»
  const inv = /^se\s+(llama|llaman|denomina|denominan|conoce\s+como|conocen\s+como)\s+(.{2,60}?)\s+a\s+((?:la|el|los|las|lo|un|una|aquell?[oa]s?)\s.{8,})$/i.exec(body);
  if (inv && words(inv[2]).length <= 5) {
    const plural = /^(llaman|denominan|conocen)/i.test(inv[1]);
    return { q: `¿Cómo se llama${plural ? 'n' : ''} ${inv[3].charAt(0).toLocaleLowerCase() + inv[3].slice(1)}?`, a: capFirst(inv[2].replace(/^[«"“]|[»"”]$/g, '')), score: 0.72 };
  }
  // «La función de los ribosomas es la síntesis de proteínas…» / «El objetivo del proyecto es analizar…»
  const func = /^(la\s+funci[oó]n|el\s+objetivo)(?:\s+principal)?\s+(de\s+|del\s+)(.{2,60}?)\s+es\s+(.+)$/i.exec(body);
  if (func) {
    const kind = func[1].toLowerCase().includes('objetivo') ? 'el objetivo' : 'la función';
    const prep = func[2].trim().toLowerCase();
    const entity = func[3].trim();
    const rest = func[4].trim();
    const subjCandidate = (prep === 'del' ? 'el ' : '') + entity;
    const head = subjectHead(subjCandidate);
    if (head && validSubject(head) && words(rest).length >= 2 && !/^(no|también|ya)\b/i.test(rest)) {
      const qEntity = prep === 'del' ? `del ${head.replace(/^el\s+/i, '')}` : `de ${lowerSubject(head)}`;
      return { q: `¿Cuál es ${kind} ${qEntity}?`, a: capFirst(trimAnswer(rest)), score: 0.7 };
    }
  }
  const engFunc = /^(the\s+function|the\s+purpose|the\s+goal)\s+of\s+(.{2,60}?)\s+is\s+(.+)$/i.exec(body);
  if (engFunc) {
    const engKind = engFunc[1].trim().toLowerCase();
    const head = subjectHead(engFunc[2].trim());
    const rest = engFunc[3].trim();
    if (head && validSubject(head) && words(rest).length >= 2) {
      return { q: `What is ${engKind} of ${lowerSubject(head)}?`, a: capFirst(trimAnswer(rest)), score: 0.7 };
    }
  }
  for (const c of COPULAS) {
    const m = c.re.exec(body);
    if (!m) continue;
    const verb = (/\s(es|son|era|eran|fue|fueron|is|are|was|were)\s/i.exec(body.slice(m[1].length, m[1].length + 12)) || [])[1]?.toLowerCase();
    let subj = m[1].trim(), rest = m[2].trim();
    if (c.reverse) {
      // «El proceso por el que… se llama fotosíntesis»: la respuesta es el nombre (corto)
      subj = subj.replace(/^\s*(?:\d+(?:\.\d+)*\s*[.)\-–]+\s*)/, '');
      if (words(subj).length > 22 || words(rest).length > 5 || VAGUE.test(subj) || GENERIC_SUBJECT.test(subj) || !(ARTICLE.test(subj) || /^\p{Lu}/u.test(subj))) return null;
      return { q: c.ask(subj), a: capFirst(rest), score: 0.7 };
    }
    const head = subjectHead(subj);
    if (!head || !validSubject(head) || /^(no|también|ya|muy|más|menos|tan)\b/i.test(rest) || words(rest).length < 3) return null;
    if (verb && COPULAR.has(verb) && !DEFINING.test(rest)) return null;
    return { q: c.ask(head), a: capFirst(trimAnswer(rest)), score: words(head).length <= 3 ? 0.7 : 0.62 };
  }
  return null;
}
/* ---------------- Acrónimos y siglas ---------------- */
const ROMAN_NUMERAL = /^[IVXLCDM]+$/i;
const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'e', 'en', 'o', 'u', 'a', 'al', 'por', 'para', 'of', 'and', 'the', 'in', 'for', 'to']);

export function isAcronymPair(acrRaw, expRaw) {
  const normStr = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const acr = normStr(acrRaw).trim().replace(/[^A-Za-z]/g, '').toUpperCase();
  if (acr.length < 2 || acr.length > 8 || ROMAN_NUMERAL.test(acr)) return false;
  const expWords = words(String(expRaw || '')).filter(w => !STOPWORDS.has(normStr(w).toLowerCase()));
  if (expWords.length < 2 || expWords.length > 8) return false;
  const initials = expWords.map(w => normStr(w)[0]?.toUpperCase() || '').join('');
  if (initials === acr) return true;
  if (acr[0] === initials[0]) {
    let ai = 0;
    const allText = normStr(expWords.join('')).toUpperCase();
    for (let i = 0; i < allText.length && ai < acr.length; i++) {
      if (allText[i] === acr[ai]) ai++;
    }
    if (ai === acr.length) return true;
  }
  return false;
}

export function acronymCard(sp) {
  // 1) Expansión (SIGLA): «El ácido desoxirribonucleico (ADN) es…»
  const m1 = /\(([A-ZÁÉÍÓÚÑ]{2,8})\)/u.exec(sp);
  if (m1 && !ROMAN_NUMERAL.test(m1[1])) {
    const acr = m1[1];
    const beforeTokens = sp.slice(0, m1.index).trim().split(/\s+/);
    for (let len = Math.min(beforeTokens.length, 7); len >= 2; len--) {
      let cand = beforeTokens.slice(-len).join(' ').replace(/^[,;:.(«"“\-–—]+/, '').trim();
      cand = cand.replace(/^(?:el|la|los|las|un|una|unos|unas|del?)\s+/i, '').trim();
      if (isAcronymPair(acr, cand)) {
        return { q: `¿Qué significan las siglas ${acr}?`, a: capFirst(cand), score: 0.75 };
      }
    }
  }
  // 2) SIGLA (Expansión): «El ADN (ácido desoxirribonucleico) es…»
  const m2 = /\b([A-ZÁÉÍÓÚÑ]{2,8})\s*\(([^()]{4,70})\)/u.exec(sp);
  if (m2 && !ROMAN_NUMERAL.test(m2[1])) {
    const acr = m2[1];
    let cand = m2[2].trim().replace(/^(?:el|la|los|las|un|una|unos|unas|del?)\s+/i, '').trim();
    if (isAcronymPair(acr, cand)) {
      return { q: `¿Qué significan las siglas ${acr}?`, a: capFirst(cand), score: 0.75 };
    }
  }
  // 3) Enunciado explícito: «Las siglas ADN corresponden al ácido desoxirribonucleico»
  const m3 = /^(?:las?\s+siglas?\s+)?([A-ZÁÉÍÓÚÑ]{2,8})\s+(?:significan?|corresponden?\s+(?:a|al)|son?\s+(?:las?\s+)?(?:siglas?|acr[oó]nimos?)\s+de)\s+([^,.;]{4,70})/iu.exec(sp);
  if (m3 && !ROMAN_NUMERAL.test(m3[1])) {
    const acr = m3[1];
    let cand = m3[2].trim().replace(/^(?:el|la|los|las|un|una|unos|unas|del?|al)\s+/i, '').trim();
    if (isAcronymPair(acr, cand)) {
      return { q: `¿Qué significan las siglas ${acr}?`, a: capFirst(cand), score: 0.75 };
    }
  }
  return null;
}
// «…dos copias idénticas de la misma hebra, llamadas cromátidas hermanas» → ¿Cómo se llaman las dos copias…?
const AGREE = { o: /^(un|el|uno)$/i, a: /^(una|la)$/i, os: /^(unos|los|dos|tres|cuatro|varios|ciertos)$/i, as: /^(unas|las|dos|tres|cuatro|varias|ciertas)$/i };
function appositiveCard(sp) {
  const m = /^(.*?[^,;:.()]{3}),?\s+(?:llamad|denominad|conocid)(o|a|os|as)(?:\s+como)?\s+([^,;:.()]{2,50}?)(?=$|[,;:.()]|\s(?:que|y|o|en|de|del|con|por|para|a)\s)/i.exec(sp);
  if (!m) return null;
  // El sustantivo: desde el último artículo que concuerda con «llamado/a/os/as»
  const before = m[1], agree = AGREE[m[2].toLowerCase()], tokens = before.split(/\s+/);
  let k = -1;
  for (let i = tokens.length - 1; i >= Math.max(0, tokens.length - 12); i--) if (agree.test(tokens[i].replace(/^[,(]/, ''))) { k = i; break; }
  if (k < 0 || tokens.length - k < 3) return null;   // «la llamada citocinesis» (= «la así llamada») no da para pregunta
  const np = tokens.slice(k).join(' ').replace(/^[,(]/, '').trim(), name = m[3].trim().replace(/^[«"“]|[»"”]$/g, '');
  if (words(name).length > 4 || words(np).length < 3 || GENERIC_SUBJECT.test(np) || VERBISH.test(np.split(/\s+/).slice(1).join(' '))) return null;
  const plural = /^(los|las|unos|unas|dos|tres|cuatro|varios|varias)\b/i.test(np);
  const fem = /^as?$/i.test(m[2]);
  const what = np.replace(/^(un|una)\s/i, w => (w.toLowerCase() === 'un ' ? 'el ' : 'la ')).replace(/^(unos|unas)\s/i, w => (w.toLowerCase() === 'unos ' ? 'los ' : 'las '))
    .replace(/^(dos|tres|cuatro|varios|varias|ciertos|ciertas)\s/i, w => `${fem ? 'las' : 'los'} ${w.toLowerCase()}`);
  return { q: `¿Cómo se llama${plural ? 'n' : ''} ${what.charAt(0).toLocaleLowerCase() + what.slice(1)}?`, a: capFirst(name), score: 0.58 };
}
// Verbos que delatan que el «sujeto» ya es media frase
const VERBISH = /(?<![\p{L}])(es|son|era|fue|ser|está|están|tiene|tienen|hay|puede|pueden|debe|deben|hace|hacen|existe|existen|se|que|cuando|porque|si|aunque|pero|is|are|was|be|has|have|can|which|that|because|when)(?![\p{L}])/iu;

// Enunciados de ejercicios («Haz las actividades…», «Rodea con un círculo…»)
const EXERCISE = /^(?:\d+\s*[.)-]+\s*-?\s*)?(haz|hacer|realiza|lee|leer|responde|contesta|completa|elabora|busca|observa|mira|explica|define|indica|señala|rodea|marca|subraya|escribe|copia|resume|piensa|relaciona|une|ordena|identifica|compara|justifica|analiza|comenta|calcula|dibuja|investiga|elige|selecciona|repasa|repasar|para repasar|empezamos)(?![\p{L}])/iu;
const SAYS = /(?<![\p{L}])(comenta|afirma|dice|señala|explica|escribe|indica|sostiene|asegura|añade|recuerda|opina|cuenta|declara|says|writes|states|argues)$/iu;

/* ---------------- Reglas ---------------- */
// «Término: definición» (también con =, →, —, – o « - »)
function splitDef(text) {
  const t = String(text).trim();
  const m = /^(.{1,70}?)\s*(?::|=|→|⇒|—|–|\s-\s)\s+(.+)$/s.exec(t);
  if (!m) return null;
  let term = m[1].trim(), def = m[2].trim();
  term = term.replace(/^[-•*]\s*/, '');
  const tp = plainText(term).replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '');
  // «Presentan multitud de formas: …» empieza por un verbo: no es un término
  if (words(tp).length >= 3 && /^\p{L}{4,}(an|en|aron|ieron|aban|ían)\s/u.test(tp) && looksSpanish(tp) > 0) return null;
  if (!tp || !/\p{L}/u.test(tp) || LABELS.test(tp) || words(tp).length > 7 || DANGLING.test(tp) || /[.?!](\s|$)/.test(tp) || /[()]/.test(tp) || VERBISH.test(tp) || SAYS.test(tp) || EXERCISE.test(tp)
    || (tp.match(/(?<![\p{L}])\p{Lu}{2,}(?![\p{L}])/gu) || []).length >= 2 || /(?<![\p{L}])\p{Lu}{5,}(?![\p{L}])/u.test(tp)
    || /(?<![\p{L}])(documento|texto|imagen|figura|actividad|ejercicio|pregunta|tema|unidad|página|pág)\s+\d+$/iu.test(tp)
    || /(?<![\p{L}])\p{L}{2,}(amos|emos|imos|áis|éis)(?![\p{L}])/iu.test(tp)) return null;
  // «Legislativo – Ejecutivo – Judicial» es una enumeración, no una definición; con más «:» detrás, una tabla aplanada
  const sep = /\s(—|–|-|=|→)\s/.exec(t.slice(m[1].length, m[1].length + 5))?.[1];
  if (sep && def.includes(` ${sep} `)) return null;
  if ((def.match(/:\s/g) || []).length >= 1 && /\s[–—]\s/.test(def)) return null;
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
    if (b.type === 'callout' || CALLOUT_PRE.test(plainText(b.text))) calloutIds.add(b.id);
    // Lo que cuelga de «Referencias», «Bibliografía»… y el texto con direcciones web no da tarjetas
    if (stack.some(s => /^(referencias|bibliograf[ií]a|notas|notas y referencias|enlaces externos|véase también|fuentes|obras citadas|lecturas recomendadas|references|bibliography|notes|external links|see also|further reading)$/i.test(s.text.replace(/^\d+(\.\d+)*\s*/, '')))
      || /https?:\/\/|www\.|doi[:.]\s?10\.|PMID\s\d/i.test(b.text || '')) used.add(b.id);
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
  const tables = blocks.filter(x => x.type === 'table').map(b => ({ b, t: parseTable(b.text) })).filter(x => x.t);
  const headSig = x => norm(x.t.head.join(' '));
  for (const { b, t } of tables) {
    if (!t.rows.length || used.has(b.id)) continue;
    // Cabeceras que se repiten (las de cada página de un examen o una ficha) no son contenido
    if (tables.filter(x => headSig(x) === headSig({ t })).length > 1 && headSig({ t })) { used.add(b.id); continue; }
    let head = t.head.map(plainText);
    let rows = t.rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => plainText(c)));
    if (head.length >= 3 && head.filter(Boolean).length === 1 && rows.length >= 2) { head = rows[0].map(plainText); rows = rows.slice(1); }
    // Frases partidas en varias filas (celdas que empiezan en minúscula y son trozos de frase): no es una tabla de datos
    const frag = rows.filter(r => r.some(c => /^\p{Ll}/u.test(plainText(c)) && words(c).length >= 3)).length;
    if (rows.length >= 3 && frag >= rows.length * 0.4) { used.add(b.id); continue; }
    // Una clave partida en dos líneas («Forma de» / «gobierno»): se junta con la fila de arriba
    rows = rows.reduce((acc, r) => {
      const prev = acc.at(-1), k0 = plainText(r[0]);
      const cont = prev && DANGLING.test(plainText(prev[0])) && /^\p{Ll}/u.test(k0) && !isPronoun(k0);
      if (cont) acc[acc.length - 1] = prev.map((v, i) => [v, r[i]].filter(x => plainText(x)).join(' ')); else acc.push(r);
      return acc;
    }, []);
    if (rows.flat().concat(head).some(c => /[☐☑☒□■✓✔✗✘]/.test(c))) { used.add(b.id); continue; }
    // Fichas de metadatos («PROCESO COGNITIVO: …», «CRITERIOS DE CODIFICACIÓN»): claves en mayúsculas
    const caps = c => (plainText(c).match(/(?<![\p{L}])\p{Lu}{2,}(?![\p{L}])/gu) || []).length >= 2;
    if (rows.filter(r => caps(r[0])).length >= Math.max(1, rows.length * 0.4) || caps(head[0])) { used.add(b.id); continue; }
    const cellsAll = rows.flat().concat(head);
    if (cellsAll.some(c => plainText(c).length > 160) || cellsAll.filter(c => !plainText(c)).length > cellsAll.length * 0.4) { used.add(b.id); continue; }
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
    // Ficha «clave: valor» (dos columnas y una cabecera que es un título, no nombres de columnas)
    if (head.length === 2 && (!head[0] || !head[1])) {
      const ctx = nearestHeading(b.id) || title || head[0] || head[1];
      for (const r of rows) if (plainText(r[0]) && plainText(r[1])) add('table', b.id, 'basic', { q: `${plainText(r[0])} — ${ctx}`, a: r[1].trim(), n: '' }, 0.66);
      used.add(b.id); continue;
    }
    // En general: una tarjeta por celda («fila → columna»)
    for (const r of rows) {
      const key = plainText(r[0]);
      if (!key) continue;
      for (let j = 1; j < head.length; j++) {
        if (!plainText(r[j]) || (!head[j] && head.length > 2)) continue;
        const col = head[j] ? (ARTICLE.test(head[j]) || /^[\p{Lu}][\p{Ll}]/u.test(head[j]) ? head[j].charAt(0).toLocaleLowerCase() + head[j].slice(1) : head[j]) : '';
        add('table', b.id, 'basic', { q: col ? `${r[0].trim()} → ${col}` : r[0].trim(), a: r[j].trim(), n: head[0] && head[j] ? `${head[0]}: ${key}` : '' }, head.length <= 3 && rows.length <= 10 ? 0.8 : 0.6);
      }
    }
    // Alternativa: toda la tabla como emparejar (si es corta y de dos columnas)
    if (head.length === 2 && rows.length >= 3 && rows.length <= 8) {
      add('match', b.id, 'match', { t: head[0] && head[1] ? `Une cada ${head[0].toLocaleLowerCase()} con su ${head[1].toLocaleLowerCase()}` : '', p: rows.map(r => `${plainText(r[0])} = ${plainText(r[1])}`).join('\n'), n: '' }, 0.5);
    }
    used.add(b.id);
  }

  /* 2) Preguntas del propio texto: «¿Cuáles son los tres poderes…?» y debajo la respuesta (u opciones y la correcta) */
  const ANSWER_LABEL = /^(respuestas?(\s+correcta)?|soluci[oó]n|answer|correct answer|clave)\s*[:.-]?\s*/i;
  const BLANK = t => /^[\s_.…\-,;y]*$/.test(t) && /[_.…]{3}/.test(t);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i], qt = plainText(b.text);
    if (used.has(b.id) || !/^(p|li|ol|h3|callout)$/.test(b.type) || !/\?$/.test(qt) || qt.length > 240 || qt.length < 10) continue;
    let j = i + 1;
    const opts = [];
    while (blocks[j] && /^(ol|li)$/.test(blocks[j].type) && opts.length < 6) opts.push(plainText(blocks[j++].text).replace(/\.$/, ''));
    while (blocks[j] && BLANK(plainText(blocks[j].text))) j++;
    let ans = '', labelled = false;
    if (blocks[j] && ANSWER_LABEL.test(plainText(blocks[j].text))) {
      labelled = true;
      ans = plainText(blocks[j].text).replace(ANSWER_LABEL, '').trim();
      if (!ans && blocks[j + 1]) { j++; ans = plainText(blocks[j].text); }
    } else if (!opts.length && blocks[j] && /^(p|li|ol|callout)$/.test(blocks[j].type) && !/\?$/.test(plainText(blocks[j].text)) && plainText(blocks[j].text).length <= 200 && qt.length <= 160) ans = plainText(blocks[j].text);
    ans = ans.replace(/\.$/, '');
    if (opts.length) for (let k = i; k < i + 1 + opts.length; k++) used.add(blocks[k].id);   // las opciones no son pasos
    if (!ans || ans.length > 300 || BLANK(ans)) continue;
    const q = qt.replace(/^\s*(?:\d+(?:\.\d+)*\s*[.)\-–]+\s*|[a-z]\)\s+)/i, '');
    const isOpt = opts.length >= 2 && opts.some(o => norm(o) === norm(ans));
    if (isOpt) add('qa', b.id, 'choice', { q, a: ans, w: opts.filter(o => norm(o) !== norm(ans)).join('; '), n: '' }, 0.8);
    else add('qa', b.id, 'basic', { q, a: capFirst(ans.replace(/\s*[–—-]\s*/g, ', ')), n: '' }, labelled ? 0.8 : 0.62);
    for (let k = i; k <= j; k++) used.add(blocks[k].id);
  }

  /* 3) Listas con título */
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
    if (/\?$/.test(introText) || EXERCISE.test(introText)) continue;
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

  /* 4) Bloque a bloque: vocabulario, definiciones, negritas, fechas, código */
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

    const DATE_TERM = /^(?:(?:en\s+)?(?:el\s+)?(?:año\s+)?\d{3,4}(?:\s*[-–]\s*\d{2,4})?|década\s+de\s+\d{4}|siglo\s+[IVXL]+(?:\s*[ad]\.\s?C\.?)?)$/i;
    const dt = /^(.{3,30}?)\s*[:–—-]\s+(.{15,240})$/.exec(plainText(text));
    if (dt && DATE_TERM.test(dt[1].trim())) { add('date', b.id, 'basic', { q: `${capFirst(dt[2].replace(/\.$/, ''))} — ¿cuándo?`, a: dt[1].trim(), n: '' }, dt[2].length <= 130 ? 0.66 : 0.55); continue; }
    const def = splitDef(text.replace(CALLOUT_PRE, '').trim()) || boldLead(text);
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
        add('def', b.id, 'basic', { q, a: capFirst(cleanAnswer(defP)), n: '' }, 0.85);
        continue;
      }
    }

    // Frase a frase: concepto con verbo, negritas y fechas
    for (const rawSentence of sentences(text)) {
      const s = rawSentence.replace(CALLOUT_PRE, '').trim();
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
      // Enunciados de ejercicios y frases que empiezan a medias (un trozo de otra) no dan tarjetas
      if (EXERCISE.test(sp) || /^\p{Ll}/u.test(sp) || /(?<![\p{L}])\p{Lu}{4,}\s+\p{Lu}{2,}(?![\p{L}])/u.test(sp)) continue;
      const ac = acronymCard(sp);
      if (ac) add('term', b.id, 'basic', { q: ac.q, a: ac.a, n: '' }, ac.score);
      const cc = conceptCard(sp);
      if (cc && add('term', b.id, 'basic', { q: cc.q, a: cc.a, n: '' }, cc.score)) continue;
      const ap = appositiveCard(sp);
      if (ap && add('term', b.id, 'basic', { q: ap.q, a: ap.a, n: '' }, ap.score)) continue;
      // Fechas: un solo año, detrás de «en / desde / hacia / año…» (no cualquier número de cuatro cifras)
      if (sp.length > 230) continue;
      const years = [...sp.matchAll(/(?<![\d.,^])(1[0-9]{3}|20[0-9]{2})(?![\d.,]\d)/g)];
      if (years.length === 1) {
        const y = years[0][1];
        const ctx = new RegExp(`(?:\\b(?:en|desde|hasta|entre|hacia|año|años|in|since|until|im|seit)\\s+(?:el\\s+|the\\s+)?(?:año\\s+|year\\s+)?|^)${y}(?![\\d])`, 'i');
        if (ctx.test(sp)) add('date', b.id, 'number', { q: sp.replace(new RegExp(`(?<![\\d.,])${y}(?![\\d.,]\\d)`), '____'), a: y, t: '', u: '', n: '' }, 0.6);
      }
    }
  }

  /* 5) Apartados: el título y la primera frase de su primer párrafo (su idea principal) */
  const GENERIC_HEAD = /^(introducción|resumen|conclusi[oó]n(es)?|índice|contenidos?|referencias|bibliograf[ií]a|enlaces externos|véase también|notas|ejercicios|actividades|anexos?|apéndices?|glosario|fuentes|documento \d+|tema \d+|unidad \d+|bloque \d+|parte \d+|capítulo \d+|cuestiones|preguntas|soluciones|evaluación)$/i;
  const GENERIC_TOPIC = /^(definición|concepto|características|propiedades|funciones|función|estructura|tipos|clasificación|origen|orígenes|importancia|historia|evolución|causas|consecuencias|ventajas|inconvenientes|desventajas|partes|composición|ejemplos|aplicaciones|usos|descripción|funcionamiento|objetivos|etapas|fases)$/i;
  for (let i = 0; i < blocks.length; i++) {
    const h = blocks[i];
    if (!/^h[1-3]$/.test(h.type)) continue;
    const head = plainText(h.text).replace(/^\s*(?:\d+(?:\.\d+)*\s*[.)\-–]*\s*)/, '').trim();
    if (!head || words(head).length > 6 || GENERIC_HEAD.test(head) || norm(head) === norm(title) || /[?:]$/.test(head)) continue;
    let k = i + 1;
    while (blocks[k] && (blocks[k].type === 'img' || /^(véase|ver también|artículo principal|see also|main article)/i.test(plainText(blocks[k].text)))) k++;
    const p = blocks[k];
    if (!p || p.type !== 'p' || used.has(p.id)) continue;
    const first = sentences(plainText(p.text))[0] || '';
    if (first.length < 25 || first.length > 260 || /[?:]$/.test(first) || /^(véase|ver también)/i.test(first) || EXERCISE.test(first) || EXERCISE.test(head)) continue;
    if (out.some(x => x.blockId === p.id && (norm(x.front).includes(norm(head)) || norm(first).includes(norm(x.back))))) continue;
    // Un título genérico («Definición», «Características») necesita saber de qué
    const ctx = GENERIC_TOPIC.test(head) ? (headOf.get(h.id)?.slice(0, -1).at(-1) || title) : '';
    add('section', p.id, 'basic', { q: ctx ? `${head} — ${ctx}` : head, a: cleanAnswer(first).replace(/\.$/, ''), n: '' }, first.length <= 180 && (words(head).length <= 2 || norm(first).includes(norm(head))) ? 0.66 : 0.55);
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
