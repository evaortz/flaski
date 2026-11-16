// Japonés en la tanda: los kanji como sistema. Cada kanji de tus palabras tiene una pregunta con tres pasos
// (qué significa, cómo se lee, cómo se escribe); cada paso espera al anterior y el kanji nuevo se presenta justo antes
// de la primera palabra que lo usa. Las preguntas de kanji las crea Flaski en la lista automática «Kanji».
import * as api from '../api.js';
import { S, esc, fmt } from '../comun.js';
import { BUILTIN_TYPES, summarize } from '../cardtypes.js';
import { loadKanji, kanjiInfo } from '../ja/datos.js';
import { kanjiIn, kata } from '../ja/texto.js';
import { readingIn, readingKind, readingsOf } from '../ja/lecturas.js';
import { jaWords, jaKanjiWords, kanjiStep, kanjiCards, hasKanjiCards, hasJapanese, wordOfCard, STEP_DAYS, KANJI_TYPE } from '../ja/saber.js';

// Nombres de las piezas más frecuentes (las demás se enseñan sin nombre)
export const PIECES = {
  亻: 'persona', 人: 'persona', 𠆢: 'tejado', 木: 'árbol', 日: 'sol, día', 月: 'luna', 口: 'boca', 一: 'uno', 二: 'dos', 十: 'diez', 大: 'grande', 小: 'pequeño',
  氵: 'agua', 水: 'agua', 火: 'fuego', 灬: 'fuego', 土: 'tierra', 女: 'mujer', 子: 'niño', 心: 'corazón', 忄: 'corazón', 手: 'mano', 扌: 'mano',
  言: 'decir', 糸: 'hilo', 金: 'metal', 門: 'puerta', 田: 'arrozal', 力: 'fuerza', 目: 'ojo', 耳: 'oreja', 足: 'pie', 山: 'montaña', 川: 'río',
  雨: 'lluvia', 刂: 'cuchillo', 刀: 'cuchillo', 宀: 'techo', 艹: 'hierba', 竹: 'bambú', 車: 'coche', 貝: 'concha, dinero', 食: 'comer', 馬: 'caballo',
  魚: 'pez', 鳥: 'pájaro', 犭: 'animal', 礻: 'altar', 衤: 'ropa', 辶: 'camino', 阝: 'colina', 疒: 'enfermedad', 囗: 'recinto', 广: 'casa', 尸: 'cuerpo',
  立: 'de pie', 白: 'blanco', 石: 'piedra', 米: 'arroz', 王: 'rey', 寸: 'medida', 止: 'parar', 夕: 'tarde', 文: 'escritura', 方: 'dirección', 本: 'libro',
  丷: 'cuernos', 冂: 'marco', 亠: 'tapa', 儿: 'piernas', 斗: 'cazo', ノ: 'barrida', 丶: 'punto', '｜': 'palo', 乙: 'anzuelo', 匕: 'cuchara', 卜: 'adivinar',
};

