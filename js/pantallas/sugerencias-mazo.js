// Flaski · revisar las sugerencias de una en una, como un mazo (en el móvil; en el ordenador se queda la lista).
// Deslizar a la derecha añade, a la izquierda descarta y arriba edita (el mismo deslizar de la tanda, con sus ajustes),
// siempre con botones para quien no desliza, y con el teclado ← → y E. Va por apartados del apunte; al acabar uno,
// se crean las añadidas y se ve cuántas, y se puede seguir con el siguiente. Las que no salían marcadas, al final.
import { icon } from '../icons.js';
import { $, S, esc, fmt, toast, toastAction, fail } from '../comun.js';
import { swipeable, buzz } from '../feel.js';
import { pageTitle } from '../pages.js';
import { typeIcon, getType } from './estudio.js';
import { plural } from './mazos.js';
import { openSheet, closeSheet } from './editor.js';
import { focusPageBlock } from './apuntes.js';
import { sugHidden, setSugHidden, swapTo, sugAnswer, openSugEditor, makeSuggested, drawSuggestions, scheduleSugMarks } from './sugerencias.js';

const PER_ITEM_S = 10;   // lo que se tarda en revisar una, más o menos (para «unos 2 min»)
// En el móvil, el mazo; en el ordenador (o desde la ✨ de un bloque), la lista
export const deckMode = g => matchMedia('(max-width: 699px)').matches && !g.only && g.list.length > 0;

// Los grupos del mazo: un apartado del apunte cada uno (con las que salen marcadas) y, al final, las menos seguras
function buildDeck(g, p) {
  const title = pageTitle(p), groups = [], byName = new Map();
  const top = x => (x.section && x.section !== title ? x.section.split(' › ')[0] : '');
  for (const x of g.list.filter(y => y.rec)) {
    const name = top(x);
    if (!byName.has(name)) { byName.set(name, { name, ids: [] }); groups.push(byName.get(name)); }
    byName.get(name).ids.push(x.id);
  }
  const weak = g.list.filter(y => !y.rec).map(y => y.id);
  if (weak.length) groups.push({ name: 'Menos seguras', ids: weak, weak: true });
  return { groups, gi: 0, i: 0, total: g.list.length, added: [], dropped: [], t0: Date.now(), editing: null, end: false };
}
const findIdx = (g, id) => g.list.findIndex(x => x.id === id || (x.alts || []).some(a => a.id === id));

