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
// Salen marcadas de entrada solo las más seguras (0,75 o más), como mucho MAX_PRESELECT por apunte: las demás, a un toque
export const PRESELECT = 0.75;
export const MAX_PRESELECT = 15;
const NEVER_PRESELECT = new Set(['explain', 'whatif']);

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
  if (/¿Qu[eé] (?:es|son) (?:el|la|los|las|lo) (?:y|e|o|u|ni|pero|que|qué|cómo|cuándo|dónde|si)(?![\p{L}])/iu.test(t)) return 'no es un término';
  if (/(?<![.…])\.\.(?!\.)|…\./u.test(t)) return 'dos puntos seguidos';
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
const NOT_TERM = /^(?:y|e|o|u|ni|pero|aunque|porque|pues|que|qué|cómo|como|cuándo|cuando|dónde|donde|por\s+qué|para\s+qué|quién|cuál|si|no|sí)(?![\p{L}])/iu;
// «Efecto de espaciado» → ¿Qué es el efecto de espaciado? · «Descubrió la **curva del olvido**» → ¿Qué es la curva del olvido?
// · con un término genérico, de qué: «Estructura» → ¿Cuál es la estructura de la Constitución Española?
// (los nombres propios de varias palabras, como «Hermann Ebbinghaus», se quedan tal cual)
export function termQuestion(term, ctx = '') {
  let t = String(term).trim();
  const bold = /\*\*([^*]+)\*\*/.exec(t), lead = bold ? plainText(t.slice(0, bold.index)).trim().split(/\s+/).filter(Boolean) : [];
  if (bold && lead.length && lead.length <= 2 && TERM_VERB.test(lead[0]) && (lead.length === 1 || /^(el|la|los|las|un|una)$/i.test(lead[1]))) t = `${lead[1] ? lead[1] + ' ' : ''}${bold[1]}`;
  t = plainText(t).replace(/[:.]$/, '').trim();
  if (/\?$/.test(t)) return capFirst(t.replace(/^¿?/, '¿'));
  if (NOT_TERM.test(t.replace(/^¿/, ''))) return '';
  if (/^(qué|cuál|cómo|quién|por qué|cuándo|dónde)(?![\p{L}])/iu.test(t)) return capFirst(t.replace(/^¿?/, '¿').replace(/\??$/, '?'));
  const art = (/^(el|la|los|las)\s/i.exec(t) || [])[1]?.toLowerCase(), bare = t.replace(ARTICLE, '');
  const ws = words(bare);
  // Un título que no es un término («Y dormir», «Cómo lo usa Flaski», «Que cueste un poco…», «Recordar enseña más…»): sin pregunta
  if (NOT_TERM.test(bare) || (ws.length >= 3 && /^\p{L}+(?:ar|er|ir)$/iu.test(ws[0]))) return '';
  if (!ws.length || ws.length > 6 || (ws.length > 1 && isProperName(bare))) return t;
  const head = ws[0], plural = /s$/i.test(head) && singular(head) !== head.toLocaleLowerCase(), fem = genderOf(head) === 'f';
  const a = art || (plural ? (fem ? 'las' : 'los') : (fem ? 'la' : 'el'));
  const low = /^\p{Lu}\p{Ll}/u.test(bare) ? bare.charAt(0).toLocaleLowerCase() + bare.slice(1) : bare;
  if (/^(definición|concepto)$/i.test(bare) && ctx) return termQuestion(ctx);
  if (GENERIC_TOPIC.test(bare) && ctx) return `¿${plural ? 'Cuáles son' : 'Cuál es'} ${a} ${low} ${dePrep(ctx)}?`;
  return fixGrammar(`¿Qué ${plural ? 'son' : 'es'} ${a} ${low}?`);
}

