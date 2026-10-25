// Sugerir tarjetas a partir de unos apuntes, sin IA: busca la información que la propia estructura de los
// apuntes señala como importante (definiciones, negritas, tablas, listas con título, fechas, vocabulario…)
// y la convierte en tarjetas del tipo que mejor le va. Cada sugerencia lleva una confianza (0 a 1): las altas
// salen ya marcadas. Sin dependencias de la interfaz, así que se puede probar aparte.
import { BUILTIN_TYPES, activeTemplates, summarize, baseLang } from './cardtypes.js';
import { pageTitle, parseTable } from './pages.js';
import { toPlain, toRuns } from './inline.js';

export const KINDS = {
  vocab: 'Vocabulario', def: 'Definición', term: 'Concepto', bold: 'Destacado', sub: 'Subpuntos', table: 'Tabla', match: 'Emparejar',
  conj: 'Conjugación', steps: 'Pasos', list: 'Viñetas', sort: 'Clasificar', date: 'Fecha', phrase: 'Frase', code: 'Código',
  section: 'Apartado', qa: 'Pregunta', num: 'Cifra', art: 'Artículo', enum: 'Enumeración',
};
// Orden dentro de una misma parte del apunte: fechas y cifras primero; ordenar frases, al final
const KIND_RANK = { date: 0, num: 0, phrase: 2 };
export const PRESELECT = 0.65;

/* ---------------- Texto ---------------- */
const IMG = /!\[[^\]\n]*\]\(img:[\w-]+\)/g;
// Sin formato: negritas, cursivas, huecos e imágenes fuera (la furigana se queda)
export const plainText = s => toPlain(String(s ?? '').replace(IMG, '')).replace(/\{\{(.+?)(?:::.+?)?\}\}/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2').replace(/\s+/g, ' ').trim();
const norm = s => plainText(s).toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const words = s => plainText(s).split(/\s+/).filter(Boolean);
const normQ = s => norm(s).replace(/^(?:que|cual|cuales) (?:es|son) (?:el|la|los|las) /, '');
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

/* ---------------- Género y gramática ---------------- */
// Al abrir las sugerencias se carga rosaenlg-gender-es (js/vendor/gender-es.js, con useGender); sin él, o donde se
// equivoca con palabras que salen mucho en los apuntes (-sis, -ie, «fase», «ley», «reforma»…), estas reglas
let genderLib = null;
export const useGender = fn => { genderLib = fn; };
const FEM_WORD = /^(?:base|clase|frase|ley|reforma|forma|norma|plataforma|cama|crema|pluma|rama|trama|yema|lágrima|víctima|parte|muerte|suerte|noche|gente|fuente|mente|red|sede|llave|calle|carne|nube|nieve|torre|tarde|sangre|fe|imagen|piel|sal|flor|labor|mujer|mano|foto|moto|radio)$/;
const MASC = /^(?:día|mapa|planeta|cometa|régimen|origen|análisis|énfasis|paréntesis|virus|lunes|martes|miércoles|jueves|viernes|mes|país)$|ma$/;
const FEM = /(?:sis|itis|ie|umbre|tud|ción|sión|dad|tad|fase)$/;
// «fases» → «fase», «leyes» → «ley», «funciones» → «función», «meses» → «mes»
export function singular(w) {
  w = String(w).toLocaleLowerCase();
  if (/^(?:meses|países|intereses)$/.test(w)) return w.slice(0, -2).replace(/^paise$/, 'país');
  if (/iones$/.test(w)) return w.slice(0, -5) + 'ión';
  if (/ces$/.test(w)) return w.slice(0, -3) + 'z';
  if (/[dlnrjy]es$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w) && !/(?:sis|tis|xis|us|[áéíóú]s)$/.test(w)) return w.slice(0, -1);
  return w;
}
export function genderOf(noun) {
  const w = singular(noun);
  if (FEM_WORD.test(w)) return 'f';
  if (MASC.test(w)) return 'm';
  if (FEM.test(w)) return 'f';
  const g = genderLib?.(w);
  if (g === 'm' || g === 'f') return g;
  return /[adz]$/.test(w) ? 'f' : 'm';
}
// Lo que se arregla solo antes de enseñar una pregunta: «de el» → «del», «a el» → «al», «¿Cuántos fases» → «¿Cuántas fases»
const NOT_NOUN = /^(?:de|del|el|la|los|las|un|una|se|y|o|en|a|al|veces)$/i;
export const fixGrammar = s => String(s)
  .replace(/(?<![\p{L}])([Dd])el?\s+el(?![\p{L}])/gu, '$1el')
  .replace(/(?<![\p{L}])([Aa])\s+el(?![\p{L}])/gu, '$1l')
  .replace(/(?<![\p{L}])([Cc]uánt)(os|as)\s+(\p{L}+)/gu, (m, c, end, n) => (NOT_NOUN.test(n) ? m : `${c}${genderOf(n) === 'f' ? 'as' : 'os'} ${n}`));
