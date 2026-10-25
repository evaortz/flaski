// Flaski · apuntes: sugerir preguntas (sale de apuntes.js)
import * as api from '../api.js';
import { icon } from '../icons.js';
import { BUILTIN_TYPES, activeTemplates, summarize, missingFor } from '../cardtypes.js';
import { suggestCards, writingTips, plainText, useGender } from '../suggest.js';
import { temaCards } from '../primera-vez.js';
import { stripImages, storeImage, flushUploads } from '../media.js';
import { toPlain } from '../inline.js';
import { pageTitle } from '../pages.js';
import { $, S, esc, fmt, cardList, toast, toastAction, fail } from '../comun.js';
import { typeIcon, getType, deckLang, nativeLang, typeIn } from './estudio.js';
import { plural } from './mazos.js';
import { openSheet, closeSheet, cardForm, readEditor, migrateDeckLangs } from './editor.js';
import { savePageSoon, renderPage, curPage, commitBlockEl } from './apuntes.js';

/* ===================== sugerir tarjetas ===================== */
// Lo que ya hay como tarjeta (para no proponerlo otra vez): las de este apunte y las del mazo elegido
export function suggestFor(p, deckId) {
  const existing = cardList().filter(c => c.page_id === p.id || (deckId && c.deck_id === deckId));
  return suggestCards(p, { lang: deckId ? deckLang(deckId) : '', native: nativeLang(), existing });
}
// Sugerencias descartadas (por apunte, en este navegador): no vuelven a salir al actualizar
const SUG_HIDDEN = 'flaski-sug-hidden';
function sugHidden(pageId) { try { return new Set(JSON.parse(localStorage.getItem(SUG_HIDDEN) || '{}')[pageId] || []); } catch { return new Set(); } }
export function setSugHidden(pageId, set) {
  try { const all = JSON.parse(localStorage.getItem(SUG_HIDDEN) || '{}'); if (set.size) all[pageId] = [...set]; else delete all[pageId]; localStorage.setItem(SUG_HIDDEN, JSON.stringify(all)); } catch { /* sin almacenamiento */ }
}
// El género de las palabras («¿Cuántas fases…?»), con rosaenlg-gender-es: se carga al abrir las sugerencias por primera
// vez (ruta en una variable: no forma parte del arranque de la app); sin conexión, suggest.js se apaña con sus reglas
const GENDER_LIB = '../vendor/gender-es.js';
let genderReady = null;
const loadGender = () => (genderReady ||= import(GENDER_LIB).then(m => useGender(m.default)).catch(() => {}));
// only: solo las de un bloque (desde la ✨ del apunte)
export function openSuggestions(only = null) {
  const p = curPage();
  if (!p) return;
  if (!genderReady) { loadGender().then(() => openSuggestions(only)); return; }
  const open = document.querySelector('[data-block-input]');
  if (open) commitBlockEl(open);
  // Si ya se habían abierto en este apunte, se conserva lo retocado y lo marcado
  if (S.sug?.pageId !== p.id) {
    // Si el apunte aún no tiene lista, se propone una nueva con su nombre
    const deckId = p.deck_id && S.decks.has(p.deck_id) && !S.decks.get(p.deck_id).archived ? p.deck_id : 'new';
    S.sug = { pageId: p.id, deckId, list: [], types: null, showMore: null, scroll: 0 };
  }
  S.sug.only = only;
  S.sug.scroll = 0;
  refreshSuggestions(false);
}
// Vuelve a leer el apunte: las nuevas aparecen, las que ya no salen se van, y lo retocado se queda
export function refreshSuggestions(report = true) {
  const g = S.sug, p = S.pages.get(g?.pageId);
  if (!g || !p) return;
  const old = new Map(g.list.map(x => [x.id, x]));
  const hidden = sugHidden(p.id);
  // Cada dato con sus otras formas de preguntarlo: si se descartó o se eligió una de ellas, cuenta para todo el dato
  const list = suggestFor(p, g.deckId === 'new' ? '' : g.deckId).filter(x => !sugIds(x).some(id => hidden.has(id))).map(x => {
    const o = sugIds(x).map(id => old.get(id)).find(Boolean);
    if (!o) return { ...x, fresh: report && g.list.length > 0 };
    const y = o.id !== x.id ? swapTo(x, o.id) : x;
    return o.edited ? { ...y, ...o, fresh: false } : { ...y, selected: o.selected, fresh: false };
  });
  // Las retocadas a mano se quedan aunque el texto del apunte haya cambiado (mientras su parte exista)
  for (const o of g.list) if (o.edited && !list.some(x => x.id === o.id) && p.blocks.some(b => b.id === o.blockId)) list.push(o);
  const pos = new Map(p.blocks.map((b, i) => [b.id, i]));
  g.list = list.sort((a, b) => (pos.get(a.blockId) ?? 0) - (pos.get(b.blockId) ?? 0));
  if (report) {
    const added = g.list.filter(x => x.fresh).length, gone = [...old.keys()].filter(id => !g.list.some(x => x.id === id)).length;
    toast(added || gone ? [added ? plural(added, 'nueva', 'nuevas') : '', gone ? plural(gone, 'ya no sale', 'ya no salen') : ''].filter(Boolean).join(' · ') : 'Sin cambios: ya estaban todas');
    sugScroll();
  }
  drawSuggestions();
}
const sugIds = x => [x.id, ...(x.alts || []).map(a => a.id)];
// La misma sugerencia preguntada de otra forma (una de sus «alts»): la elegida pasa a enseñarse y la de antes, a las otras
function swapTo(x, id) {
  const k = (x.alts || []).findIndex(a => a.id === id);
  if (k < 0) return x;
  const { alts, ...shown } = x;
  return { ...alts[k], alts: [shown, ...alts.filter((a, j) => j !== k)], selected: x.selected, rec: x.rec, fresh: false };
}
export function swapSuggestion(i, k) {
  const g = S.sug, x = g?.list[i];
  if (!x?.alts?.[k]) return;
  g.list[i] = swapTo(x, x.alts[k].id);
  g.openAlts = g.list[i].id;
  redrawSuggestions();
  toastAction('Cambiada', 'Deshacer', () => {
    const j = g.list.indexOf(S.sug === g ? g.list.find(y => y.id === x.alts[k].id) : null);
    if (j < 0) return;
    g.list[j] = swapTo(g.list[j], x.id);
    g.openAlts = x.id;
    redrawSuggestions();
  });
}
// Lo que hay que saber de una sugerencia, para la línea de debajo: en un hueco, solo lo que falta
const sugAnswer = x => (x.typeId === 'cloze' ? [...String(x.fields?.x || '').matchAll(/\{\{(.+?)(?:::.+?)?\}\}/g)].map(m => m[1]).join(' · ') || x.back : x.back);
// El texto del apunte de donde sale una sugerencia (para ver qué forma de escribir la ha dado)
function sugSource(p, x) {
  const b = p.blocks.find(y => y.id === x.blockId);
  const t = b ? toPlain(stripImages(b.text)).replace(/\s+/g, ' ').trim() : '';
  return t.length > 90 ? t.slice(0, 88).trimEnd() + '…' : t;
}
// Cómo salen las sugerencias: lo que se escribe y la tarjeta que da
export const SUG_HOW = [
  ['<code>Mitosis: división de una célula</code>', 'Una pregunta y su respuesta: «Mitosis» → «División de una célula»'],
  ['Algo en <b>negrita</b>, <mark class="hl hl-yellow">resaltado</mark>, <u>subrayado</u> o <span class="tc tc-red">en color</span>', 'Una frase para completar, con eso oculto'],
  ['Un título o «Las fases son:» y unas viñetas debajo', '«¿Cuáles son…?» con los puntos; si llevan numeración, ordenar los pasos'],
  ['Un punto con subpuntos (con <kbd>Tab</kbd>)', '«¿Qué incluye el núcleo?» → sus subpuntos'],
  ['Una tabla', 'Una pregunta por celda («Locativo → sufijo» = «-de»); en idiomas, vocabulario o conjugación'],
  ['Una pregunta (<code>¿…?</code>) con la respuesta debajo', 'Esa misma pregunta, con su respuesta'],
  ['«En 1789…», «Década de 1830: …»', '«¿Cuándo?», con el año como respuesta'],
  ['«La OMS (Organización Mundial de la Salud)…»', '«¿Qué significan las siglas OMS?»'],
  ['Un título y su primer párrafo', 'El título como pregunta y la idea principal como respuesta'],
  ['Un destacado o «Importante: …»', 'Sus preguntas salen ya marcadas'],
];
export function drawSuggestions() {
  const g = S.sug, p = S.pages.get(g?.pageId);
  if (!g || !p) return;
  const all = g.list, list = g.only ? all.filter(x => x.blockId === g.only) : all;
  const picked = all.filter(x => x.selected);
  const nCards = picked.reduce((n, x) => n + (x.cards || 1), 0);
  // Filtro por tipo de tarjeta
  const typeIds = [...new Set(list.map(x => x.typeId))];
  const visible = list.filter(x => !g.types || g.types.has(x.typeId));
  const rec = visible.filter(x => x.rec), more = visible.filter(x => !x.rec);
  if (g.showMore == null) g.showMore = rec.length < 5;
  if (g.only) g.showMore = true;
  const hiddenN = sugHidden(p.id).size;
  const tips = writingTips(p, all);
  const deckSel = `<select id="sugDeck" aria-label="Lista donde se crean">${[...S.decks.values()].filter(d => !d.archived).map(d => `<option value="${d.id}" ${d.id === g.deckId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
    <option value="new" ${g.deckId === 'new' ? 'selected' : ''}>+ Lista nueva: «${esc(pageTitle(p).slice(0, 60))}»</option></select>`;
  // Cada sugerencia, como una fila de la lista de un mazo: casilla para crearla, y debajo de dónde sale
  const row = x => {
    const i = all.indexOf(x), t = getType(x.typeId);
    const where = x.section && x.section !== pageTitle(p) ? x.section.split(' › ').at(-1) : '';
    const src = sugSource(p, x);
    return `<li class="sug${x.selected ? ' on' : ''}${x.fresh ? ' is-new' : ''}"><label class="sug-check" title="${x.selected ? 'Se creará' : 'No se creará'}"><input type="checkbox" data-sug="${i}" ${x.selected ? 'checked' : ''} aria-label="Crear esta pregunta"></label>
      <button class="row" data-sug-open="${i}" title="Ver y editar"><span class="f">${fmt(x.front)}</span><span class="b">${fmt(sugAnswer(x))}</span>
        <span class="rmeta"><span class="tchip">${typeIcon(t, 13)} ${esc(t?.name || '')}</span>${x.cards > 1 ? `<span class="muted small">· ${x.cards} preguntas</span>` : ''}${x.edited ? '<span class="muted small">· Retocada</span>' : ''}${x.fresh ? '<span class="sug-new">Nueva</span>' : ''}${where ? `<span class="muted small">· ${esc(where)}</span>` : ''}</span>
        ${src ? `<span class="sug-src" title="Sale de esta parte del apunte (${esc(x.label || '')})">${icon('notebook-text', { size: 12 })} <span>${esc(x.label || '')}</span> <q>${esc(src)}</q></span>` : ''}</button>
      <button type="button" class="iconbtn sug-ed" data-sug-open="${i}" aria-label="Escribirla con tus palabras" title="Escribirla con tus palabras">${icon('pencil', { size: 15 })}</button>
      <button type="button" class="iconbtn sug-x" data-sug-hide="${i}" aria-label="Descartar" title="Descartar: no volverá a salir">${icon('x', { size: 15 })}</button>
      ${x.alts?.length ? `<details class="sug-alts"${g.openAlts === x.id ? ' open' : ''}><summary>Otras formas de preguntarlo (${x.alts.length})</summary>
        <ul>${x.alts.map((a, k) => `<li class="sug-alt"><span class="sug-alt-q"><span class="tchip">${typeIcon(getType(a.typeId), 13)} ${esc(getType(a.typeId)?.name || '')}</span> <span class="f">${fmt(a.front)}</span></span>
          <button type="button" class="ghost sug-use" data-sug-alt="${i}:${k}" title="Ponerla en lugar de la de arriba">Usar esta</button></li>`).join('')}</ul></details>` : ''}</li>`;
  };
  const group = (title, items, key) => items.length ? `<div class="sug-group">
    <div class="sug-gh"><h3>${title} <span class="muted">· ${items.length}</span></h3>
      <button type="button" class="link small" data-sug-group="${key}">${items.every(x => x.selected) ? 'Quitar todas' : 'Marcar todas'}</button></div>
    <ul class="list sug-list">${items.map(row).join('')}</ul></div>` : '';
  const tipBox = tips.length ? `<div class="sug-tips"><p class="sug-tips-h">${icon('lightbulb', { size: 16 })} <b>${list.length ? 'Para sacar más preguntas de este apunte' : 'Así saldrán preguntas de este apunte'}</b></p>
      <ul>${tips.slice(0, 3).map(tp => `<li>${fmt(tp.text)}</li>`).join('')}</ul></div>` : '';
  const how = `<details class="sug-how"${list.length ? '' : ' open'}><summary>${icon('circle-help', { size: 16 })} ¿Cómo se eligen las sugerencias?</summary>
      <p class="muted small">Salen de cómo están escritos los apuntes, sin inteligencia artificial: se fijan en lo que la propia forma del texto señala como importante. Si escribes así, saldrán solas:</p>
      <table class="help-tbl sug-how-tbl"><thead><tr><th>Si escribes</th><th>Sale</th></tr></thead><tbody>${SUG_HOW.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody></table>
      <p class="muted small">En el apunte, una ${icon('sugerencia', { size: 13 })} junto a un bloque indica que de ahí sale alguna pregunta. <label class="sug-marks-opt"><input type="checkbox" id="sugMarksOpt" ${sugMarksOn() ? 'checked' : ''}> Mostrarla</label></p></details>`;
  const body = !list.length
    ? `<div class="sug-empty"><p><b>${g.only ? 'Esta parte del apunte ya no da sugerencias.' : all.length ? '' : 'No he encontrado nada claro que convertir en preguntas.'}</b></p>${tipBox}
        <p class="muted">También puedes seleccionar cualquier texto del apunte y pulsar «Crear pregunta».</p></div>`
    : `${g.only ? `<div class="sug-only">${icon('sugerencia', { size: 15 })} <span>Las de esta parte del apunte</span><button type="button" class="link small" data-act="sug-all">Ver todas (${all.length})</button></div>` : ''}
       ${typeIds.length > 1 ? `<div class="sug-filters" role="group" aria-label="Filtrar por tipo de pregunta">${typeIds.map(id => { const t = getType(id); return `<button type="button" class="chip-btn" data-sug-type="${id}" aria-pressed="${!g.types || g.types.has(id)}">${typeIcon(t, 14)} ${esc(t?.name || id)} <span>${list.filter(x => x.typeId === id).length}</span></button>`; }).join('')}</div>` : ''}
       ${group(g.only ? 'Sugerencias' : 'Recomendadas', g.only ? visible : rec, g.only ? 'all' : 'rec')}
       ${g.only ? '' : more.length ? (g.showMore ? group('Otras posibles', more, 'more') + (rec.length >= 5 ? '<button type="button" class="link sug-toggle" data-act="sug-more">Ocultar las otras posibles</button>' : '')
         : `<button type="button" class="ghost sug-toggle" data-act="sug-more">Ver ${plural(more.length, 'otra posible', 'otras posibles')}</button>`) : ''}
       ${!visible.length ? '<p class="muted">Ninguna sugerencia de estos tipos.</p>' : ''}
       ${g.only ? '' : tipBox}`;
  openSheet(`<div class="sug-wrap">
    <header class="ed-top"><button type="button" class="ed-x" data-act="close-sheet" aria-label="Cerrar">${icon('x', { size: 20 })}</button>
      <div class="ed-title"><span>Preguntas sugeridas</span><small class="muted">${esc(pageTitle(p))}</small></div>
      <button type="button" class="iconbtn sug-refresh" data-act="sug-refresh" aria-label="Actualizar" title="Actualizar: vuelve a leer el apunte (lo que has retocado se queda)">${icon('refresh-cw', { size: 18 })}</button></header>
    <div class="sug-main" id="sugMain">
      ${all.length ? `<p class="sug-intro">He encontrado <b>${plural(all.length, 'posible pregunta', 'posibles preguntas')}</b> en tus apuntes. Las más seguras ya están marcadas: toca una para verla, o descártala con la ✕. Si cambias el apunte, pulsa ${icon('refresh-cw', { size: 13 })} para actualizarlas.</p>
      <p class="sug-own">${icon('pencil', { size: 15 })} <span>Si la escribes con tus palabras, la recordarás mejor.</span></p>
      <div class="sug-deck"><label for="sugDeck">Crear en</label>${deckSel}</div>` : ''}
      ${body}
      ${how}
      ${hiddenN ? `<p class="muted small sug-hidden">${plural(hiddenN, 'sugerencia descartada', 'sugerencias descartadas')} en este apunte · <button type="button" class="link small" data-act="sug-unhide">Recuperarlas</button></p>` : ''}
    </div>
    ${all.length ? `<footer class="ed-foot"><span class="muted small" id="sugCount">${plural(picked.length, 'marcada', 'marcadas')}</span><span class="spacer"></span>
      <button type="button" class="primary" data-act="sug-create" ${nCards ? '' : 'disabled'}>${nCards ? `Crear ${plural(nCards, 'pregunta', 'preguntas')}` : 'Marca alguna'}</button></footer>` : ''}
  </div>`, { full: true });
  if (g.scroll) { const m = $('#sugMain'); if (m) m.scrollTop = g.scroll; g.scroll = 0; }
}
export function hideSuggestion(i) {
  const g = S.sug, x = g?.list[i];
  if (!x) return;
  const set = sugHidden(g.pageId);
  set.add(x.id);
  setSugHidden(g.pageId, set);
  g.list.splice(i, 1);
  redrawSuggestions();
  scheduleSugMarks();
}

/* ---------- La ✨ de los bloques que dan tarjetas (para ir viendo, al escribir, qué forma de escribir funciona) ---------- */
const sugMarksOn = () => { try { return localStorage.getItem('flaski-sugmarks') !== 'off'; } catch { return true; } };
let sugMarkTimer = 0;
export function scheduleSugMarks(wait = 700) { clearTimeout(sugMarkTimer); sugMarkTimer = setTimeout(paintSugMarks, wait); }
export function paintSugMarks() {
  const p = curPage(), box = $('#pgBlocks');
  if (S.view !== 'page' || !p || !box) return;
  box.querySelectorAll('.nb-sugdot').forEach(el => el.remove());
  if (!sugMarksOn()) return;
  const hidden = sugHidden(p.id), count = new Map();
  for (const x of suggestFor(p, p.deck_id && S.decks.has(p.deck_id) ? p.deck_id : '')) if (!hidden.has(x.id)) count.set(x.blockId, (count.get(x.blockId) || 0) + 1);
  for (const [id, n] of count) {
    const nb = box.querySelector(`.nb[data-block="${id}"]`);
    if (!nb) continue;
    nb.insertAdjacentHTML('beforeend', `<button type="button" class="nb-sugdot" data-sug-block="${id}" tabindex="-1" title="${plural(n, 'pregunta sugerida', 'preguntas sugeridas')} de esta parte" aria-label="${plural(n, 'pregunta sugerida', 'preguntas sugeridas')}">${icon('sugerencia', { size: 15 })}</button>`);
  }
}
const sugScroll = () => { const m = $('#sugMain'); if (m && S.sug) S.sug.scroll = m.scrollTop; };
export function redrawSuggestions() { sugScroll(); drawSuggestions(); }
// Editar una sugerencia: el mismo editor que «+ Tarjeta», relleno con su tipo y sus campos
export function openSugEditor(i) {
  const g = S.sug, x = g?.list[i];
  if (!x) return;
  sugScroll();
  const deckId = g.deckId !== 'new' && S.decks.has(g.deckId) ? g.deckId : [...S.decks.keys()][0];
  cardForm(null, { deckId, prefill: { typeId: x.typeId, fields: { ...x.fields }, hint: x.hint || '' }, source: { page_id: g.pageId, block_id: x.blockId }, sugIndex: i });
}
export function saveSugEditor() {
  const e = readEditor(), g = S.sug, x = g?.list[e.sugIndex];
  if (!x) return;
  const type = getType(e.typeId) || BUILTIN_TYPES[0];
  const fields = {};
  for (const f of type.fields) fields[f.id] = String(e.fields[f.id] || '').trim();
  const active = activeTemplates(typeIn(type, $('#c-deck')?.value), fields);
  if (!active.length) return toast(`Falta ${missingFor(type, type.templates[0], fields)}`);
  const sum = summarize(type, active[0], fields);
  Object.assign(x, { typeId: type.id, fields, front: sum.front, back: sum.back, cards: active.length, selected: true, hint: (e.hint || '').trim(), edited: true });
  e.dirty = false;
  closeSheet();
  toast('Sugerencia guardada');
}
export function readSugEdit() {}
// Crea las preguntas de unas sugerencias del apunte (en una lista nueva con su nombre si deckId es 'new')
export async function makeSuggested(p, picked, deckId, source = 'apuntes') {
  if (deckId === 'new' || !deckId) {
    const deck = await api.createDeck({ owner: S.uid, name: pageTitle(p).slice(0, 80) || 'Apuntes', description: '', source, folder_id: p.folder_id || null });
    S.decks.set(deck.id, { tags: [], ...deck });
    deckId = deck.id;
  }
  const base = Date.now() / 1000, rows = [];
  for (const [i, s] of picked.entries()) {
    const type = typeIn(getType(s.typeId), deckId);
    const note = api.newId();
    for (const t of activeTemplates(type, s.fields)) {
      const sum = summarize(type, t, s.fields);
      rows.push({ deck_id: deckId, owner: S.uid, front: sum.front.slice(0, 2000) || '—', back: sum.back.slice(0, 2000) || '—', note: sum.note.slice(0, 2000),
        position: base + i / 1000 + rows.length / 1e6, note_id: note, type_id: s.typeId, template: t.id, fields: s.fields, hint: s.hint || '', tags: [], page_id: p.id, block_id: s.blockId });
    }
  }
  const made = await api.createCards(rows);
  for (const c of made) S.cards.set(c.id, c);
  if (!p.deck_id) { p.deck_id = deckId; savePageSoon(p, 0); }
  migrateDeckLangs();
  return { deckId, made };
}
// Las primeras de un apunte para empezar (la primera vez): del principio, una por bloque, de las que salen marcadas
// y cortas (una frase), sin las que solo preguntan una etiqueta («{{Referéndum:}} …»); si no llegan a n, se
// completan con las demás
export function firstPicks(list, n = 5) {
  const label = x => /\{\{[^}]*:\s*\}\}/.test(x.fields?.x || '');
  const short = x => x.selected !== false && toPlain(x.front || '').length <= 90 && toPlain(x.back || '').length <= 120 && !/\n/.test(x.back || '');
  const good = [...list.filter(x => !label(x) && short(x)), ...list.filter(x => !label(x) && !short(x))], out = [], blocks = new Set();
  for (const x of good) if (out.length < n && !blocks.has(x.blockId)) { out.push(x); blocks.add(x.blockId); }
  for (const x of [...good, ...list]) if (out.length < n && !out.includes(x)) out.push(x);
  return out;
}
// El bloque del apunte donde está una respuesta (para que la pregunta quede unida a su parte); si no, el primero
const fold = x => plainText(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function blockFor(p, answer) {
  const a = fold(answer);
  return (a && p.blocks.find(b => b.type !== 'hr' && fold(b.text).includes(a)))?.id || p.blocks.find(b => b.type !== 'hr')?.id || null;
}
// Las primeras de un tema de ejemplo: las marcadas «primera» en su JSON (cortas y claras), unidas a su parte
export async function temaFirst(p, url) {
  const list = (await (await fetch(url, { cache: 'no-cache' })).json()).filter(x => x.primera);
  return temaPicks(p, list);
}
// Las preguntas de un tema, unidas a su apartado («bloque» en el JSON o, si no, donde está la respuesta),
// con sus dibujos ya guardados (tapar partes de una imagen)
export async function temaPicks(p, list) {
  const picks = temaCards(list).map(x => ({ ...x, blockId: blockFor(p, x.block || x.answer) }));
  for (const x of picks) if (x.image?.svg) await storeImage(x.image.id, new TextEncoder().encode(x.image.svg), 'image/svg+xml');
  if (picks.some(x => x.image)) flushUploads();
  return picks;
}
export async function createSuggested(btn) {
  const g = S.sug, p = S.pages.get(g?.pageId);
  if (!g || !p) return;
  readSugEdit();
  const picked = g.list.filter(s => s.selected);
  if (!picked.length) return;
  btn.disabled = true; btn.textContent = 'Creando…';
  try {
    const { deckId, made } = await makeSuggested(p, picked, g.deckId);
    S.sug = null;
    closeSheet();
    toast(`${plural(made.length, 'pregunta creada', 'preguntas creadas')} en «${S.decks.get(deckId)?.name || 'la lista'}»`);
    if (S.view === 'page') renderPage();
  } catch (e) { btn.disabled = false; btn.textContent = 'Crear'; fail(e); }
}
