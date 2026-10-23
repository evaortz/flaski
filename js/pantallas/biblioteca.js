// Flaski · Biblioteca: un solo árbol de carpetas con apuntes y listas juntos.
// Raíz: carpetas grandes y, debajo, «Sueltos» (lo que no está en ninguna). Dentro de una carpeta:
// su cabecera azul y, mezclados, sus subcarpetas, apuntes y listas. Al buscar o filtrar, los resultados.
import { icon } from '../icons.js';
import { SORTS, folderPath, descendants, sortDecks, matchesDeck, colorVar, drawingOf, drawingSrc } from '../org.js';
import { pageTitle, pageSearchText, cardsStatus } from '../pages.js';
import { main, S, esc, norm, cardList, tagChips, counts, planNodes, folderIcon } from '../comun.js';
import { plural } from './mazos.js';

const ST_LABEL = { ok: 'al día', due: 'toca repasar', weak: 'te cuesta', new: 'sin estudiar' };
const parentOf = f => (f.parent_id && S.folders.has(f.parent_id) ? f.parent_id : null);
const inFolder = x => (x.folder_id && S.folders.has(x.folder_id) ? x.folder_id : null);
const statusOf = cards => cardsStatus(cards.map(c => S.progress.get(c.id) || null));
const pct = (n, t) => (t ? Math.round((n / t) * 100) : 0);
const dueOf = c => c.due + c.newToday;

// Lo que hay dentro de una carpeta, a cualquier profundidad
function folderInfo(id) {
  const ids = descendants(S.folders, id);
  const decks = [...S.decks.values()].filter(d => !d.archived && ids.has(d.folder_id));
  const pages = [...S.pages.values()].filter(p => ids.has(inFolder(p)));
  const subs = [...S.folders.values()].filter(f => parentOf(f) === id);
  const c = counts('folder:' + id);
  return { decks, pages, subs, c, young: Math.max(0, c.total - c.fresh - c.mature) };
}
// «examen el 12 dic» (y «faltan N días» si se pide)
function examText(id, long = false) {
  const ex = planNodes()?.['f:' + id]?.exam;
  if (!ex) return '';
  const d = new Date(ex + 'T00:00:00');
  if (isNaN(d)) return '';
  const days = Math.round((d - new Date(new Date().toDateString())) / 864e5);
  if (days < 0) return '';
  return ` · examen el ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')}${long ? ` · ${days === 0 ? 'es hoy' : `faltan ${plural(days, 'día', 'días')}`}` : ''}`;
}
const bar = (c, young) => `<span class="lbar" aria-label="${pct(c.mature, c.total)} % consolidadas"><i style="width:${pct(c.mature, c.total)}%"></i><i style="width:${pct(young, c.total)}%"></i></span>`;
// Color de la carpeta: el que eligió la persona (Editar carpeta) o, si no eligió ninguno, el cobalto del tema
const foldColor = f => `--fold:${f.color ? colorVar(f.color) : 'var(--accent)'}`;
// Lo que asoma por la esquina: el dibujo de la carpeta, su emoji o, si no tiene, el icono de carpeta
const deco = f => { const dr = drawingOf(f.icon);
  return dr ? `<img class="lfold-deco lfold-draw" src="${drawingSrc(dr)}" alt="" aria-hidden="true">`
    : `<span class="lfold-deco" aria-hidden="true">${f.icon ? esc(f.icon) : icon('folder', { size: 72 })}</span>`; };

// Carpeta grande de la raíz
function folderCard(f) {
  const { decks, pages, c, young } = folderInfo(f.id), n = dueOf(c);
  const what = [pages.length && plural(pages.length, 'apunte', 'apuntes'), decks.length && plural(decks.length, 'lista', 'listas')].filter(Boolean).join(' · ') || 'vacía';
  return `<li><button class="lfold" data-folder="${f.id}" style="${foldColor(f)}"><span class="lfold-tab" aria-hidden="true"></span>${deco(f)}
    <span class="lfold-k">carpeta${examText(f.id)}</span>
    <span class="lfold-name">${esc(f.name)}</span>
    <span class="lfold-meta">${what}</span>
    ${c.total ? bar(c, young) : ''}
    <span class="lfold-foot"><span class="lfold-stats">${c.total ? `${plural(c.total, 'pregunta', 'preguntas')} · ${pct(c.mature, c.total)}% consolidadas · ${pct(young, c.total)}% jóvenes` : ''}</span>
      <span class="lfold-due">${n ? `${n} hoy` : c.total ? `al día ${icon('check', { size: 20 })}` : ''}</span></span></button></li>`;
}

