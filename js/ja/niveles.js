// Japonés · los niveles del JLPT (sin dependencias de la interfaz): qué entra en el N5 y en el N4 y qué sabes de ello.
// Las palabras son las listas de Jonathan Waller (data/ja/jlpt.json, CC BY); los kanji, el nivel del JLPT anterior a
// 2010 que trae KANJIDIC2 (4 → N5, 3 → N4). El JLPT no publica listas desde 2010: son orientativas.
//
// «Lo sabes» es estricto: lo recordarías dentro de KNOW_DAYS días (la estabilidad de su memoria llega), no basta con
// haberlo visto. Lo que está en tus listas pero aún no llega es «aprendiéndolo»; lo que no está, «te falta».

export const LEVELS = [{ id: 'n5', name: 'N5', old: 4 }, { id: 'n4', name: 'N4', old: 3 }];
export const KNOW_DAYS = 21;

let dataP = null;
export function jlptData() {
  if (!dataP) dataP = fetch('data/ja/jlpt.json').then(r => (r.ok ? r.json() : null)).catch(() => { dataP = null; return null; });
  return dataP;
}
export function _resetJlpt() { dataP = null; }

// Los kanji de un nivel, en el orden de los datos
export const levelKanji = (kanji, id) => {
  const old = LEVELS.find(l => l.id === id)?.old;
  return Object.keys(kanji || {}).filter(k => kanji[k].j === old);
};

// mine.words: Map palabra → { known: bool, inLists: bool } (las tuyas, con la forma en kanji o solo en kana)
// mine.kanji: Map kanji → { known: bool, inLists: bool }
// list: [[kanji, kana, es]], kanji: ['日', …]
export function classify(list, kanji, mine) {
  const words = list.map(([k, kana, es]) => {
    const m = (k && mine.words.get(k)) || mine.words.get(kana);
    return { k, kana, es, state: m?.known ? 'known' : m ? 'learning' : 'missing' };
  });
  const ks = kanji.map(k => {
    const m = mine.kanji.get(k);
    return { k, state: m?.known ? 'known' : m ? 'learning' : 'missing' };
  });
  const count = (xs, s) => xs.filter(x => x.state === s).length;
  const part = xs => ({ total: xs.length, known: count(xs, 'known'), learning: count(xs, 'learning'), missing: count(xs, 'missing') });
  const w = part(words), kj = part(ks), all = w.total + kj.total;
  return { words, kanji: ks, w, kj, pct: all ? Math.round(100 * (w.known + kj.known) / all) : 0 };
}

// Lo que sabes de tus palabras y kanji. words: Map palabra → { stab (la mayor de sus preguntas), seen }.
// kanjiSteps: Map kanji → { s1, s2 } (estabilidad de «qué significa» y «cómo se lee»), kanjiInWords: Map kanji → [palabras]
// sabidas: palabras marcadas como «Ya me la sé»
export function mineFrom({ words, kanjiSteps, kanjiInWords, sabidas = [] }, days = KNOW_DAYS) {
  const W = new Map();
  for (const [w, x] of words) W.set(w, { known: (x.stab || 0) >= days, inLists: true });
  for (const w of sabidas) W.set(w, { known: true, inLists: true });
  const K = new Map();
  for (const [k, ws] of kanjiInWords) K.set(k, { known: ws.some(w => W.get(w)?.known), inLists: true });
  // Con su pregunta de kanji manda la pregunta: significado y lectura, los dos bien asentados
  for (const [k, st] of kanjiSteps) K.set(k, { known: (st.s1 || 0) >= days && (st.s2 || 0) >= days, inLists: true });
  return { words: W, kanji: K };
}