// Referencias que no se entienden fuera del apunte: «ese mismo mes», «dicho órgano», «Estas se utilizarán…», «…, este será de tres meses»
const VAGUE_REF = new RegExp([
  '(?<![\\p{L}])(?:es[eao]s?|est[eao]s?|aquel(?:l[oa]s?)?)\\s+mism[oa]s?(?![\\p{L}])',
  '(?<![\\p{L}])dich[oa]s?(?![\\p{L}])',
  '(?<![\\p{L}])(?:est[ea]s?|es[ea]s?)\\s+(?:mes|año|día|semana|momento|periodo|período|siglo|plazo|caso)(?![\\p{L}])',
  '(?:^|[,;:]\\s*|¿\\s*)(?:est[ea]s?|es[ea]s?|esto|eso)\\s+(?:se\\s+\\p{L}+|es|son|era|eran|fue|fueron|está|están|tiene|tienen|puede|pueden|debe|deben|será|serán|podrá|podrán|deberá|deberán|\\p{L}{3,}(?:ará|arán|erá|erán|irá|irán|ó|aron|ieron))(?![\\p{L}])',
].join('|'), 'iu');
// Por qué una pregunta está mal escrita ('' si está bien); lo usa add() para descartarla y la batería para contarlas
export function grammarIssue(s) {
  const t = plainText(s);
  if (/(?<![\p{L}])(?:de|del|a)\s+el(?![\p{L}])/u.test(t)) return 'del el';
  for (const [, end, n] of t.matchAll(/(?<![\p{L}])[Cc]uánt(os|as)\s+(\p{L}+)/gu)) if (!NOT_NOUN.test(n) && (end === 'as') !== (genderOf(n) === 'f')) return 'cuántos';
  if (VAGUE_REF.test(t)) return 'referencia';
  return '';
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
    if (dates(rest.slice(0, 30)).some(d => d.index <= 12)) return null;   // «X fue el 14 de julio…»: es cuándo, no qué
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

// Lo que el autor destacó (negrita, subrayado, resaltado o color) se trata igual que la negrita: «**así**»
export function emphasize(src) {
  const out = toRuns(src).map(r => {
    if (r.raw) return r.text;
    if (r.st.code) return '`' + r.text + '`';
    const em = r.st.b || r.st.u || r.st.bg || r.st.color;
    if (!em || !r.text.trim()) return r.text;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(r.text);
    return `${m[1]}**${m[2]}**${m[3]}`;
  }).join('');
  return out.replace(/\*\*\*\*/g, '');
}

/* ---------------- Un término como pregunta ---------------- */
// Títulos y términos que no dicen de qué («Estructura», «Reformas»): necesitan el apartado o el título del apunte
const GENERIC_TOPIC = /^(definición|concepto|características|propiedades|funciones|función|estructura|tipos|clasificación|origen|orígenes|importancia|historia|evolución|causas|consecuencias|ventajas|inconvenientes|desventajas|partes|composición|ejemplos|aplicaciones|usos|descripción|funcionamiento|objetivos|etapas|fases|reformas|organización|contenido|requisitos|competencias|principios|naturaleza|objeto|ámbito|duración|sede|miembros|elementos|antecedentes|contexto)$/i;
const TERM_VERB = /^\p{L}{3,}(?:ó|ió|aron|ieron)$/u;
// «Efecto de espaciado» → ¿Qué es el efecto de espaciado? · «Descubrió la **curva del olvido**» → ¿Qué es la curva del olvido?
// · con un término genérico, de qué: «Estructura» → ¿Cuál es la estructura de la Constitución Española?
// (los nombres propios de varias palabras, como «Hermann Ebbinghaus», se quedan tal cual)
export function termQuestion(term, ctx = '') {
  let t = String(term).trim();
  const bold = /\*\*([^*]+)\*\*/.exec(t), lead = bold ? plainText(t.slice(0, bold.index)).trim().split(/\s+/).filter(Boolean) : [];
  if (bold && lead.length && lead.length <= 2 && TERM_VERB.test(lead[0]) && (lead.length === 1 || /^(el|la|los|las|un|una)$/i.test(lead[1]))) t = `${lead[1] ? lead[1] + ' ' : ''}${bold[1]}`;
  t = plainText(t).replace(/[:.]$/, '').trim();
  if (/^(qué|cuál|cómo|quién|por qué|cuándo|dónde)(?![\p{L}])/iu.test(t) || /\?$/.test(t)) return capFirst(t.replace(/^¿?/, '¿').replace(/\??$/, '?'));
  const art = (/^(el|la|los|las)\s/i.exec(t) || [])[1]?.toLowerCase(), bare = t.replace(ARTICLE, '');
  const ws = words(bare);
  if (!ws.length || ws.length > 6 || (ws.length > 1 && isProperName(bare))) return t;
  const head = ws[0], plural = /s$/i.test(head) && singular(head) !== head.toLocaleLowerCase(), fem = genderOf(head) === 'f';
  const a = art || (plural ? (fem ? 'las' : 'los') : (fem ? 'la' : 'el'));
  const low = /^\p{Lu}\p{Ll}/u.test(bare) ? bare.charAt(0).toLocaleLowerCase() + bare.slice(1) : bare;
  if (/^(definición|concepto)$/i.test(bare) && ctx) return termQuestion(ctx);
  if (GENERIC_TOPIC.test(bare) && ctx) return `¿${plural ? 'Cuáles son' : 'Cuál es'} ${a} ${low} ${dePrep(ctx)}?`;
  return fixGrammar(`¿Qué ${plural ? 'son' : 'es'} ${a} ${low}?`);
}

/* ---------------- Reglas ---------------- */
const GENERIC_HEAD = /^(introducción|resumen|conclusi[oó]n(es)?|índice|contenidos?|referencias|bibliograf[ií]a|enlaces externos|véase también|notas|ejercicios|actividades|anexos?|apéndices?|glosario|fuentes|documento \d+|tema \d+|unidad \d+|bloque \d+|parte \d+|capítulo \d+|cuestiones|preguntas|soluciones|evaluación)$/i;

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
// «**Término** es / . / , definición» (también «**Término:** definición», con los dos puntos dentro de la negrita)
function boldLead(text) {
  const t = String(text).trim();
  const m = /^\*\*([^*]{1,70}?)\s*:\*\*\s*(.{8,})$/s.exec(t) || /^\*\*([^*]{1,70})\*\*\s*(?:[:.,—–-]\s*|\s+(?:es|son|is|are)\s+)(.{8,})$/s.exec(t);
  return m && !LABELS.test(m[1].trim()) ? { term: m[1].trim(), def: m[2].trim() } : null;
}

/* ---------------- Fechas y cifras ---------------- */
const MONTH = '(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)';
const YEAR = '(?:1\\d{3}|20\\d{2})';
// Una fecha: «6 de diciembre de 1978», «octubre de 1978», «entre 1793 y 1794», «1793-1794», «1885»
const DATE_SRC = `entre\\s+(?:el\\s+|los\\s+años\\s+)?${YEAR}\\s+y\\s+(?:el\\s+)?${YEAR}|${YEAR}\\s*[-–]\\s*${YEAR}|\\d{1,2}\\s+de\\s+${MONTH}(?:\\s+(?:de|del)\\s+${YEAR})?|${MONTH}\\s+de\\s+${YEAR}|(?<![\\d.,])${YEAR}(?![\\d.,]?\\d)`;
const dates = s => [...String(s).matchAll(new RegExp(DATE_SRC, 'giu'))].map(m => ({ text: m[0], index: m.index }));
const isYear = s => new RegExp(`^${YEAR}$`).test(s);
export const isDate = s => new RegExp(`^(?:(?:el|en|desde|hasta|hacia)\\s+)?(?:${DATE_SRC})\\.?$`, 'iu').test(plainText(s).trim());
// Lo que se pregunta con «¿Cuándo…?» a partir del nombre de un dato («Publicación y entrada en vigor»)
const NOMINAL = new Map([['aprobación', ['aprobó', 'aprobaron']], ['sanción', ['sancionó', 'sancionaron']], ['publicación', ['publicó', 'publicaron']], ['promulgación', ['promulgó', 'promulgaron']],
  ['ratificación', ['ratificó', 'ratificaron']], ['firma', ['firmó', 'firmaron']], ['fundación', ['fundó', 'fundaron']], ['creación', ['creó', 'crearon']], ['construcción', ['construyó', 'construyeron']],
  ['reforma', ['reformó', 'reformaron']], ['redacción', ['redactó', 'redactaron']], ['descubrimiento', ['descubrió', 'descubrieron']]]);
const INTRANS = new Map([['entrada en vigor', 'entró en vigor'], ['nacimiento', 'nació'], ['muerte', 'murió'], ['llegada', 'llegó'], ['inicio', 'empezó'], ['comienzo', 'empezó'], ['fin', 'terminó'], ['final', 'terminó']]);
const guessArticle = w => { const p = /s$/i.test(w), f = /(ción|sión|dad|tad|tud|umbre|a)s?$/i.test(w); return p ? (f ? 'las' : 'los') : (f ? 'la' : 'el'); };
// «Aprobación por las Cortes» → ¿Cuándo aprobaron las Cortes <ctx>? · «Muerte de Colón» → ¿Cuándo murió Colón?
function whenLabel(label, ctx) {
  const verbs = [];
  let agent = '';
  for (const part of label.split(/\s+y\s+/)) {
    const m = /^(.+?)(?:\s+(por|de|del)\s+(.+))?$/i.exec(part.trim());
    let noun = m[1].toLocaleLowerCase();
    if (!INTRANS.has(noun) && !NOMINAL.has(noun) && INTRANS.has(part.trim().toLocaleLowerCase())) { noun = part.trim().toLocaleLowerCase(); m[2] = ''; }
    if (m[2] === 'por') agent = m[3];
    else if (m[2]) ctx = m[2] === 'del' ? 'el ' + m[3] : m[3];
    if (INTRANS.has(noun)) verbs.push({ v: INTRANS.get(noun), intr: true });
    else if (NOMINAL.has(noun)) verbs.push({ v: NOMINAL.get(noun) });
    else return '';
  }
  if (!ctx) return '';
  if (agent) {
    if (verbs.length > 1 || verbs[0].intr) return '';
    return `¿Cuándo ${verbs[0].v[/^(los|las)\s|\sy\s/i.test(agent) ? 1 : 0]} ${lowerSubject(agent)} ${lowerSubject(ctx)}?`;
  }
  return `¿Cuándo ${verbs.map(v => (v.intr ? v.v : 'se ' + v.v[0])).join(' y ')} ${lowerSubject(ctx)}?`;
}
// Verbos conjugados en pasado o presente (para dar la vuelta a una frase: «X se aprobó en…» → «¿Cuándo se aprobó X?»)
const FINITE = /^(fue|fueron|es|son|era|eran|ha|han|había|habían|se|lo|la|los|las|le|les|\p{L}{2,}(?:ó|aron|ieron|ió|aba|aban|ía|ían))$/iu;
const AUX = /^(fue|fueron|ha|han|había|habían|se|lo|la|los|las|le|les)$/i;
// «La Constitución fue ratificada en referéndum el 6 de diciembre de 1978» → ¿Cuándo fue ratificada la Constitución en referéndum?
// «El Terror lo dirigió Robespierre entre 1793 y 1794» → ¿Cuándo dirigió Robespierre el Terror?   (solo con una fecha en la frase)
function whenSentence(sp) {
  const ds = dates(sp);
  if (ds.length !== 1 || sp.length > 220) return null;
  const d = ds[0];
  // «El golpe de Estado del 18 de julio de 1936 provocó…»: la fecha es del golpe → ¿Cuándo fue el golpe de Estado que provocó…?
  const of = /^((?:El|La|Los|Las)\s[^,;]{2,60}?)\s+(?:del|de)$/u.exec(sp.slice(0, d.index).trim());
  const after = sp.slice(d.index + d.text.length).replace(/[.;:]+$/, '').trim();
  if (of && !/a\s+partir$/i.test(of[1]) && FINITE.test(after.split(' ')[0] || '') && !AUX.test(after.split(' ')[0])) {
    const past = /(?:ó|ió|aron|ieron)$/.test(after.split(' ')[0]);
    return { q: `¿Cuándo ${past ? 'fue' : 'es'} ${lowerSubject(of[1])} que ${after}?`, a: capFirst(d.text), year: isYear(d.text) };
  }
  const pre = /(?:,\s*)?(?:(?<![\p{L}])(en(?:\s+el(?:\s+año)?)?|el|desde(?:\s+el)?|hasta(?:\s+el)?|hacia(?:\s+el)?|a\s+partir\s+del?)\s+)?$/iu.exec(sp.slice(0, d.index));
  const prep = (pre[1] || '').toLowerCase();
  let rest = (sp.slice(0, d.index - pre[0].length) + ' ' + sp.slice(d.index + d.text.length)).replace(/\s*,\s*,/g, ',').replace(/^\s*,\s*|\s+(?=[,.;:])/g, '').replace(/[.;:]+$/, '').replace(/\s+/g, ' ').trim();
  rest = rest.replace(/,\s*$/, '');
  const t = rest.split(' ');
  // (un «la» tras «de», «en»… es un artículo; como pronombre va justo antes del verbo: «El Terror lo dirigió…»)
  const isVerb = k => FINITE.test(t[k]) && (!/^(lo|la|los|las|le|les|se)$/i.test(t[k]) || (!/^(de|del|a|al|en|con|por|para|sobre|entre|y)$/i.test(t[k - 1]) && FINITE.test(t[k + 1] || '') && !/^(lo|la|los|las|le|les|se)$/i.test(t[k + 1])) || (/^se$/i.test(t[k]) && t[k + 1]));
  let i = 1;
  while (i < t.length && i <= 6 && !isVerb(i)) i++;
  if (i >= t.length || i > 6) return null;
  const subj = t.slice(0, i).join(' ');
  if (!/^\p{Lu}/u.test(subj) || VAGUE.test(subj) || LEAD_PHRASE.test(subj) || (GENERIC_SUBJECT.test(subj) && !isProperName(subj.replace(ARTICLE, ''))) || /,/.test(subj)) return null;
  // El verbo (con su auxiliar o su pronombre) y lo que sigue
  const clitic = /^(lo|la|los|las|le|les)$/i.test(t[i]);
  let j = i + 1;
  if (AUX.test(t[i]) && t[j]) j++;
  const verb = (clitic ? t.slice(i + 1, j) : t.slice(i, j)).join(' ');
  if (/^(fue|fueron|es|son|era|eran)$/i.test(t[i]) && /^(un|una|el|la|los|las)$/i.test(t[i + 1] || '')) return null;   // «X fue un psicólogo…»: no es cuándo pasó algo
  const tail = t.slice(j).join(' ').replace(/^,\s*/, '');
  const ask = prep.startsWith('desde') || prep.startsWith('a partir') ? '¿Desde cuándo' : prep.startsWith('hasta') ? '¿Hasta cuándo' : '¿Cuándo';
  const q = clitic ? `${ask} ${verb} ${tail} ${lowerSubject(subj)}?` : `${ask} ${verb} ${lowerSubject(subj)}${tail ? ' ' + tail : ''}?`;
  return { q: q.replace(/\s+/g, ' ').replace(/\s\?$/, '?'), a: capFirst(d.text), year: isYear(d.text) };
}
// Una frase con dos fechas unidas por «y»: «X fue aprobada… el A y ratificada… el B» → dos frases con una fecha cada una
// («X fue aprobada… el A» y «X fue ratificada… el B»). Sin sujeto («Entró en vigor el…»), el de la frase anterior.
const PARTICIPLE = /^\p{L}+(?:ad|id)[oa]s?$/u;
function whenParts(sp, prevSubj = '') {
  const ds = dates(sp);
  if (ds.length === 2) {
    const m = /^(.+?)\s+(fue|fueron|ha sido|han sido)\s+(.+?)\s+y\s+(\S+)\s+(.+)$/iu.exec(sp.replace(/[.;]+$/, ''));
    if (m && PARTICIPLE.test(m[4]) && dates(m[3]).length === 1 && dates(m[5]).length === 1) return [`${m[1]} ${m[2]} ${m[3]}`, `${m[1]} ${m[2]} ${m[4]} ${m[5]}`];
    return [];
  }
  if (ds.length !== 1) return [];
  const first = sp.split(' ')[0];
  if (prevSubj && FINITE.test(first.toLocaleLowerCase()) && !AUX.test(first) && /^\p{Lu}/u.test(first)) return [`${prevSubj} ${first.toLocaleLowerCase()}${sp.slice(first.length)}`];
  return [sp];
}
// El sujeto de una frase («La Constitución fue aprobada…» → «La Constitución»), para la siguiente si no lo repite
const subjectOf = sp => /^((?:El|La|Los|Las)\s+\p{Lu}[\p{L}]*(?:\s+(?:de|del)?\s*\p{Lu}[\p{L}]*)*)\s+(?:fue|fueron|es|son|se|ha|han|\p{L}+(?:ó|aron|ió|ieron))\b/u.exec(sp)?.[1] || '';
// Una frase «X es / reside en / se constituye en / corresponde a Y» → hueco en Y (si es corto)
const PRED = /^(.{3,140}?\s(?:es|son|reside en|residen en|se constituye en|se constituyen en|corresponde a|recae en|está formad[oa] por))\s+(.{3,70}?)[.;]?$/iu;
function predicateCloze(sp) {
  const m = PRED.exec(sp.trim());
  if (!m || words(m[2]).length > 8) return null;
  return `${m[1]} {{${m[2]}}}.`;
}
// Cifras: «**169 artículos**», «Reformas: tres.»
const NUM_WORDS = { uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, cien: 100 };
const NUM = `(\\d+|${Object.keys(NUM_WORDS).join('|')})`;
const toNumber = s => (/^\d+$/.test(s) ? s : String(NUM_WORDS[s.toLowerCase()] ?? ''));
const howMany = unit => `¿${genderOf(unit) === 'f' ? 'Cuántas' : 'Cuántos'} ${unit.toLocaleLowerCase()}`;

/* ---------------- Frases que dicen quién hace qué ---------------- */
const PART_VERB = { constituid: ['constituye', 'constituyen'], formad: ['forma', 'forman'], compuest: ['compone', 'componen'], integrad: ['integra', 'integran'] };
const subjOk = s => s && words(s).length <= 10 && ARTICLE.test(s) && !VAGUE.test(s) && !GENERIC_SUBJECT.test(s) && !/\b(que|cuando|porque)\b/i.test(s);
// sp: la frase sin formato · s: con las negritas («**…**») → [{ q, a, score, typeId?, kind? }]
function relationCards(sp, s) {
  const out = [];
  const body = sp.replace(/[.;]+$/, '').split(/;\s/)[0];
  // «Las Fuerzas Armadas, constituidas por el Ejército de Tierra, la Armada y el Ejército del Aire, tienen como misión…»
  let m = /^((?:el|la|los|las)\s[^,]{2,60}),\s+(constituid|formad|compuest|integrad)(?:o|a|os|as)\s+por\s+(.+)$/iu.exec(body);
  let main = body;
  if (m) {
    // La enumeración acaba en la coma que va antes del verbo de la frase
    const k = m[3].search(/,\s+(?=(?:tienen?|son|es|están?|han|deben?|pueden?|se)\s)/i);
    m[4] = k >= 0 ? m[3].slice(k).replace(/^,\s+/, '') : '';
    if (k >= 0) m[3] = m[3].slice(0, k);
  }
  if (m && words(m[3]).length <= 20) {
    const items = m[3].split(/,\s|\s[ye]\s/).map(x => x.replace(ARTICLE, '').trim());
    const who = items.every(x => /^\p{Lu}/u.test(x)) ? 'Quiénes' : 'Qué';
    out.push({ q: `¿${who} ${PART_VERB[m[2].toLowerCase()][items.length > 1 ? 1 : 0]} ${lowerSubject(m[1])}?`, a: capFirst(m[3]), score: 0.75, enum: true });
    if (m[4]) main = `${m[1]} ${m[4]}`;
  }
  // «X tiene como misión garantizar…»
  m = /^((?:el|la|los|las)\s.{2,60}?)\s+tienen?\s+(?:como|por)\s+(misión|función|objetivo|finalidad|fin)\s+(.{6,})$/iu.exec(main);
  if (m && subjOk(m[1])) out.push({ q: `¿Cuál es ${m[2].toLowerCase() === 'objetivo' || m[2].toLowerCase() === 'fin' ? 'el' : 'la'} ${m[2].toLowerCase()} ${dePrep(m[1])}?`, a: capFirst(m[3]), score: 0.75 });
  // «La bandera está formada por…» → ¿Cómo está formada la bandera?
  m = /^((?:el|la|los|las)\s.{2,60}?)\s+(está|están)\s+((?:formad|compuest|constituid|integrad)(?:o|a|os|as))\s+por\s+(.{6,})$/iu.exec(main);
  if (m && subjOk(m[1])) out.push({ q: `¿Cómo ${m[2]} ${m[3]} ${lowerSubject(m[1])}?`, a: capFirst(m[4]), score: 0.75 });
  // «Los ciudadanos están sujetos a la Constitución» → ¿A qué están sujetos los ciudadanos?
  else if ((m = /^((?:el|la|los|las)\s.{2,80}?)\s+(está|están|es|son)\s+(\p{L}+(?:ad|id|et|est)(?:o|a|os|as))\s+(a|al|en|de|del|con)\s+(.{4,})$/iu.exec(main)) && subjOk(m[1])) {
    const p = m[4].toLowerCase(), base = p === 'al' ? 'a' : p === 'del' ? 'de' : p;
    out.push({ q: `¿${capFirst(base)} qué ${m[2]} ${m[3]} ${lowerSubject(m[1])}?`, a: capFirst(`${p} ${m[5]}`), score: 0.72 });
  }
  // «Corresponde a los poderes públicos promover…» → ¿A quién corresponde promover…?
  m = /^(?:le\s+|les\s+)?(corresponde|compete|incumbe)\s+(a|al)\s+((?:los|las|el|la)?\s*[^,]{2,50}?)\s+(\p{L}+(?:ar|er|ir)\s.{6,})$/iu.exec(body);
  if (m) out.push({ q: `¿A quién ${m[1].toLowerCase()} ${m[4].split(/;\s/)[0]}?`, a: capFirst(`${m[2] === 'al' ? 'al' : 'a'} ${m[3]}`), score: 0.76 });
  // «El mejor momento para repasar es **justo cuando…**» → ¿Cuál es el mejor momento para repasar?
  m = /^(.*?)\s+(es|son)\s+\*\*([^*]{2,80})\*\*/iu.exec(s.replace(/[.;]+$/, ''));
  if (m) {
    let subj = plainText(m[1]).replace(/^(?:por\s+eso|por\s+tanto|por\s+ello|así\s+que|así|además|en\s+resumen|en\s+definitiva|pues|entonces)\s*,?\s*/i, '');
    subj = subj.replace(/^(?:\d+(?:\.\d+)*\s*[.)\-–]+\s*)/, '');
    if (subjOk(subj) && !/\*\*/.test(m[1])) {
      const pred = m[3].trim(), many = m[2].toLowerCase() === 'son';
      const q = /^(un|una|unos|unas)\s/i.test(pred) ? `¿Qué ${m[2]} ${lowerSubject(subj)}?` : `¿${many ? 'Cuáles' : 'Cuál'} ${m[2]} ${lowerSubject(subj)}?`;
      out.push({ q, a: capFirst(pred), score: 0.75, bold: pred });
    }
  }
  // «Releer da una sensación engañosa de saber, la **ilusión de fluidez**: el texto te suena…» → ¿Qué es la ilusión de fluidez?
  m = /^(.{0,30}?)(un|una)\s([^,*]{4,60}),\s+(el|la|los|las)\s+\*\*([^*]{2,40})\*\*\s*(?::\s*(.+?)(?:,\s+pero\b|;|$))?/iu.exec(s.replace(/[.]+$/, ''));
  if (m && words(m[1]).length <= 3) out.push({ q: `¿Qué ${/s$/.test(m[4]) ? 'son' : 'es'} ${m[4].toLowerCase()} ${m[5]}?`, a: capFirst(plainText(`${m[1]}${m[2]} ${m[3]}${m[6] ? ': ' + m[6] : ''}`)), score: 0.75, bold: m[5] });
  // «Hermann Ebbinghaus fue un psicólogo alemán que, en 1885, publicó el primer estudio…» → ¿Quién publicó en 1885…? y ¿Cuándo…?
  m = /^((?:\p{Lu}[\p{L}'-]+\s?){1,4})\s+fue\s+(?:un|una)\s+[^,]{2,40}?\s+que,?\s*(?:en\s+(\d{3,4}),?\s*)?(\p{L}+(?:ó|ió))\s+(.{6,})$/u.exec(body);
  if (m) {
    const name = m[1].trim();
    out.push({ q: `¿Quién ${m[3]}${m[2] ? ' en ' + m[2] : ''} ${m[4]}?`, a: name, score: 0.78, bold: name });
    if (m[2]) out.push({ q: `¿Cuándo ${m[3]} ${name} ${m[4]}?`, a: m[2], score: 0.66, typeId: 'number', kind: 'date', bold: m[2] });
  }
  // «Pero también descubrió algo: **cada repaso aplana la curva**» → Cada repaso {{aplana la curva}}.
  m = /^[^*]+:\s+\*\*((?:cada|todo|toda|el|la|los|las)\s+\p{L}+)\s+([^*]{3,60})\*\*\.?$/iu.exec(s.trim());
  if (m && FINITE.test(m[2].split(' ')[0]) || m && /^\p{L}+(?:a|e|an|en)$/u.test(m[2].split(' ')[0])) out.push({ cloze: `${capFirst(m[1])} {{${m[2]}}}.`, score: 0.72, bold: `${m[1]} ${m[2]}` });
  return out;
}
// Un hueco en una frase larga: se quita lo que va detrás, después del hueco («…, que…», «…, del que…», «…, patria común…»)
const TAIL_CLAUSE = /(?:,\s+(?=(?:que|del\s+que|de\s+la\s+que|de\s+los\s+que|de\s+las\s+que|donde|siendo|patria|conforme|según)\s)|\s+(?=conforme\s+a\s))/i;
function shortenCloze(x, from = x.lastIndexOf('}}') + 2) {
  if (from < 2) return x;
  const m = TAIL_CLAUSE.exec(x.slice(from));
  return m && m.index + from > 20 ? x.slice(0, from + m.index).replace(/[,;:\s]+$/, '') + '.' : x;
}
// Un hueco en una frase corta: el trozo que tiene el hueco (cortando por «;», «, y» o «, que»), con el sujeto delante
// si se ha quedado sin él, y como mucho 25 palabras (si no cabe, null). «La Constitución se fundamenta en…, y reconoce y
// garantiza el {{derecho a la autonomía}} de…» → «La Constitución reconoce y garantiza el {{derecho a la autonomía}} de…»
const CLAUSE_CUT = /;\s+|,\s+(?=(?:y|e|que|del\s+que|de\s+la\s+que|de\s+los\s+que|de\s+las\s+que|donde|siendo|patria|conforme)\s)|\s+(?=conforme\s+a\s)/giu;
const SUBJ_END = /^(?:se|es|son|está|están|ha|han|fue|fueron|será|serán|\p{Ll}\p{L}+(?:a|e|an|en|ó|aron|ieron|ía|ían|aba|aban|á|án))$/u;
const DET = /^(?:el|la|los|las|un|una|unos|unas|lo|al|del|de|a|en|con|por|para|su|sus|este|esta|cada|toda|todo|todas|todos|y|e|o)$/i;
const MAX_CLOZE = 25;
function subjectOfClause(s) {
  const t = plainText(s).split(/\s+/);
  for (let i = 1; i < Math.min(t.length, 9); i++) if (SUBJ_END.test(t[i]) && !DET.test(t[i - 1])) return /^\p{Lu}/u.test(t[0]) ? t.slice(0, i).join(' ') : '';
  return '';
}
export function trimCloze(x) {
  const t = String(x).trim().replace(/[.;:]+$/, '');
  const cuts = [0];
  for (const m of t.matchAll(CLAUSE_CUT)) {
    const before = t.slice(0, m.index);
    if ((before.match(/\{\{/g) || []).length === (before.match(/\}\}/g) || []).length) cuts.push(m.index, m.index + m[0].length);
  }
  cuts.push(t.length);
  const segs = [];
  for (let i = 0; i < cuts.length; i += 2) segs.push(t.slice(cuts[i], cuts[i + 1]));
  const withHole = segs.filter(s => s.includes('{{'));
  let out = t;
  if (withHole.length === 1 && segs.length > 1) {
    const k = segs.indexOf(withHole[0]);
    let seg = withHole[0].replace(/^(?:y|e|que)\s+/i, '');
    const subj = k > 0 && /^\p{Ll}/u.test(seg) && !/^(?:del?|la|el|los|las|donde|siendo|patria|conforme)\s/i.test(seg) ? subjectOfClause(segs[0]) : '';
    if (k === 0 || subj) out = subj ? `${subj} ${seg}` : seg;
  }
  // Aún largo: fuera lo que va detrás del hueco, hasta la coma siguiente
  if (words(out).length > MAX_CLOZE) { const end = out.lastIndexOf('}}') + 2, c = out.indexOf(',', end); if (c > 0) out = out.slice(0, c); }
  // (y que siga siendo una frase, con su verbo: no «Las {{Fuerzas Armadas}}»)
  if (words(out).length > MAX_CLOZE || !plainText(out).split(/\s+/).some((w, i, a) => i && SUBJ_END.test(w.replace(/[^\p{L}]/gu, '')) && !DET.test(a[i - 1]))) return null;
  return capFirst(out.trim()) + '.';
}
// Un hueco que es un verbo («el cerebro {{consolida}} lo que…», «{{Espaciar}} los repasos…») no se propone
export function verbHole(x) {
  const m = /(^|\S+)\s*\{\{([^}]+)\}\}/u.exec(String(x).trim());
  if (!m) return false;
  const hole = m[2].trim().split(/\s+/), prev = m[1] === '' ? '' : m[1].replace(/[^\p{L}]/gu, '');
  if (!prev && /^\p{L}+(?:ar|er|ir)(?:lo|la|los|las|se|le|les)?$/iu.test(hole[0])) return true;
  return hole.length === 1 && !!prev && !DET.test(prev) && /^\p{Ll}\p{L}+(?:a|e|an|en|ó|aron|ieron|ía|ían|aba|aban|ará|erá|irá|arán|erán|irán)$/u.test(hole[0]) && !/(?:ción|sión|dad|tad|ura|encia|ancia|ente|ante|eza|ismo|ista)$/.test(hole[0]);
}
// Varias negritas seguidas en una enumeración («la **libertad**, la **justicia** y el **pluralismo**»): un solo hueco
const ENUM_RX = /(?:(?:el|la|los|las)\s+)?\*\*[^*]+\*\*(?:\s*,\s*(?:(?:el|la|los|las)\s+)?\*\*[^*]+\*\*)+\s*,?\s+(?:y|e|o)\s+(?:(?:el|la|los|las)\s+)?\*\*[^*]+\*\*/iu;

export function suggestCards(page, { lang = '', native = 'es-ES', existing = [] } = {}) {
  const isLangDeck = !!lang;
  const nativeEs = baseLang(native) === 'es';
  const blocks = page?.blocks || [];
  // Apuntes en español (para preguntar «¿Qué es…?»; en otro idioma, el término tal cual)
  const pageEs = !isLangDeck && looksSpanish(blocks.slice(0, 80).map(b => plainText(b.text)).join(' ')) >= 0.12;
  const out = [];
  // (también «Mitosis» y «¿Qué es la mitosis?» son la misma pregunta)
  const seen = new Set(existing.flatMap(c => [norm(c.front), normQ(c.front)]).filter(Boolean));
  // Lo que ya es tarjeta en la misma parte del apunte, aunque se retocara el anverso: por su respuesta
  const fromBlock = new Set(existing.filter(c => c.block_id).map(c => c.block_id + '|' + norm(c.back)));
  const used = new Set();   // bloques ya convertidos por una regla más fiable
  const subKids = new Set(), listed = new Set();   // subpuntos y viñetas que ya van en una pregunta de lista
  const add = (kind, blockId, typeId, fields, score, extra = {}) => {
    // La gramática: lo que se puede se arregla («del el», «¿Cuántos fases»); lo que no se entiende solo, fuera
    if (!isLangDeck) {
      fields = { ...fields };
      for (const k of ['q', 'x', ...(typeId === 'truefalse' ? ['s'] : [])]) if (fields[k]) fields[k] = fixGrammar(fields[k]);
      if (grammarIssue([fields.q, fields.x, typeId === 'truefalse' ? fields.s : ''].filter(Boolean).join(' '))) return false;
    }
    // Huecos: en una frase corta y nunca en un verbo (las listas ya van cortas: «los demás a la vista»)
    if (typeId === 'cloze' && !extra.list) {
      if (verbHole(fields.x)) return false;
      extra = { src: norm(fields.x), ...extra };
      const x = trimCloze(fields.x);
      if (!x) return false;
      fields = { ...fields, x };
    }
    const note = asNote(typeId, fields, isLangDeck);
    const type = TYPE(note.typeId);
    const active = activeTemplates(type, note.fields);
    if (!active.length) return false;
    const sum = summarize(type, active[0], note.fields);
    const key = norm(sum.front) + '|' + norm(sum.back);
    if (!norm(sum.front) || seen.has(norm(sum.front)) || seen.has(normQ(sum.front)) || seen.has(key) || fromBlock.has(blockId + '|' + norm(sum.back))) return false;
    seen.add(key); seen.add(norm(sum.front)); seen.add(normQ(sum.front));
    out.push({ key: `${kind}:${blockId}:${out.length}`, id: `${kind}|${blockId}|${norm(sum.front).slice(0, 60)}`, kind, label: KINDS[kind], blockId, section: sectionOf(blockId), typeId: note.typeId, fields: note.fields,
      front: sum.front, back: sum.back, cards: active.length, score: Math.min(1, score + (calloutIds.has(blockId) ? 0.1 : 0)),
      src: extra.src ?? (note.typeId === 'cloze' ? norm(note.fields.x) : ''), ...extra });
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
  // De qué habla un bloque (para «¿Cuántos artículos tiene…?»): su apartado, o el título del apunte si el apartado
  // es genérico («Datos clave») o un artículo; sin lo que va tras « · » ni entre paréntesis
  const ARTICLE_HEAD = /^art(?:ículo|\.)\s*(\d+)/i;
  // Sin «Tema 1.» delante («Tema 1. La Constitución Española» → «La Constitución Española»)
  const cleanCtx = t => plainText(t).split(/\s+[·|]\s+/)[0].replace(/^(?:tema|unidad|lecci[oó]n|cap[ií]tulo|bloque)\s+\d+\s*[.:–—-]\s*/i, '').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const subjectCtx = id => {
    const h = nearestHeading(id);
    if (h && h !== title && !GENERIC_HEAD.test(h) && !/^(datos(\s+clave)?|ideas\s+clave|lo\s+esencial|en\s+resumen|para\s+no\s+confundirse)$/i.test(h) && !ARTICLE_HEAD.test(h)) return cleanCtx(h);
    return cleanCtx(title);
  };
  // El artículo («1.3») de un bloque que cuelga de «Artículo 1 · …» (con el número de su punto, si es una numeración)
  const olNo = new Map();
  for (let i = 0, n = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'ol' && !b.indent) olNo.set(b.id, ++n);
    else if (!(b.indent > 0)) n = 0;
  }
  const artRef = id => { const m = ARTICLE_HEAD.exec(nearestHeading(id)); return m ? (olNo.has(id) ? `${m[1]}.${olNo.get(id)}` : m[1]) : ''; };

  // Grupos seguidos de elementos de lista (con lo que los presenta: un título o un párrafo acabado en «:»)
  // (solo los del primer nivel: los subpuntos con sangría no cortan la lista)
  const runs = [];
  const LIST = ['li', 'ol', 'todo'];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!['li', 'ol'].includes(b.type) || b.indent) continue;
    const run = [b], first = i;
    let j = i + 1;
    while (blocks[j] && ((blocks[j].type === b.type && !blocks[j].indent) || (LIST.includes(blocks[j].type) && blocks[j].indent > 0))) { if (!blocks[j].indent) run.push(blocks[j]); j++; }
    i = j - 1;
    const prev = blocks[first - 1];
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
    // «Pregunta | Respuesta»: la pregunta es la celda de la izquierda, tal cual
    if (head.length === 2 && /^(preguntas?|questions?|anverso|frente)$/i.test(head[0]) && /^(respuestas?|answers?|reverso|soluci[oó]n)$/i.test(head[1])) {
      for (const r of rows) if (plainText(r[0]) && plainText(r[1])) add('table', b.id, 'basic', { q: r[0].trim(), a: r[1].trim(), n: '' }, 0.8);
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

  /* 3) Un punto con subpuntos (sangría): «Núcleo» → ADN, nucléolo… */
  const LIST_WORDS = /^(tipos|clases|partes|características|funciones|causas|consecuencias|ventajas|inconvenientes|desventajas|ejemplos|elementos|componentes|fases|etapas)(?![\p{L}])/iu;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!['li', 'ol', 'p'].includes(b.type) || used.has(b.id)) continue;
    const d = b.indent || 0, kids = [];
    for (let j = i + 1; j < blocks.length && [...LIST, 'p'].includes(blocks[j].type) && (blocks[j].indent || 0) > d; j++) if ((blocks[j].indent || 0) === d + 1) kids.push(blocks[j]);
    if (kids.length < 2 || kids.length > 10 || !kids.every(shortItem)) continue;
    const head = plainText(b.text).replace(/:$/, '').trim();
    if (!head || words(head).length > 10 || /\?$/.test(head)) continue;
    // Subpuntos que son definiciones («término: …»): mejor una tarjeta por cada uno
    if (kids.filter(k => splitDef(k.text) || boldLead(k.text)).length >= kids.length * 0.5) continue;
    const ctx = nearestHeading(b.id), art = artRef(b.id);
    // «La Constitución garantiza:» → ¿Qué garantiza la Constitución?
    const vh = /^((?:el|la|los|las)\s.{2,60}?)\s+(garantiza|garantizan|incluye|incluyen|comprende|comprenden|recoge|recogen|establece|establecen|reconoce|reconocen|regula|regulan|protege|protegen|contiene|contienen|abarca|abarcan|prohíbe|prohíben)$/iu.exec(head);
    const q = vh ? `¿Qué ${vh[2]} ${lowerSubject(vh[1])}${art ? ` (art. ${art})` : ''}?` : LIST_WORDS.test(head) || /:$/.test(plainText(b.text)) ? `${head}: ¿cuáles son?` : `${head}: ¿qué incluye?`;
    const item = k => plainText(k.text).replace(/[,;]$/, '').replace(/^(?:y|e)\s+/i, '');
    if (add('sub', b.id, 'basic', { q: q + (!vh && ctx && words(head).length <= 2 && !norm(head).includes(norm(ctx)) ? ` — ${ctx}` : ''), a: kids.map(k => `- ${item(k)}`).join('\n'), n: '' }, kids.length <= 6 ? 0.7 : 0.55)) kids.forEach(k => subKids.add(k.id));
    used.add(b.id);
  }

  /* 3b) Listas con título */
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
    if (add('list', r.items[0].id, 'basic', { q: capFirst(q) + (ctx ? ` — ${ctx}` : ''), a: r.items.map(x => `- ${plainText(x.text)}`).join('\n'), n: '' }, r.items.length <= 6 ? 0.55 : 0.45)) r.items.forEach(x => listed.add(x.id));
  }

  /* 4) Bloque a bloque: vocabulario, definiciones, negritas, fechas, código */
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (used.has(b.id) || !['p', 'li', 'ol', 'callout', 'quote', 'code'].includes(b.type)) continue;
    const text = emphasize(String(b.text || '').replace(IMG, '')).trim();
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
    if (dt && DATE_TERM.test(dt[1].trim())) {
      // «1789: empieza la Revolución francesa» → ¿Cuándo empieza la Revolución francesa?
      // (la pregunta se arma con un año cualquiera en su sitio: la respuesta es lo de delante, también «Década de 1830»)
      const w = whenSentence(`${capFirst(dt[2].replace(/\.$/, ''))} en 1111`);
      add('date', b.id, 'basic', { q: w?.q || `${capFirst(dt[2].replace(/\.$/, ''))}: ¿cuándo?`, a: dt[1].trim(), n: '' }, dt[2].length <= 130 ? 0.66 : 0.55);
      continue;
    }
    const def = splitDef(text.replace(CALLOUT_PRE, '').trim()) || boldLead(text);
    const ctx = subjectCtx(b.id);
    // En un apunte por artículos («Artículo 1 · …»): ¿Qué artículo establece que…? (sin marcar: hay una por punto)
    const ref = artRef(b.id), first = shortenCloze(sentences(plainText(text))[0] || '', 0);
    if (ref && ['p', 'ol'].includes(b.type) && first.length >= 20 && first.length <= 140 && /^\p{Lu}/u.test(first) && !VAGUE.test(first) && !/^(su|sus|estas?|estos?)\s/i.test(first)) {
      add('art', b.id, 'basic', { q: `¿Qué artículo establece que ${ARTICLE.test(first) || /^(todos|todas|cada|cualquier|ning[uú]n[oa]?|nadie|quien|quienes)\s/i.test(first) ? first.charAt(0).toLocaleLowerCase() + first.slice(1) : first}`.replace(/[.;:]+$/, '') + '?', a: `Art. ${ref}`, n: '' }, 0.5, { src: norm(first) });
    }
    // Cifras en negrita: «**169 artículos**» → ¿Cuántos artículos tiene la Constitución?
    for (const [, n, unit] of text.matchAll(new RegExp(`\\*\\*${NUM}\\s+(\\p{L}{4,}s)\\*\\*`, 'giu'))) {
      if (ctx && toNumber(n)) add('num', b.id, 'number', { q: `${howMany(unit)} tiene ${lowerSubject(ctx)}?`, a: toNumber(n), t: '', u: '', n: '' }, 0.72);
    }
    // Cifras sin negrita: «tiene 169 artículos», «consta de diez títulos»
    // (si la frase dice de qué, es eso y no el apartado: «La mitosis tiene cuatro fases» → ¿Cuántas fases tiene la mitosis?)
    for (const sp of sentences(plainText(text))) {
      for (const m of sp.matchAll(new RegExp(`(?<![\\p{L}])(tiene|tienen|consta de|constan de|cuenta con|cuentan con|contiene|contienen)\\s+${NUM}\\s+(\\p{L}{4,}s)(?![\\p{L}])`, 'giu'))) {
        const own = new RegExp(`^((?:el|la|los|las)\\s[^,;:]{2,50}?)\\s+${m[1]}\\s`, 'iu').exec(sp.slice(0, m.index + m[1].length + 1))?.[1];
        const what = own && subjOk(own) ? own : ctx, verb = /n$|n\s/.test(m[1]) && own ? 'tienen' : 'tiene';
        if (what && toNumber(m[2])) add('num', b.id, 'number', { q: `${howMany(m[3])} ${verb} ${lowerSubject(what)}?`, a: toNumber(m[2]), t: '', u: '', n: '' }, 0.72);
      }
    }
    const lab = def || (/^\*\*([^*]{1,60}?)\s*:?\*\*\s*:?\s+(\S.*)$/s.exec(text) || []).slice(1).reduce((o, v, k) => ({ ...o, [k ? 'def' : 'term']: v }), null);
    if (lab) {
      const termP = plainText(lab.term).replace(/[:.]$/, ''), defP = plainText(lab.def);
      // «Publicación: 29 de diciembre de 1978» → ¿Cuándo se publicó…? (con la fecha como respuesta)
      const ds = dates(defP);
      if (ds.length === 1 && defP.length <= 140 && words(termP).length <= 6) {
        const v = /^((?:el|la|los|las)\s[^,]{2,40}?)\s+(?:lo|la|los|las)\s+(\p{L}+(?:ó|ió|aron|ieron))\s+(?:el|en)\s/iu.exec(defP);
        const q = whenLabel(termP, ctx) || (v && ctx ? `¿Cuándo ${v[2]} ${lowerSubject(v[1])} ${lowerSubject(ctx)}?` : words(termP).length === 1 && ctx ? `¿Cuándo fue ${guessArticle(termP)} ${termP.toLocaleLowerCase()} ${dePrep(ctx)}?` : `${capFirst(termP)}: ¿cuándo?`);
        add('date', b.id, 'basic', { q, a: capFirst(ds[0].text), n: norm(defP) === norm(ds[0].text) ? '' : capFirst(defP) }, 0.8);
        continue;
      }
      // «Reformas: tres.» → ¿Cuántas reformas tiene…?
      const nm = new RegExp(`^${NUM}\\.?(?:\\s|$)`, 'iu').exec(defP);
      if (nm && /s$/i.test(termP) && words(termP).length <= 3 && ctx) add('num', b.id, 'number', { q: `${howMany(termP)} tiene ${lowerSubject(ctx)}?`, a: toNumber(nm[1]), t: '', u: '', n: defP.length > nm[0].length + 2 ? capFirst(defP) : '' }, 0.72);
    }
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
      // Una definición de varias frases («Artículo 1: España se constituye… La soberanía reside… »): un hueco por frase
      const defSents = sentences(defP);
      if (tw <= 6 && defSents.length >= 2) {
        let n = 0;
        for (const ds2 of defSents) { const x = predicateCloze(ds2); if (x && add('def', b.id, 'cloze', { x, e: termP }, 0.7)) n++; }
        if (n) continue;
      }
      if (tw <= 6 && dw >= 2) {
        const subj = termP;
        const q = /^(qué|cuál|cómo|quién|por qué|cuándo|dónde|what|how|why|who|when|where)\b/i.test(subj) || /\?$/.test(subj)
          ? capFirst(subj.replace(/^¿?/, '¿').replace(/\??$/, '?'))
          : pageEs ? termQuestion(def.term, ctx) : def.term.replace(/\*\*/g, '').trim();   // en otro idioma, el término tal cual
        add('def', b.id, 'basic', { q, a: capFirst(cleanAnswer(defP)), n: '' }, 0.85);
        continue;
      }
    }

    // Frase a frase: concepto con verbo, negritas y fechas
    let prevSubj = '';
    for (const rawSentence of sentences(text)) {
      const s = rawSentence.replace(CALLOUT_PRE, '').trim();
      const sp = plainText(s);
      if (sp.length < 12 || sp.length > 420) continue;
      const art = artRef(b.id), withArt = q => (art && !/\(art\./i.test(q) ? q.replace(/\?$/, ` (art. ${art})?`) : q);
      // Quién hace qué, de qué está formado, a qué está sujeto… (aunque la frase tenga negritas)
      const rel = /^\p{Ll}/u.test(sp) ? [] : relationCards(sp, s);
      const done = new Set();
      for (const r of rel) {
        if (r.cloze ? add('bold', b.id, 'cloze', { x: r.cloze, e: '' }, r.score) : add(r.kind || 'term', b.id, r.typeId || 'basic', r.typeId === 'number' ? { q: r.q, a: r.a, t: '', u: '', n: '' } : { q: withArt(r.q), a: r.a, n: '' }, r.score)) {
          if (r.bold) done.add(norm(r.bold));
          if (r.enum) done.add('enum');
        }
      }
      // Fechas: «¿Cuándo…?» con la fecha como respuesta (una por frase; en el mismo párrafo, todas las frases)
      if (!rel.some(r => r.kind === 'date')) {
        for (const part of whenParts(sp, prevSubj)) {
          const when = whenSentence(part);
          if (when && add('date', b.id, when.year ? 'number' : 'basic', when.year ? { q: when.q, a: when.a, t: '', u: '', n: '' } : { q: when.q, a: when.a, n: '' }, 0.68)) done.add('date');
        }
      }
      prevSubj = subjectOf(sp) || prevSubj;
      // Negritas: un hueco por cada una (lo que el autor marcó como importante); una enumeración, un solo hueco
      let src = s;
      const en = ENUM_RX.exec(s);
      if (sp.length > 320) continue;
      if (en && !done.has('enum')) {
        const x = shortenCloze(s.replace(en[0], `{{${plainText(en[0])}}}`).replace(/\*\*([^*]{1,60})\*\*/g, '$1'));
        add('enum', b.id, 'cloze', { x: x.trim(), e: '' }, 0.72);
      }
      if (en) src = s.replace(en[0], plainText(en[0]));
      const nDates = dates(sp).length;
      // Trozos de una frase («el principio de **legalidad**,») y sujetos que no se entienden solos («Su estructura…»)
      const fragment = /,$/.test(sp) || /^(y|e|o|su|sus)\s/i.test(sp) || subKids.has(b.id);
      const bolds = [...src.matchAll(/\*\*([^*]{1,60})\*\*/g)].map(m => m[1].trim()).filter(x => x && !LABELS.test(x));
      if (bolds.length && bolds.length <= 4) {
        for (const bt of bolds) {
          if (fragment || done.has(norm(bt)) || (isDate(bt) && (done.has('date') || nDates > 1)) || (listed.has(b.id) && src.trim().startsWith(`**${bt}`))) continue;
          const x = src.replace(/\*\*([^*]{1,60})\*\*/g, (m, inner) => (inner.trim() === bt ? `{{${inner.trim()}}}` : inner)).replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2');
          add('bold', b.id, 'cloze', { x: shortenCloze(x.trim()), e: '' }, 0.75);
        }
        continue;
      }
      if (rel.length) continue;
      const sdef = s !== text && !bolds.length && splitDef(s);
      if (sdef && words(plainText(sdef.term)).length <= 5 && words(plainText(sdef.def)).length >= 2 && !/^(\d|[a-z])/.test(plainText(sdef.term))) {
        const tp = plainText(sdef.term);
        if (add('def', b.id, 'basic', { q: pageEs ? termQuestion(sdef.term, ctx) : tp, a: capFirst(plainText(sdef.def).replace(/[.]$/, '')), n: '' }, 0.8)) continue;
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
      if (years.length === 1 && !done.has('date')) {
        const y = years[0][1];
        const ctx = new RegExp(`(?:\\b(?:en|desde|hasta|entre|hacia|año|años|in|since|until|im|seit)\\s+(?:el\\s+|the\\s+)?(?:año\\s+|year\\s+)?|^)${y}(?![\\d])`, 'i');
        if (ctx.test(sp)) add('date', b.id, 'number', { q: sp.replace(new RegExp(`(?<![\\d.,])${y}(?![\\d.,]\\d)`), '____'), a: y, t: '', u: '', n: '' }, 0.6);
      }
    }
  }

  /* 5) Apartados: el título y la primera frase de su primer párrafo (su idea principal) */
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
    add('section', p.id, 'basic', { q: pageEs ? termQuestion(head, ctx) : ctx ? `${head} — ${ctx}` : head, a: cleanAnswer(first).replace(/\.$/, ''), n: '' }, first.length <= 180 && (words(head).length <= 2 || norm(first).includes(norm(head))) ? 0.66 : 0.55);
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
  return onePerDatum(out, pos).map((s, i) => ({ s, i })).sort((a, b) => (pos.get(a.s.blockId) ?? 0) - (pos.get(b.s.blockId) ?? 0) || (KIND_RANK[a.s.kind] ?? 1) - (KIND_RANK[b.s.kind] ?? 1) || a.i - b.i).map(({ s }) => s).map(s => ({ ...s, selected: s.score >= PRESELECT }));
}

