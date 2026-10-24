// Flaski · Mis mazos, un mazo e importar/exportar mazos (sale de app.js)
import * as api from '../api.js';
import { toRow } from '../rows.js';
import { fmtWhen, dateKey } from '../srs.js';
import { cardsToCSV } from '../csv.js';
import { icon } from '../icons.js';
import { LANGS, NATIVE } from '../cardtypes.js';
import { folderPath, iconText } from '../org.js';
import { parsePasted } from '../notes.js';
import { readApkg, ankiToFlaski, ankiProgress, ankiHistory } from '../anki.js';
import { storeImage, imageType, newImageId, flushUploads, imageIdsOf, exportImages } from '../media.js';
import { pageTitle, pageSnippet } from '../pages.js';
import { $, main, S, esc, fmt, plain, norm, cardList, toast, fail, tagChips, algo } from '../comun.js';
import { typeIcon, getType, deckLang, langLabel, nativeLang, todayQueue } from './estudio.js';
import { previewImport } from './explorar.js';
import { drag, savePageSoon } from './apuntes.js';
import { seg } from './perfil.js';
import { openSheet, closeSheet, addTag, deckTypes, adoptTypes, migrateDeckLangs } from './editor.js';
import { go } from '../app.js';

/* ===================== mis mazos ===================== */
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Ruta de carpetas: Biblioteca › Idiomas › Turco
export function crumbs(folderId, { linkLast = false } = {}) {
  const path = folderId ? folderPath(S.folders, folderId) : [];
  const parts = [`<button class="crumb" data-folder="">Biblioteca</button>`];
  path.forEach((f, i) => {
    const last = i === path.length - 1 && !linkLast;
    parts.push(last ? `<span class="crumb crumb-cur">${esc(iconText(f.icon) ? iconText(f.icon) + ' ' : '')}${esc(f.name)}</span>`
      : `<button class="crumb" data-folder="${f.id}">${esc(iconText(f.icon) ? iconText(f.icon) + ' ' : '')}${esc(f.name)}</button>`);
  });
  return `<nav class="crumbs" aria-label="Ruta">${parts.join('<span class="sep" aria-hidden="true">/</span>')}</nav>`;
}
export function statusChip(id) {
  const p = S.progress.get(id);
  if (!p) return '<span class="chip">Nueva</span>';
  const now = Date.now();
  return p.due <= now ? '<span class="chip">Toca hoy</span>' : `<span class="chip">En ${fmtWhen(p.due, now)}</span>`;
}
// En una lista: los apuntes de los que salen sus preguntas (o que la tienen como lista)
function deckPages(deckId) {
  const ids = new Set(cardList().filter(c => c.deck_id === deckId && c.page_id).map(c => c.page_id));
  return [...S.pages.values()].filter(p => p.deck_id === deckId || ids.has(p.id));
}

/* ===================== una lista ===================== */
// Etapa de cada pregunta (la misma regla que «Cómo va lo que sabes»): aprendiendo < 1 día, jóvenes < 21 días
const STAGES = [['new', 'nuevas', 'nueva', 'Nuevas'], ['learn', 'aprendiendo', 'aprendiendo', 'Aprendiendo'], ['young', 'jóvenes', 'joven', 'Jóvenes'], ['mature', 'consolidadas', 'consolidada', 'Consolidadas']];
const stageOf = p => (!p ? 'new' : p.interval < 1 ? 'learn' : p.interval < 21 ? 'young' : 'mature');
const SORTS_CARDS = [['next', 'Próximo repaso'], ['position', 'Orden de la lista'], ['az', 'Alfabético']];
const SHOWN = 10;
const MONTH = d => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }).replace('.', '');

// «editado el 18 oct»: lo último que ha cambiado, la lista o alguna de sus preguntas
function editedText(d, cards) {
  const t = Math.max(...[d.updated_at, d.created_at, ...cards.map(c => c.updated_at || c.created_at)].map(x => Date.parse(x || '') || 0));
  return t ? `editado el ${MONTH(new Date(t))}` : '';
}
// Retención de los últimos 30 días (repasos acertados) y repasos de la semana que viene
function deckHealth(d, cards, now) {
  const evs = S.events.filter(e => e.deck_id === d.id && e.state === 'review' && e.t > now - 30 * 864e5);
  const week = cards.filter(c => { const p = S.progress.get(c.id); return p && p.due > now && p.due <= now + 7 * 864e5; }).length;
  const parts = [evs.length >= 5 && `Retención en esta lista: <b>${Math.round((evs.filter(e => e.grade > 1).length / evs.length) * 100)} %</b>`, week && `próxima semana, ${plural(week, 'repaso', 'repasos')}`].filter(Boolean);
  return parts.length ? `<p class="dk-health">${parts.join(' · ')}</p>` : '';
}

