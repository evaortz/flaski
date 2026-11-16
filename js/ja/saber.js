// Japonés · lo que sabes: las palabras de tus listas de japonés (con su estado) y el paso de cada kanji.
// Todo lo demás pregunta aquí: el furigana selectivo, los kanji que hay que crear, el modo lectura…
import { S } from '../comun.js';
import { BUILTIN_TYPES, resolveType, baseLang } from '../cardtypes.js';
import { isJa, isKanji, isKana, plainJa, reading, hira, kanjiIn, RUBY } from './texto.js';

// Días de intervalo para dar un paso por superado (y una palabra por dominada)
export const STEP_DAYS = 3, KNOWN_DAYS = 7;
export const KANJI_TYPE = 'ja-kanji', KANA_TYPE = 'ja-kana', VERB_TYPE = 'ja-verbo';
const AUTO = new Set([KANJI_TYPE, KANA_TYPE, VERB_TYPE]);

const typeOf = id => BUILTIN_TYPES.find(t => t.id === id) || S.types.get(id) || null;
export const isJaDeck = d => !!d && !d.archived && baseLang(d.options?.lang) === 'ja';
export const hasJapanese = () => [...S.decks.values()].some(isJaDeck);

// El campo «palabra» de una pregunta de japonés: el primero en japonés que es corto (una palabra, no una frase)
function wordField(c) {
  if (AUTO.has(c.type_id) || !c.fields) return null;
  const d = S.decks.get(c.deck_id), t = typeOf(c.type_id);
  if (!t || !isJaDeck(d)) return null;
  const rt = resolveType(t, { study: d.options.lang, native: 'es-ES' });
  for (const f of rt.fields) {
    if (baseLang(f.lang) !== 'ja') continue;
    const raw = String(c.fields[f.id] || ''), w = plainJa(raw);
    if (!w || [...w].length > 12 || /[\s。、！？!?.,]/.test(w) || ![...w].some(isJa)) continue;
    return { raw, word: w, reading: raw.match(RUBY) ? hira(plainJa(reading(raw))) : [...w].every(isKana) ? hira(w) : '' };
  }
  return null;
}
const stateOf = p => (!p ? 'new' : (p.interval || 0) >= KNOWN_DAYS ? 'known' : 'learning');
const RANK = { new: 0, learning: 1, known: 2 };

let cache = null, cacheKey = '';
const key = () => `${S.cards.size}|${S.progress.size}|${S.events.length}|${S.events.at(-1)?.t || 0}|${S.decks.size}`;
function build() {
  if (cache && cacheKey === key()) return cache;
  const words = new Map(), kanji = new Map(), steps = new Map(), cardWord = new Map();
  for (const c of S.cards.values()) {
    if (c.type_id === KANJI_TYPE) {
      const k = c.fields?.k;
      if (!k) continue;
      const st = steps.get(k) || { cards: {}, step: 0 };
      st.cards[c.template] = c;
      steps.set(k, st);
      continue;
    }
    const w = wordField(c);
    if (!w) continue;
    cardWord.set(c.id, w.word);
    const p = S.progress.get(c.id), st = stateOf(p);
    const cur = words.get(w.word);
    if (!cur) words.set(w.word, { word: w.word, raw: w.raw, reading: w.reading, state: st, cards: [c.id], deck: c.deck_id });
    else { cur.cards.push(c.id); if (RANK[st] > RANK[cur.state]) cur.state = st; if (!cur.reading && w.reading) { cur.reading = w.reading; cur.raw = w.raw; } }
  }
  for (const w of words.values()) for (const k of kanjiIn(w.word)) {
    if (!kanji.has(k)) kanji.set(k, []);
    kanji.get(k).push(w.word);
  }
  // El paso de cada kanji: los pasos superados seguidos (1 qué significa, 2 cómo se lee, 3 cómo se escribe)
  for (const st of steps.values()) {
    let n = 0;
    for (const t of ['t1', 't2', 't3']) { const c = st.cards[t], p = c && S.progress.get(c.id); if (p && (p.interval || 0) >= STEP_DAYS) n++; else break; }
    st.step = n;
  }
  cache = { words, kanji, steps, cardWord }; cacheKey = key();
  return cache;
}
// Map palabra → { word, raw, reading, state, cards, deck }
export const jaWords = () => build().words;
// La palabra de una pregunta de japonés (o undefined)
export const wordOfCard = c => build().cardWord.get(c.id);
// Map kanji → [palabras tuyas que lo llevan]
export const jaKanjiWords = () => build().kanji;
// El paso de un kanji (0–3) y sus preguntas
export const kanjiStep = k => build().steps.get(k)?.step || 0;
export const kanjiCards = k => build().steps.get(k)?.cards || {};
export const hasKanjiCards = k => build().steps.has(k);
// ¿Te sabes leer este kanji? (para el furigana selectivo): paso 2 superado
export const readsKanji = k => kanjiStep(k) >= 2;
// El estado de una palabra: 'known' | 'learning' | 'new' (en tus listas pero sin ver) | '' (no está en tus listas)
export function wordState(w) {
  const x = jaWords().get(w);
  if (x) return x.state;
  return (S.prefs.ja?.sabidas || []).includes(w) ? 'known' : '';
}
// ¿Hay que poner furigana encima de este grupo de kanji? (con «Lo que no sé»)
export const needsRuby = base => [...base].filter(isKanji).some(k => !readsKanji(k));
