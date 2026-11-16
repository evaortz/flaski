// Japonés · lo puro de «leer japonés de verdad»: la palabra con su furigana y los subtítulos (.srt o .vtt)
import { isKanji, isKana, hira } from './texto.js';

// La palabra (en su forma de diccionario) con furigana en sus kanji: 走[はし]る
export function rubyWord(w, r) {
  r = hira(r || '');
  if (!r || ![...w].some(isKanji)) return w;
  const ch = [...w];
  let k = ch.length;
  while (k > 0 && isKana(ch[k - 1])) k--;
  const head = ch.slice(0, k).join(''), tail = ch.slice(k).join('');
  if ([...head].every(isKanji) && r.endsWith(hira(tail))) return `${head}[${r.slice(0, r.length - [...tail].length)}]${tail}`;
  return [...w].every(isKanji) ? `${w}[${r}]` : w;
}
// [{ at: segundos, time: '02:14', text }] de un .srt o .vtt
export function parseSubs(src) {
  const out = [];
  for (const block of String(src || '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const ls = block.split('\n').map(l => l.trim()).filter(Boolean);
    const i = ls.findIndex(l => /-->/.test(l));
    if (i < 0) continue;
    const m = /(\d+):(\d{2}):(\d{2})|(\d{1,2}):(\d{2})[.,]/.exec(ls[i]);
    const at = m ? (m[1] ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[4] * 60 + +m[5]) : 0;
    const text = ls.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '').trim();
    if (text) out.push({ at, time: `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`, text });
  }
  return out;
}
// Empareja cada frase en japonés con la de español más cercana en el tiempo (como mucho 2 s de diferencia)
export function pairSubs(ja, es) {
  return ja.map(l => {
    const best = es.reduce((b, x) => (Math.abs(x.at - l.at) < Math.abs((b?.at ?? Infinity) - l.at) ? x : b), null);
    return { ...l, es: best && Math.abs(best.at - l.at) <= 2 ? best.text : '' };
  });
}