/* ---------- los pasos ---------- */
const STEPS = ['t1', 't2', 't3'];
// ¿Esta pregunta de kanji aún no puede salir? (su paso anterior no está superado)
export function locked(c) {
  if (c.type_id !== KANJI_TYPE || c.template === 't1' || S.progress.get(c.id)) return false;
  const prev = kanjiCards(c.fields?.k)[STEPS[STEPS.indexOf(c.template) - 1]], p = prev && S.progress.get(prev.id);
  return !(p && (p.interval || 0) >= STEP_DAYS);
}
// El paso 1 de un kanji cuyas palabras son todas nuevas: espera a la primera de ellas (no sale como nueva suelta)
function waiting(c) {
  if (c.type_id !== KANJI_TYPE || c.template !== 't1' || S.progress.get(c.id)) return false;
  const ws = jaKanjiWords().get(c.fields?.k) || [];
  return ws.length > 0 && ws.every(w => jaWords().get(w)?.state === 'new');
}
// ¿Puede salir en la tanda? (lo usan la tanda y el Plan)
export const studyOk = c => !locked(c) && !waiting(c);
// Las nuevas de la tanda, ya elegidas y en orden: delante de cada palabra nueva, el paso 1 de sus kanji que aún
// no conoces (una vez cada uno). Cuentan dentro de las nuevas del día: si no caben, la palabra espera a otro día
export function arrangeFresh(ids) {
  if (!hasJapanese()) return ids;
  const out = [], put = new Set(ids.filter(id => S.cards.get(id)?.type_id === KANJI_TYPE));
  for (const id of ids) {
    const c = S.cards.get(id), w = c && wordOfCard(c), group = [];
    if (w) for (const k of kanjiIn(w)) {
      const t1 = kanjiCards(k).t1;
      if (t1 && !S.progress.get(t1.id) && !put.has(t1.id)) group.push(t1.id);
    }
    if (out.length + group.length + 1 > ids.length) break;
    for (const x of group) put.add(x);
    out.push(...group, id);
  }
  return out;
}

/* ---------- crear las preguntas de kanji ---------- */
const KTYPE = () => BUILTIN_TYPES.find(t => t.id === KANJI_TYPE);
const kanjiDeck = () => [...S.decks.values()].find(d => d.options?.auto === 'kanji' && !d.deleted_at);
// Los campos de la pregunta de un kanji (con lo que dice el diccionario de kanji)
export function kanjiFields(k) {
  const i = kanjiInfo(k) || {};
  const m = (i.es?.length ? i.es : (i.en || []).map(x => `${x} (en inglés)`)).slice(0, 3).join(', ');
  return { k, m, kun: [...new Set((i.kun || []).map(r => r.replace(/-/g, '')).map(r => r.replace('.', '(') + (r.includes('.') ? ')' : '')))].join('、'), on: [...new Set((i.on || []).map(r => kata(r.replace(/-/g, ''))))].join('、'), p: (i.p || []).join(' '), h: '' };
}
let syncing = null;
// Crea las preguntas de los kanji nuevos de tus palabras (una vez por kanji). Devuelve cuántos ha creado
export function syncKanji() {
  if (syncing) return syncing;
  syncing = (async () => {
    if (!hasJapanese() || S.prefs.ja?.noKanji) return 0;
    await loadKanji();
    const want = [...jaKanjiWords().keys()].filter(k => kanjiInfo(k) && !hasKanjiCards(k));
    if (!want.length) return 0;
    let deck = kanjiDeck();
    // La lista «Kanji» se borró: no se vuelve a crear
    if (!deck && S.prefs.ja?.kanjiDeck) { S.prefs.ja = { ...S.prefs.ja, noKanji: true }; return 0; }
    if (!deck) {
      const per = new Map();
      for (const w of jaWords().values()) { const f = S.decks.get(w.deck)?.folder_id || ''; per.set(f, (per.get(f) || 0) + 1); }
      const folder = [...per].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      deck = await api.createDeck({ owner: S.uid, name: 'Kanji', description: 'Los kanji de tus palabras de japonés. Flaski los crea solos.', folder_id: folder, options: { lang: 'ja-JP', auto: 'kanji' } });
      S.decks.set(deck.id, { tags: [], ...deck });
      S.prefs.ja = { ...(S.prefs.ja || {}), kanjiDeck: deck.id };
      (await import('./perfil.js')).savePrefsSoon();
    }
    const type = KTYPE(), rows = [];
    for (const k of want) {
      const fields = kanjiFields(k), note = 'kanji-' + k + '-' + Date.now().toString(36);
      for (const tpl of type.templates) { const s = summarize(type, tpl, fields); rows.push({ type_id: KANJI_TYPE, template: tpl.id, fields, note_id: note, front: s.front, back: s.back, note: s.note }); }
    }
    const made = await api.importCards(S.uid, deck.id, rows);
    for (const c of made) S.cards.set(c.id, { tags: [], ...c });
    return want.length;
  })().finally(() => { syncing = null; });
  return syncing;
}