// Una lista con título como pregunta: «Algunas dificultades deseables» → ¿Cuáles son algunas dificultades deseables?
// · los subpuntos de un punto: «Núcleo» → ¿Qué incluye el núcleo?
const DETERMINER = /^(el|la|los|las|un|una|unos|unas|algun[oa]s?|sus?|mis?|tus?|estos?|estas?|esos?|esas?|otr[oa]s?|vari[oa]s|much[oa]s|pocos|pocas|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s/i;
export function listQuestion(head, what = 'cuáles') {
  const t = plainText(head).replace(/:$/, '').trim(), ws = words(t);
  if (!ws.length) return '';
  if (/\?$/.test(t)) return t;
  const low = /^\p{Lu}\p{Ll}/u.test(t) && !(ws.length > 1 && isProperName(t)) ? t.charAt(0).toLocaleLowerCase() + t.slice(1) : t;
  const plural = /s$/i.test(ws[0]) && singular(ws[0]) !== ws[0].toLocaleLowerCase(), fem = genderOf(ws[0]) === 'f';
  const np = DETERMINER.test(t) || (ws.length > 1 && isProperName(t)) ? low : `${plural ? (fem ? 'las' : 'los') : (fem ? 'la' : 'el')} ${low}`;
  if (what === 'incluye') return `¿Qué ${DETERMINER.test(t) ? (/s\s/i.test(t.split(/\s+/).slice(0, 2).join(' ') + ' ') ? 'incluyen' : 'incluye') : plural ? 'incluyen' : 'incluye'} ${np}?`;
  return `¿Cuáles son ${np}?`;
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
const pluralOf = w => (/[aeiouáéó]$/i.test(w) ? w + 's' : /ión$/.test(w) ? w.replace(/ión$/, 'iones') : /z$/.test(w) ? w.slice(0, -1) + 'ces' : w + 'es');
const howMany = unit => `¿${genderOf(unit) === 'f' ? 'Cuántas' : 'Cuántos'} ${unit.toLocaleLowerCase()}`;

/* ---------------- Frases clave sin formato ---------------- */
// Sin negritas, títulos ni listas, cada frase suma puntos por lo que la hace preguntable (fecha completa, plazo, cifra
// con unidad, «Art. N», «Ley N/AAAA», «X es Y», una enumeración con número, un nombre propio, «ante», «salvo», «porque»…,
// palabras que se repiten en el apunte); de las de 2 puntos o más salen preguntas
const QTY = `(?:\\d+|${Object.keys(NUM_WORDS).join('|')}|un|medio)`;
const TIME_UNIT = '(?:días?|meses|mes|años?|semanas?|horas?)(?:\\s+(?:hábiles|naturales))?';
const PLAZO_RX = new RegExp(`(?<![\\p{L}])${QTY}\\s+${TIME_UNIT}(?![\\p{L}])`, 'iu');
const stems = s => norm(s).split(' ').filter(w => w.length >= 4 && !STOPWORDS.has(w)).map(w => w.slice(0, 5));
// Cuántas veces sale cada palabra (por su raíz) en el apunte, para saber de qué trata
export function wordFreq(blocks) {
  const f = new Map();
  for (const b of blocks) for (const w of stems(b.text || '')) f.set(w, (f.get(w) || 0) + 1);
  return f;
}
export function keyScore(sp, freq = new Map()) {
  let n = 0;
  if (dates(sp).some(d => /\sde\s/i.test(d.text)) || PLAZO_RX.test(sp) || /plazo\s+de/i.test(sp) || new RegExp(`(?<![\\p{L}\\d])(?:\\d+|${Object.keys(NUM_WORDS).join('|')})\\s+\\p{L}{4,}s(?![\\p{L}])`, 'iu').test(sp)
    || /(?<![\p{L}])(?:art\.|artículo)\s*\d/iu.test(sp) || /Ley\s+\d+\/\d{4}/.test(sp)) n += 2;
  if (/^(?:[\p{L}\s,]{3,60}?)\s(?:es|son|se\s+define\s+como|tiene|tienen)\s/iu.test(sp)) n += 2;
  if (new RegExp(`(?<![\\p{L}])${NUM}\\s+\\p{L}+s\\s*:\\s*\\S`, 'iu').test(sp)) n += 2;
  if (/^\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+){1,3}\s+\p{L}{3,}(?:ó|ió|aron|ieron)\s/u.test(sp)) n += 2;   // persona y hecho
  if (/\s\p{Lu}\p{Ll}/u.test(sp.slice(1))) n += 1;
  if (/(?<![\p{L}])(?:corresponde\s+a|ante|salvo|excepto|solo|por\s+eso|porque|a\s+diferencia\s+de)(?![\p{L}])/iu.test(sp)) n += 1;
  if (/^(?:el|la|los|las)\s[^,]{2,40}?\s\p{L}{3,}(?:a|e|an|en|ó|aron)\s(?:el|la|los|las|un|una)\s/iu.test(sp)) n += 1;   // quién hace qué
  if (new Set(stems(sp).filter(w => (freq.get(w) || 0) >= 2)).size >= 2) n += 1;
  if (/^(?:esto|eso|también)(?![\p{L}])/iu.test(sp) || (words(sp).length > 40 && !/[;,]/.test(sp))) n -= 2;
  return n;
}
const lowFirst = s => (/^\p{Lu}\p{Ll}/u.test(s) && !/^\p{Lu}[\p{L}'-]+\s+\p{Lu}/u.test(s) ? s.charAt(0).toLocaleLowerCase() + s.slice(1) : s);
// «interponerlo» con el sujeto de la frase de antes → «interponer el recurso de alzada»
const unClitic = (s, subj) => (subj ? s.replace(/(?<![\p{L}])(\p{L}+(?:ar|er|ir))(?:lo|la|los|las)(?![\p{L}])/u, (m, v) => `${v} ${lowerSubject(subj)}`) : s);
// Reglas que valen también en las frases con negritas → [{ kind, typeId, fields, score, extra }]
export function anyRules(sp, env = {}) {
  const out = [], body = sp.replace(/[.;:]+$/, '').trim();
  const push = (kind, typeId, fields, score, extra = {}) => out.push({ kind, typeId, fields, score, extra });
  let m;
  // «Las demás lenguas serán también oficiales en las Comunidades Autónomas de acuerdo con sus Estatutos» → ¿Según qué serán…?
  if ((m = /^(.+?)\s+(?:de\s+acuerdo\s+con|conforme\s+a|según)\s+([^,]{3,60})$/iu.exec(body))) {
    const subj = subjectOfClause(m[1]), rest = subj ? m[1].slice(m[1].indexOf(subj) + subj.length).trim() : '';
    if (subj && ARTICLE.test(subj) && rest && SUBJ_END.test(rest.split(/\s+/)[0])) push('term', 'basic', { q: `¿Según qué ${rest} ${lowerSubject(subj)}?`, a: `Según ${m[2]}`, n: '' }, 0.7);
  }
  // Una cita: «En un experimento conocido (Roediger y Karpicke, 2006), unos estudiantes…» → ¿Quiénes hicieron en 2006 el experimento…?
  if ((m = /^En\s+(?:un|una)\s+(\p{L}+(?:\s+\p{L}+)?)\s+\(([^,()]{3,60}),\s*((?:1|2)\d{3})\),\s+(.{8,})$/u.exec(body))) {
    const many = /\s(?:y|e)\s|,/.test(m[2]);
    push('term', 'basic', { q: `¿${many ? 'Quiénes hicieron' : 'Quién hizo'} en ${m[3]} el ${m[1]} en el que ${m[4]}?`, a: m[2].trim(), n: '' }, 0.74, { atype: 'persona' });
  }
  // Sin sujeto, el de la frase de antes: «Hermann Ebbinghaus fue… Se usó a sí mismo como sujeto: memorizaba listas de sílabas
  // sin sentido (…) y medía…» → ¿Qué memorizaba Hermann Ebbinghaus?
  const name = /^(\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+){1,3})\s/u.exec(env.prev || '')?.[1];
  if (name && (m = /^(?:[^:]{3,60}:\s+)?(\p{Ll}\p{L}+(?:aba|ían|ía))\s+(.+?)(?=\s*\(|\s+y\s+\p{L}+(?:aba|ía)\s|,|$)/u.exec(body)) && words(m[2]).length <= 8) {
    push('term', 'basic', { q: `¿Qué ${m[1]} ${name}?`, a: capFirst(m[2]), n: '' }, 0.7);
  }
  // «…, pero reconocer no es lo mismo que recordar» → Explica con tus palabras por qué reconocer no es lo mismo que recordar
  if ((m = /^(?:(.+?),\s+pero\s+)?(\p{L}[^,]{2,40}?)\s+no\s+es\s+lo\s+mismo\s+que\s+([^,]{3,40})$/iu.exec(body))) {
    push('diff', 'explain', { q: `Explica con tus palabras por qué ${lowFirst(m[2])} no es lo mismo que ${m[3]}.`, k: capFirst(m[1] || body), n: '' }, 0.6);
  }
  return out;
}
// Las reglas de una frase sin negritas → [{ kind, typeId, fields, score, extra }]
// env: { ctx (de qué va el apunte), prev (la frase de antes), prevSubj (su sujeto), score (sus puntos) }
export function plainRules(sp, env = {}) {
  const out = anyRules(sp, env), body = sp.replace(/[.;:]+$/, '').trim(), ctx = env.ctx || '';
  const push = (kind, typeId, fields, score, extra = {}) => out.push({ kind, typeId, fields, score, extra });
  const basic = (kind, q, a, score, extra) => push(kind, 'basic', { q, a: capFirst(a.trim()), n: '' }, score, extra);
  let m;
  // Plazos: «El plazo máximo para resolver no podrá exceder de seis meses, salvo…» · «El plazo para interponerlo será de un mes si…»
  if ((m = new RegExp(`^((?:el|un)\\s+plazo[^,;]*?)\\s+(no\\s+podrá\\s+exceder\\s+de|será\\s+de|es\\s+de|no\\s+será\\s+superior\\s+a)\\s+(${QTY}\\s+${TIME_UNIT})(.*)$`, 'iu').exec(body))) {
    const np = unClitic(m[1], env.prevSubj), tail = m[4].replace(/^,.*$/, '').trim();
    basic('plazo', `¿Cuál es ${lowFirst(np)}${tail ? ' ' + tail : ''}?`, m[3], 0.78, { atype: 'plazo' });
    push('plazo', 'cloze', { x: `${capFirst(np)} ${m[2]} {{${m[3]}}}${m[4]}.`, e: '' }, 0.76, { atype: 'plazo' });
    // La excepción negada: «…no podrá exceder de seis meses, salvo que…» → «…nunca podrá exceder de seis meses» (falso)
    const salvo = /^,\s+((?:salvo|excepto)\s.+)$/iu.exec(m[4]);
    if (salvo && /^no\s/i.test(m[2])) push('tf', 'truefalse', { s: `${capFirst(np)} ${m[2].replace(/^no\s+/i, 'nunca ')} ${m[3]}.`, v: 'F', n: `Falso: ${salvo[1]}.` }, 0.66, { link: `@${m[3]}` });
  }
  // «Cuando las normas no fijen el plazo máximo, este será de tres meses» → Cuando las normas no fijen el plazo máximo, ¿cuál es?
  if ((m = new RegExp(`^((?:Cuando|Si)\\s[^,]*?(el\\s+plazo[^,]*)),\\s+(?:este|ese|dicho\\s+plazo|el\\s+plazo)\\s+será\\s+de\\s+(${QTY}\\s+${TIME_UNIT})(.*)$`, 'iu').exec(body))) {
    basic('plazo', `${m[1]}, ¿cuál es?`, m[3], 0.78, { atype: 'plazo' });
    push('plazo', 'cloze', { x: `${m[1]}, ${m[2]} será de {{${m[3]}}}${m[4]}.`, e: '' }, 0.76, { atype: 'plazo' });
  }
  // Órgano: «El recurso de alzada podrá interponerse ante el órgano que dictó el acto» → ¿Ante qué órgano podrá interponerse…?
  if ((m = /^((?:el|la|los|las)\s[^,]{2,60}?)\s+((?:podrá|podrán|deberá|deberán|puede|pueden)\s+\p{L}+se|se\s+\p{L}+|\p{L}+se)\s+ante\s+(.{4,})$/iu.exec(body))) {
    basic('organo', `¿Ante ${/^(?:el|la)\s+(?:mismo\s+|misma\s+)?órgano/i.test(m[3]) ? 'qué órgano' : 'quién'} ${m[2]} ${lowerSubject(m[1])}?`, `ante ${m[3]}`, 0.78);
  }
  // Excepción: «Contra la resolución de X no cabrá ningún otro recurso, salvo el Y» → ¿Qué recurso cabe contra la resolución de X?
  if ((m = /^(Contra\s.+?)\s+no\s+(cabrá|cabe|procederá|procede)\s+ning[uú]n(?:a)?\s+otr[oa]\s+(\p{L}+)[^,]*,\s+salvo\s+(.+)$/iu.exec(body))) {
    basic('term', `¿Qué ${m[3]} ${m[2] === 'cabrá' ? 'cabe' : m[2]} ${lowFirst(m[1])}?`, m[4], 0.76);
    // Falso: otro de los del apunte en lugar de la excepción («…cabe el recurso potestativo de reposición»)
    const others = [...new Set((env.text || '').match(new RegExp(`(?<![\\p{L}])${m[3]}\\s+\\p{Ll}+(?:\\s+de\\s+\\p{Ll}+)?`, 'gu')) || [])]
      .filter(o => !m[4].includes(o) && !m[1].includes(o) && words(o).length >= 3);
    if (others[0]) push('tf', 'truefalse', { s: `${m[1]} ${m[2] === 'cabrá' ? 'cabe' : m[2]} el ${others[0]}.`, v: 'F', n: `Falso: solo ${m[2] === 'cabrá' ? 'cabe' : m[2]} ${m[4].replace(/^(?:El|La)\s/, w => w.toLowerCase())}.` }, 0.66, { link: `@${m[4]}` });
  }
  // «Tienen capacidad de obrar las personas físicas…» → ¿Quiénes tienen capacidad de obrar?
  if ((m = /^(Tienen|Tiene|Podrán|Pueden|Deberán|Deben)\s+([^,]{3,40}?)\s+((?:los|las|el|la)\s.{4,})$/u.exec(body)) && !/\s(?:de|del|a|en)$/.test(m[2])) {
    basic('term', `¿${/n$/.test(m[1]) ? 'Quiénes' : 'Quién'} ${lowFirst(m[1])} ${m[2]}?`, m[3], 0.74);
  }
  // «Los interesados podrán actuar por medio de representante» → ¿Cómo podrán actuar los interesados?
  if ((m = /^((?:el|la|los|las)\s[^,]{2,40}?)\s+(podrán|pueden|podrá|puede|deberán|deben|deberá|debe)\s+(\p{L}+(?:ar|er|ir))\s+(por\s+medio\s+de|mediante|a\s+través\s+de)\s+(.+)$/iu.exec(body))) {
    basic('term', `¿Cómo ${m[2]} ${m[3]} ${lowerSubject(m[1])}?`, `${m[4]} ${m[5]}`, 0.74);
  }
  // «Los cloroplastos solo están en las células vegetales…» → «Los cloroplastos están en todas las células…» (falso)
  if ((m = /^(.+?)\s+solo\s+(\p{L}+)\s+en\s+(las|los)\s+(\p{L}+)\s+(\p{L}+)(.*)$/iu.exec(body))) {
    push('tf', 'truefalse', { s: `${m[1]} ${m[2]} en ${m[3].toLowerCase() === 'las' ? 'todas' : 'todos'} ${m[3]} ${m[4]}${m[6]}.`, v: 'F', n: `Falso: solo ${m[2]} en ${m[3]} ${m[4]} ${m[5]}.` }, 0.62);
  }
  // Enumeración con número: «El periodo se divide en tres etapas: a, b y c» · «La mitosis tiene cuatro fases: profase, …»
  if ((m = new RegExp(`^(.+?)\\s+(se\\s+divide\\s+en|se\\s+dividen\\s+en|tiene|tienen|consta\\s+de|comprende|incluye|distingue)\\s+${NUM}\\s+(\\p{L}+s)\\s*:\\s*(.+)$`, 'iu').exec(body))) {
    const items = m[5].split(/,\s+/).map(x => x.trim()).filter(Boolean), last = items.pop() || '';
    const k = Math.max(last.search(/\s[ye]\s(?=(?:el|la|los|las)\s)/i), /\s(?:el|la|los|las)\s/i.test(last) ? -1 : last.lastIndexOf(' y '));
    items.push(...(k > 0 ? [last.slice(0, k), last.slice(k + 3)] : [last]).map(x => x.trim()));
    let subj = m[1].trim();
    if (/^(?:el|este|dicho)\s+(?:periodo|período|proceso|tema|ciclo)$/i.test(subj) && ctx) subj = ctx;
    const n = toNumber(m[3]), unit = m[4].toLocaleLowerCase(), f = genderOf(unit) === 'f', divide = /divide/i.test(m[2]);
    if (+n === items.length && (ARTICLE.test(subj) || /^\p{Lu}/u.test(subj))) {
      // (la pregunta ya dice cuántos: «¿Cuántas fases…?» va plegada debajo, como otra forma de preguntarlo)
      basic('enum', divide ? `¿En qué ${m[3].toLocaleLowerCase()} ${unit} se divide ${lowerSubject(subj)}?` : `¿Qué ${m[3].toLocaleLowerCase()} ${unit} ${m[2]} ${lowerSubject(subj)}?`, m[5], 0.76, { link: `@${n}` });
      if (divide) push('num', 'number', { q: `¿En ${f ? 'cuántas' : 'cuántos'} ${unit} se divide ${lowerSubject(subj)}?`, a: n, t: '', u: '', n: '' }, 0.72);
      if (/^(?:fases|etapas|pasos)$/.test(unit)) push('steps', 'steps', { q: `Ordena ${f ? 'las' : 'los'} ${unit} de ${lowerSubject(subj)}`, s: items.map(x => capFirst(x.replace(/\s*\([^)]*\)/g, ''))).join('\n'), n: '' }, 0.7);
    }
  }
  // Quién hizo qué: «Clara Campoamor defendió el sufragio femenino…» → ¿Quién defendió…? · «Durante el bienio reformista,
  // el gobierno de Manuel Azaña impulsó…» → ¿Qué impulsó el gobierno de Manuel Azaña durante el bienio reformista?
  if ((m = /^(?:((?:Durante|En|Tras|Desde)\s[^,]{3,50}),\s+)?((?:(?:[Ee]l|[Ll]a|[Ll]os|[Ll]as)\s[^,]{2,50}?)|(?:\p{Lu}[\p{L}'-]+(?:\s+(?:de\s+|del\s+)?\p{Lu}[\p{L}'-]+){1,3}))\s+(\p{L}{3,}(?:ó|ió|aron|ieron))\s+(.{4,})$/u.exec(body))
    // (sin la fecha de lo que pasa: «X llegó al poder en 1799…» y «El golpe del 18 de julio de 1936 provocó…» ya preguntan «¿Cuándo…?»)
    && /\s\p{Lu}/u.test(' ' + m[2].slice(1)) && !/\s(?:lo|la|los|las|le|les)$/i.test(m[2])
    && !dates(m[2]).some(d => /\sde\s/.test(d.text)) && !/(?<![\p{L}])(?:en|el|entre|hacia)\s+(?:el\s+año\s+)?\d/iu.test(m[4].split(/,\s+que\s/)[0])) {
    const lead = m[1] ? ` ${lowFirst(m[1])}` : '', obj = m[4].split(/,\s+(?=(?:que|el\s+cual|la\s+cual|lo\s+que|pero|aunque)\s)|;\s/)[0];
    if (!ARTICLE.test(m[2])) basic('term', `¿Quién ${m[3]} ${obj}${lead}?`, m[2], 0.76, { atype: 'persona' });
    else basic('term', `¿Qué ${m[3]} ${lowerSubject(m[2])}${lead}?`, obj, 0.76);
    // «…el voto femenino, que se ejerció por primera vez en las elecciones de 1933» → ¿En qué año se ejerció por primera vez el voto femenino?
    const rel = /,\s+que\s+((?:se\s+)?\p{L}+(?:ó|ió))\s+(.*?)(?<![\d])(1\d{3}|20\d{2})(?![\d])/u.exec(m[4]);
    if (rel) {
      const what = rel[2].replace(/\s*(?:en|desde|hasta)\s+(?:el|la|los|las)?\s*[^,]*?$/iu, '').trim();
      push('date', 'number', { q: `¿En qué año ${rel[1]}${what ? ' ' + what : ''} ${obj}?`, a: rel[3], t: '', u: '', n: '' }, 0.7,
        { atype: 'año', stmt: `${capFirst(obj)} ${rel[1]} ${rel[2]}${rel[3]}.` });
    }
  }
  // «La Segunda República se proclamó el 14 de abril de 1931, tras las elecciones municipales del 12 de abril»
  // → ¿Cuándo se proclamó la Segunda República? y ¿Tras qué elecciones se proclamó la Segunda República?
  if ((m = /^(.+?),\s+(tras|después\s+de|antes\s+de)\s+((?:el|la|los|las)\s+(\p{L}+).+)$/iu.exec(body)) && dates(m[1]).length === 1) {
    const when = whenSentence(m[1]);
    if (when) {
      push('date', when.year ? 'number' : 'basic', when.year ? { q: when.q, a: when.a, t: '', u: '', n: '' } : { q: when.q, a: when.a, n: '' }, 0.76, { atype: when.year ? 'año' : 'fecha', stmt: `${m[1]}.` });
      const vq = when.q.replace(/^¿Cuándo\s+/, '').replace(/\?$/, '');
      basic('term', `¿${capFirst(m[2].toLocaleLowerCase())} qué ${m[4].toLocaleLowerCase()} ${vq}?`, m[3], 0.74);
    }
  }
  // Para entender (nunca marcadas de entrada): «Por eso X» → Explícalo: ¿por qué X? (con la frase de antes como idea clave)
  if ((m = /^Por\s+eso,?\s+(.{8,})$/iu.exec(body)) && env.prev) push('why', 'explain', { q: `Explícalo: ¿por qué ${lowFirst(m[1])}?`, k: `Porque ${lowFirst(env.prev.replace(/[.;:]+$/, ''))}`, n: '' }, 0.6);
  else if ((m = /^(.{12,}?),?\s+porque\s+(.{8,})$/iu.exec(body))) push('why', 'explain', { q: `Explícalo: ¿por qué ${lowFirst(m[1])}?`, k: `Porque ${m[2]}`, n: '' }, 0.6);
  // «A diferencia de las células animales, las vegetales tienen pared celular» → ¿En qué se diferencian las células vegetales de las animales?
  if ((m = /^A\s+diferencia\s+de\s+((?:el|la|los|las)\s+(\p{L}+)\s+(\p{L}+)),\s+((?:el|la|los|las)\s+(\p{L}+))\s+(.{6,})$/iu.exec(body))) {
    const a = m[1], noun = m[2], b = m[5] === noun ? m[4] : `${m[4].split(' ')[0]} ${noun} ${m[5]}`;
    push('diff', 'explain', { q: `¿En qué se diferencian ${lowFirst(b)} de ${a.split(' ')[0].toLocaleLowerCase()} ${m[3]}?`, k: `${capFirst(b)} ${m[6]}`, n: '' }, 0.6);
  } else if ((m = /^(.{4,40}?)\s+en\s+vez\s+de\s+([^,]{3,40}?),?\s+(hace|hacen|es|son|sirve|funciona|dura|fija|ayuda)\s+(.{4,})$/iu.exec(body))) {
    push('diff', 'explain', { q: `¿En qué se diferencia ${lowFirst(m[1])} de ${m[2]}?`, k: `${capFirst(m[1])} ${m[3]} ${m[4]}`, n: '' }, 0.6);
  }
  // «Gran parte de lo que aprendes hoy se habrá ido en unos pocos días si no vuelves a ello» → ¿Qué pasaría si no vuelves
  // a lo que aprendes hoy? · «Lo que recuerdas en unos pocos días: baja» (efectos que se miden: suben, bajan o se quedan igual)
  if ((m = /^(.{10,}?)\s+si\s+(.{6,})$/iu.exec(body)) && !/plazo/i.test(m[1])) {
    const main = m[1], down = /(?<![\p{L}])(?:se\s+habrá\s+ido|se\s+va|olvid\p{L}*|se\s+pierde|disminuye|baja|empeora|cae)(?![\p{L}])/iu, up = /(?<![\p{L}])(?:aumenta|sube|mejora|dura\s+más|crece|se\s+recuerda\s+mejor)(?![\p{L}])/iu;
    const dir = down.test(main) ? 'baja' : up.test(main) ? 'sube' : '';
    const when = /(?<![\p{L}])((?:en|al\s+cabo\s+de|después\s+de)\s+(?:unos?|unas?|pocos?|pocas?|\d+|una|un)[^,]*?(?:días?|semanas?|meses|mes|años?)(?:\s+después)?)/iu.exec(main)?.[1] || '';
    const thing = /(?<![\p{L}])(lo\s+que\s+\p{L}+(?:\s+hoy)?)/iu.exec(main)?.[1];
    const cond = thing ? m[2].replace(/(?<![\p{L}])(?:ello|eso|esto)(?![\p{L}])/iu, thing) : m[2];
    if (dir && !/(?<![\p{L}])(?:ello|eso|esto)(?![\p{L}])/iu.test(cond)) {
      push('whatif', 'whatif', { s: `¿Qué pasaría si ${cond}?`, p: '¿Qué pasa con lo que recuerdas?', e: `Lo que recuerdas${when ? ' ' + when : ''}: ${dir}`, k: capFirst(sp), n: '' }, 0.58);
    }
  }
  // Una frase clave cualquiera: hueco en lo que se dice del sujeto («Las células eucariotas tienen {{un núcleo rodeado por
  // una membrana}}», «La mitocondria produce {{la energía de la célula}} mediante…») o en la enumeración que es el sujeto
  if (env.score >= 2 && !out.some(r => r.kind !== 'tf' && r.kind !== 'diff') && !/:\s/.test(body) && !LEAD_PHRASE.test(body)) {
    let clauseSubj = '';
    for (const clause of body.split(/;\s+/)) {
      let c = clause.trim();
      // «…; su material genético está disperso…» → «El material genético de las células procariotas está disperso…»
      if (/^sus?\s/i.test(c) && clauseSubj) {
        c = c.replace(/^(sus?)\s+([^,]{3,40}?)\s+(?=(?:está|están|es|son|se|tiene|tienen)\s)/iu, (x, su, np) => {
          const f = genderOf(np.split(' ')[0]) === 'f', pl = /^sus$/i.test(su);
          return `${pl ? (f ? 'Las' : 'Los') : (f ? 'La' : 'El')} ${np} ${dePrep(lowerSubject(clauseSubj))} `;
        });
      }
      const subj = subjectOfClause(c).replace(/\s+(?:no|solo|también|ya)$/i, '');
      const listSubj = /,\s|\s[ye]\s/.test(subj) && !ARTICLE.test(subj);
      if (!subj || words(subj).length > 7 || DANGLING.test(subj) || !(ARTICLE.test(subj) || /^tod[oa]s\s/i.test(subj) || listSubj)) continue;
      clauseSubj ||= subj;
      const rest = c.slice(c.indexOf(subj) + subj.length).trim();
      const vm = /^((?:no\s+|solo\s+|también\s+)?(?:se\s+)?\p{L}+(?:\s+(?:formad|compuest|constituid|integrad|dispers|rodead|situad|ubicad)[oa]s?\s+(?:por|en))?)\s+(.+)$/iu.exec(rest);
      if (!vm || !SUBJ_END.test(vm[1].split(/\s+/).filter(w => !/^(?:no|solo|también|se)$/i.test(w))[0] || '')) continue;
      let obj = vm[2], tail = '', x;
      const coord = /^(.*?)\s+y\s+(\p{L}+(?:a|e|an|en|ó|aron))\s+((?:el|la|los|las|un|una)\s.{2,60})$/iu.exec(obj);
      if (listSubj) x = `{{${subj}}} ${rest}`;   // «Animales, plantas y hongos están formados por…»
      else if (coord) x = `${subj} ${vm[1]} ${coord[1]} y ${coord[2]} {{${coord[3]}}}`;
      else {
        const cut = /,\s|\s(?=(?:mediante|según|salvo|porque|para|durante|cuando|si|excepto)\s)/iu.exec(obj);
        if (cut) { tail = obj.slice(cut.index); obj = obj.slice(0, cut.index); }
        // («Las células son capaces de dirigir…»: con «es / son», el hueco es un nombre, no una frase entera)
        // (una cantidad ya la pregunta «¿Cuántos…?»)
        if (words(obj).length > 8 || /^(?:que|de|del|a|al)\s/i.test(obj) || new RegExp(`^${NUM}\\s`, 'iu').test(obj) || (/^(?:es|son)$/i.test(vm[1]) && !ARTICLE.test(obj) && words(obj).length > 2)) continue;
        x = `${subj} ${vm[1]} {{${obj}}}${tail}`;
      }
      push('key', 'cloze', { x: `${capFirst(x.trim())}.`, e: '' }, 0.55);
    }
  }
  return out;
}

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
const CLAUSE_CUT = /;\s+|,\s+(?=(?:y|e|que|del\s+que|de\s+la\s+que|de\s+los\s+que|de\s+las\s+que|donde|siendo|patria|conforme|salvo|excepto)\s)|\s+(?=conforme\s+a\s)|\s+y\s+(?=(?:es|son|será|serán|está|están)\s)/giu;
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
      // (src: la frase ya recortada; dos huecos se juntan como un dato solo si quedan en la misma frase y uno delata al otro)
      const x = trimCloze(fields.x);
      if (!x) return false;
      fields = { ...fields, x };
      extra = { src: norm(x), ...extra };
    }
    // (link «@respuesta»: va con lo que pregunta esa respuesta en este mismo bloque)
    if (extra.link?.startsWith('@')) extra = { ...extra, link: `b|${blockId}|${answerCore(extra.link.slice(1))}` };
    const note = asNote(typeId, fields, isLangDeck);
    const type = TYPE(note.typeId);
    const active = activeTemplates(type, note.fields);
    if (!active.length) return false;
    const sum = summarize(type, active[0], note.fields);
    const key = norm(sum.front) + '|' + norm(sum.back);
    // (una opción múltiple pregunta lo mismo que su pregunta: va con ella, no se descarta por repetida)
    const again = kind !== 'mc' && (seen.has(norm(sum.front)) || seen.has(normQ(sum.front)));
    if (!norm(sum.front) || again || (kind !== 'mc' && seen.has(key)) || fromBlock.has(blockId + '|' + norm(sum.back))) return false;
    seen.add(key); seen.add(norm(sum.front)); seen.add(normQ(sum.front));
    out.push({ key: `${kind}:${blockId}:${out.length}`, id: `${kind}|${blockId}|${norm(sum.front).slice(0, 60)}`, kind, label: KINDS[kind], blockId, section: sectionOf(blockId), typeId: note.typeId, fields: note.fields,
      front: sum.front, back: sum.back, cards: active.length, score: Math.min(1, score + (calloutIds.has(blockId) ? 0.15 : 0)),
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

  // Una lista de 5 elementos o más: un hueco por elemento, con los demás a la vista (cortos y en su orden), y «¿Cuántos…?»,
  // que lleva plegada la lista entera (la pregunta de toda la lista va en el mismo grupo)
  const listClozes = (blockId, lead, items, countQ) => {
    items = items.map(t => t.replace(/[.,;:]+$/, ''));
    const brief = t => { const w = words(t); if (w.length <= 4) return t; let s = w.slice(0, 4).join(' ').replace(/[,;:.]+$/, ''); while (DANGLING.test(s)) s = s.replace(DANGLING, '').trim(); return s + '…'; };
    items.forEach((it, k) => {
      const parts = items.map((x, j) => (j === k ? `{{${x}}}` : brief(x)));
      const last = parts.pop();
      add('listitem', blockId, 'cloze', { x: `${lead} ${parts.join(', ')} ${/^\{?\{?h?i(?!e)/i.test(last) ? 'e' : 'y'} ${last}${/…$/.test(last) ? '' : '.'}`, e: '' }, 0.74, { list: true });
    });
    if (countQ) add('num', blockId, 'number', { q: countQ, a: String(items.length), t: '', u: '', n: '' }, 0.72, { group: `list|${blockId}` });
  };

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
  const VERB_HEAD = /^((?:el|la|los|las)\s.{2,60}?)\s+(garantiza|garantizan|incluye|incluyen|comprende|comprenden|recoge|recogen|establece|establecen|reconoce|reconocen|regula|regulan|protege|protegen|contiene|contienen|abarca|abarcan|prohíbe|prohíben)$/iu;
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
    const vh = VERB_HEAD.exec(head);
    const q = vh ? `¿Qué ${vh[2]} ${lowerSubject(vh[1])}${art ? ` (art. ${art})` : ''}?` : listQuestion(head, LIST_WORDS.test(head) || /:$/.test(plainText(b.text)) ? 'cuáles' : 'incluye');
    const item = k => plainText(k.text).replace(/[,;]$/, '').replace(/^(?:y|e)\s+/i, '');
    const long = kids.length >= 5;
    if (add('sub', b.id, 'basic', { q: q + (!vh && ctx && words(head).length <= 2 && !norm(head).includes(norm(ctx)) ? ` — ${ctx}` : ''), a: kids.map(k => `- ${item(k)}`).join('\n'), n: '' }, long ? 0.55 : 0.7, long ? { group: `list|${b.id}` } : {})) kids.forEach(k => subKids.add(k.id));
    if (long) {
      const noun = /^(?:el|la|los|las)\s+(\p{L}+)\s+(?:de|del)\s/iu.exec(item(kids[0]))?.[1];
      listClozes(b.id, `${vh ? `${vh[1]} ${vh[2]}${art ? ` (art. ${art})` : ''}` : head}:`, kids.map(item),
        noun && vh ? `¿${genderOf(noun) === 'f' ? 'Cuántas' : 'Cuántos'} ${pluralOf(noun)} ${vh[2]} ${lowerSubject(vh[1])}${art ? ` (art. ${art})` : ''}?` : '');
    }
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
    if (/^art(?:ículo|\.)\s*\d/i.test(introText) && r.type === 'ol') continue;   // los puntos de un artículo no son una lista
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
    const vh = VERB_HEAD.exec(introText.replace(/:$/, ''));
    if (vh) q = `¿Qué ${vh[2]} ${lowerSubject(vh[1])}?`;
    else if (m1) q = /^(are|include)$/i.test(m1[2]) ? `What ${m1[2].toLowerCase()} ${m1[1]}?` : `¿Cuáles ${m1[2].toLowerCase() === 'son' ? 'son' : m1[2].toLowerCase()} ${lowerSubject(m1[1])}?`;
    else if (m2) q = `¿Cuáles son ${/^(tipos|clases|partes|ejemplos|elementos|componentes)/i.test(m2[1]) ? 'los' : 'las'} ${(m2[1] + m2[2]).toLocaleLowerCase().replace(/:$/, '')}?`;
    else if (/^h[1-3]$/.test(r.intro.type) || /:$/.test(introText)) q = listQuestion(introText);
    else continue;
    if (r.intro.type === 'p' && !/:$/.test(introText)) continue;   // un párrafo cualquiera antes de la lista no la presenta
    // Con un título genérico («Causas»), el apartado del que cuelga da el contexto
    const ctx = /^h[1-3]$/.test(r.intro.type) && m2 ? headOf.get(r.intro.id)?.slice(0, -1).at(-1) || title : '';
    const long = r.items.length >= 5;
    if (add('list', r.items[0].id, 'basic', { q: capFirst(q) + (ctx ? ` — ${ctx}` : ''), a: r.items.map(x => `- ${plainText(x.text)}`).join('\n'), n: '' }, long ? 0.45 : 0.55, long ? { group: `list|${r.items[0].id}` } : {})) r.items.forEach(x => listed.add(x.id));
    if (long) {
      // «Las funciones del hígado son:» → ¿Cuántas funciones del hígado hay?
      const items = r.items.map(x => plainText(x.text).replace(/[,;.]$/, '').replace(/^(?:y|e)\s+/i, ''));
      const np = (m1 ? m1[1] : m2 ? m2[1] + m2[2] : '').replace(ARTICLE, '').replace(/:$/, '').trim(), noun = np.split(/\s+/)[0];
      const itemNoun = vh && /^(?:el|la|los|las)\s+(\p{L}+)\s+(?:de|del)\s/iu.exec(items[0])?.[1];
      listClozes(r.items[0].id, introText.replace(/:?$/, ':'), items,
        itemNoun ? `¿${genderOf(itemNoun) === 'f' ? 'Cuántas' : 'Cuántos'} ${pluralOf(itemNoun)} ${vh[2]} ${lowerSubject(vh[1])}?`
          : np && /s$/i.test(noun) ? `¿${genderOf(noun) === 'f' ? 'Cuántas' : 'Cuántos'} ${np.charAt(0).toLocaleLowerCase() + np.slice(1)} hay${ctx ? ` — ${ctx}` : ''}?` : '');
    }
  }

  /* 4) Bloque a bloque: vocabulario, definiciones, negritas, fechas, código */
  const freq = wordFreq(blocks), pagePlain = plainText(blocks.map(b => b.text).join(' \n '));
  let lastSent = '';   // la frase de antes (para «Por eso…», «interponerlo», «este será…»)
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (/^h[1-3]$/.test(b.type)) lastSent = '';
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
      // «En 1992, el art. 13.2…; en 2011, el art. 135…; y en 2024, el art. 49…» → Une cada reforma con su año
      const pairs = [...defP.matchAll(/(?<![\p{L}])en\s+((?:1|2)\d{3}),\s+(el\s+art(?:ículo|\.)\s*\d+(?:\.\d+)?)/giu)];
      if (pairs.length >= 3) add('match', b.id, 'match', { t: `Une cada ${/s$/i.test(termP) && words(termP).length === 1 ? singular(termP) : 'artículo'} con su año`, p: pairs.map(x => `${x[2]} = ${x[1]}`).join('\n'), n: '' }, 0.55);
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
          : (pageEs && termQuestion(def.term, ctx)) || def.term.replace(/\*\*/g, '').trim();   // en otro idioma, el término tal cual
        add('def', b.id, 'basic', { q, a: capFirst(cleanAnswer(defP)), n: '' }, 0.85);
        // (las frases que siguen a la definición también pueden dar «¿Qué pasaría si…?», «Explícalo»…)
        if (pageEs) {
          const more = sentences(defP);
          more.slice(1).forEach((sp2, k) => { for (const r of plainRules(sp2, { ctx: cleanCtx(title), prev: more[k], prevSubj: subjectOfClause(more[k]), score: keyScore(sp2, freq), text: pagePlain })) add(r.kind, b.id, r.typeId, r.fields, r.score, r.extra); });
        }
        continue;
      }
    }

    // Frase a frase: concepto con verbo, negritas y fechas
    let prevSubj = '';
    for (const rawSentence of sentences(text)) {
      const s = rawSentence.replace(CALLOUT_PRE, '').trim();
      const sp = plainText(s);
      if (sp.length < 12 || sp.length > 420) continue;
      const before = lastSent;
      lastSent = sp;
      const lastSentHere = before;
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
          if (when && add('date', b.id, when.year ? 'number' : 'basic', when.year ? { q: when.q, a: when.a, t: '', u: '', n: '' } : { q: when.q, a: when.a, n: '' }, 0.68, { stmt: `${part.replace(/[.;:]+$/, '')}.` })) done.add('date');
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
      if (bolds.length && pageEs) for (const r of anyRules(sp, { prev: lastSentHere })) add(r.kind, b.id, r.typeId, r.fields, r.score, r.extra);
      // El sujeto en negrita y lo que hace: «Los **partidos políticos** expresan el pluralismo político, …» → ¿Qué expresan los partidos políticos?
      const bs = /^((?:El|La|Los|Las|Un|Una)\s+\*\*[^*]{2,50}\*\*)\s+(\p{Ll}\p{L}+(?:a|e|an|en|á|án))\s+((?:el|la|los|las)\s[^,;*]{3,60}?)(?=,|;|\.?$|\s+y\s)/u.exec(s.replace(/[.]+$/, ''));
      if (bs && pageEs && !/^(?:es|son|está|están|era|eran|fue|fueron|tiene|tienen)$/i.test(bs[2])) add('term', b.id, 'basic', { q: withArt(`¿Qué ${bs[2]} ${lowerSubject(plainText(bs[1]))}?`), a: capFirst(bs[3]), n: '' }, 0.7);
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
        if (add('def', b.id, 'basic', { q: (pageEs && termQuestion(sdef.term, ctx)) || tp, a: capFirst(plainText(sdef.def).replace(/[.]$/, '')), n: '' }, 0.8)) continue;
      }
      // Enunciados de ejercicios y frases que empiezan a medias (un trozo de otra) no dan tarjetas
      if (EXERCISE.test(sp) || /^\p{Ll}/u.test(sp) || /(?<![\p{L}])\p{Lu}{4,}\s+\p{Lu}{2,}(?![\p{L}])/u.test(sp)) continue;
      // Sin negritas: las frases clave (plazos, órganos, enumeraciones con número, quién hizo qué, para entender…)
      if (pageEs) {
        const env = { ctx: cleanCtx(title), prev: lastSentHere, prevSubj: lastSentHere ? subjectOfClause(lastSentHere) : '', score: keyScore(sp, freq), text: pagePlain };
        for (const r of plainRules(sp, env)) add(r.kind, b.id, r.typeId, r.fields, r.score, r.extra);
      }
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

  /* 4b) «¿Qué regula el artículo N?»: en un apunte por artículos, con lo que el apartado destaca */
  for (let i = 0; i < blocks.length; i++) {
    const h = blocks[i], m = /^art(?:ículo|\.)\s*(\d+)\s*[·:.–—-]\s*(.+)$/i.exec(plainText(h.text));
    if (!/^h[1-3]$/.test(h.type) || !m) continue;
    const bolds = [];
    for (let j = i + 1; j < blocks.length && !/^h[1-3]$/.test(blocks[j].type); j++) for (const x of emphasize(blocks[j].text || '').matchAll(/\*\*([^*]{2,80})\*\*/g)) bolds.push(plainText(x[1]));
    const first = blocks.slice(i + 1).find(b => !/^h[1-3]$/.test(b.type))?.id;
    if (!first || bolds.length < 2 || bolds.length > 5) continue;
    const list = bolds.length > 1 ? `${bolds.slice(0, -1).join(', ')} y ${bolds.at(-1)}` : bolds[0];
    add('art', first, 'basic', { q: `¿Qué regula el artículo ${m[1]}?`, a: `${capFirst(m[2])}: ${list}`, n: '' }, 0.6);
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
    const sq = pageEs ? termQuestion(head, ctx) : ctx ? `${head} — ${ctx}` : head;
    if (!sq) continue;
    add('section', p.id, 'basic', { q: sq, a: cleanAnswer(first).replace(/\.$/, ''), n: '' }, first.length <= 180 && (words(head).length <= 2 || norm(first).includes(norm(head))) ? 0.66 : 0.55);
  }

  // Vocabulario suelto en mazos de idiomas: líneas tipo «ev (casa)»
  if (isLangDeck) {
    for (const b of blocks) {
      if (used.has(b.id) || !['li', 'p'].includes(b.type) || out.some(s => s.blockId === b.id)) continue;
      const m = /^([^()]{1,40}?)\s*\(([^()]{1,40})\)\s*$/.exec(plainText(b.text));
      if (m && words(m[1]).length <= 3) add('vocab', b.id, 'vocab', { w: m[1].trim(), t: m[2].trim(), p: '', e: '', n: '' }, 0.75);
    }
  }

  if (pageEs) withChoices(out, add, plainText(blocks.map(b => b.text).join(' \n ')));

  // En el orden en que aparecen en los apuntes
  const pos = new Map(blocks.map((b, i) => [b.id, i]));
  const list = onePerDatum(out, pos).map((s, i) => ({ s, i })).sort((a, b) => (pos.get(a.s.blockId) ?? 0) - (pos.get(b.s.blockId) ?? 0) || (KIND_RANK[a.s.kind] ?? 1) - (KIND_RANK[b.s.kind] ?? 1) || a.i - b.i).map(({ s }) => s);
  // Marcadas de entrada: la mejor de cada dato con 0,75 o más, las de más puntuación primero, hasta MAX_PRESELECT
  const top = new Set(list.filter(s => s.score >= PRESELECT && !NEVER_PRESELECT.has(s.typeId)).sort((a, b) => b.score - a.score).slice(0, MAX_PRESELECT));
  return list.map(s => ({ ...s, selected: top.has(s), rec: top.has(s) }));
}