// Una ficha: apunte (esquina doblada), lista (con otras debajo) o subcarpeta
function pageTile(p, { hand, where }) {
  const cards = cardList().filter(c => c.page_id === p.id), st = statusOf(cards);
  const n = cards.length ? dueOf(counts('page:' + p.id)) : 0;
  const foot = hand ? `<span class="lt-hand">${n ? `${n} hoy` : cards.length ? 'al día' : ''}</span>`
    : st ? `<span class="lt-st st-${st}"><i aria-hidden="true"></i>${ST_LABEL[st]}</span>` : '';
  return `<li data-kind="notes"><button class="ltile lt-note" data-page="${p.id}"><span class="lt-ic" aria-hidden="true">${p.icon ? esc(p.icon) : icon('file-text', { size: 26 })}</span>
    <span class="lt-name">${esc(pageTitle(p))}</span>
    <span class="lt-foot"><span class="lt-meta">${where(p)}apunte${hand ? ` · ${cards.length}` : ` · ${plural(cards.length, 'pregunta', 'preguntas')}`}</span>${foot}</span></button></li>`;
}
function deckTile(d, { hand, where }) {
  const c = counts(d.id), n = dueOf(c), st = statusOf(cardList().filter(x => x.deck_id === d.id));
  const foot = hand ? `<span class="lt-hand">${n ? `${n} hoy` : c.total ? 'al día' : 'vacía'}</span>`
    : st ? `<span class="lt-st st-${st}"><i aria-hidden="true"></i>${ST_LABEL[st]}</span>` : '<span class="lt-st">vacía</span>';
  return `<li data-kind="lists" draggable="true" data-drag-deck="${d.id}"><button class="ltile lt-list" data-open="${d.id}"><span class="lt-ic" aria-hidden="true">${d.icon ? esc(d.icon) : icon('copy', { size: 24 })}</span>
    <span class="lt-name">${esc(d.name)}</span>
    <span class="lt-foot"><span class="lt-meta">${where(d)}lista${d.source === 'anki' || d.source === 'archivo' ? ' · importada' : ''}${hand ? ` · ${c.total}` : ` · ${plural(c.total, 'pregunta', 'preguntas')}`}${d.archived ? ' · archivada' : ''}</span>${foot}</span></button>
    <button class="row-more tile-more" data-move="${d.id}" aria-label="Mover «${esc(d.name)}» a otra carpeta" title="Mover a otra carpeta">${icon('folder-input', { size: 18 })}</button></li>`;
}
function subTile(f) {
  const { decks, pages, subs, c } = folderInfo(f.id), n = decks.length + pages.length + subs.length;
  const st = statusOf(cardList().filter(x => decks.some(d => d.id === x.deck_id)));
  return `<li data-kind="subs" class="lt-subli"><button class="ltile lt-sub" data-folder="${f.id}"><span class="lt-ic" aria-hidden="true">${f.icon ? folderIcon(f) : icon('folder', { size: 26 })}</span>
    <span class="lt-name">${esc(f.name)}</span>
    <span class="lt-foot"><span class="lt-meta">subcarpeta · ${plural(n, 'elemento', 'elementos')}${c.total ? ` · ${c.total}` : ''}</span>${st ? `<span class="lt-st st-${st}"><i aria-hidden="true"></i>${ST_LABEL[st]}</span>` : ''}</span>
    <span class="lt-go" aria-hidden="true">${icon('chevron-right', { size: 18 })}</span></button></li>`;
}

