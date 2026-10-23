// Flaski · Mis mazos, un mazo e importar/exportar mazos (sale de app.js)
import * as api from '../api.js';
import { toRow } from '../rows.js';
import { fmtWhen, dateKey } from '../srs.js';
import { cardsToCSV } from '../csv.js';
import { icon } from '../icons.js';
import { LANGS } from '../cardtypes.js';
import { SORTS, folderPath, decksInFolder, sortDecks, matchesDeck, descendants } from '../org.js';
import { parsePasted } from '../notes.js';
import { readApkg, ankiToFlaski, ankiProgress, ankiHistory } from '../anki.js';
import { storeImage, imageType, newImageId, flushUploads, imageIdsOf, exportImages } from '../media.js';
import { pageTitle } from '../pages.js';
import { $, main, S, esc, fmt, norm, cardList, toast, fail, deckIcon, tagChips, algo, counts, planMeta } from '../comun.js';
import { typeIcon, getType, deckLang, langLabel } from './estudio.js';
import { go, previewImport, drag, seg, openSheet, closeSheet, addTag, deckTypes, adoptTypes, migrateDeckLangs } from '../app.js';

/* ===================== mis mazos ===================== */
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const LIST_ICON = icon('list', { size: 18 });
const GRID_ICON = icon('layout-grid', { size: 18 });
const MOVE_ICON = icon('folder-input', { size: 20 });
const PIN_ICON = icon('pin', { size: 14, cls: 'pin', label: 'Fijado' });

// Ruta de carpetas: Mis mazos › Idiomas › Turco
export function crumbs(folderId, { linkLast = false } = {}) {
  const path = folderId ? folderPath(S.folders, folderId) : [];
  const parts = [`<button class="crumb" data-folder="">Mis mazos</button>`];
  path.forEach((f, i) => {
    const last = i === path.length - 1 && !linkLast;
    parts.push(last ? `<span class="crumb crumb-cur">${esc(f.icon ? f.icon + ' ' : '')}${esc(f.name)}</span>`
      : `<button class="crumb" data-folder="${f.id}">${esc(f.icon ? f.icon + ' ' : '')}${esc(f.name)}</button>`);
  });
  return `<nav class="crumbs" aria-label="Ruta">${parts.join('<span class="sep" aria-hidden="true">/</span>')}</nav>`;
}

