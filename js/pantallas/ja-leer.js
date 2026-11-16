// Japonés · leer japonés de verdad: el modo lectura de un apunte (qué entiendes, las palabras nuevas marcadas y con su
// lectura, tocar una para aprenderla con su frase) y los subtítulos de una serie (.srt o .vtt) como apunte
import * as api from '../api.js';
import { S, esc, toast, fail } from '../comun.js';
import { BUILTIN_TYPES } from '../cardtypes.js';
import { openSheet, closeSheet } from './editor.js';
import { tokenize, readingOf, isGrammar } from '../ja/palabras.js';
import { base as rubyBase, isKanji, isKana, jaCount } from '../ja/texto.js';
import { wordState, isJaDeck, kanjiStep } from '../ja/saber.js';
import { newBlock } from '../pages.js';
import { rubyWord, parseSubs, pairSubs } from '../ja/leer.js';

const auto = d => !!d?.options?.auto;
const jaDecks = () => [...S.decks.values()].filter(d => isJaDeck(d) && !auto(d));
// Las líneas de un apunte: [{ text, es }] (una cita justo después de una línea en japonés es su traducción)
function linesOf(p) {
  const out = [];
  for (const b of p.blocks || []) {
    if (['img', 'hr', 'table', 'code'].includes(b.type)) continue;
    const t = rubyBase(String(b.text || '')).replace(/[*_=~`]/g, '').trim();
    if (!t) continue;
    if (b.type === 'quote' && out.length && !jaCount(t) && !out.at(-1).es) { out.at(-1).es = t; continue; }
    out.push({ text: t, es: '' });
  }
  return out;
}
export const canRead = p => jaCount(linesOf(p).map(l => l.text).join('')) >= 30;

// Cómo llevas cada palabra del texto: 'known' | 'learning' | 'new' | 'gram' | 'other'
function classify(t) {
  if (t.kind === 'other') return 'other';
  if (t.kind === 'word' && isGrammar(t)) return 'gram';
  const st = wordState(t.base || t.s) || wordState(t.s);
  if (st === 'known') return 'known';
  if (st) return 'learning';
  if ([...t.s].every(isKana) && [...t.s].length <= 2) return 'gram';
  return 'new';
}
const meaningOf = e => (e?.es?.length ? e.es.slice(0, 3).join(', ') : e?.en?.length ? `${e.en.slice(0, 2).join(', ')} (en inglés)` : '');

let R = null;   // la lectura abierta: { pageId, lines: [{ text, es, toks: [{ t, c }] }], words: Map }
async function analyze(p) {
  const lines = linesOf(p);
  for (const l of lines) l.toks = (await tokenize(l.text)).map(t => ({ t, c: classify(t) }));
  const words = new Map();
  lines.forEach((l, li) => l.toks.forEach(({ t, c }) => {
    if (c !== 'new') return;
    const k = t.base || t.s;
    if (!words.has(k)) words.set(k, { word: k, t, line: li, n: 0 });
    words.get(k).n++;
  }));
  return { pageId: p.id, title: p.title || 'Apunte', lines, words };
}
const tokHTML = ({ t, c }, li) => {
  if (c === 'new') {
    const r = t.s === (t.base || t.s) && [...t.s].some(isKanji) ? readingOf(t) : '';
    return `<button type="button" class="rd-w rd-new" data-rd="${esc(t.base || t.s)}" data-rd-l="${li}">${r ? `<ruby>${esc(t.s)}<rt>${esc(r)}</rt></ruby>` : esc(t.s)}</button>`;
  }
  return c === 'learning' ? `<span class="rd-w rd-learning">${esc(t.s)}</span>` : esc(t.s);
};
// El modo lectura de un apunte
export async function readSheet(pageId, onlyOne = false) {
  const p = S.pages.get(pageId);
  if (!p) return;
  openSheet('<div class="rd"><div class="spin" aria-label="Cargando"></div></div>', { full: true });
  R = await analyze(p);
  drawRead(onlyOne);
}
function drawRead(onlyOne = false) {
  const all = R.lines.flatMap(l => l.toks).filter(x => ['known', 'learning', 'new'].includes(x.c));
  const len = c => all.filter(x => x.c === c).reduce((a, x) => a + [...x.t.s].length, 0);
  const tot = Math.max(1, len('known') + len('learning') + len('new')), pct = Math.round(100 * len('known') / tot);
  const one = R.lines.map((l, i) => [l, i]).filter(([l]) => new Set(l.toks.filter(x => x.c === 'new').map(x => x.t.base || x.t.s)).size === 1);
  // (si ninguna frase tiene una sola nueva, el texto entero)
  onlyOne = onlyOne && one.length > 0;
  const shown = onlyOne ? one : R.lines.map((l, i) => [l, i]);
  R.onlyOne = onlyOne;
  openSheet(`<div class="rd"><h2 class="sheet-hand">${esc(R.title)}</h2>
    <div class="rd-sum"><div class="rd-big"><b>${pct} %</b><span>de este texto ya lo conoces</span></div>
      <span class="rd-bar" aria-hidden="true"><i class="rd-known" style="width:${pct}%"></i><i class="rd-learning" style="width:${Math.round(100 * len('learning') / tot)}%"></i><i class="rd-new" style="width:${100 - pct - Math.round(100 * len('learning') / tot)}%"></i></span>
      <span class="rd-key"><span><i class="rd-known"></i>lo sabes</span><span><i class="rd-learning"></i>aprendiéndola</span><span><i class="rd-new"></i>nueva · ${R.words.size}</span></span></div>
    ${one.length ? `<div class="rd-filter" role="group" aria-label="Qué frases ver"><button type="button" data-rd-only="0" aria-pressed="${!onlyOne}">Todo el texto</button><button type="button" data-rd-only="1" aria-pressed="${onlyOne}">Frases con una sola nueva · ${one.length}</button></div>` : ''}
    <div class="rd-text" lang="ja">${shown.map(([l, i]) => `<p>${l.toks.map(x => tokHTML(x, i)).join('')}${l.es ? `<small lang="es">${esc(l.es)}</small>` : ''}</p>`).join('')}</div>
    <p class="muted small">Las nuevas llevan su lectura encima. Toca una para ver qué significa y aprenderla con su frase.</p>
    ${R.words.size ? `<h3 class="rd-h">Palabras nuevas</h3><ul class="rd-list">${[...R.words.values()].slice(0, 30).map(w => `<li><button type="button" data-rd="${esc(w.word)}" data-rd-l="${w.line}"><b lang="ja">${esc(w.word)}</b><span><span>${esc(meaningOf(w.t.entries?.[0]) || 'no está en el diccionario')}</span><small lang="ja">${esc(readingOf(w.t))}</small></span><small>${w.n === 1 ? '1 vez' : `${w.n} veces`}</small></button></li>`).join('')}</ul>` : ''}
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button>${R.words.size ? `<button class="primary" data-act="rd-all">Aprender ${R.words.size === 1 ? 'la nueva' : `las ${Math.min(R.words.size, 30)}`} con su frase</button>` : ''}</div></div>`, { full: true });
}
export const showOnlyOne = v => drawRead(v);

const sentenceOf = (line, word) => (line.text.split(/(?<=[。！？!?])/).find(s => s.includes(word)) || line.text).trim();
// La hoja de una palabra nueva
export function wordSheet(word, li) {
  const w = R?.words.get(word) || [...(R?.lines[li]?.toks || [])].map(x => x.t).find(t => (t.base || t.s) === word) && { word, t: R.lines[li].toks.find(x => (x.t.base || x.t.s) === word).t, line: li };
  if (!w) return;
  const t = w.t, e = t.entries?.[0], line = R.lines[li ?? w.line], sent = sentenceOf(line, t.s), decks = jaDecks();
  const ks = [...word].filter(isKanji);
  openSheet(`<div class="kj-sheet">
    <div class="kj-hero"><span class="kj-big rd-wbig" lang="ja">${esc(word)}</span><span class="kj-mean"><b>${esc(meaningOf(e) || 'No está en el diccionario')}</b><small lang="ja">${esc(readingOf(t))}</small></span></div>
    <div class="kj-box"><small>La frase de tu texto, que irá en la pregunta</small><p lang="ja" class="ja-line">${esc(sent).replace(esc(t.s), `<b class="rd-new">${esc(t.s)}</b>`)}</p>${line.es ? `<small>${esc(line.es)}</small>` : ''}</div>
    ${ks.length ? `<div class="kj-words">${ks.map(k => `<span class="kj-word"><b lang="ja">${esc(k)}</b><small>${kanjiStep(k) ? 'ya lo conoces' : 'nuevo'}</small></span>`).join('')}</div>` : ''}
    ${decks.length > 1 ? `<label class="kj-box"><small>A qué lista</small><select id="rdDeck">${decks.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></label>` : ''}
    <div class="btnrow"><button class="ghost" data-act="rd-know" data-w="${esc(word)}">Ya me la sé</button><button class="ghost" data-act="close-sheet">Ahora no</button><span class="spacer"></span>
      ${decks.length ? `<button class="primary" data-act="rd-learn" data-w="${esc(word)}" data-l="${li ?? w.line}">Aprenderla</button>` : ''}</div></div>`);
}
const VOCAB = () => BUILTIN_TYPES.find(t => t.id === 'vocab');
async function learnOne(word, li, deckId) {
  const w = R.words.get(word) || { t: R.lines[li].toks.find(x => (x.t.base || x.t.s) === word).t };
  const e = w.t.entries?.[0], line = R.lines[li], sent = sentenceOf(line, w.t.s);
  const { saveNote } = await import('./editor.js');
  const r = e?.r?.[0] || '';
  await saveNote({ type: VOCAB(), fields: { w: rubyWord(word, r), t: e?.es?.slice(0, 2).join(', ') || '', p: '', e: sent, n: line.es ? `La frase: ${line.es}` : '' }, deckId });
}
export async function learn(word, li) {
  const deckId = document.getElementById('rdDeck')?.value || jaDecks()[0]?.id;
  if (!deckId) return;
  try { await learnOne(word, +li, deckId); toast('Palabra añadida con su frase'); R.words.delete(word); await reread(); } catch (e) { fail(e); }
}
export async function learnAll() {
  const deckId = jaDecks()[0]?.id;
  if (!deckId) return;
  const ws = [...R.words.values()].slice(0, 30);
  try { for (const w of ws) await learnOne(w.word, w.line, deckId); toast(`${ws.length === 1 ? '1 palabra añadida' : `${ws.length} palabras añadidas`} con su frase`); await reread(); } catch (e) { fail(e); }
}
export async function knowIt(word) {
  S.prefs.ja = { ...(S.prefs.ja || {}), sabidas: [...new Set([...(S.prefs.ja?.sabidas || []), word])] };
  (await import('./perfil.js')).savePrefsSoon();
  await reread();
}
async function reread() { const p = S.pages.get(R.pageId); if (p) { R = await analyze(p); drawRead(R.onlyOne); } }

/* ---------- subtítulos ---------- */
export function subsSheet() {
  openSheet(`<div class="kj-sheet"><h2 class="sheet-hand">Subtítulos de una serie</h2>
    <p class="muted small">Sube los subtítulos en japonés de un capítulo (.srt o .vtt). Si tienes también los de español, cada frase llevará su traducción.</p>
    <label class="kj-box"><small>En japonés</small><input type="file" id="subsJa" accept=".srt,.vtt,text/vtt"></label>
    <label class="kj-box"><small>En español (si los tienes)</small><input type="file" id="subsEs" accept=".srt,.vtt,text/vtt"></label>
    <label class="kj-box"><small>Nombre del apunte</small><input type="text" id="subsName" placeholder="Capítulo 1"></label>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-act="subs-go">Crear el apunte</button></div></div>`);
}
export async function subsGo() {
  const fj = document.getElementById('subsJa')?.files?.[0], fe = document.getElementById('subsEs')?.files?.[0];
  if (!fj) return toast('Elige el archivo de subtítulos en japonés');
  try {
    const ja = parseSubs(await fj.text()), es = fe ? parseSubs(await fe.text()) : [];
    if (!ja.length) return toast('Ese archivo no tiene subtítulos');
    const lines = es.length ? pairSubs(ja, es) : ja;
    const blocks = lines.flatMap(l => [newBlock('p', `${l.time} · ${l.text}`), ...(l.es ? [newBlock('quote', l.es)] : [])]);
    const title = document.getElementById('subsName')?.value.trim() || fj.name.replace(/\.(srt|vtt)$/i, '');
    const ja0 = jaDecks()[0];
    const page = { id: api.newId(), owner: S.uid, title, icon: '', deck_id: ja0?.id || null, folder_id: ja0?.folder_id || null, tags: [], blocks };
    await api.savePage(page);
    S.pages.set(page.id, page);
    closeSheet();
    toast(`Apunte creado: ${lines.length === 1 ? '1 frase' : `${lines.length} frases`}`);
    const { go } = await import('../app.js');
    go('page', { pageId: page.id });
    readSheet(page.id, true);
  } catch (e) { fail(e); }
}