// Orden de los apuntes según el orden elegido para las listas
function sortPages(list, sort) {
  const upd = (a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  if (sort === 'name') return list.sort((a, b) => pageTitle(a).localeCompare(pageTitle(b), 'es'));
  if (sort === 'created') return list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return list.sort(upd);
}

export function renderLibrary() {
  if (S.folderId && !S.folders.has(S.folderId)) S.folderId = null;
  return S.folderId ? renderFolder(S.folders.get(S.folderId)) : renderRoot();
}

function renderRoot() {
  const o = S.org, q = o.query.trim();
  const filtering = !!(q || o.tagIds.length || o.archived);
  const stats = new Map([...S.decks.values()].map(d => [d.id, counts(d.id)]));
  let decks, pages, folders = [];
  if (filtering) {
    decks = [...S.decks.values()].filter(d => matchesDeck(d, { query: q, tagIds: o.tagIds, archived: o.archived }));
    pages = o.archived ? [] : [...S.pages.values()].filter(p => (!q || norm(pageSearchText(p)).includes(norm(q))) && o.tagIds.every(t => (p.tags || []).includes(t)));
  } else {
    decks = [...S.decks.values()].filter(d => !d.archived && !inFolder(d));
    pages = [...S.pages.values()].filter(p => !inFolder(p));
    folders = [...S.folders.values()].filter(f => !parentOf(f)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }
  decks = sortDecks(decks, o.sort, stats);
  pages = sortPages(pages, o.sort);
  const where = x => (filtering && inFolder(x) ? `${folderPath(S.folders, x.folder_id).map(f => esc(f.name)).join(' / ')} · ` : '');
  const tiles = [...pages.map(p => pageTile(p, { hand: true, where })), ...decks.map(d => deckTile(d, { hand: true, where }))].join('');
  const tagFilter = [...S.tags.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(t =>
    `<button class="fchip" data-tagfilter="${t.id}" aria-pressed="${o.tagIds.includes(t.id)}">${esc(t.name)}</button>`).join('');
  const studyTag = o.tagIds.length === 1 && !o.archived ? (() => { const c = counts('tag:' + o.tagIds[0]), n = dueOf(c);
    return `<div class="btnrow"><button class="primary" data-start="tag:${o.tagIds[0]}" ${n ? '' : 'disabled'}>Estudiar #${esc(S.tags.get(o.tagIds[0])?.name || '')}${n ? ' · ' + n : ''}</button></div>`; })() : '';
  const empty = filtering ? 'Nada coincide con la búsqueda o el filtro.' : 'Aún no tienes apuntes ni listas. Crea uno o busca listas en Explorar.';

  main.innerHTML = `
    <div class="lib-head"><h1>Biblioteca</h1><button class="add-round" data-act="create-menu" aria-label="Crear">${icon('plus', { size: 20 })}</button></div>
    <div class="lib-quick">
      <button data-act="new-page">${icon('file-text', { size: 20 })}<span>Apunte</span></button>
      <button data-act="new-deck">${icon('copy', { size: 20 })}<span>Lista</span></button>
      <button data-act="new-folder">${icon('folder', { size: 20 })}<span>Carpeta</span></button>
      <button data-act="import-menu">${icon('download', { size: 20 })}<span>Importar</span></button>
    </div>
    ${S.pagesMissing ? '<div class="panel"><p><b>Falta un paso en Supabase.</b> Para guardar apuntes en la nube, vuelve a ejecutar <code>supabase/schema.sql</code> en el SQL Editor y recarga la app.</p></div>' : ''}
    <label class="lib-search">${icon('search', { size: 18 })}<input id="libSearch" type="search" placeholder="Buscar en apuntes y listas" aria-label="Buscar en apuntes y listas" value="${esc(o.query)}"></label>
    ${tagFilter ? `<div class="filters chips-scroll"><button class="fchip" data-act="clear-filters" aria-pressed="${!filtering}">Todo</button>${tagFilter}</div>` : ''}
    <div class="org-bar">
      <label class="sort-inline">Orden: <select id="libSort" aria-label="Ordenar">${SORTS.map(x => `<option value="${x.id}" ${x.id === o.sort ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label>
      <button class="link" data-act="toggle-archived" aria-pressed="${o.archived}">${o.archived ? 'Ver las activas' : 'Archivadas'}</button>
    </div>
    ${studyTag}
    ${folders.length ? `<ul class="lfolds">${folders.map(folderCard).join('')}</ul>` : ''}
    ${tiles && !filtering && folders.length ? '<div class="section-h"><h2>Sueltos</h2><span class="muted small">sin carpeta</span></div>' : ''}
    ${filtering ? `<div class="section-h"><h2>${o.archived ? 'Archivadas' : 'Resultados'}</h2></div>` : ''}
    ${tiles ? `<ul class="ltiles">${tiles}</ul>` : folders.length ? '' : `<div class="empty"><p class="muted">${empty}</p></div>`}
    <div class="lib-links"><button class="link" data-act="manage-tags">${S.tags.size ? 'Gestionar etiquetas' : '+ Etiqueta'}</button>${S.pages.size ? '<button class="link" data-act="export-all-notes" title="Todos los apuntes en Markdown, con sus imágenes (.zip)">Exportar apuntes</button>' : ''}</div>`;
}

function renderFolder(folder) {
  const { decks: all, c, young } = folderInfo(folder.id), n = dueOf(c);
  const stats = new Map([...S.decks.values()].map(d => [d.id, counts(d.id)]));
  const subs = [...S.folders.values()].filter(f => parentOf(f) === folder.id).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const pages = sortPages([...S.pages.values()].filter(p => inFolder(p) === folder.id), S.org.sort);
  const decks = sortDecks([...S.decks.values()].filter(d => !d.archived && inFolder(d) === folder.id), S.org.sort, stats);
  const kind = S.libKind || 'all';
  const show = k => kind === 'all' || kind === k;
  const where = () => '';
  const tiles = [show('subs') ? subs.map(subTile).join('') : '', show('notes') ? pages.map(p => pageTile(p, { where })).join('') : '', show('lists') ? decks.map(d => deckTile(d, { where })).join('') : ''].join('');
  const chip = (k, label, num) => `<button class="fchip" data-libkind="${k}" aria-pressed="${kind === k}">${label} · ${num}</button>`;
  const what = [plural(pages.length, 'apunte', 'apuntes'), plural(decks.length, 'lista', 'listas'), subs.length && plural(subs.length, 'subcarpeta', 'subcarpetas'), c.total && plural(c.total, 'pregunta', 'preguntas')].filter(Boolean).join(' · ');
  const path = folderPath(S.folders, folder.id);
  const crumbs = [`<button class="crumb" data-folder="">Biblioteca</button>`, ...path.slice(0, -1).map(f => `<button class="crumb" data-folder="${f.id}">${esc(f.name)}</button>`), `<span class="crumb crumb-cur">${esc(folder.name)}</span>`];

  main.innerHTML = `
    <div class="lib-top">
      <button class="back-round" data-folder="${parentOf(folder) || ''}" aria-label="Volver">${icon('chevron-left', { size: 20 })}</button>
      <nav class="crumbs" aria-label="Ruta">${crumbs.join('<span class="sep" aria-hidden="true">›</span>')}</nav>
      <span class="spacer"></span>
      <button class="iconbtn" data-act="edit-folder" aria-label="Editar carpeta" title="Editar carpeta">${icon('ellipsis', { size: 20 })}</button>
      <button class="add-round" data-act="create-menu" aria-label="Crear">${icon('plus', { size: 20 })}</button>
    </div>
    <section class="fhero" style="${foldColor(folder)}"><span class="lfold-tab" aria-hidden="true"></span>${deco(folder)}
      <div class="fhero-main">
        <span class="lfold-k">carpeta${examText(folder.id, true)}</span>
        <h1 class="fhero-name">${esc(folder.name)}</h1>
        <p class="lfold-meta">${what}</p>
        ${c.total ? `${bar(c, young)}<ul class="lbar-key"><li><i></i>${c.mature} consolidadas</li><li><i></i>${young} jóvenes</li><li><i></i>${c.fresh} por aprender</li></ul>` : ''}
      </div>
      <div class="fhero-side">
        <button class="fhero-study" data-start="folder:${folder.id}" ${n ? '' : 'disabled'}><span>Estudiar la carpeta</span><b>${n ? `${n} hoy` : all.length ? 'al día' : ''}</b><span class="go-dot" aria-hidden="true">${icon('chevron-right', { size: 18 })}</span></button>
        <div class="fhero-add"><button data-act="new-page">+ Apunte</button><button data-act="new-deck">+ Lista</button></div>
      </div>
    </section>
    <div class="filters chips-scroll">${chip('all', 'Todo', subs.length + pages.length + decks.length)}${chip('notes', 'Apuntes', pages.length)}${chip('lists', 'Listas', decks.length)}${subs.length ? chip('subs', 'Subcarpetas', subs.length) : ''}</div>
    ${tiles ? `<ul class="ltiles">${tiles}</ul>` : `<div class="empty"><p class="muted">${kind === 'all' ? 'Esta carpeta está vacía. Crea un apunte o una lista con el botón +.' : 'Aquí no hay nada de este tipo.'}</p></div>`}
    <div class="btnrow btnrow-sm"><button class="ghost small-btn" data-act="new-folder">+ Carpeta</button><button class="ghost small-btn" data-act="add-decks-here">+ Añadir listas aquí</button><button class="ghost small-btn" data-act="import-menu">Importar</button></div>`;
}

// «+»: crear un apunte o una lista (en la carpeta abierta)
export function createMenuHTML() {
  return `<h2>Crear</h2><div class="lib-pick">
    <button data-act="new-page">${icon('file-text', { size: 22 })}<span><b>Apunte</b><small>Escribe o pega tus apuntes</small></span></button>
    <button data-act="new-deck">${icon('copy', { size: 22 })}<span><b>Lista</b><small>Preguntas para repasar</small></span></button></div>`;
}
export function importMenuHTML() {
  return `<h2>Importar</h2><div class="lib-pick">
    <button data-act="import-notes">${icon('file-text', { size: 22 })}<span><b>Apuntes</b><small>Word, PDF, Markdown, HTML, CSV o un .zip de Notion u Obsidian</small></span></button>
    <button data-act="import">${icon('copy', { size: 22 })}<span><b>Listas</b><small>CSV, mazo de Anki o archivo de Flaski</small></span></button>
    <button data-act="paste">${icon('download', { size: 22 })}<span><b>Pegar preguntas</b><small>Texto o JSON copiado</small></span></button></div>`;
}
