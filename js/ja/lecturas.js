// Japonés · reparte la lectura de una palabra entre sus caracteres: 図書館 + としょかん → 図 と · 書 しょ · 館 かん.
// Usa las lecturas de cada kanji (kanji.json) con los cambios de sonido habituales: sonoras al unirse (か → が),
// la っ al final (いち → いっ), y 々 repite el kanji de antes. Algunas palabras se leen enteras sin repartir (今日).
import { isKanji, hira } from './texto.js';

// Lecturas especiales: la palabra entera, sin repartir entre sus kanji
export const SPECIAL = {
  今日: 'きょう', 明日: 'あした', 昨日: 'きのう', 大人: 'おとな', 一人: 'ひとり', 二人: 'ふたり', 今年: 'ことし', 時計: 'とけい',
  眼鏡: 'めがね', 上手: 'じょうず', 下手: 'へた', 部屋: 'へや', 果物: 'くだもの', 二十歳: 'はたち', 今朝: 'けさ', 一日: 'ついたち',
  二日: 'ふつか', 三日: 'みっか', 四日: 'よっか', 五日: 'いつか', 六日: 'むいか', 七日: 'なのか', 八日: 'ようか', 九日: 'ここのか',
  十日: 'とおか', 二十日: 'はつか', 七夕: 'たなばた', 浴衣: 'ゆかた', 土産: 'みやげ', 景色: 'けしき', 真面目: 'まじめ', 博士: 'はかせ',
  一昨日: 'おととい', 明後日: 'あさって', 今晩: 'こんばん', 為替: 'かわせ', 清水: 'しみず', 日本: 'にほん', 何人: 'なんにん',
};
const VOICED = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ', た: 'だ', ち: 'じ', つ: 'ず', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ' };
const HALF = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ' };

// Las lecturas de un kanji, en hiragana: on y la parte kun que va en kanji (やす.む → やす)
export function readingsOf(info) {
  if (!info) return [];
  const out = new Set();
  for (const r of info.on || []) out.add(hira(r).replace(/-/g, ''));
  for (const r of info.kun || []) out.add(r.split('.')[0].replace(/-/g, ''));
  out.delete('');
  return [...out];
}
// Con los cambios de sonido: [lectura, puntos]
function variants(r) {
  const out = [[r, 3]], first = r[0], last = r.at(-1);
  if (VOICED[first]) out.push([VOICED[first] + r.slice(1), 2]);
  if (HALF[first]) out.push([HALF[first] + r.slice(1), 2]);
  if (r.length >= 2 && 'つくちきふ'.includes(last)) {
    out.push([r.slice(0, -1) + 'っ', 2]);
    if (VOICED[first]) out.push([VOICED[first] + r.slice(1, -1) + 'っ', 1]);
    if (HALF[first]) out.push([HALF[first] + r.slice(1, -1) + 'っ', 1]);
  }
  return out;
}

// [{ c, r }] (c: carácter o palabra especial; r: su lectura en hiragana) y guess: true si algún kanji se ha
// repartido a ciegas; null si la lectura no encaja con la palabra
export function splitReading(word, reading, K) {
  word = String(word || ''); reading = hira(String(reading || ''));
  if (!word || !reading) return null;
  if (SPECIAL[word] && SPECIAL[word] === reading) return { parts: [{ c: word, r: reading, special: true }], guess: false };
  const chars = [...word], R = [...reading], n = chars.length, m = R.length;
  // best[i][j]: mejor reparto de los i primeros caracteres con los j primeros sonidos
  const best = Array.from({ length: n + 1 }, () => new Map());
  best[0].set(0, { score: 0, parts: [], guess: false });
  for (let i = 0; i < n; i++) {
    const c = chars[i];
    for (const [j, st] of best[i]) {
      const put = (len, score, guess) => {
        if (j + len > m) return;
        const k = j + len, s = st.score + score, cur = best[i + 1].get(k);
        if (!cur || s > cur.score) best[i + 1].set(k, { score: s, parts: [...st.parts, { c, r: R.slice(j, k).join('') }], guess: st.guess || guess });
      };
      if (!isKanji(c)) {
        // Kana (y signos): tiene que coincidir; ー vale por la vocal que alarga
        const h = hira(c);
        if (R[j] === h || (c === 'ー' && j < m)) put(1, 1, false);
        continue;
      }
      const cands = c === '々' && st.parts.length ? variants(st.parts.at(-1).r) : readingsOf(K?.[c]).flatMap(variants);
      let any = false;
      for (const [r, score] of cands) {
        if (R.slice(j, j + [...r].length).join('') === r) { put([...r].length, score, false); any = true; }
      }
      // Sin ninguna lectura que encaje: de 1 a 4 sonidos, a ciegas (solo si no hay nada mejor)
      if (!any) for (let len = 1; len <= 4; len++) put(len, -4, true);
    }
  }
  const end = best[n].get(m);
  return end ? { parts: end.parts, guess: end.guess } : null;
}
// La lectura de un kanji dentro de una palabra (o null si no se sabe)
export function readingIn(word, reading, kanji, K) {
  const s = splitReading(word, reading, K);
  if (!s || s.guess) return null;
  const p = s.parts.find(p => p.c === kanji);
  return p ? p.r : null;
}
// ¿Es lectura on (china) o kun (japonesa) dentro de esta palabra? 'on' | 'kun' | ''
export function readingKind(r, info) {
  if (!info || !r) return '';
  const on = (info.on || []).map(x => hira(x)), kun = (info.kun || []).map(x => x.split('.')[0].replace(/-/g, ''));
  const strip = x => x.replace(/っ$/, '');
  const match = (list, v) => list.some(x => x === v || variants(x).some(([y]) => y === v || strip(y) === strip(v)));
  if (match(on, r)) return 'on';
  if (match(kun, r)) return 'kun';
  return '';
}
