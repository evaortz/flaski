// Japonés · hiragana y katakana: la tabla de kana (cada casilla con el color de cómo la llevas), la mini ficha de
// cada kana, las listas para empezar y la comparación al confundir dos que se parecen (シ y ツ)
import * as api from '../api.js';
import { S, esc, toast, fail } from '../comun.js';
import { BUILTIN_TYPES, summarize } from '../cardtypes.js';
import { openSheet, closeSheet } from './editor.js';
import { ROWS, ALL, pairOf, romaji, kanaForRomaji } from '../ja/kana.js';
import { jaWords, KANA_TYPE, isJaDeck } from '../ja/saber.js';
import { hira } from '../ja/texto.js';

const isKataChar = c => c >= '゠' && c <= 'ヿ';
const kanaCards = () => [...S.cards.values()].filter(c => c.type_id === KANA_TYPE);
const cardOf = (c, tpl = 't1') => kanaCards().find(x => x.fields?.c === c && x.template === tpl);
// Cómo llevas un kana: 'ok' (te lo sabes) · 'mid' (a medias) · 'bad' (te cuesta) · 'no' (aún no)
function kanaState(c) {
  const card = cardOf(c), p = card && S.progress.get(card.id);
  if (!p) return 'no';
  if ((p.lapses || 0) > 0 && (p.interval || 0) < 3) return 'bad';
  return (p.interval || 0) >= 7 ? 'ok' : 'mid';
}
const STATE_TXT = { ok: 'te lo sabes', mid: 'a medias', bad: 'te cuesta', no: 'aún no' };

// La tabla: alpha 'h' (hiragana) o 'k' (katakana)
export function kanaTable(alpha = S.kanaAlpha || 'h') {
  S.kanaAlpha = alpha;
  const has = ALL.some(k => cardOf(alpha === 'h' ? k.h : k.k));
  const cells = ROWS.map(row => row.map(k => {
    if (!k) return '<span class="kn-cell is-empty" aria-hidden="true"></span>';
    const c = alpha === 'h' ? k[0] : k[1], st = kanaState(c);
    return `<button type="button" class="kn-cell kn-${st}" data-kana="${esc(c)}" aria-label="${esc(c)}, ${esc(romaji(k[2]))}, ${STATE_TXT[st]}"><b lang="ja">${esc(c)}</b><small>${esc(romaji(k[2]))}</small></button>`;
  }).join('')).join('');
  const list = ALL.map(k => (alpha === 'h' ? k.h : k.k)), n = s => list.filter(c => kanaState(c) === s).length;
  const name = alpha === 'h' ? 'hiragana' : 'katakana';
  openSheet(`<div class="kn-sheet">
    <div class="kn-head"><div><h2 class="sheet-hand">Tu tabla de kana</h2>
      <p class="muted small">${has ? `Te sabes <b>${n('ok')} de ${list.length}</b> · ${n('bad')} te cuestan` : `Aún no has empezado con los ${name}.`}</p></div>
      <div class="kn-alpha" role="group" aria-label="Alfabeto"><button type="button" data-kana-alpha="h" aria-pressed="${alpha === 'h'}" aria-label="Hiragana" lang="ja">あ</button><button type="button" data-kana-alpha="k" aria-pressed="${alpha === 'k'}" aria-label="Katakana" lang="ja">ア</button></div></div>
    <div class="kn-grid">${cells}</div>
    <div class="kn-key"><span><i class="kn-ok"></i>te lo sabes</span><span><i class="kn-mid"></i>a medias</span><span><i class="kn-bad"></i>te cuesta</span><span><i class="kn-no"></i>aún no</span></div>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button>
      ${has ? (n('bad') ? `<button class="primary" data-act="kana-weak" data-alpha="${alpha}">Repasar los que cuestan · ${n('bad')}</button>` : '')
        : `<button class="primary" data-act="kana-start" data-alpha="${alpha}">Empezar con los ${name}</button>`}</div></div>`, { full: true });
}
// La mini ficha de un kana
export function kanaSheet(c) {
  const k = ALL.find(x => x.h === c || x.k === c);
  if (!k) return;
  const kata = isKataChar(c), other = kata ? k.h : k.k, trick = kata ? k.tk : k.th, pair = pairOf(c);
  const h = hira(c), words = [...jaWords().values()].filter(w => (w.reading || '').includes(h) || w.word.includes(c)).slice(0, 4);
  openSheet(`<div class="kn-sheet">
    <div class="kj-hero"><span class="kj-big kn-${kanaState(c)}" lang="ja">${esc(c)}</span><span class="kj-mean"><b>${esc(romaji(k.r))}</b><small>${kata ? 'katakana' : 'hiragana'} · en ${kata ? 'hiragana' : 'katakana'}: <span lang="ja">${esc(other)}</span></small><small>${STATE_TXT[kanaState(c)]}</small></span></div>
    <div class="kj-box"><small>Truco para recordarlo</small><p class="kj-story">${esc(trick)}</p></div>
    ${pair ? `<div class="kj-confuse"><b lang="ja">${esc(pair.other)}</b><span>Se confunde con <span lang="ja">${esc(pair.other)}</span>. ${esc(pair.tip)}</span></div>` : ''}
    ${words.length ? `<div class="kj-box"><small>En tus palabras</small><div class="kj-words">${words.map(w => `<span class="kj-word"><b lang="ja">${esc(w.word)}</b>${w.reading ? `<small lang="ja">${esc(w.reading)}</small>` : ''}</span>`).join('')}</div></div>` : ''}
    <div class="btnrow"><button class="ghost" data-act="kj-strokes" data-kj-s="${esc(c)}">Ver cómo se escribe</button><span class="spacer"></span>
      ${cardOf(c) ? `<button class="primary" data-act="kana-practice" data-kana-p="${esc(c)}${pair ? esc(pair.other) : ''}">Practicarlo${pair ? ` con <span lang="ja">${esc(pair.other)}</span>` : ''}</button>` : '<button class="ghost" data-act="close-sheet">Cerrar</button>'}</div></div>`);
}

