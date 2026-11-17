// Japonés · las trampas del examen (sin dependencias de la interfaz): para «¿cómo se lee?», lecturas que se parecen a
// la buena como en el JLPT (la vocal larga, la っ, el ゛ y la ゃゅょ pequeña), y para «¿qué kanji es?», la misma palabra
// con un kanji que se le parece (comparten piezas). Siempre las mismas para la misma palabra.

const DAKU = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ', た: 'だ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ' };
const UNDAKU = Object.fromEntries(Object.entries(DAKU).map(([a, b]) => [b, a]));
const SMALL = { ゃ: 'や', ゅ: 'ゆ', ょ: 'よ' }, BIG = { や: 'ゃ', ゆ: 'ゅ', よ: 'ょ' };
const O_ROW = 'おこごそぞとどのほぼぽもよろょ', U_ROW = 'うくぐすずつづぬふぶぷむゆるゅ', E_ROW = 'えけげせぜてでねへべぺめれ';
// La vocal que se confunde (あ↔お, い↔え, う↔お) dentro de la misma fila: か→こ, し→せ…
const ROWS = ['あいうえお', 'かきくけこ', 'がぎぐげご', 'さしすせそ', 'ざじずぜぞ', 'たちつてと', 'だぢづでど', 'なにぬねの', 'はひふへほ', 'ばびぶべぼ', 'まみむめも', 'らりるれろ'];
const SWAP = [4, 3, 4, 1, 0];   // a→o, i→e, u→o, e→i, o→a
const SWAP2 = [3, 2, 1, 4, 2];  // y si hace falta otra: a→e, i→u, u→i, e→o, o→u
const vowelSwap = (c, t = SWAP) => { for (const r of ROWS) { const i = r.indexOf(c); if (i >= 0) return r[t[i]]; } return ''; };
// Un número fijo a partir de un texto (para que las trampas no cambien de una vez a otra)
const hash = s => [...s].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7);

// Las lecturas parecidas a `r` (hiragana): hasta n, distintas de la buena y entre sí
export function readingTraps(r, n = 3) {
  const ch = [...r], out = new Set();
  const put = arr => { const s = arr.join(''); if (s && s !== r) out.add(s); };
  ch.forEach((c, i) => {
    const next = ch[i + 1];
    // La vocal larga: quitarla (しゅう → しゅ, こう → こ) o ponerla donde no va (しゅ → しゅう, こ → こう)
    if ((c === 'う' && i > 0 && (O_ROW + U_ROW).includes(ch[i - 1])) || (c === 'い' && i > 0 && E_ROW.includes(ch[i - 1]))) put([...ch.slice(0, i), ...ch.slice(i + 1)]);
    // (ponerla: detrás de una sílaba en o, de ゅ o de ょ, nunca al final ni delante de ん: かくう o ぶうん no engañan a nadie)
    else if ((O_ROW.includes(c) || c === 'ゅ' || c === 'ょ') && next && next !== 'う' && next !== 'っ' && next !== 'ん') put([...ch.slice(0, i + 1), 'う', ...ch.slice(i + 1)]);
    // La っ: quitarla (がっこう → がこう) o ponerla delante de k, s, t, p
    if (c === 'っ') put([...ch.slice(0, i), ...ch.slice(i + 1)]);
    else if (i > 0 && i < ch.length && /[かきくけこさしすせそたちつてとぱぴぷぺぽ]/.test(c) && ch[i - 1] !== 'っ' && ch[i - 1] !== 'ん') put([...ch.slice(0, i), 'っ', ...ch.slice(i)]);
    // El ゛: ponerlo o quitarlo
    if (DAKU[c]) put([...ch.slice(0, i), DAKU[c], ...ch.slice(i + 1)]);
    else if (UNDAKU[c]) put([...ch.slice(0, i), UNDAKU[c], ...ch.slice(i + 1)]);
    // ゃゅょ pequeña o grande
    if (SMALL[c]) put([...ch.slice(0, i), SMALL[c], ...ch.slice(i + 1)]);
    else if (BIG[c] && i > 0 && /[きしちにひみりぎじびぴ]/.test(ch[i - 1])) put([...ch.slice(0, i), BIG[c], ...ch.slice(i + 1)]);
  });
  // Si aún faltan (palabras cortas): una vocal cambiada, de la primera sílaba a la última
  const mix = xs => xs.sort((a, b) => (hash(r + a) % 997) - (hash(r + b) % 997));
  const classic = mix([...out]);
  // Si faltan (palabras cortas): una vocal cambiada, nunca delante de ゃゅょ (らいせゅう no existe)
  const extra = [];
  for (const t of [SWAP, SWAP2]) ch.forEach((c, i) => {
    const v = vowelSwap(c, t), s = v && !SMALL[ch[i + 1]] ? [...ch.slice(0, i), v, ...ch.slice(i + 1)].join('') : '';
    if (s && s !== r && !out.has(s) && !extra.includes(s)) extra.push(s);
  });
  return [...classic, ...mix(extra)].slice(0, n);
}

// Los kanji que se parecen a k: comparten piezas, son del mismo nivel o del siguiente y tienen un número de trazos
// parecido. K: los datos de kanji ({ 休: { p, s, j } })
export function lookalikes(k, K, n = 6) {
  const a = K[k];
  if (!a?.p?.length) return [];
  const mine = new Set(a.p);
  return Object.keys(K).filter(x => x !== k && K[x].j >= 3 && K[x].p?.some(p => mine.has(p)) && Math.abs((K[x].s || 0) - (a.s || 0)) <= 3)
    .map(x => [x, K[x].p.filter(p => mine.has(p)).length - Math.abs((K[x].s || 0) - (a.s || 0)) / 10 - (K[x].j === 4 ? 0 : 0.3)])
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, n).map(x => x[0]);
}

// La palabra con un kanji cambiado por uno que se le parece: hasta n, distintas
export function kanjiTraps(word, K, n = 3) {
  const ch = [...word], out = [];
  const idx = ch.map((c, i) => (K[c] ? i : -1)).filter(i => i >= 0);
  for (let round = 0; out.length < n && round < 6; round++) {
    for (const i of idx) {
      const alt = lookalikes(ch[i], K)[round];
      if (!alt) continue;
      const w = [...ch.slice(0, i), alt, ...ch.slice(i + 1)].join('');
      if (w !== word && !out.includes(w)) out.push(w);
      if (out.length === n) break;
    }
  }
  return out;
}