export function renderDecks() {
  if (S.folderId && !S.folders.has(S.folderId)) S.folderId = null;
  const folder = S.folderId ? S.folders.get(S.folderId) : null;
  const o = S.org;
  const filtering = !!(o.query.trim() || o.tagIds.length || o.archived);
  const stats = new Map([...S.decks.values()].map(d => [d.id, counts(d.id)]));
  const parentOf = f => (f.parent_id && S.folders.has(f.parent_id) ? f.parent_id : null);
  const deckFolder = d => (d.folder_id && S.folders.has(d.folder_id) ? d.folder_id : null);

  let decks, folders = [];
  if (filtering) {
    decks = [...S.decks.values()].filter(d => matchesDeck(d, { query: o.query.trim(), tagIds: o.tagIds, archived: o.archived }));
  } else {
    decks = [...S.decks.values()].filter(d => !d.archived && deckFolder(d) === (folder?.id || null));
    folders = [...S.folders.values()].filter(f => parentOf(f) === (folder?.id || null)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }
  decks = sortDecks(decks, o.sort, stats);

  const where = d => {
    if (!filtering || !deckFolder(d)) return '';
    return folderPath(S.folders, d.folder_id).map(f => f.name).join(' / ') + ' · ';
  };
  // Lo que toca de un mazo, a mano: «9 hoy», «al día» o «vacío»
  const dueHand = c => (c.due + c.newToday ? `${c.due + c.newToday} hoy` : c.total ? 'al día' : 'vacío');
  const deckCard = (d, mini = false) => {
    const c = stats.get(d.id), pend = c.due + c.newToday, pct = c.total ? Math.round((c.mature / c.total) * 100) : 0;
    const ic = d.icon ? `<span class="dc-ic dc-emoji" aria-hidden="true">${esc(d.icon)}</span>` : `<span class="dc-ic" aria-hidden="true">${deckGlyph(d)}</span>`;
    const body = `${ic}<span class="dname">${esc(d.name)}${d.pinned ? PIN_ICON : ''}</span>
        ${!mini && d.tags?.length ? `<span class="tags">${tagChips(d.tags)}</span>` : ''}
        <span class="dc-foot"><span class="dc-due${pend ? ' on' : ''}">${dueHand(c)}</span><span class="meta">${where(d)}${plural(c.total, 'tarjeta', 'tarjetas')}${planMeta(d)}</span></span>
        ${c.total ? `<span class="mini" aria-label="${pct} % consolidadas"><span style="width:${pct}%"></span></span>` : ''}`;
    if (mini) return `<li><button class="deck dcard dcard-mini" data-open="${d.id}">${body}</button></li>`;
    return `<li class="has-more" draggable="true" data-drag-deck="${d.id}"><button class="deck dcard${c.total ? '' : ' dcard-empty'}" data-open="${d.id}">${body}</button><button class="row-more tile-more" data-move="${d.id}" aria-label="Mover «${esc(d.name)}» a otra carpeta" title="Mover a otra carpeta">${MOVE_ICON}</button></li>`;
  };
  // Carpetas: una tarjeta del color del tema con sus primeros mazos dentro
  const folderRows = folders.map(f => {
    const fc = counts('folder:' + f.id);
    const all = decksInFolder(S.decks, S.folders, f.id).filter(d => !d.archived);
    const sub = descendants(S.folders, f.id), np = [...S.pages.values()].filter(p => sub.has(p.folder_id)).length;
    const top = sortDecks(all, 'due', stats).slice(0, 4);
    return `<li class="fcard folder">
      <span class="fcard-deco" aria-hidden="true">${f.icon ? esc(f.icon) : icon('folder', { size: 84 })}</span>
      <span class="fcard-k">carpeta</span>
      <button class="fcard-name" data-folder="${f.id}">${esc(f.name)}</button>
      <span class="fcard-meta">${plural(all.length, 'mazo', 'mazos')} · ${fc.due + fc.newToday} pendientes${np ? ` · ${plural(np, 'apunte', 'apuntes')}` : ''}</span>
      ${top.length ? `<ul class="fcard-grid">${top.map(d => deckCard(d, true)).join('')}</ul>` : ''}
      <button class="fcard-go" data-folder="${f.id}">${all.length ? `Ver ${all.length === 1 ? 'el mazo' : `los ${all.length} mazos`}` : 'Abrir la carpeta'}<span class="go-dot" aria-hidden="true">${icon('chevron-right', { size: 16 })}</span></button>
    </li>`;
  }).join('');

  const deckRows = decks.map(d => {
    if (o.layout === 'grid') return deckCard(d);
    const c = stats.get(d.id);
    const pend = c.due + c.newToday;
    return `<li class="has-more" draggable="true" data-drag-deck="${d.id}"><button class="deck" data-open="${d.id}">${deckIcon(d)}
      <span class="info"><span class="dname">${esc(d.name)}${d.pinned ? PIN_ICON : ''}</span>
        ${d.tags?.length ? `<span class="tags">${tagChips(d.tags)}</span>` : ''}
        <span class="meta">${where(d)}${plural(c.total, 'tarjeta', 'tarjetas')}${pend ? ` · ${pend} para hoy` : ''}${planMeta(d)}${d.is_public ? ' · compartido' : ''}${d.archived ? ' · archivado' : ''}</span></span>
      </button><button class="row-more" data-move="${d.id}" aria-label="Mover «${esc(d.name)}» a otra carpeta" title="Mover a otra carpeta">${MOVE_ICON}</button></li>`;
  }).join('');

  const tagFilter = [...S.tags.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(t =>
    `<button class="fchip" data-tagfilter="${t.id}" aria-pressed="${o.tagIds.includes(t.id)}">${esc(t.name)}</button>`).join('');

  let studyBtn = '';
  if (!filtering && folder) {
    const fc = counts('folder:' + folder.id); const n = fc.due + fc.newToday;
    studyBtn = `<button class="primary" data-start="folder:${folder.id}" ${n ? '' : 'disabled'}>Estudiar carpeta${n ? ' · ' + n : ''}</button>`;
  } else if (o.tagIds.length === 1 && !o.archived) {
    const tc = counts('tag:' + o.tagIds[0]); const n = tc.due + tc.newToday;
    studyBtn = `<button class="primary" data-start="tag:${o.tagIds[0]}" ${n ? '' : 'disabled'}>Estudiar #${esc(S.tags.get(o.tagIds[0])?.name || '')}${n ? ' · ' + n : ''}</button>`;
  }

  const oneTag = o.tagIds.length === 1 && !o.query.trim() && !o.archived ? S.tags.get(o.tagIds[0]) : null;
  const title = filtering ? (o.archived ? 'Archivados' : oneTag ? '#' + esc(oneTag.name) : 'Resultados')
    : folder ? `${folder.icon ? esc(folder.icon) + ' ' : ''}${esc(folder.name)}` : 'Mis mazos';
  const empty = filtering ? 'No hay mazos que coincidan con el filtro.'
    : folder ? 'Esta carpeta está vacía. Crea un mazo aquí o pulsa «Añadir mazos aquí».'
    : 'Aún no tienes mazos. Crea uno o busca alguno en Explorar.';
  // «Empieza por aquí»: el mazo con más pendientes, con una nota a mano que lo señala
  const scope = filtering ? [] : folder ? decksInFolder(S.decks, S.folders, folder.id).filter(d => !d.archived) : [...S.decks.values()].filter(d => !d.archived);
  const first = scope.length < 5 ? null : sortDecks(scope, 'due', stats).find(d => stats.get(d.id).due + stats.get(d.id).newToday > 0);
  const fs1 = first && stats.get(first.id), fsN = first ? fs1.due + fs1.newToday : 0;
  const feat = first ? `<div class="feat-row">
      <button class="feat-info" data-open="${first.id}"><b>${esc(first.name)}</b><span>${fs1.due} por repasar · ${fs1.newToday} nuevas · ${plural(fs1.total, 'tarjeta', 'tarjetas')} en total${deckFolder(first) && !folder ? ` · ${esc(S.folders.get(first.folder_id).name)}` : ''}</span></button>
      <button class="pill-tint" data-start="${first.id}">Estudiar</button></div>` : '';
  const note = first ? `<div class="hand-note" aria-hidden="true"><span>empieza por aquí,<br>${plural(fsN, 'pendiente', 'pendientes')}</span>${ARROW}</div>` : '';

  main.innerHTML = `
    ${folder && !filtering ? crumbs(folder.id) : ''}
    <div class="pg-title"><div class="pg-title-l"><h1>${title}</h1><button class="add-round" data-act="new-deck" aria-label="Nuevo mazo">${icon('plus', { size: 20 })}</button></div>${note}</div>
    ${feat}
    ${studyBtn || (folder && !filtering) ? `<div class="btnrow">${studyBtn}${folder && !filtering ? '<button class="ghost small-btn" data-act="edit-folder">Editar carpeta</button><button class="ghost small-btn" data-act="add-decks-here">+ Añadir mazos aquí</button>' : ''}</div>` : ''}
    <div class="toolbar">
      <input id="deckSearch" type="search" placeholder="Buscar en todos los mazos" aria-label="Buscar mazos" value="${esc(o.query)}">
      <div class="seg-icons round" role="group" aria-label="Vista">
        <button data-layout="grid" aria-pressed="${o.layout === 'grid'}" aria-label="Tarjetas">${GRID_ICON}</button>
        <button data-layout="list" aria-pressed="${o.layout === 'list'}" aria-label="Lista">${LIST_ICON}</button>
      </div>
    </div>
    <div class="filters chips-scroll">
      <button class="fchip" data-act="clear-filters" aria-pressed="${!filtering}">Todo</button>
      ${tagFilter}
    </div>
    <div class="org-bar">
      <label class="sort-inline">Orden: <select id="deckSort" aria-label="Ordenar">${SORTS.map(x => `<option value="${x.id}" ${x.id === o.sort ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label>
      <button class="link" data-act="toggle-archived" aria-pressed="${o.archived}">${o.archived ? 'Ver los activos' : 'Archivados'}</button>
    </div>
    <div class="btnrow btnrow-sm">
      <button class="ghost small-btn" data-act="new-folder">+ Carpeta</button>
      <button class="ghost small-btn" data-nav="plan">Plan de estudio</button>
      <button class="ghost small-btn" data-act="import">Importar</button>
      <button class="ghost small-btn" data-act="paste">Pegar</button>
    </div>
    ${folderRows ? `<ul class="fcards">${folderRows}</ul>` : ''}
    ${folderRows && deckRows ? '<div class="section-h"><h2>Sueltos</h2><span class="muted small">sin carpeta</span></div>' : ''}
    ${deckRows ? `<ul class="${o.layout === 'grid' ? 'dcards' : 'list'}">${deckRows}</ul>` : folderRows ? '' : `<div class="empty"><p class="muted">${empty}</p></div>`}
    ${S.folders.size && !filtering ? '<p class="hint dnd-hint">Consejo: en el ordenador puedes arrastrar un mazo encima de una carpeta.</p>' : ''}
    <button class="link manage-tags" data-act="manage-tags">${S.tags.size ? 'Gestionar etiquetas' : '+ Etiqueta'}</button>`;
}
// El dibujo de un mazo sin emoji: según de qué parece que va
const GLYPHS = {
  vocab: 'M4 6c5-1 11-1 16 0 .5 3 .5 6 0 9-4 .6-7 .6-10 .4L6 19l.4-3.7c-1.2-.2-2-.4-2.4-.7-.4-3-.4-6 0-8.6zM8 9.5h8M8 12.5h5',
  grammar: 'M5 9h4a2.5 2.5 0 1 1 5 0h4v4a2.5 2.5 0 1 1 0 5v2H5v-5a2.5 2.5 0 1 0 0-5z',
  verb: 'M4 17c3-6 8-9 15-10M15 4l4 3-3 4M4 21h8',
  cards: 'M5 7h13a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM8 4h11a1 1 0 0 1 1 1v11',
};
function deckGlyph(d) {
  const n = (d.name || '').toLowerCase();
  const k = /verb|pasado|presente|futuro|conjug|imperativ/.test(n) ? 'verb'
    : /gram|caso|acusativ|dativ|genitiv|armon|mutaci|sufij|declin|artícul|pronombre/.test(n) ? 'grammar'
    : deckLang(d.id) || /vocab|palabra|léxico/.test(n) ? 'vocab' : 'cards';
  return `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${GLYPHS[k]}"/></svg>`;
}
// Flecha dibujada a mano (para las notas que señalan algo)
export const ARROW = '<svg width="70" height="46" viewBox="0 0 70 46" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M60 4C58 24 40 36 12 40"/><path d="M20 32l-8 8 10 4"/></svg>';
export function statusChip(id) {
  const p = S.progress.get(id);
  if (!p) return '<span class="chip">Nueva</span>';
  const now = Date.now();
  return p.due <= now ? '<span class="chip">Toca hoy</span>' : `<span class="chip">En ${fmtWhen(p.due, now)}</span>`;
}
// En un mazo: los apuntes de los que salen sus tarjetas (o que lo tienen como mazo)
function deckNotesHTML(deckId) {
  const ids = new Set(cardList().filter(c => c.deck_id === deckId && c.page_id).map(c => c.page_id));
  const pages = [...S.pages.values()].filter(p => p.deck_id === deckId || ids.has(p.id));
  if (!pages.length) return '';
  return `<div class="deck-notes">${icon('file-text', { size: 16 })}<span class="muted small">Apuntes:</span>
    ${pages.map(p => `<button class="chip chip-link" data-page="${p.id}">${p.icon ? esc(p.icon) + ' ' : ''}${esc(pageTitle(p))}</button>`).join('')}</div>`;
}
export function renderDeck() {
  const d = S.decks.get(S.deckId);
  if (!d) return go('decks');
  const all = cardList().filter(c => c.deck_id === d.id).sort((a, b) => a.position - b.position);
  const q = norm(S.cardQuery.trim());
  const rows = all.filter(c => !q || norm(c.front).includes(q) || norm(c.back).includes(q) || norm(c.note).includes(q)
    || (c.tags || []).some(t => norm(S.tags.get(t)?.name).includes(q)));
  const c = counts(d.id);
  main.innerHTML = `
    ${crumbs(d.folder_id && S.folders.has(d.folder_id) ? d.folder_id : null, { linkLast: true })}
    <div class="deckhead"><div class="deck-title">${deckIcon(d, true)}<h1>${esc(d.name)}</h1></div>${d.description ? `<p class="desc">${fmt(d.description)}</p>` : ''}
      <div class="btnrow">${deckLang(d.id) ? `<span class="chip">${icon('languages', { size: 13 })} ${esc(langLabel(deckLang(d.id)))}</span>` : ''}${tagChips(d.tags)}<span class="chip">${c.total} ${c.total === 1 ? 'tarjeta' : 'tarjetas'}</span><span class="chip">${c.due} por repasar${c.dueAll > c.due ? ` (+${c.dueAll - c.due} tras el límite)` : ''}</span>${d.pinned ? '<span class="chip">Fijado</span>' : ''}${d.archived ? '<span class="chip">Archivado</span>' : ''}${d.is_public ? '<span class="chip">Compartido</span>' : ''}</div></div>
    <div class="btnrow">
      <button class="primary" data-start="${d.id}" ${c.due + c.newToday ? '' : 'disabled'}>Estudiar</button>
      <button class="ghost" data-act="new-card">+ Tarjeta</button>
      <button class="ghost" data-act="quick-add">Crear varias</button>
      <button class="ghost" data-act="share">Compartir</button>
      <button class="ghost" data-act="move-deck">Mover</button>
      <button class="ghost" data-act="edit-deck">Editar</button>
      <button class="ghost" data-stats="${d.id}">${icon('chart-column', { size: 16 })} Estadísticas</button>
    </div>
    ${deckNotesHTML(d.id)}
    <div class="toolbar"><input id="cardSearch" type="search" placeholder="Buscar en este mazo" aria-label="Buscar tarjetas" value="${esc(S.cardQuery)}"></div>
    <p class="muted small" id="cardCount">${rows.length === all.length ? `${all.length} ${all.length === 1 ? 'tarjeta' : 'tarjetas'}` : `${rows.length} de ${all.length} tarjetas`}</p>
    <ul class="list" id="cardRows">${rows.map(c => {
      const t = c.fields && Object.keys(c.fields).length ? getType(c.type_id) : null;
      const tplName = t && t.templates.length > 1 ? t.templates.find(x => x.id === c.template)?.name : '';
      return `<li><button class="row" data-card="${c.id}"><span class="f">${fmt(c.front)}</span>${statusChip(c.id)}<span class="b">${fmt(c.back)}</span>
        ${t && t.id !== 'basic' || c.tags?.length ? `<span class="rmeta">${t && t.id !== 'basic' ? `<span class="tchip">${typeIcon(t, 13)} ${esc(tplName || t.name)}</span>` : ''}${tagChips(c.tags || [])}</span>` : ''}</button></li>`;
    }).join('')}</ul>`;
}

/* ===================== archivos ===================== */
// Formato de archivo de mazo (ver README):
// { "format": "flaski-deck", "version": 1, "name": "...", "description": "...", "cards": [ { "front", "back", "note" } ] }
export function parseDeckFile(data) {
  if (!data || typeof data !== 'object') throw new Error('El archivo no es un mazo válido');
  const cards = (Array.isArray(data.cards) ? data.cards : [])
    .filter(c => c && ((String(c.front || '').trim() && String(c.back || '').trim()) || (c.fields && typeof c.fields === 'object')))
    .map(c => ({
      front: String(c.front || ''), back: String(c.back || ''), note: String(c.note || ''),
      type_id: typeof c.type_id === 'string' ? c.type_id : 'basic', template: typeof c.template === 'string' ? c.template : 't1',
      fields: c.fields && typeof c.fields === 'object' && !Array.isArray(c.fields) ? c.fields : {}, note_id: typeof c.note_id === 'string' ? c.note_id : null,
      hint: String(c.hint || ''),
    }));
  if (!cards.length) throw new Error('El archivo no tiene tarjetas');
  return { name: String(data.name || 'Mazo importado').slice(0, 80), description: String(data.description || '').slice(0, 300), cards, types: Array.isArray(data.types) ? data.types : [],
    images: data.images && typeof data.images === 'object' ? data.images : null,
    lang: typeof data.lang === 'string' && (data.lang === '' || LANGS.some(l => l.id === data.lang)) ? data.lang : undefined };
}
export async function importFile(file) {
  if (/\.(apkg|colpkg)$/i.test(file.name)) return importAnki(file);
  try {
    const text = await file.text();
    const baseName = file.name.replace(/\.(flaski\.json|kartlar\.json|json|csv|tsv|txt)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Mazo importado';
    // .csv y .tsv siempre como CSV; lo demás puede ser JSON (también entre ```json, como lo dan las IAs)
    const parsed = /\.(csv|tsv)$/i.test(file.name) ? { kind: 'csv', text } : parsePasted(text);
    previewImport(parsed, { source: 'archivo', baseName });
  } catch (e) { toast(e.message || 'No se pudo leer el archivo'); }
}
/* ---------------- Importar de Anki ---------------- */
async function importAnki(file) {
  openSheet(`<h2>Importar de Anki</h2><p class="muted" role="status">Leyendo «${esc(file.name)}»…</p>`);
  try {
    const col = await readApkg(new Uint8Array(await file.arrayBuffer()));
    const r = ankiToFlaski(col, { newImageId });
    if (!r.total) throw new Error('No se ha encontrado ninguna tarjeta en el archivo.');
    const base = file.name.replace(/\.(apkg|colpkg)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Anki';
    S.anki = { col, r, base };
    const withProgress = col.cards.some(c => c.type > 0);
    const sounds = col.notes.some(n => n.fields.some(f => f.includes('[sound:')));
    const sample = r.decks.flatMap(d => d.cards).slice(0, 5).map(c => `<li><span>${fmt(c.front)}</span><b>${fmt(c.back)}</b></li>`).join('');
    const names = ankiDeckNames(r.decks, base);
    openSheet(`<h2>Importar de Anki</h2>
      <p class="muted small">${plural(r.total, 'tarjeta', 'tarjetas')} de ${plural(r.notes, 'nota', 'notas')}${r.images.size ? ` · ${plural(r.images.size, 'imagen', 'imágenes')}` : ''}</p>
      <ul class="preview">${sample}</ul>
      <p class="anki-dest"><b>${r.decks.length === 1 ? 'Se creará el mazo' : `Se crearán ${r.decks.length} mazos en la carpeta «${esc(names.folder)}»`}</b></p>
      <ul class="anki-decks">${r.decks.map((d, i) => `<li><span>${esc(names.decks[i])}</span><span class="muted">${d.cards.length}</span></li>`).join('')}</ul>
      ${withProgress ? '<label class="anki-check"><input type="checkbox" id="ankiProgress" checked> Traer también mi progreso y el historial de repasos</label>' : ''}
      ${r.skipped ? `<p class="muted small">${r.skipped === 1 ? 'Se salta 1 nota vacía o sin tarjetas' : `Se saltan ${r.skipped} notas vacías o sin tarjetas`}.</p>` : ''}
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
    step('Creando los mazos…');
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
    const byAnki = new Map();   // id de la tarjeta en Anki → [id en Flaski, mazo]
    let firstDeck = null;
    for (const [k, d] of r.decks.entries()) {
      step(`Mazo ${k + 1}/${r.decks.length}…`);
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
    toast(`${plural(r.total, 'tarjeta importada', 'tarjetas importadas')} de Anki`);
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
  const slug = d.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'mazo';
  if (kind === 'csv') return download(cardsToCSV(cards), slug + '.csv', 'text/csv;charset=utf-8');
  const full = cardList().filter(c => c.deck_id === d.id).sort((a, b) => a.position - b.position)
    .map(c => ({ front: c.front, back: c.back, note: c.note || '', type_id: c.type_id || 'basic', template: c.template || 't1', fields: c.fields || {}, note_id: c.note_id || null, hint: c.hint || '' }));
  const data = { format: 'flaski-deck', version: 2, name: d.name, description: d.description || '', lang: deckLang(d.id), types: deckTypes(d.id), cards: full };
  // Las imágenes van dentro del archivo, para que el mazo llegue completo a quien lo reciba
  const ids = imageIdsOf({ cards: full });
  if (ids.size) data.images = await exportImages(ids);
  download(JSON.stringify(data, null, 2), slug + '.flaski.json', 'application/json');
}