/* ---------- en la tanda ---------- */
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// Estado de una pregunta de kanji: la presentación (paso 1 la primera vez) o las opciones de «cómo se lee»
export function jaCardState(c, model, st) {
  if (c.type_id !== KANJI_TYPE) return;
  const k = model.fields.k;
  if (c.template === 't1' && !S.progress.get(c.id)) { st.intro = true; return; }
  if (c.template !== 't2') return;
  const info = kanjiInfo(k);
  const words = shuffle([...(jaKanjiWords().get(k) || [])]).map(w => jaWords().get(w)).filter(w => w?.reading);
  for (const w of words) {
    const r = readingIn(w.word, w.reading, k, Object.fromEntries([...kanjiIn(w.word)].map(x => [x, kanjiInfo(x)])));
    if (!r) continue;
    const others = new Set([...readingsOf(info), ...[...jaKanjiWords().keys()].filter(x => x !== k).slice(0, 30).flatMap(x => readingsOf(kanjiInfo(x)))]);
    others.delete(r);
    const opts = shuffle([r, ...shuffle([...others].filter(x => x && [...x].length <= 4)).slice(0, 3)]);
    st.kr = { word: w.word, reading: w.reading, r, kind: readingKind(r, info), other: (jaKanjiWords().get(k) || []).map(x => jaWords().get(x)).find(x => x && x.word !== w.word && x.reading) };
    st.choice = { opts, correct: r, picked: -1 };
    return;
  }
}
const dots = (n, cls = '') => `<span class="kj-dots${cls}" aria-label="${n === 3 ? 'Los tres pasos hechos' : n ? `Paso ${n} de 3 hecho` : 'Sin empezar'}">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
export const stepDots = dots;
const pieceChips = p => String(p || '').split(/\s+/).filter(Boolean).map(x => `<span class="kj-piece"><b lang="ja">${esc(x)}</b>${PIECES[x] ? `<small>${esc(PIECES[x])}</small>` : ''}</span>`).join('<span class="kj-plus" aria-hidden="true">+</span>');
const wordChips = (k, skip = '') => (jaKanjiWords().get(k) || []).filter(w => w !== skip).slice(0, 6).map(w => jaWords().get(w)).filter(Boolean)
  .map(w => `<span class="kj-word"><b lang="ja">${esc(w.word)}</b>${w.reading ? `<small lang="ja">${esc(w.reading)}</small>` : ''}</span>`).join('');
// ¿La siguiente de la tanda es una palabra con este kanji? (después de la presentación y de otros kanji nuevos)
function nextUses(k) {
  for (const id of (S.session?.queue || []).slice(1)) {
    const c = S.cards.get(id);
    if (c?.type_id === KANJI_TYPE && !S.progress.get(c.id)) continue;
    return !!(c && wordOfCard(c)?.includes(k));
  }
  return false;
}
// La cara de una pregunta de kanji, o null para la de siempre
export function jaFace(c, model, st) {
  if (c?.type_id !== KANJI_TYPE) return null;
  const f = model.fields, k = f.k;
  if (st.intro) {
    const ws = wordChips(k);
    return {
      front: `<div class="kj-intro"><span class="kj-new">Kanji nuevo</span><p class="kj-lead">${nextUses(k) ? 'La siguiente palabra lleva un kanji que aún no conoces. Primero, el kanji:' : 'Un kanji de tus palabras que aún no conoces:'}</p>
        <div class="kj-hero"><span class="kj-big" lang="ja">${esc(k)}</span><span class="kj-mean"><small>significa</small><b>${esc(f.m || '')}</b></span></div>
        ${f.p ? `<div class="kj-box"><small>Para recordarlo, sus piezas</small><div class="kj-pieces">${pieceChips(f.p)}</div>${f.h ? `<p class="kj-story">${fmt(f.h)}</p>` : ''}</div>` : ''}
        ${ws ? `<div class="kj-box"><small>Lo vas a ver en estas palabras de tus listas</small><div class="kj-words">${ws}</div></div>` : ''}
        <p class="kj-note">Esto no cuenta como pregunta: solo te lo presenta.</p></div>`,
      ask: '', answer: '',
    };
  }
  if (c.template === 't2' && st.kr) {
    const kr = st.kr, word = [...kr.word].map(x => (x === k ? `<span class="kj-mark">${esc(x)}</span>` : `<span class="kj-dim">${esc(x)}</span>`)).join('');
    const choices = `<div class="choices kj-choices">${st.choice.opts.map((o, i) => {
      let cls = '';
      if (st.revealed) cls = o === st.choice.correct ? ' right' : i === st.choice.picked ? ' wrong' : ' dim';
      return `<button type="button" class="choice${cls}" data-choice="${i}" lang="ja" ${st.revealed ? 'disabled' : ''}><span class="ckey">${i + 1}</span><span>${esc(o)}</span></button>`;
    }).join('')}</div>`;
    const why = kr.kind === 'on' ? 'cuando un kanji va junto a otro kanji, suele leerse así.' : kr.kind === 'kun' ? 'solo o con hiragana detrás, un kanji suele leerse a la japonesa.' : 'es la lectura de esta palabra.';
    return {
      front: `<p class="kj-ask">¿Cómo se lee <b lang="ja">${esc(k)}</b> aquí?</p><div class="kj-wordbig" lang="ja">${word}</div>`,
      ask: choices,
      answer: st.revealed ? `<div class="kj-why"><b>Aquí se lee <span lang="ja">${esc(kr.r)}</span>:</b> ${why}
        <p><span lang="ja">${esc(kr.word)}</span> se lee <span lang="ja">${esc(kr.reading)}</span>.${kr.other ? ` En cambio, <span lang="ja">${esc(kr.other.word)}</span> se lee <span lang="ja">${esc(kr.other.reading)}</span>.` : ''}</p></div>` : '',
    };
  }
  return null;
}
// Antes de valorar una pregunta de kanji: su paso de antes (para el resumen)
export function noteBefore(ses, c) {
  if (c?.type_id !== KANJI_TYPE) return;
  const k = c.fields?.k;
  if (k && !(k in (ses.jaBefore ||= {}))) ses.jaBefore[k] = kanjiStep(k);
}
// Al acabar la tanda: los kanji que han avanzado hoy y los que se resisten
export function jaDoneHTML(ses) {
  const before = ses.jaBefore || {};
  const rows = Object.entries(before).map(([k, b]) => {
    const n = kanjiStep(k), cards = kanjiCards(k), lapsed = Object.values(cards).some(c => (S.progress.get(c.id)?.lapses || 0) > 0 && (S.progress.get(c.id)?.interval || 0) < 1);
    if (n > b) return `<li><span class="kj-sq ok" lang="ja">${esc(k)}</span><span><b>${n >= 3 ? 'Los tres pasos, hechos' : `Ha pasado al paso ${n + 1}`}</b><small>${n >= 3 ? 'Ya sabes qué significa, leerlo y escribirlo.' : n === 2 ? 'Ya sabes leerlo. Desde ahora, también te pedirá escribirlo.' : 'Ya sabes qué significa. Ahora toca leerlo en tus palabras.'}</small>${dots(n)}</span></li>`;
    if (lapsed) return `<li><span class="kj-sq bad" lang="ja">${esc(k)}</span><span><b>Te está costando</b><small>Vuelve a salir pronto.</small>${dots(n)}</span></li>`;
    return '';
  }).filter(Boolean);
  return rows.length ? `<section class="kj-done"><h3>Tus kanji hoy</h3><ul>${rows.join('')}</ul></section>` : '';
}
export const KANJI_DECK = kanjiDeck;