/* ---------------- Una sugerencia por dato ---------------- */
// Lo que responde una sugerencia: el hueco, la respuesta…
const answerOf = s => {
  const f = s.fields || {};
  if (s.typeId === 'cloze' || s.typeId === 'clozechoice') return [...String(f.x || '').matchAll(/\{\{(.+?)(?:::.+?)?\}\}/g)].map(m => m[1]).join(' ');
  return ['basic', 'type', 'number', 'choice', 'vocab'].includes(s.typeId) ? f.a ?? f.t ?? '' : '';
};
// …sin lo que no cambia el dato: artículos y preposiciones delante, «(art. 1.3)» detrás
const answerCore = a => norm(String(a).replace(/\([^)]*\)/g, ' ')).replace(/^(?:(?:en|a|al|de|del|el|la|los|las|un|una|lo)\s+)+/, '');
// Las que piden lo mismo se juntan: misma parte del apunte y misma respuesta, huecos y «¿Qué artículo…?» de la misma
// frase, o la misma respuesta larga en otra parte («Monarquía parlamentaria» en el art. 1.3 y en la tabla de repaso).
// Se enseña la de más puntuación de la parte del apunte donde sale antes (lo que dice el texto, no la tabla de repaso
// del final); las demás van en alts («Otras formas de preguntarlo»)
export function onePerDatum(list, pos = new Map()) {
  const parent = list.map((s, i) => i), owner = new Map();
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  list.forEach((s, i) => {
    const core = answerCore(answerOf(s)), keys = [];
    if (core) keys.push(`b|${s.blockId}|${core}`);
    if (s.src && s.kind !== 'listitem') keys.push(`s|${s.blockId}|${s.src.slice(0, 40)}`);
    if (core.split(' ').length >= 2 && !/^[\d\s]+$/.test(core) && !['art', 'match', 'sort', 'steps', 'listitem'].includes(s.kind)) keys.push(`a|${core}`);
    for (const k of keys) { if (owner.has(k)) parent[find(i)] = find(owner.get(k)); else owner.set(k, i); }
  });
  const groups = new Map();
  list.forEach((s, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(s); });
  return [...groups.values()].map(g => {
    const first = Math.min(...g.map(s => pos.get(s.blockId) ?? 0)), at = s => ((pos.get(s.blockId) ?? 0) === first ? 0 : 1);
    const [best, ...rest] = [...g].sort((a, b) => at(a) - at(b) || b.score - a.score || list.indexOf(a) - list.indexOf(b));
    return rest.length ? { ...best, alts: rest } : best;
  });
}

