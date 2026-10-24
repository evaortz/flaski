// Flaski · en un apunte: el modo «Repasar» (tapa negritas y huecos; Espacio destapa y 1–4 valoran, como en la tanda)
// y el atajo al escribir «a >> b» (una pregunta a → b) o «a <> b» (las dos direcciones)
import * as api from '../api.js';
import { icon } from '../icons.js';
import { toLiveHTML, toPlain } from '../inline.js';
import { liveSet } from '../liveedit.js';
import { clozeFrom, newBlock } from '../pages.js';
import { sentences, plainText } from '../suggest.js';
import { summarize, activeTemplates } from '../cardtypes.js';
import { $, S, esc, cardList, toast, fail } from '../comun.js';
import { getType, recordAnswer } from './estudio.js';
import { plural } from './mazos.js';
import { makeSuggested } from './sugerencias.js';
import { curPage, renderPage, redrawBlocks, savePageSoon } from './apuntes.js';

const GRADES = [[1, 'Otra vez'], [2, 'Difícil'], [3, 'Bien'], [4, 'Fácil']];
const TEXT_BLOCKS = ['p', 'h1', 'h2', 'h3', 'li', 'ol', 'todo', 'quote', 'callout'];
const fold = s => toPlain(String(s ?? '')).toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/* ===================== atajo «a >> b» ===================== */
export const QS_RE = /^\s*(.+?)\s+(>>|<>)\s+(.+?)\s*$/;
// La pregunta que saldría de lo escrito en un bloque: { a, b, both } o null
export function qsParse(text) {
  if (/\n/.test(text)) return null;
  const m = QS_RE.exec(String(text || ''));
  return m && m[1].trim() && m[3].trim() ? { a: m[1].trim(), b: m[3].trim(), both: m[2] === '<>' } : null;
}
const blockCards = (p, id) => cardList().filter(c => c.page_id === p.id && c.block_id === id);
// Al escribir: si el bloque tiene la forma «a >> b» y aún no es pregunta, el aviso «Pregunta nueva … Enter crear · Esc dejarlo como texto»
export function qsCheck(el) {
  const p = curPage(), id = el?.dataset.blockInput, b = p?.blocks.find(x => x.id === id);
  const q = b && TEXT_BLOCKS.includes(b.type) && !S.qsSkip?.has(id) && !blockCards(p, id).length ? qsParse(el.value) : null;
  let bar = $('#qsHint');
  if (!q) { bar?.remove(); return null; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'qsHint';
    bar.className = 'qs-hint';
    bar.setAttribute('role', 'status');
    document.body.append(bar);
  }
  const touch = matchMedia('(hover: none)').matches;
  bar.innerHTML = `<span class="qs-k">${touch ? 'Pregunta nueva al pulsar Intro' : 'Pregunta nueva'}</span><b class="qs-q">${esc(toPlain(q.a))} ${q.both ? '↔' : '→'} ${esc(toPlain(q.b))}</b>
    ${touch ? '<button type="button" class="link qs-skip" data-act="qs-skip">Dejar como texto</button>' : '<span class="qs-keys"><kbd>Enter</kbd> crear · <kbd>Esc</kbd> dejarlo como texto</span>'}`;
  const r = el.getBoundingClientRect();
  bar.classList.toggle('qs-float', !touch);
  if (!touch) { bar.style.left = `${Math.max(8, r.left)}px`; bar.style.top = `${r.bottom + 8 + scrollY}px`; }
  return q;
}
export const qsHide = () => $('#qsHint')?.remove();
// Esc con el aviso a la vista: el bloque se queda como texto (no se vuelve a proponer mientras no salgas del apunte)
export function qsSkip(id = document.querySelector('[data-block-input]')?.dataset.blockInput) {
  if (!id) return;
  (S.qsSkip ||= new Set()).add(id);
  qsHide();
}
// Enter: crea la pregunta (o las dos), en la lista del apunte y unidas a su línea; sigue en un párrafo nuevo debajo
export async function qsCreate(el) {
  const p = curPage(), id = el.dataset.blockInput, b = p?.blocks.find(x => x.id === id), q = qsParse(el.value);
  if (!b || !q) return false;
  qsHide();
  b.text = el.value;
  const i = p.blocks.indexOf(b), next = newBlock(b.type === 'li' || b.type === 'ol' ? b.type : 'p');
  p.blocks.splice(i + 1, 0, next);
  savePageSoon(p);
  try {
    const deckId = p.deck_id && S.decks.has(p.deck_id) ? p.deck_id : 'new';
    // «qs»: salió del atajo, así que sigue a la línea si la cambias
    const pick = q.both ? { typeId: 'reverse', fields: { a: q.a, b: q.b, n: '', qs: 1 }, blockId: id } : { typeId: 'basic', fields: { q: q.a, a: q.b, n: '', qs: 1 }, blockId: id };
    const { made } = await makeSuggested(p, [pick], deckId);
    toast(made.length === 1 ? 'Pregunta creada' : `${made.length} preguntas creadas`);
  } catch (e) { fail(e); }
  redrawBlocks(next.id, 0);
  return true;
}
// Si cambias la línea, cambia la pregunta: las que salieron de «a >> b» siguen a lo escrito
export function qsFollow(p, b, text) {
  const now = qsParse(text);
  if (!now) return;
  for (const c of blockCards(p, b.id)) {
    const f = c.fields || {};
    if (!f.qs || !['basic', 'reverse'].includes(c.type_id)) continue;
    const fields = c.type_id === 'basic' ? { ...f, q: now.a, a: now.b } : { ...f, a: now.a, b: now.b };
    if (JSON.stringify(fields) === JSON.stringify(f)) continue;
    const type = getType(c.type_id), tpl = activeTemplates(type, fields).find(t => t.id === c.template);
    if (!tpl) continue;
    const sum = summarize(type, tpl, fields), patch = { fields, front: sum.front.slice(0, 2000) || '—', back: sum.back.slice(0, 2000) || '—' };
    Object.assign(c, patch);
    api.updateCard(c.id, patch).catch(() => {});
  }
}
// La forma «a → b» de una línea que ya es pregunta (en vez de «a >> b»)
export function qsBodyHTML(b, cards) {
  const q = cards?.length && TEXT_BLOCKS.includes(b.type) ? qsParse(b.text) : null;
  return q ? `<span class="qs-a">${toLiveHTML(q.a)}</span><span class="qs-arr" aria-hidden="true">${q.both ? '↔' : '→'}</span><span class="qs-b">${toLiveHTML(q.b)}</span>` : null;
}
// Botón «pregunta» de la barra sobre el teclado: escribe « >> » donde está el cursor
export function qsInsert() {
  const el = document.activeElement?._live ? document.activeElement : document.querySelector('[data-block-input]');
  if (!el) return;
  const a = el.selectionStart ?? el.value.length, z = el.selectionEnd ?? a;
  const before = el.value.slice(0, a).replace(/\s+$/, ''), after = el.value.slice(z).replace(/^\s+/, '');
  const text = `${before} >> ${after}`;
  liveSet(el, text, before.length + 4);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ===================== modo Repasar ===================== */
// Lo que se tapa en un bloque: las negritas y lo que es hueco en una de sus preguntas. [{ a, z, text }] en su Markdown
function gapsOf(b, cards) {
  if (!TEXT_BLOCKS.includes(b.type)) return [];
  const out = [];
  for (const m of b.text.matchAll(/\*\*(.+?)\*\*/g)) out.push({ a: m.index, z: m.index + m[0].length, text: m[1] });
  const holes = cards.filter(c => c.type_id === 'cloze' || c.type_id === 'clozechoice').flatMap(c => [...String(c.fields?.x || '').matchAll(/\{\{(.+?)(?:::.+?)?\}\}/g)].map(m => m[1]));
  for (const h of holes) {
    const k = b.text.indexOf(h);
    if (k >= 0 && !out.some(g => k < g.z && k + h.length > g.a)) out.push({ a: k, z: k + h.length, text: h });
  }
  return out.sort((x, y) => x.a - y.a);
}
// La pregunta que ya pregunta eso: un hueco con ese texto o una con esa respuesta, en el mismo bloque
function cardFor(cards, text) {
  const t = fold(text);
  return cards.find(c => (c.type_id === 'cloze' || c.type_id === 'clozechoice')
    ? [...String(c.fields?.x || '').matchAll(/\{\{(.+?)(?:::.+?)?\}\}/g)].some(m => fold(m[1]) === t)
    : fold(c.back) === t)?.id || null;
}
export const rvOn = (p = curPage()) => !!p && S.rv?.pageId === p.id;
export function startReview() {
  const p = curPage();
  if (!p) return;
  const items = [];
  for (const b of p.blocks) {
    const cards = blockCards(p, b.id);
    for (const g of gapsOf(b, cards)) items.push({ k: items.length, blockId: b.id, ...g, cardId: cardFor(cards, g.text) });
  }
  if (!items.length) { toast('No hay nada que tapar: pon en negrita lo que quieras repasar'); return; }
  S.mapView = null;
  S.rv = { pageId: p.id, items, i: 0, revealed: false, res: new Map(), shownAt: Date.now(), made: false };
  renderPage();
}
export function stopReview() { S.rv = null; qsHide(); renderPage(); }
// Se vuelven a pintar los bloques con lo tapado y destapado de ahora
const rvRedraw = () => { redrawBlocks(); drawReview(); };
// Después de pintar los bloques: el texto de cada uno con lo que se tapa, y nada se edita al tocarlo
export function drawReview() {
  const p = curPage(), R = S.rv;
  if (!rvOn(p)) return;
  for (const el of document.querySelectorAll('#pgBlocks [data-edit-block]')) {
    const id = el.dataset.editBlock, b = p.blocks.find(x => x.id === id), mine = R.items.filter(x => x.blockId === id);
    el.removeAttribute('data-edit-block');
    if (!b || !mine.length) continue;
    let html = '', at = 0;
    for (const it of mine) {
      html += toLiveHTML(b.text.slice(at, it.a));
      const g = R.res.get(it.k), cur = it.k === R.items[R.i]?.k && !R.done;
      const shown = g || (cur && R.revealed);
      html += `<button type="button" class="rv-gap${cur ? ' is-cur' : ''}${g ? ` g${g}` : ''}" data-rv="${it.k}" aria-label="${shown ? esc(toPlain(it.text)) : 'Tapado: toca para destaparlo'}" style="--w:${Math.min(16, Math.max(3, toPlain(it.text).length))}ch">${shown ? toLiveHTML(it.text) : ''}</button>`;
      at = it.z;
    }
    el.innerHTML = html + toLiveHTML(b.text.slice(at));
  }
  drawReviewPanel();
}
function tally(R) {
  const n = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const g of R.res.values()) n[g]++;
  return n;
}
const failed = R => R.items.filter(it => (R.res.get(it.k) || 9) <= 2);
function drawReviewPanel() {
  const R = S.rv, box = $('#rvPanel'), foot = $('#rvFoot');
  if (!R || !box) return;
  const n = tally(R), total = R.items.length, done = R.res.size;
  const segs = R.items.map(it => `<i class="${R.res.has(it.k) ? `g${R.res.get(it.k)}` : it.k === R.items[R.i]?.k && !R.done ? 'is-cur' : ''}"></i>`).join('');
  const sum = GRADES.filter(([g]) => n[g]).map(([g, l]) => `${l} ${n[g]}`).join(' · ');
  const bad = failed(R), toMake = bad.filter(it => !it.cardId);
  box.innerHTML = `<div class="rv-card"><div class="rv-h"><h3>${R.done ? 'Repaso hecho' : 'Repasando'}</h3><span>${Math.min(done + (R.done ? 0 : 1), total)} de ${total}</span></div>
      <span class="rv-segs">${segs}</span>${sum ? `<p class="rv-sum">${sum}</p>` : ''}
      ${R.done ? `<div class="rv-end">${toMake.length && !R.made ? `<button type="button" class="primary" data-act="rv-make">Crear ${toMake.length === 1 ? '1 pregunta' : `${toMake.length} preguntas`} «Hueco»</button>` : ''}
        <button type="button" class="ghost" data-act="rv-again">Repasar otra vez</button><button type="button" class="link" data-act="pg-mode" data-mode="write">Volver a escribir</button></div>` : ''}</div>
    ${bad.length ? `<h4 class="rv-nh">Lo que no te sale</h4><ul class="rv-bad">${bad.map(it => `<li><span>${toLiveHTML(it.text)}</span>${it.cardId ? '<em>ya es pregunta</em>' : ''}</li>`).join('')}</ul>` : ''}
    <p class="rv-help">Son los mismos 4 botones de la tanda: si ya es pregunta, cuenta como un repaso más y decide cuándo vuelve. Si no, al terminar te proponemos crearla como «Hueco», unida a su frase.</p>
    <p class="rv-keys"><kbd>Espacio</kbd> destapar · <kbd>1–4</kbd> igual que en una tanda · <kbd>Esc</kbd> volver a escribir</p>`;
  // Los botones: junto a lo destapado (ordenador) o abajo, fijos (móvil)
  const it = R.items[R.i];
  const grades = `<div class="rv-grades">${GRADES.map(([g, l]) => `<button type="button" class="grade g${g}" data-rv-grade="${g}"><small>${g}</small> ${l}</button>`).join('')}</div>`;
  if (foot) {
    foot.hidden = !!R.done;
    foot.innerHTML = R.done ? '' : R.revealed ? `<p class="rv-ask">¿Cómo te ha salido «${esc(toPlain(it.text))}»?</p>${grades}`
      : `<button type="button" class="primary big rv-open" data-act="rv-reveal">Destapar</button><p class="rv-tip">Toca un hueco para destaparlo · lo que falles y no sea pregunta, te lo propongo al final</p>`;
  }
  document.querySelector('.rv-float')?.remove();
  const cur = it && !R.done && R.revealed && document.querySelector(`.rv-gap[data-rv="${it.k}"]`);
  if (cur && matchMedia('(min-width: 900px)').matches) {
    const f = document.createElement('div');
    f.className = 'rv-float';
    f.innerHTML = grades;
    $('#pgBlocks').append(f);
    const r = cur.getBoundingClientRect(), host = $('#pgBlocks').getBoundingClientRect();
    f.style.left = `${Math.max(0, r.left - host.left)}px`;
    f.style.top = `${r.bottom - host.top + 8}px`;
  }
}
export function rvReveal(k = null) {
  const R = S.rv;
  if (!R || R.done) return;
  if (k != null) {
    const j = R.items.findIndex(x => x.k === k);
    if (j < 0 || R.res.has(k)) return;
    if (j !== R.i) { R.i = j; R.shownAt = Date.now(); }
  }
  R.revealed = true;
  rvRedraw();
}
export function rvGrade(g) {
  const R = S.rv, it = R?.items[R.i];
  if (!it || !R.revealed || R.done) return;
  if (it.cardId && S.cards.has(it.cardId)) recordAnswer(it.cardId, g, Math.min(120e3, Date.now() - R.shownAt));
  R.res.set(it.k, g);
  const next = R.items.findIndex((x, j) => j > R.i && !R.res.has(x.k));
  const any = next >= 0 ? next : R.items.findIndex(x => !R.res.has(x.k));
  R.revealed = false;
  R.shownAt = Date.now();
  if (any < 0) R.done = true; else R.i = any;
  rvRedraw();
  document.querySelector(`.rv-gap[data-rv="${R.items[R.i]?.k}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
// Lo que falló y aún no es pregunta, como «Hueco» unido a su frase
export async function rvMake() {
  const R = S.rv, p = curPage();
  if (!R || !p) return;
  const picks = [];
  for (const it of failed(R).filter(x => !x.cardId)) {
    const b = p.blocks.find(x => x.id === it.blockId);
    if (!b) continue;
    const t = toPlain(it.text), sentence = sentences(plainText(b.text)).find(x => x.includes(t));
    const x = (sentence && clozeFrom(sentence, t)) || clozeFrom(plainText(b.text), t);
    if (x) picks.push({ typeId: 'cloze', fields: { x, e: '' }, blockId: b.id, k: it.k });
  }
  if (!picks.length) return;
  try {
    const { made } = await makeSuggested(p, picks, p.deck_id && S.decks.has(p.deck_id) ? p.deck_id : 'new');
    R.made = true;
    for (const pk of picks) { const c = made.find(m => m.block_id === pk.blockId && m.fields?.x === pk.fields.x); const it = R.items.find(x => x.k === pk.k); if (c && it) it.cardId = c.id; }
    toast(plural(made.length, 'pregunta creada', 'preguntas creadas'));
  } catch (e) { fail(e); }
  rvRedraw();
}
export function rvKey(e) {
  if (!rvOn() || e.target.matches?.('input, textarea, select, [contenteditable="true"]') || !$('#sheet').hidden) return false;
  if (e.key === 'Escape') { e.preventDefault(); stopReview(); return true; }
  if (e.key === ' ' && !S.rv.revealed) { e.preventDefault(); rvReveal(); return true; }
  if (/^[1-4]$/.test(e.key) && S.rv.revealed) { e.preventDefault(); rvGrade(Number(e.key)); return true; }
  return false;
}
// «Escribir | Repasar»
export const modeSeg = (p = curPage()) => `<div class="seg pg-mode" role="group" aria-label="Modo"><button type="button" class="seg-b" data-act="pg-mode" data-mode="write" aria-pressed="${!rvOn(p)}">Escribir</button><button type="button" class="seg-b" data-act="pg-mode" data-mode="review" aria-pressed="${rvOn(p)}">Repasar</button></div>`;
export const reviewIntro = () => `<p class="rv-intro">${icon('eye-off', { size: 16 })} Están tapadas las negritas y los huecos de tus preguntas. Intenta decirlo antes de destaparlo.</p>`;
