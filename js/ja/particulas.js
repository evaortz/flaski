// Japonés · las partículas: dónde están en una frase y qué hace cada una (textos fijos para la hoja de la partícula)
import { isKanji, isKata, isHira } from './texto.js';

// id, color (el de las pantallas) y explicación
export const PARTICLES = {
  は: { color: 'coral', es: 'de qué se habla', more: 'Marca el tema de la frase: «en cuanto a…».', twin: 'が', diff: 'は presenta el tema; が señala quién o qué hace algo, a menudo lo nuevo.' },
  が: { color: 'coral', es: 'quién o qué', more: 'Señala quién hace algo o de qué se dice algo.', twin: 'は', diff: 'が señala quién lo hace; は presenta el tema del que se habla.' },
  を: { color: 'green', es: 'sobre qué', more: 'Va detrás de lo que recibe la acción: qué comes, qué lees.', twin: '', diff: '' },
  に: { color: 'blue', es: 'a dónde o cuándo', more: 'El destino (vas a un sitio), el momento (a las tres) o dónde está algo.', twin: 'で', diff: 'に: vas hacia allí o algo está allí. で: haces algo allí.' },
  で: { color: 'yellow', es: 'en (un sitio) o con qué', more: 'Va detrás del sitio donde haces algo, o de con qué lo haces (en tren, con palillos).', twin: 'に', diff: 'で: haces algo allí. に: vas hacia allí o algo está allí.' },
  へ: { color: 'blue', es: 'hacia', more: 'La dirección a la que vas. Se lee «e».', twin: 'に', diff: 'へ es «hacia» (la dirección); に es el sitio al que llegas.' },
  と: { color: 'coral', es: 'con, y', more: 'Con quién haces algo, o une dos cosas: «A y B».', twin: 'や', diff: 'と: la lista completa. や: algunos ejemplos («entre otras cosas»).' },
  も: { color: 'coral', es: 'también', more: 'Sustituye a は o が y añade «también» (o «tampoco» en negativa).', twin: '', diff: '' },
  の: { color: 'gray', es: 'de', more: 'Une dos palabras: «el libro de…», «la estación de…».', twin: '', diff: '' },
  や: { color: 'gray', es: 'y (entre otros)', more: 'Une algunos ejemplos de una lista.', twin: 'と', diff: 'や: solo algunos ejemplos. と: la lista completa.' },
  から: { color: 'blue', es: 'desde, porque', more: 'Desde dónde o desde cuándo; detrás de una frase, «porque».', twin: 'まで', diff: 'から: desde. まで: hasta.' },
  まで: { color: 'blue', es: 'hasta', more: 'Hasta dónde o hasta cuándo.', twin: 'から', diff: 'まで: hasta. から: desde.' },
  か: { color: 'gray', es: 'pregunta', more: 'Al final, convierte la frase en pregunta.', twin: '', diff: '' },
  ね: { color: 'gray', es: '¿verdad?', more: 'Al final, busca que el otro esté de acuerdo.', twin: 'よ', diff: 'ね busca acuerdo; よ informa de algo que el otro no sabe.' },
  よ: { color: 'gray', es: '¡ojo!, te digo', more: 'Al final, avisa de algo que el otro no sabe.', twin: 'ね', diff: 'よ informa; ね busca acuerdo.' },
};
const ONE = new Set(['は', 'が', 'を', 'に', 'で', 'へ', 'と', 'も', 'の', 'や', 'か', 'ね', 'よ']);
const TWO = new Set(['から', 'まで']);
const nounEnd = c => isKanji(c) || isKata(c) || c === 'ー' || /[）)」』0-9０-９]/.test(c);

// Con las palabras ya cortadas (palabras.js): las que el diccionario dice que son partículas
export function particlesInTokens(tokens) {
  const out = [];
  let pos = 0;
  for (const t of tokens) {
    const len = [...t.s].length;
    if (t.kind === 'word' && (ONE.has(t.s) || TWO.has(t.s)) && t.entries.some(e => e.p.includes('prt'))) out.push({ at: pos, p: t.s });
    pos += len;
  }
  return out;
}
// Sin diccionario: solo las seguras (を siempre; las demás detrás de kanji o katakana y antes de algo que no siga la palabra)
export function particlesByRule(text) {
  const ch = [...String(text || '')], out = [];
  for (let i = 1; i < ch.length; i++) {
    const two = ch[i] + (ch[i + 1] || '');
    if (TWO.has(two) && nounEnd(ch[i - 1])) { out.push({ at: i, p: two }); i++; continue; }
    const c = ch[i];
    if (!ONE.has(c)) continue;
    if (c === 'を') { out.push({ at: i, p: c }); continue; }
    if (c === 'の' && !nounEnd(ch[i - 1])) continue;
    const next = ch[i + 1] || '';
    // Detrás de un nombre (kanji o katakana) y antes de otra palabra o del final
    if (nounEnd(ch[i - 1]) && (!next || !isHira(next) || 'はがをにでへともの'.includes(next) || ['ね', 'よ', 'か'].includes(c))) out.push({ at: i, p: c });
  }
  return out;
}