/* ---------------- Consejos para escribir los apuntes de forma que salgan más (y mejores) tarjetas ---------------- */
// Mira cómo está escrito este apunte y qué no ha dado ninguna sugerencia → [{ id, text }] (los más útiles primero)
export function writingTips(page, suggestions = []) {
  const blocks = (page?.blocks || []).filter(b => !/https?:\/\//.test(b.text || ''));
  const withSug = new Set(suggestions.map(s => s.blockId));
  const tips = [];
  const emphasized = b => toRuns(b.text || '').some(r => r.st.b || r.st.u || r.st.bg || r.st.color);
  const longPlain = blocks.filter(b => b.type === 'p' && plainText(b.text).length > 220 && !emphasized(b) && !withSug.has(b.id));
  if (longPlain.length) tips.push({ id: 'emphasis', n: longPlain.length, text: `${longPlain.length === 1 ? 'Un párrafo largo no da' : `${longPlain.length} párrafos largos no dan`} ninguna pregunta. Marca en **negrita** o ==resalta== la palabra clave de cada idea y saldrá una frase para completar.` });
  // Listas sin nada que las presente
  let bare = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (!['li', 'ol'].includes(blocks[i].type) || blocks[i].indent || (i && ['li', 'ol', 'todo'].includes(blocks[i - 1].type))) continue;
    let n = 0;
    for (let j = i; blocks[j] && ['li', 'ol'].includes(blocks[j].type); j++) if (!blocks[j].indent) n++;
    const prev = blocks[i - 1], intro = prev && (/^h[1-3]$/.test(prev.type) || /:$/.test(plainText(prev.text)));
    if (n >= 2 && !intro && !withSug.has(blocks[i].id)) bare++;
  }
  if (bare) tips.push({ id: 'list', n: bare, text: `${bare === 1 ? 'Hay unas viñetas' : `Hay ${bare} grupos de viñetas`} sin nada encima. Escribe antes un título o una frase acabada en dos puntos («Las fases de la mitosis son:») y saldrá la pregunta con los puntos; si llevan numeración, para ordenar los pasos.` });
  if (!blocks.some(b => /^h[1-3]$/.test(b.type)) && blocks.filter(b => plainText(b.text)).length >= 8) tips.push({ id: 'heads', text: 'Divide el apunte con títulos (escribe «## » al principio de una línea): cada apartado da su propia pregunta y luego puedes estudiarlos por separado.' });
  const defs = suggestions.filter(s => s.kind === 'def').length, paras = blocks.filter(b => b.type === 'p' && plainText(b.text)).length;
  if (!defs && paras >= 3) tips.push({ id: 'defs', text: 'Escribe las definiciones así: «Mitosis: división de una célula en dos células hijas». Es lo que mejor se convierte en pregunta.' });
  const lists = blocks.filter(b => ['li', 'ol'].includes(b.type));
  if (lists.length >= 6 && !lists.some(b => b.indent)) tips.push({ id: 'indent', text: 'Usa la sangría (Tab) para los subpuntos: «Núcleo» con «ADN» y «Nucléolo» debajo da la pregunta «Núcleo: ¿qué incluye?».' });
  return tips;
}