/* ---------------- Opción múltiple y verdadero o falso, con lo que dice el propio apunte ---------------- */
// De qué tipo es una respuesta (para buscar otras del mismo tipo: fecha con fecha, plazo con plazo, artículo con artículo…)
const ATYPES = [
  ['fecha', a => new RegExp(`^\\d{1,2}\\s+de\\s+${MONTH}(?:\\s+(?:de|del)\\s+${YEAR})?$`, 'iu').test(a)],
  ['año', a => new RegExp(`^${YEAR}$`).test(a)],
  ['plazo', a => new RegExp(`^${QTY}\\s+${TIME_UNIT}$`, 'iu').test(a)],
  ['art', a => /^art(?:ículo|\.)\s*\d+(?:\.\d+)?$/i.test(a)],
  ['ley', a => /^ley\s+(?:orgánica\s+)?\d+\/\d{4}$/i.test(a)],
  ['persona', a => words(a).length >= 2 && words(a).length <= 4 && words(a).every(w => /^\p{Lu}\p{Ll}/u.test(w) || /^(de|del|y)$/.test(w))],
  ['cifra', a => /^\d+(?:[.,]\d+)?$/.test(a)],
];
export const answerType = a => (ATYPES.find(([, t]) => t(plainText(a).trim())) || [''])[0];
// Una alternativa de opción múltiple por dato (con 2 o 3 incorrectas del mismo tipo sacadas de otras sugerencias del
// apunte; si no hay 2, ninguna) y un verdadero o falso con una de ellas en su sitio. text: el apunte entero, sin formato
function withChoices(out, add, text) {
  const base = out.filter(s => !['listitem', 'match', 'sort', 'steps', 'mc', 'tf', 'why', 'diff', 'whatif'].includes(s.kind) && ['basic', 'number', 'cloze'].includes(s.typeId)
    && (s.typeId !== 'cloze' || (String(s.fields.x).match(/\{\{/g) || []).length === 1));
  const typed = base.map(s => ({ s, a: plainText(answerOf(s)).trim().replace(/[.]$/, '') })).map(x => ({ ...x, t: x.s.atype || answerType(x.a) })).filter(x => x.t);
  const done = new Set();
  for (const { s, a, t } of typed) {
    const key = `${s.blockId}|${answerCore(a)}`;
    if (done.has(key)) continue;
    // (para un año, también los años de las fechas completas del apunte)
    const cands = typed.filter(o => o.t === t).map(o => o.a).concat(t === 'año' ? typed.filter(o => o.t === 'fecha').map(o => (new RegExp(YEAR).exec(o.a) || [])[0]).filter(Boolean) : []);
    const pool = [...new Map(cands.filter(o => answerCore(o) !== answerCore(a)).map(o => [answerCore(o), o])).values()];
    if (!pool.length) continue;
    done.add(key);
    const link = `b|${s.blockId}|${answerCore(a)}`, same = w => (/^\p{Lu}/u.test(a) ? capFirst(w) : w.charAt(0).toLocaleLowerCase() + w.slice(1));
    if (pool.length >= 2) {
      const wrong = pool.slice(0, 3).map(same).join('; ');
      if (s.typeId === 'cloze') add('mc', s.blockId, 'clozechoice', { x: s.fields.x, w: wrong, e: '' }, s.score - 0.08, { link, atype: t });
      else add('mc', s.blockId, 'choice', { q: s.fields.q, a: capFirst(a), w: pool.slice(0, 3).map(capFirst).join('; '), n: '' }, s.score - 0.08, { link, atype: t });
    }
    // Verdadero o falso: la frase con otra respuesta del mismo tipo en su sitio (la explicación dice cuál es la buena)
    const stmt = s.typeId === 'cloze' ? plainText(s.fields.x) : s.stmt;
    if (stmt && plainText(stmt).includes(a)) {
      const wrongStmt = plainText(stmt).replace(a, same(pool[0]));
      add('tf', s.blockId, 'truefalse', { s: wrongStmt, v: 'F', n: `Falso: ${plainText(stmt)}` }, s.score - 0.1, { link });
    }
  }
  // Una palabra cambiada por su pareja del apunte («procariotas» por «eucariotas»), en los huecos de las frases clave
  const vocab = [...new Set(text.match(/\p{L}{7,}/gu) || [])];
  for (const s of out.filter(x => x.kind === 'key')) {
    const sent = plainText(s.fields.x);
    for (const w of sent.match(/\p{L}{7,}/gu) || []) {
      const end = w.slice(-6).toLocaleLowerCase(), lw = w.toLocaleLowerCase();
      const twin = vocab.find(o => { const lo = o.toLocaleLowerCase(); return lo.endsWith(end) && lo !== lw && lo.slice(0, 3) !== lw.slice(0, 3); });
      if (!twin) continue;
      add('tf', s.blockId, 'truefalse', { s: sent.replace(w, twin.toLocaleLowerCase() === twin ? twin : twin.toLocaleLowerCase()), v: 'F', n: `Falso: ${sent}` }, 0.6, { link: `b|${s.blockId}|${answerCore(answerOf(s))}` });
      break;
    }
  }
}

/* ---------------- Una sugerencia por dato ---------------- */
// Un hueco que tapa el sujeto (en las dos primeras palabras de la frase): «La {{soberanía nacional}} reside en…»
const subjectHole = s => s.typeId === 'cloze' && s.kind !== 'listitem' && /^\s*(?:[^\s{]+\s+)?\{\{/.test(String(s.fields?.x || ''));
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
    // («¿Qué artículo establece…?» pregunta otro dato, el número del artículo: va aparte)
    if (s.src && s.kind !== 'listitem' && s.kind !== 'art') keys.push(`s|${s.blockId}|${s.src.slice(0, 40)}`);
    if (s.group) keys.push(`g|${s.group}`);
    if (s.link) keys.push(s.link);
    if (core.split(' ').length >= 2 && !/^[\d\s]+$/.test(core) && !['art', 'match', 'sort', 'steps', 'listitem'].includes(s.kind)) keys.push(`a|${core}`);
    for (const k of keys) { if (owner.has(k)) parent[find(i)] = find(owner.get(k)); else owner.set(k, i); }
  });
  const groups = new Map();
  list.forEach((s, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(s); });
  return [...groups.values()].map(g => {
    // (y en una misma frase, antes el hueco en lo que se dice del sujeto que el que tapa el sujeto: «La soberanía nacional
    // reside en el […]» antes que «La […] reside en el pueblo español»)
    const first = Math.min(...g.map(s => pos.get(s.blockId) ?? 0)), at = s => ((pos.get(s.blockId) ?? 0) === first ? 0 : 1);
    // (la opción múltiple y el verdadero o falso de un dato son otras formas de preguntarlo, nunca la que se enseña)
    const rank = s => s.score - (subjectHole(s) ? 0.1 : 0) - (s.kind === 'mc' || s.kind === 'tf' ? 0.5 : 0);
    const [best, ...rest] = [...g].sort((a, b) => at(a) - at(b) || rank(b) - rank(a) || list.indexOf(a) - list.indexOf(b));
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
  if (lists.length >= 6 && !lists.some(b => b.indent)) tips.push({ id: 'indent', text: 'Usa la sangría (Tab) para los subpuntos: «Núcleo» con «ADN» y «Nucléolo» debajo da la pregunta «¿Qué incluye el núcleo?».' });
  return tips;
}
