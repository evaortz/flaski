// Japonés · lo básico del texto: qué es kanji y qué es kana, katakana → hiragana y el furigana de Flaski
// (漢字[かんじ], el mismo que pinta inline.js). Sin dependencias: lo usan el resto de módulos de js/ja/.

export const isKanji = c => /[㐀-䶿一-鿿豈-﫿々〆ヶ]/.test(c);
export const isHira = c => c >= 'ぁ' && c <= 'ゟ';
export const isKata = c => (c >= '゠' && c <= 'ヿ') || c === 'ー';
export const isKana = c => isHira(c) || isKata(c);
export const isJa = c => isKanji(c) || isKana(c);
// ¿Lleva japonés? (al menos n caracteres)
export const jaCount = s => [...String(s || '')].filter(isJa).length;

// Katakana → hiragana (la ー se queda)
export const hira = s => [...String(s || '')].map(c => (c >= 'ァ' && c <= 'ヶ' ? String.fromCharCode(c.charCodeAt(0) - 0x60) : c)).join('');
// Hiragana → katakana
export const kata = s => [...String(s || '')].map(c => (c >= 'ぁ' && c <= 'ゖ' ? String.fromCharCode(c.charCodeAt(0) + 0x60) : c)).join('');

export const RUBY = /([㐀-䶿一-鿿豈-﫿々〆ヶ]+)\[([^\]\n]+)\]/g;
// El texto sin furigana (solo el kanji) y solo con la lectura
export const base = s => String(s ?? '').replace(RUBY, '$1');
export const reading = s => String(s ?? '').replace(RUBY, '$2');
// Trozos: [{ text }] y [{ text, rt }] para los kanji con lectura
export function rubyParts(s) {
  const out = [], src = String(s ?? '');
  let last = 0;
  for (const m of src.matchAll(RUBY)) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) });
    out.push({ text: m[1], rt: m[2] });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}
// Los kanji distintos de un texto, en orden
export const kanjiIn = s => [...new Set([...base(s)].filter(isKanji))];
// Sin marcas de formato (**, *, ==, enlaces…) ni furigana: para comparar palabras
export const plainJa = s => base(String(s ?? '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_=~`]/g, '').replace(/<[^>]+>/g, '')).trim();