// «de: Artículo 1 · punto 2»: el apartado y el sitio del bloque dentro de él
function whereIn(p, x) {
  const i = p.blocks.findIndex(b => b.id === x.blockId);
  if (i < 0) return '';
  let h = i - 1;
  while (h >= 0 && !/^h[1-3]$/.test(p.blocks[h].type)) h--;
  const n = p.blocks.slice(h + 1, i + 1).filter(b => !/^h[1-3]$/.test(b.type) && b.type !== 'hr').length;
  const name = h >= 0 ? p.blocks[h].text.replace(/[*_=]/g, '').trim() : pageTitle(p);
  return `${name} · ${p.blocks[i].type === 'ol' ? 'punto' : 'párrafo'} ${n}`;
}
// La pregunta como se verá: los huecos, como un recuadro
function question(x) {
  const f = x.fields || {};
  if (x.typeId === 'cloze' || x.typeId === 'clozechoice') return fmt(String(f.x || x.front).replace(/\{\{(.+?)(?:::.+?)?\}\}/g, '')).replace(//g, '<span class="sd-hole" aria-label="hueco"></span>');
  if (x.typeId === 'whatif') return `${fmt(f.s || '')} ${fmt(f.p || '')}`;
  if (x.typeId === 'truefalse') return `${fmt(f.s || '')} <small class="sd-tf">¿Verdadero o falso?</small>`;
  return fmt(x.front);
}

export function drawDeck() {
  const g = S.sug, p = S.pages.get(g?.pageId);
  if (!g || !p) return;
  if (!g.deck) g.deck = buildDeck(g, p);
  const d = g.deck;
  // Vuelve del editor: lo retocado cuenta como añadido
  if (d.editing) { const x = g.list[findIdx(g, d.editing)]; d.editing = null; if (x?.edited) return decide('add', x); }
  if (d.end) return drawEnd();
  const grp = d.groups[d.gi];
  if (!grp) return finish();
  // Ya no está (descartada, creada…): la siguiente
  const x = g.list[findIdx(g, grp.ids[d.i])];
  if (!x) { d.i++; return d.i >= grp.ids.length ? groupDone() : drawDeck(); }
  const t = getType(x.typeId), many = d.groups.filter(y => !y.weak).length > 1 || d.groups[0]?.name;
  // (del título del apunte, lo último: «La Constitución Española · Título Preliminar» → «Título Preliminar»)
  const title = many ? `${esc(pageTitle(p).split(' · ').at(-1))} · ${d.i + 1} de ${grp.ids.length}` : `Sugerencias · ${d.i + 1} de ${grp.ids.length}`;
  const sub = grp.weak ? 'Estas son menos seguras' : many ? `apartado ${d.gi + 1} de ${d.groups.filter(y => !y.weak).length} · ${esc(grp.name || pageTitle(p))}` : `de tu apunte «${esc(pageTitle(p))}»`;
  const deckName = g.deckId !== 'new' && S.decks.has(g.deckId) ? S.decks.get(g.deckId).name : `una lista nueva: «${pageTitle(p).slice(0, 60)}»`;
  const ans = x.typeId === 'cloze' || x.typeId === 'clozechoice' ? sugAnswer(x) : x.typeId === 'truefalse' ? (x.fields.v === 'F' ? 'Falso' : 'Verdadero') : x.back;
  openSheet(`<div class="sd-wrap" data-sd-deck>
    <header class="sd-top"><button type="button" class="sd-back" data-sd="exit" aria-label="Volver al apunte">${icon('chevron-left', { size: 22 })}</button>
      <div class="sd-head"><h2 class="sd-title">${title}</h2><p class="sd-sub">${sub}</p></div></header>
    <div class="sd-bar" aria-hidden="true">${grp.ids.map((id, j) => `<i class="${j < d.i ? 'sd-done' : j === d.i ? 'sd-now' : ''}"></i>`).join('')}</div>
    ${grp.weak && d.i === 0 ? '<p class="sd-weak">Estas son menos seguras: míralas con calma antes de añadirlas.</p>' : ''}
    <p class="sd-hint" aria-hidden="true">↑ Editar</p>
    <div class="sd-stack">
      <article class="sd-card" data-sd-card tabindex="-1" aria-label="Sugerencia ${d.i + 1} de ${grp.ids.length}">
        <span class="sd-chip">${typeIcon(t, 13)} ${esc(t?.name || '')}</span>
        <div class="sd-q">${question(x)}</div>
        ${ans && x.typeId !== 'whatif' ? `<p class="sd-a"><span>Respuesta:</span> <b>${fmt(String(ans).split('\n')[0])}</b></p>` : ''}
        ${x.alts?.length ? `<details class="sug-alts sd-alts"${g.openAlts === x.id ? ' open' : ''}><summary>Otras formas de preguntarlo (${x.alts.length})</summary>
          <ul>${x.alts.map((a, j) => `<li class="sug-alt"><span class="sug-alt-q"><span class="tchip">${typeIcon(getType(a.typeId), 13)} ${esc(getType(a.typeId)?.name || '')}</span> <span class="f">${fmt(a.front)}</span></span>
            <button type="button" class="ghost sug-use" data-sd-alt="${j}" title="Ponerla en lugar de esta">Usar esta</button></li>`).join('')}</ul></details>` : ''}
        <div class="sd-foot"><span>de: ${esc(whereIn(p, x))}</span><button type="button" class="link" data-sd="see">Ver en el apunte</button></div>
      </article>
    </div>
    <div class="sd-acts">
      <button type="button" class="sd-btn sd-drop" data-sd="drop" aria-label="Descartar" title="Descartar (←)">${icon('x', { size: 30 })}</button>
      <button type="button" class="sd-btn sd-edit" data-sd="edit" aria-label="Editar" title="Editar (E)">${icon('pencil', { size: 26 })}</button>
      <button type="button" class="sd-btn sd-add" data-sd="add" aria-label="Añadir" title="Añadir (→)">${icon('check', { size: 30 })}</button>
    </div>
    <p class="sd-to">Se añaden a <b>${esc(deckName)}</b></p>
  </div>`, { full: true });
  const card = $('[data-sd-card]');
  if (S.prefs.study.swipe !== false) {
    swipeable(card, {
      dirs: { left: 'Descartar', right: 'Añadir', up: 'Editar' }, vertical: true,
      onCross: () => { if (S.prefs.study.haptics) buzz('tick'); },
      onSwipe: dir => act({ left: 'drop', right: 'add', up: 'edit' }[dir]),
    });
  }
}

// Añadir, descartar o editar la que se ve
export function act(what) {
  const g = S.sug, d = g?.deck, grp = d?.groups[d.gi];
  if (!grp || d.end) return;
  const x = g.list[findIdx(g, grp.ids[d.i])];
  if (!x) return;
  if (what === 'edit') { d.editing = x.id; return openSugEditor(findIdx(g, x.id)); }
  decide(what, x);
}
function decide(what, x) {
  const g = S.sug, d = g.deck, at = { gi: d.gi, i: d.i };
  if (what === 'add') { x.selected = true; d.added.push(x); }
  else {
    const set = sugHidden(g.pageId); set.add(x.id); setSugHidden(g.pageId, set);
    d.dropped.push(x);
    toastAction('Descartada', 'Deshacer', () => {
      const s2 = sugHidden(g.pageId); s2.delete(x.id); setSugHidden(g.pageId, s2);
      d.dropped = d.dropped.filter(y => y !== x);
      Object.assign(d, at, { end: false });
      drawSuggestions();
      scheduleSugMarks();
    });
  }
  d.i++;
  if (d.i >= d.groups[d.gi].ids.length) return groupDone();
  drawDeck();
}
// Al acabar un apartado: se crean las añadidas y, si venían más de 2 sugerencias, la pantalla de fin
async function groupDone() {
  const g = S.sug, d = g.deck;
  const grp = d.groups[d.gi], ids = new Set(grp.ids.flatMap(id => { const x = g.list[findIdx(g, id)]; return x ? [x.id] : []; }));
  const added = d.added.filter(x => ids.has(x.id) || grp.ids.includes(x.id));
  grp.result = { n: grp.ids.length, added: added.length, dropped: d.dropped.filter(x => ids.has(x.id) || grp.ids.includes(x.id)).length, ms: Date.now() - d.t0 };
  try { if (added.length) await createAdded(added); } catch (e) { return fail(e); }
  if (d.total <= 2) return finish();
  d.end = true;
  drawEnd();
}
async function createAdded(list) {
  const g = S.sug, p = S.pages.get(g.pageId);
  const { deckId } = await makeSuggested(p, list, g.deckId);
  g.deckId = deckId;
  const made = new Set(list.map(x => x.id));
  g.list = g.list.filter(x => !made.has(x.id));
  g.deck.added = g.deck.added.filter(x => !made.has(x.id));
  scheduleSugMarks();
}
function drawEnd() {
  const g = S.sug, d = g.deck, p = S.pages.get(g.pageId), grp = d.groups[d.gi], r = grp.result, next = d.groups[d.gi + 1];
  const mins = Math.max(1, Math.round(r.ms / 60000)), rest = d.groups.slice(d.gi + 1), restN = rest.reduce((n, y) => n + y.ids.length, 0), restA = rest.filter(y => !y.weak).length;
  const about = n => { const m = Math.round((n * PER_ITEM_S) / 60); return m < 1 ? 'menos de 1 min' : m === 1 ? 'un minuto' : `unos ${m} min`; };
  openSheet(`<div class="sd-wrap sd-end" data-sd-deck>
    <header class="sd-top"><button type="button" class="sd-back sd-close" data-sd="stop" aria-label="Cerrar">${icon('x', { size: 20 })}</button>
      <p class="sd-sub">${esc(pageTitle(p))} · sugerencias</p></header>
    <div class="sd-bar" aria-hidden="true">${grp.ids.map(() => '<i class="sd-done"></i>').join('')}</div>
    <h2 class="sd-end-h">${esc(grp.weak ? 'Las menos seguras' : grp.name || pageTitle(p))}, revisado</h2>
    <p class="sd-end-t">${plural(r.n, 'sugerencia', 'sugerencias')} en ${mins} min</p>
    <div class="sd-count"><span class="sd-c-add"><b>${r.added}</b> ${r.added === 1 ? 'añadida' : 'añadidas'}</span><span class="sd-c-drop"><b>${r.dropped}</b> ${r.dropped === 1 ? 'descartada' : 'descartadas'}</span></div>
    ${r.added ? `<p class="sd-when">${r.added === 1 ? 'La nueva entra' : `Las ${r.added} nuevas entran`} en tus tandas como preguntas nuevas, unas pocas cada día.</p>` : ''}
    ${next ? `<p class="sd-next-h">Siguiente apartado</p>
      <div class="sd-next"><span class="sd-num">${d.gi + 2}</span><span><b>${esc(next.weak ? 'Las menos seguras' : next.name || pageTitle(p))}</b><small>${icon('sugerencia', { size: 14 })} ${plural(next.ids.length, 'sugerencia', 'sugerencias')} · ${about(next.ids.length)}</small></span></div>
      ${rest.length > 1 && restA ? `<p class="sd-left">Quedan ${plural(restA, 'apartado', 'apartados')}${rest.some(y => y.weak) ? ' y las menos seguras' : ''} · ${plural(restN, 'sugerencia', 'sugerencias')}</p>` : ''}` : '<p class="sd-when">Ya no quedan más sugerencias en este apunte.</p>'}
    <div class="sd-end-acts">
      ${next ? `<button type="button" class="primary" data-sd="next">Seguir con el apartado ${d.gi + 2}</button>` : ''}
      <button type="button" class="ghost" data-sd="stop">${next ? 'Por hoy vale' : 'Volver al apunte'}</button>
    </div>
  </div>`, { full: true });
}
async function finish() {
  const g = S.sug, d = g.deck;
  try { if (d.added.length) await createAdded(d.added); } catch (e) { return fail(e); }
  const n = d.groups.reduce((k, y) => k + (y.result?.added || 0), 0);
  S.sug = null;
  closeSheet();
  if (n) toast(`${plural(n, 'pregunta creada', 'preguntas creadas')}`);
}
// Salir (‹ o «Por hoy vale»): lo añadido hasta ahora se crea
async function leave() {
  const g = S.sug, d = g?.deck;
  if (!d) return closeSheet();
  try { if (d.added.length) await createAdded(d.added); } catch (e) { return fail(e); }
  g.deck = null;
  closeSheet();
}

document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-sd], [data-sd-alt]');
  if (!b || !S.sug?.deck) return;
  const g = S.sug, d = g.deck;
  if (b.dataset.sdAlt !== undefined) {
    // «Usar esta»: la cambia sin salir del mazo
    const grp = d.groups[d.gi], k = findIdx(g, grp.ids[d.i]), x = g.list[k], alt = x?.alts?.[+b.dataset.sdAlt];
    if (!alt) return;
    g.list[k] = swapTo(x, alt.id);
    grp.ids[d.i] = alt.id;
    g.openAlts = alt.id;
    drawDeck();
    return toastAction('Cambiada', 'Deshacer', () => { const j = findIdx(g, alt.id); g.list[j] = swapTo(g.list[j], x.id); grp.ids[d.i] = x.id; g.openAlts = x.id; drawDeck(); });
  }
  const what = b.dataset.sd;
  if (['add', 'drop', 'edit'].includes(what)) return act(what);
  if (what === 'next') { d.gi++; d.i = 0; d.end = false; d.t0 = Date.now(); return drawDeck(); }
  if (what === 'stop' || what === 'exit') return leave();
  if (what === 'see') {
    // Se cierra la hoja (el mazo se queda donde estaba) y se va a ese bloque del apunte
    const x = g.list[findIdx(g, d.groups[d.gi].ids[d.i])];
    closeSheet();
    if (x) { S.focusBlock = x.blockId; focusPageBlock(); }
  }
});
document.addEventListener('keydown', e => {
  if (!S.sug?.deck || S.sug.deck.end || !$('[data-sd-card]') || e.target.closest?.('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
  const what = { ArrowRight: 'add', ArrowLeft: 'drop', e: 'edit', E: 'edit' }[e.key];
  if (!what) return;
  e.preventDefault();
  act(what);
});