// Empezar: la lista «Hiragana» (o «Katakana») con una pregunta para reconocer y otra para escribir cada kana
export async function startKana(alpha) {
  const type = BUILTIN_TYPES.find(t => t.id === KANA_TYPE), name = alpha === 'h' ? 'Hiragana' : 'Katakana';
  try {
    const ja = [...S.decks.values()].find(isJaDeck);
    const deck = await api.createDeck({ owner: S.uid, name, description: `Los ${alpha === 'h' ? '46 hiragana' : '46 katakana'}: reconocerlos y escribirlos a mano.`, folder_id: ja?.folder_id || null, options: { lang: 'ja-JP', auto: 'kana' } });
    S.decks.set(deck.id, { tags: [], ...deck });
    const rows = [];
    for (const k of ALL) {
      const c = alpha === 'h' ? k.h : k.k, fields = { c, r: k.r, t: alpha === 'h' ? k.th : k.tk, x: alpha === 'h' ? k.k : k.h }, note = 'kana-' + c + '-' + Date.now().toString(36);
      for (const tpl of type.templates) { const s = summarize(type, tpl, fields); rows.push({ type_id: KANA_TYPE, template: tpl.id, fields, note_id: note, front: s.front, back: s.back, note: s.note }); }
    }
    for (const c of await api.importCards(S.uid, deck.id, rows)) S.cards.set(c.id, { tags: [], ...c });
    toast(`Lista «${name}» creada: 46 para reconocer y 46 para escribir`);
    kanaTable(alpha);
  } catch (e) { fail(e); }
}
// Una tanda con estos kana (las preguntas de reconocer)
export async function practice(chars) {
  const ids = [...chars].map(c => cardOf(c)?.id).filter(Boolean);
  if (!ids.length) return;
  closeSheet();
  const { go } = await import('../app.js');
  S.session = { scope: 'all', queue: ids, done: 0, revealed: false, tally: { 1: 0, 2: 0, 3: 0, 4: 0 }, undo: null, st: null, startedAt: Date.now(), minutes: 0, picked: true };
  go('study');
}
export function weak(alpha) {
  const list = ALL.map(k => (alpha === 'h' ? k.h : k.k)).filter(c => kanaState(c) === 'bad');
  return practice(list.join(''));
}

// En la tanda: al fallar un kana escribiendo el de otro que se le parece, los dos juntos y la pista
export function kanaAnswerExtra(c, model, st) {
  if (c?.type_id !== KANA_TYPE || c.template !== 't1' || !st.revealed || !st.typed || st.typed.ok) return '';
  const want = model.fields.c, got = kanaForRomaji(st.input || '', isKataChar(want)), pair = pairOf(want);
  if (!got || !pair || pair.other !== got) return '';
  const pj = S.prefs.ja || (S.prefs.ja = {});
  pj.parejas = { ...(pj.parejas || {}), [want]: { ...(pj.parejas?.[want] || {}), [got]: (pj.parejas?.[want]?.[got] || 0) + 1 } };
  import('./perfil.js').then(m => m.savePrefsSoon());
  return `<div class="kn-compare"><p><b>Has puesto ${esc(romaji(ALL.find(k => k.h === got || k.k === got)?.r))} y era ${esc(romaji(model.fields.r))}.</b> Míralos juntos:</p>
    <div class="kn-two"><span><b lang="ja">${esc(want)}</b><small>${esc(romaji(model.fields.r))}</small></span><span><b lang="ja">${esc(got)}</b><small>${esc(romaji(ALL.find(k => k.h === got || k.k === got)?.r))}</small></span></div>
    <p class="muted small">${esc(pair.tip)}</p>
    <button type="button" class="link" data-act="kana-practice" data-kana-p="${esc(want + got)}">Practicar los dos</button></div>`;
}