export function renderDeck() {
  const d = S.decks.get(S.deckId);
  if (!d) return go('decks');
  if (S.deckShown !== d.id) Object.assign(S, { deckShown: d.id, cardFilter: 'all', cardAll: false });
  const now = Date.now(), endToday = new Date().setHours(24, 0, 0, 0);
  const all = cardList().filter(c => c.deck_id === d.id).sort((a, b) => a.position - b.position);
  // Lo que da «Estudiar»: lo que toca y todas las nuevas (desde la lista no hay límite del día)
  const tq = todayQueue(d.id), c = { due: tq.due, newToday: tq.fresh }, avail = tq.ids.length;
  const stage = new Map(all.map(x => [x.id, stageOf(S.progress.get(x.id))]));
  const n = Object.fromEntries(STAGES.map(([k]) => [k, 0]));
  for (const k of stage.values()) n[k]++;
  // Para hoy: las de «Estudiar»
  const today = new Set(tq.ids);
  const filters = [['all', 'Todas', all.length], ['today', 'Para hoy', today.size], ...STAGES.map(([k, , , label]) => [k, label, n[k]])];
  const f = filters.some(([k, , num]) => k === S.cardFilter && (num || k === 'all')) ? S.cardFilter : 'all';
  const q = norm(S.cardQuery.trim());
  let rows = all.filter(x => (f === 'all' || (f === 'today' ? today.has(x.id) : stage.get(x.id) === f))
    && (!q || norm(x.front).includes(q) || norm(x.back).includes(q) || norm(x.note).includes(q) || (x.tags || []).some(t => norm(S.tags.get(t)?.name).includes(q))));
  const sort = SORTS_CARDS.some(([k]) => k === S.cardSort) ? S.cardSort : 'next';
  if (sort === 'az') rows.sort((a, b) => plain(a.front).localeCompare(plain(b.front), 'es'));
  if (sort === 'next') rows.sort((a, b) => (S.progress.get(a.id)?.due ?? Infinity) - (S.progress.get(b.id)?.due ?? Infinity) || a.position - b.position);
  const matching = rows.length, limited = !q && !S.cardAll && rows.length > SHOWN;
  // Por próximo repaso, las nuevas van al final tras «Nuevas · N»; si no se ven todas, asoman las primeras
  const newSep = sort === 'next' && rows.some(x => S.progress.has(x.id)) && rows.some(x => !S.progress.has(x.id));
  let seen = newSep ? rows.filter(x => S.progress.has(x.id)) : rows, fresh = newSep ? rows.filter(x => !S.progress.has(x.id)) : [];
  const freshN = fresh.length;
  if (limited) {
    seen = seen.slice(0, SHOWN - Math.min(3, fresh.length));
    fresh = fresh.slice(0, SHOWN - seen.length);
  }
  rows = [...seen, ...fresh];
  const fid = d.folder_id && S.folders.has(d.folder_id) ? d.folder_id : null;
  const path = fid ? folderPath(S.folders, fid) : [];
  const lang = deckLang(d.id);
  const meta = [lang && esc(langLabel(lang)), plural(all.length, 'pregunta', 'preguntas'), editedText(d, all), d.archived && 'archivada', d.is_public && 'compartida'].filter(Boolean).join(' · ');
  const split = [c.due && plural(c.due, 'repaso', 'repasos'), c.newToday && plural(c.newToday, 'nueva', 'nuevas')].filter(Boolean);
  const pages = deckPages(d.id);
  const count = limited ? `Mostrando ${rows.length} de ${matching}` : matching === all.length ? plural(all.length, 'pregunta', 'preguntas') : `${matching} de ${all.length} preguntas`;
  // Una pregunta en sentido inverso (de tu idioma al que estudias): «Español → turco», con el icono de doble sentido
  const reversed = (t, x) => {
    const tpl = t.templates.find(y => y.id === x.template);
    if (!tpl || tpl === t.templates[0]) return '';
    if (t.id !== 'reverse' && t.fields.find(f => f.id === tpl.front[0])?.lang !== NATIVE) return '';
    return lang ? `${langLabel(nativeLang()).split(' (')[0]} → ${langLabel(lang).split(' (')[0].toLowerCase()}` : tpl.name;
  };
  const row = x => {
    const p = S.progress.get(x.id), st = stage.get(x.id);
    const t = (x.fields && Object.keys(x.fields).length ? getType(x.type_id) : null) || getType('basic');
    const tpl = t.templates.length > 1 ? t.templates.find(y => y.id === x.template)?.name : '', rev = reversed(t, x);
    const when = !p ? 'nueva' : p.due < endToday ? 'hoy' : `en ${fmtWhen(p.due, now)}`;
    return `<li><button class="row cr cs-${st}" data-card="${x.id}"><i class="cr-dot" aria-hidden="true"></i><span class="cr-f">${fmt(x.front)}</span><span class="cr-b">${fmt(x.back)}</span>
      <span class="cr-t"${tpl ? ` title="${esc(tpl)}"` : ''}>${rev ? `${icon('repeat-2', { size: 14 })} ${esc(rev)}` : `${typeIcon(t, 14)} ${esc(t.name)}`}${tagChips(x.tags || [])}</span><span class="cr-st">${STAGES.find(([k]) => k === st)[2]}</span><span class="cr-due${when === 'hoy' ? ' is-today' : ''}">${when}</span></button></li>`;
  };
  const more = `<button class="dk-more" data-act="deck-menu" aria-label="Más opciones" aria-haspopup="menu" title="Más opciones">${icon('ellipsis', { size: 22 })}</button>`;
  main.innerHTML = `<div class="dk">
    <div class="lib-top dk-top">
      <button class="back-round" data-folder="${fid || ''}" aria-label="Volver">${icon('chevron-left', { size: 20 })}</button>
      <nav class="crumbs" aria-label="Ruta">${[`<button class="crumb" data-folder="">Biblioteca</button>`, ...path.map((x, i) => `<button class="crumb${i === path.length - 1 ? ' crumb-cur' : ''}" data-folder="${x.id}">${esc(x.name)}</button>`)].join('<span class="sep" aria-hidden="true">›</span>')}</nav>
      <span class="spacer"></span>${more}
    </div>
    <header class="deckhead dk-head">
      <div class="dk-id"><h1 class="dk-title">${esc(d.name)}</h1>${d.description ? `<p class="dk-desc">${fmt(d.description)}</p>` : ''}<p class="dk-meta">${meta}</p></div>
      <div class="dk-today">
        <div class="dk-num">${avail ? `<b>${avail}</b><span class="dk-para">para hoy</span>` : `<span class="dk-para dk-done">${all.length ? 'al día' : 'vacía'}</span>`}
          ${split.length ? `<span class="dk-split">${split.map(s => `<span>${s}</span>`).join('<span class="dk-sep" aria-hidden="true"> · </span>')}</span>` : ''}</div>
        <div class="dk-acts"><button class="primary big dk-study" data-start="${d.id}" ${avail ? '' : 'disabled'}>${icon('play', { size: 20 })} Estudiar</button>
          <button class="dk-add" data-act="add-menu" aria-label="Añadir preguntas" aria-haspopup="menu" title="Añadir preguntas">${icon('plus', { size: 24 })}</button>${more}</div>
      </div>
    </header>
    ${all.length ? `<section class="dk-state" aria-labelledby="h-dkst"><h2 class="dk-h" id="h-dkst">Estado</h2>
      <span class="dk-bar" role="img" aria-label="${STAGES.map(([k, label]) => `${n[k]} ${label}`).join(', ')}">${STAGES.map(([k]) => (n[k] ? `<i class="cs-${k}" style="flex:${n[k]}"></i>` : '')).join('')}</span>
      <ul class="dk-key">${STAGES.map(([k, label]) => `<li class="cs-${k}"><b>${n[k]}</b><span><i aria-hidden="true"></i>${label}</span></li>`).join('')}</ul>
      ${deckHealth(d, all, now)}</section>` : ''}
    <section class="dk-qs" aria-labelledby="h-dkqs">
      <div class="dk-qh"><h2 class="dk-h" id="h-dkqs">Preguntas</h2>
        <div class="seg dk-view" role="group" aria-label="Vista" hidden><button type="button" class="seg-b" aria-pressed="true">${icon('list', { size: 16 })} Lista</button><button type="button" class="seg-b" aria-pressed="false">${icon('layout-grid', { size: 16 })} Mapa</button></div></div>
      ${all.length ? `<label class="lib-search dk-search">${icon('search', { size: 18 })}<input id="cardSearch" type="search" placeholder="Buscar en esta lista" aria-label="Buscar preguntas" value="${esc(S.cardQuery)}"></label>
      <div class="filters chips-scroll">${filters.filter(([k, , num]) => num || k === 'all' || k === f).map(([k, label, num]) => `<button class="fchip" data-cfilter="${k}" aria-pressed="${k === f}">${label} · ${num}</button>`).join('')}</div>
      <div class="org-bar"><label class="sort-inline">Orden: <select id="cardSort" aria-label="Ordenar las preguntas">${SORTS_CARDS.map(([k, label]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
      <div class="cr-head" aria-hidden="true"><span></span><span>Pregunta</span><span>Respuesta</span><span>Tipo</span><span>Estado</span><span>Repaso</span></div>
      <ul class="list cr-list" id="cardRows">${seen.map(row).join('')}${newSep ? `<li class="cr-sep">Nuevas · ${freshN}</li>` : ''}${fresh.map(row).join('')}</ul>
      ${rows.length ? '' : '<p class="muted small">Ninguna pregunta coincide.</p>'}
      <div class="dk-foot${limited ? ' is-limited' : ''}"><span id="cardCount">${count}</span>${limited ? `<button class="link" data-act="cards-all">Ver todas<span class="dk-m"> las ${matching} preguntas</span></button>` : ''}</div>`
      : '<div class="empty"><p class="muted">Esta lista aún no tiene preguntas. Añádelas con el botón +.</p></div>'}
    </section>
    ${pages.length || S.pages.size ? `<section class="dk-notes" aria-labelledby="h-dknt"><div class="dk-nh"><h2 class="dk-h" id="h-dknt">Apuntes vinculados</h2>${pages.length ? `<span class="muted small">${pages.length}</span>` : ''}</div>
      ${pages.length ? `<ul class="dk-nlist">${pages.map(p => `<li><button class="dk-note" data-page="${p.id}"><span class="dk-nic" aria-hidden="true">${p.icon ? esc(p.icon) : icon('file-text', { size: 22 })}</span>
        <span class="dk-nt"><b>${esc(pageTitle(p))}</b>${pageSnippet(p) ? `<small>${esc(pageSnippet(p))}</small>` : ''}</span>${icon('chevron-right', { size: 18 })}</button></li>`).join('')}</ul>` : ''}
      ${[...S.pages.values()].some(p => !pages.includes(p)) ? `<button class="link dk-link" data-act="link-note">${pages.length ? 'Vincular otro apunte' : 'Vincular un apunte'}</button>` : ''}</section>` : ''}
  </div>`;
  fitDeckTitle();
  document.fonts?.ready.then(fitDeckTitle);
}

// En el ordenador el título va en una línea: si no cabe, baja de tamaño (y solo si es muy largo, se parte, ya en pequeño)
function fitDeckTitle() {
  const h = main.querySelector('.dk-title');
  if (!h) return;
  h.style.fontSize = '';
  h.classList.toggle('is-fit', matchMedia('(min-width:960px)').matches);
  if (!h.classList.contains('is-fit')) return;
  let size = parseFloat(getComputedStyle(h).fontSize);
  while (h.scrollWidth > h.clientWidth && size > 36) h.style.fontSize = `${size -= 2}px`;
  if (h.scrollWidth > h.clientWidth) h.classList.remove('is-fit');   // ni así cabe: se parte, ya en pequeño
}
addEventListener('resize', () => { if (S.view === 'deck') fitDeckTitle(); });

/* ---------- «+» y «…»: hoja en el móvil, menú desplegable en el ordenador ---------- */
const mItem = (attr, ic, title, sub = '', danger = false) => `<button type="button" role="menuitem" class="dk-mi${danger ? ' danger' : ''}" ${attr}>
  <span class="dk-mic" aria-hidden="true">${icon(ic, { size: 22 })}</span><span class="dk-mt"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${danger ? '' : icon('chevron-right', { size: 18 })}</button>`;
function menuHTML(kind, d, sheet) {
  if (kind === 'add') return `<div class="dk-mh"><h2>Añadir preguntas</h2><p>a «${esc(d.name)}»</p></div><div class="dk-menu" role="menu">
    ${mItem('data-act="new-card"', 'plus', 'Una pregunta', 'Eliges el tipo y la escribes')}
    ${mItem('data-act="quick-add"', 'clipboard-list', 'Varias de golpe', 'Pega líneas «palabra = significado» o una tabla')}
    ${mItem('data-act="from-note"', 'file-text', 'Desde un apunte', 'Con las sugerencias de tus apuntes')}
    ${mItem('data-act="import"', 'download', 'Importar archivo', 'CSV o un mazo de Anki')}</div>`;
  const lang = deckLang(d.id), total = cardList().filter(c => c.deck_id === d.id).length;
  return `<div class="dk-mh">${sheet ? `<h2>${esc(d.name)}</h2><p>${[plural(total, 'pregunta', 'preguntas'), lang && esc(langLabel(lang))].filter(Boolean).join(' · ')}</p>` : `<h2>Más opciones</h2><p>${esc(d.name)}</p>`}</div><div class="dk-menu" role="menu">
    ${mItem('data-act="edit-deck"', 'pencil', 'Editar lista', 'Nombre, descripción, idioma y etiquetas')}
    ${mItem(`data-stats="${d.id}"`, 'chart-line', 'Estadísticas de esta lista')}
    ${mItem('data-act="share"', 'upload', 'Compartir', 'Con un enlace; quien la añada tendrá su copia')}
    ${mItem('data-act="move-deck"', 'folder-input', 'Mover a otra carpeta')}
    ${mItem('data-act="export-csv"', 'download', 'Exportar', 'En CSV, para Excel u otra app')}
    ${d.archived ? mItem('data-act="archive-deck"', 'archive', 'Desarchivar', 'Vuelve a salir en Hoy y en las tandas') : mItem('data-act="archive-deck"', 'archive', 'Archivar', 'Deja de salir en Hoy; no se borra nada')}
    ${mItem('data-act="ask-delete-deck"', 'trash-2', 'Borrar lista', '', true)}</div>`;
}
export function deckMenu(kind, anchor) {
  const d = S.decks.get(S.deckId);
  if (!d) return;
  const pop = $('#dkPop');
  if (pop && !pop.hidden && pop.dataset.kind === kind) return closeDeckMenu();
  if (matchMedia('(max-width:699px)').matches) return openSheet(`<div class="dk-msheet">${menuHTML(kind, d, true)}</div>`);
  let el = pop;
  if (!el) { el = document.createElement('div'); el.id = 'dkPop'; el.className = 'dk-pop'; document.body.appendChild(el); }
  el.dataset.kind = kind;
  el.innerHTML = menuHTML(kind, d, false);
  el.hidden = false;
  anchor.setAttribute('aria-expanded', 'true');
  const r = anchor.getBoundingClientRect(), w = Math.min(380, innerWidth - 16);
  el.style.width = w + 'px';
  el.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + scrollX + 'px';
  el.style.top = r.bottom + 10 + scrollY + 'px';
  if (anchor.matches(':focus-visible')) el.querySelector('button')?.focus({ preventScroll: true });
}
export function closeDeckMenu() {
  const el = $('#dkPop');
  if (!el || el.hidden) return;
  el.hidden = true;
  document.querySelectorAll('[aria-expanded="true"][data-act$="-menu"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
document.addEventListener('pointerdown', e => { if (!e.target.closest?.('#dkPop, [data-act="add-menu"], [data-act="deck-menu"]')) closeDeckMenu(); });
document.addEventListener('click', e => { if (e.target.closest?.('#dkPop button')) closeDeckMenu(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#dkPop')?.hidden) closeDeckMenu(); });
addEventListener('resize', closeDeckMenu);

// «Desde un apunte»: se elige el apunte y se abren sus sugerencias, que van a esta lista
export function fromNoteSheet() {
  const d = S.decks.get(S.deckId), linked = deckPages(d.id);
  const others = [...S.pages.values()].filter(p => !linked.includes(p)).sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const item = p => `<button data-note-sug="${p.id}">${icon('file-text', { size: 22 })}<span><b>${esc(pageTitle(p))}</b>${pageSnippet(p, 70) ? `<small>${esc(pageSnippet(p, 70))}</small>` : ''}</span></button>`;
  openSheet(`<h2>Desde un apunte</h2>${S.pages.size
    ? `<p class="muted small">Elige el apunte: verás las preguntas que se pueden sacar de él y se añadirán a «${esc(d.name)}».</p>
      <div class="lib-pick">${[...linked, ...others].map(item).join('')}</div>`
    : '<p class="muted">Aún no tienes apuntes. Escribe uno y Flaski te sugerirá preguntas a partir de lo que pongas.</p><div class="btnrow"><span class="spacer"></span><button class="primary" data-act="new-page">Crear un apunte</button></div>'}`);
}
// «Vincular otro apunte»: el apunte pasa a tener esta lista (sus preguntas nuevas irán aquí)
export function linkNoteSheet() {
  const d = S.decks.get(S.deckId), linked = deckPages(d.id);
  const rest = [...S.pages.values()].filter(p => !linked.includes(p)).sort((a, b) => pageTitle(a).localeCompare(pageTitle(b), 'es'));
  openSheet(`<h2>Vincular un apunte</h2><p class="muted small">Las preguntas que crees desde el apunte irán a «${esc(d.name)}».</p>
    <div class="lib-pick">${rest.map(p => { const other = p.deck_id && S.decks.get(p.deck_id);
      return `<button data-link-page="${p.id}">${icon('file-text', { size: 22 })}<span><b>${esc(pageTitle(p))}</b>${other ? `<small>Ahora va a «${esc(other.name)}»</small>` : ''}</span></button>`; }).join('')}</div>`);
}
export function linkPage(id) {
  const p = S.pages.get(id);
  if (!p) return;
  p.deck_id = S.deckId;
  savePageSoon(p, 0);
  closeSheet();
  toast(`«${pageTitle(p)}» vinculado`);
  renderDeck();
}

/* ===================== archivos ===================== */
// Formato de archivo de mazo (ver README):
// { "format": "flaski-deck", "version": 1, "name": "...", "description": "...", "cards": [ { "front", "back", "note" } ] }
export function parseDeckFile(data) {
  if (!data || typeof data !== 'object') throw new Error('El archivo no es una lista válida');
  const cards = (Array.isArray(data.cards) ? data.cards : [])
    .filter(c => c && ((String(c.front || '').trim() && String(c.back || '').trim()) || (c.fields && typeof c.fields === 'object')))
    .map(c => ({
      front: String(c.front || ''), back: String(c.back || ''), note: String(c.note || ''),
      type_id: typeof c.type_id === 'string' ? c.type_id : 'basic', template: typeof c.template === 'string' ? c.template : 't1',
      fields: c.fields && typeof c.fields === 'object' && !Array.isArray(c.fields) ? c.fields : {}, note_id: typeof c.note_id === 'string' ? c.note_id : null,
      hint: String(c.hint || ''),
    }));
  if (!cards.length) throw new Error('El archivo no tiene preguntas');
  return { name: String(data.name || 'Lista importada').slice(0, 80), description: String(data.description || '').slice(0, 300), cards, types: Array.isArray(data.types) ? data.types : [],
    images: data.images && typeof data.images === 'object' ? data.images : null,
    lang: typeof data.lang === 'string' && (data.lang === '' || LANGS.some(l => l.id === data.lang)) ? data.lang : undefined };
}
export async function importFile(file) {
  if (/\.(apkg|colpkg)$/i.test(file.name)) return importAnki(file);
  try {
    const text = await file.text();
    const baseName = file.name.replace(/\.(flaski\.json|kartlar\.json|json|csv|tsv|txt)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Lista importada';
    // .csv y .tsv siempre como CSV; lo demás puede ser JSON (también entre ```json, como lo dan las IAs)
    const parsed = /\.(csv|tsv)$/i.test(file.name) ? { kind: 'csv', text } : parsePasted(text);
    previewImport(parsed, { source: 'archivo', baseName });
  } catch (e) { toast(e.message || 'No se pudo leer el archivo'); }
}
/* ---------------- Importar de Anki ---------------- */
async function importAnki(file) {
  openSheet(`<h2 class="sheet-hand">Importar de Anki</h2><p class="muted" role="status">Leyendo «${esc(file.name)}»…</p>`);
  try {
    const col = await readApkg(new Uint8Array(await file.arrayBuffer()));
    const r = ankiToFlaski(col, { newImageId });
    if (!r.total) throw new Error('No se ha encontrado ninguna pregunta en el archivo.');
    const base = file.name.replace(/\.(apkg|colpkg)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Anki';
    S.anki = { col, r, base };
    const withProgress = col.cards.some(c => c.type > 0);
    const sounds = col.notes.some(n => n.fields.some(f => f.includes('[sound:')));
    const sample = r.decks.flatMap(d => d.cards).slice(0, 5).map(c => `<li><span>${fmt(c.front)}</span><b>${fmt(c.back)}</b></li>`).join('');
    const names = ankiDeckNames(r.decks, base);
    openSheet(`<h2 class="sheet-hand">Importar de Anki</h2>
      <p class="muted small">${plural(r.total, 'pregunta', 'preguntas')} de ${plural(r.notes, 'nota', 'notas')}${r.images.size ? ` · ${plural(r.images.size, 'imagen', 'imágenes')}` : ''}</p>
      <ul class="preview">${sample}</ul>
      <p class="anki-dest"><b>${r.decks.length === 1 ? 'Se creará la lista' : `Se crearán ${r.decks.length} listas en la carpeta «${esc(names.folder)}»`}</b></p>
      <ul class="anki-decks">${r.decks.map((d, i) => `<li><span>${esc(names.decks[i])}</span><span class="muted">${d.cards.length}</span></li>`).join('')}</ul>
      ${withProgress ? '<label class="anki-check"><input type="checkbox" id="ankiProgress" checked> Traer también mi progreso y el historial de repasos</label>' : ''}
      ${r.skipped ? `<p class="muted small">${r.skipped === 1 ? 'Se salta 1 nota vacía o sin preguntas' : `Se saltan ${r.skipped} notas vacías o sin preguntas`}.</p>` : ''}
      ${sounds ? '<p class="muted small">Los audios de Anki no se importan: Flaski lee en voz alta los campos que tienen idioma.</p>' : ''}
      <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-act="add-anki">Importar</button></div>`);
  } catch (e) {
    console.error(e);
    openSheet(`<h2>No se ha podido importar</h2><p>${esc(e.message || 'El archivo no es un mazo de Anki válido.')}</p>
      <p class="muted small">En Anki: Archivo → Exportar… → «Paquete de mazos de Anki (.apkg)».</p>
      <div class="btnrow"><span class="spacer"></span><button class="primary" data-act="close-sheet">Cerrar</button></div>`);
  }
}
// Nombres de los mazos: la parte común de la ruta pasa a ser la carpeta
// («Idiomas::Turco» e «Idiomas::Japonés» → carpeta «Idiomas» con los mazos «Turco» y «Japonés»)
function ankiDeckNames(decks, base) {
  if (decks.length === 1) return { folder: null, decks: [decks[0].name.slice(0, 80)] };
  let common = 0;
  while (decks.every(d => d.path.length > common + 1 && d.path[common] === decks[0].path[common])) common++;
  return {
    folder: common ? decks[0].path.slice(0, common).join(' › ') : base,
    decks: decks.map(d => (d.path.slice(common).join(' › ') || d.name).slice(0, 80)),
  };
}
export async function addAnki(btn) {
  const a = S.anki;
  if (!a || !btn) return;
  const { col, r, base } = a;
  const progress = !!$('#ankiProgress')?.checked;
  const step = t => { btn.textContent = t; };
  btn.disabled = true;
  try {
    // Imágenes, con el id que ya llevan los textos
    let i = 0;
    for (const [name, id] of r.images) {
      step(`Imágenes ${++i}/${r.images.size}…`);
      try { await storeImage(id, await col.media.get(name)(), imageType(name)); } catch {}
    }
    flushUploads();
    step('Creando las listas…');
    const typeMap = await adoptTypes(r.types);
    const tagIds = new Map();
    for (const n of new Set(r.decks.flatMap(d => d.cards.flatMap(c => c.tagNames)))) { const t = await addTag(n); if (t) tagIds.set(n, t.id); }
    const names = ankiDeckNames(r.decks, base);
    let folder = null;
    if (names.folder) {
      folder = await api.createFolder({ owner: S.uid, name: names.folder.slice(0, 80), icon: '', color: '', position: Date.now() / 1000, parent_id: S.view === 'decks' ? S.folderId || null : null });
      S.folders.set(folder.id, folder);
    }
    const ankiCard = new Map(col.cards.map(c => [c.id, c]));
    const byAnki = new Map();   // id de la pregunta en Anki → [id en Flaski, lista]
    let firstDeck = null;
    for (const [k, d] of r.decks.entries()) {
      step(`Lista ${k + 1}/${r.decks.length}…`);
      const cards = d.cards.map(c => ({ ...c, tags: c.tagNames.map(n => tagIds.get(n)).filter(Boolean) }));
      const { deck, cards: made } = await api.importDeck(S.uid, { name: names.decks[k], description: 'Importado de Anki', source: 'anki', cards, typeMap });
      S.decks.set(deck.id, { tags: [], ...(folder ? await api.updateDeck(deck.id, { folder_id: folder.id }) : deck) });
      firstDeck ||= deck.id;
      made.forEach((c, j) => { S.cards.set(c.id, c); if (d.cards[j]?.anki) byAnki.set(d.cards[j].anki, [c.id, deck.id]); });
    }
    if (progress && byAnki.size) {
      step('Progreso…');
      const { events, seen } = ankiHistory(col.revlog, [...byAnki.keys()]);
      const now = Date.now(), rows = [];
      for (const [aid, [id]] of byAnki) {
        const p = ankiProgress(ankiCard.get(aid), col.crt, now, seen.get(aid));
        if (p) { S.progress.set(id, p); rows.push(toRow(S.uid, id, p)); }
      }
      if (rows.length) await api.saveProgressMany(rows);
      const evs = events.map(({ anki, ...e }) => { const [id, deckId] = byAnki.get(anki); return { ...e, id: api.newId(), user_id: S.uid, card_id: id, deck_id: deckId }; });
      if (evs.length) {
        await api.addEvents(evs.map(({ t, ...row }) => row));
        S.events.push(...evs);
        S.events.sort((x, y) => x.t - y.t);
        const perDay = {};
        for (const e of evs) { const k = dateKey(e.t); perDay[k] = (perDay[k] || 0) + 1; }
        await api.mergeLog(S.uid, Object.entries(perDay).map(([day, count]) => ({ day, count })));
        for (const [day, n] of Object.entries(perDay)) S.log[day] = Math.max(S.log[day] || 0, n);
      }
    }
    S.anki = null;
    migrateDeckLangs();
    closeSheet();
    toast(`${plural(r.total, 'pregunta importada', 'preguntas importadas')} de Anki`);
    if (folder) go('decks', { folderId: folder.id }); else go('deck', { deckId: firstDeck, cardQuery: '' });
  } catch (e) { btn.disabled = false; btn.textContent = 'Importar'; fail(e); }
}
export function download(text, filename, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export async function exportDeck(kind) {
  const d = S.decks.get(S.deckId);
  const cards = cardList().filter(c => c.deck_id === d.id).sort((a, b) => a.position - b.position)
    .map(c => ({ front: c.front, back: c.back, note: c.note || '' }));
  const slug = d.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'lista';
  if (kind === 'csv') return download(cardsToCSV(cards), slug + '.csv', 'text/csv;charset=utf-8');
  const full = cardList().filter(c => c.deck_id === d.id).sort((a, b) => a.position - b.position)
    .map(c => ({ front: c.front, back: c.back, note: c.note || '', type_id: c.type_id || 'basic', template: c.template || 't1', fields: c.fields || {}, note_id: c.note_id || null, hint: c.hint || '' }));
  const data = { format: 'flaski-deck', version: 2, name: d.name, description: d.description || '', lang: deckLang(d.id), types: deckTypes(d.id), cards: full };
  // Las imágenes van dentro del archivo, para que el mazo llegue completo a quien lo reciba
  const ids = imageIdsOf({ cards: full });
  if (ids.size) data.images = await exportImages(ids);
  download(JSON.stringify(data, null, 2), slug + '.flaski.json', 'application/json');
}
