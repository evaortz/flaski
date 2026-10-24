// Flaski · apuntes: lista, editor por bloques y sugerencias de tarjetas (sale de app.js)
import * as api from '../api.js';
import { icon } from '../icons.js';
import { folderPath, iconText } from '../org.js';
import { readPdf, pdfToBlocks } from '../pdf.js';
import { storeImage, imageType, newImageId, flushUploads, imageBlob } from '../media.js';
import { toHTML, toLiveHTML, toPlain, toggleMark, marksAt, COLORS as TEXT_COLORS, COLOR_LABEL } from '../inline.js';
import { makeLive, liveSet, selOffsets, textOffset } from '../liveedit.js';
import { htmlToBlocks } from '../paste.js';
import { writeZip, safeName, pageImageIds, markdownWithImages, pageToHTML, pageToDocx, docxToHTML, csvToBlocks, markdownToPage, titleFromFile, markdownImageRefs } from '../notesio.js';
import { readZip } from '../zip.js';
import { BLOCK_MENU, NO_TEXT, olNumbers, newBlock, blockId, hiddenIds, unitOf, moveBlocks, canIndent, INDENTABLE, MAX_INDENT, findAll, backlinks, renameLinks, sameTitle, imageBlock, textToBlocks, splitBlock, mergeBlocks, clozeFrom, pageTitle, parseTable, isTableText, tableToMarkdown, cardsStatus, sectionIds, STATUS, pageToMarkdown } from '../pages.js';
import { $, main, S, esc, imgHTML, fmt, plain, cardList, toast, fail, tagChips, algo, counts } from '../comun.js';
import { saveSnapSoon } from './cuenta.js';
import { deckLang } from './estudio.js';
import { plural, statusChip, download } from './mazos.js';
import { seg } from './perfil.js';
import { openSheet, closeSheet, folderSelect, deckOptions, cardForm, autoGrow, pickImage, saveImage, imageIntoField, imageFile, occSetImage } from './editor.js';
import { go } from '../app.js';

import { TBL_EMPTY, placeTblHandles, tblAlign, editTable, commitTable, tablePaste } from './apuntes-tablas.js';
import { suggestFor, openSuggestions, scheduleSugMarks } from './sugerencias.js';

/* ===================== apuntes ===================== */
// Tarjetas vinculadas a cada bloque de una página: block_id → [tarjetas]
export function pageCards(pageId) {
  const m = new Map();
  for (const c of S.cards.values()) if (c.page_id === pageId) { const k = c.block_id || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(c); }
  return m;
}
// Fila para guardar. Las etiquetas solo si la base de datos ya tiene esa columna (si no, se perdería el guardado)
export const pageRow = p => ({ id: p.id, owner: S.uid, title: p.title || '', icon: p.icon || '', deck_id: p.deck_id || null, folder_id: p.folder_id || null, blocks: p.blocks,
  ...(S.pageTagsMissing ? {} : { tags: p.tags || [] }) });
const pageTimers = new Map();
// Guarda una página poco después del último cambio (se escribe mucho seguido)
export function savePageSoon(p, wait = 700) {
  if (p.id === S.pageId) histRecord();
  p.updated_at = new Date().toISOString();
  savedState('saving');
  clearTimeout(pageTimers.get(p.id));
  pageTimers.set(p.id, setTimeout(() => {
    pageTimers.delete(p.id);
    api.savePage(pageRow(p)).then(() => savedState('saved')).catch(e => { savedState('error'); fail(e); });
    saveSnapSoon();
  }, wait));
}
// «Guardando…» / «Guardado» junto al título del apunte
function savedState(state) {
  const el = $('#pgSaved');
  if (!el) return;
  el.dataset.state = state;
  el.textContent = state === 'saving' ? 'Guardando…' : state === 'error' ? 'No se ha guardado' : 'Guardado';
}
function flushPages() {
  for (const [id, t] of pageTimers) { clearTimeout(t); pageTimers.delete(id); const p = S.pages.get(id); if (p) api.savePage(pageRow(p)).catch(() => {}); }
}
addEventListener('pagehide', flushPages);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushPages(); });

// Ruta de los apuntes: Biblioteca / Idiomas / Turco (/ título del apunte, si se está dentro de uno)
export function noteCrumbs(folderId, current = null) {
  const path = folderId && S.folders.has(folderId) ? folderPath(S.folders, folderId) : [];
  const btn = (id, label) => `<button class="crumb" data-nfolder="${id}">${label}</button>`;
  const parts = [btn('', 'Biblioteca'), ...path.map((f, i) => (i === path.length - 1 && !current
    ? `<span class="crumb crumb-cur">${esc(iconText(f.icon) ? iconText(f.icon) + ' ' : '')}${esc(f.name)}</span>`
    : btn(f.id, `${esc(iconText(f.icon) ? iconText(f.icon) + ' ' : '')}${esc(f.name)}`)))];
  if (current) parts.push(`<span class="crumb crumb-cur">${esc(current)}</span>`);
  return `<nav class="crumbs" aria-label="Ruta">${parts.join('<span class="sep" aria-hidden="true">/</span>')}</nav>`;
}
export const pageFolder = p => (p.folder_id && S.folders.has(p.folder_id) ? p.folder_id : null);

const BLOCK_PH = 'Escribe algo… («# » título, «- » viñetas)';
// Una tabla en Markdown → <table>; si está a medio escribir, se ve el texto tal cual
function tableHTML(text) {
  const t = parseTable(text);
  if (!t) return `<pre class="nb-raw">${esc(text)}</pre>`;
  const td = (tag, c, i) => `<${tag}${t.align[i] ? ` style="text-align:${t.align[i]}"` : ''}>${fmt(c)}</${tag}>`;
  return `<div class="nb-tablewrap"><table class="nb-tbl"><thead><tr>${t.head.map((c, i) => td('th', c, i)).join('')}</tr></thead>
    <tbody>${t.rows.map(r => `<tr>${r.map((c, i) => td('td', c, i)).join('')}</tr>`).join('')}</tbody></table></div>`;
}
// Cómo llevas un grupo de tarjetas: 'ok' | 'due' | 'weak' | 'new' (null si no hay)
const statusOf = cards => cardsStatus(cards.map(c => S.progress.get(c.id) || null));
const statusLabel = st => STATUS.find(s => s.id === st)?.label || '';
// Tarjetas que tocan ahora en un ámbito (repasos + nuevas que caben hoy)
const pendingIn = scope => { const c = counts(scope); return c.due + c.newToday; };
// Texto de ayuda de un bloque vacío, según su tipo
const PH = { p: BLOCK_PH, h1: 'Título', h2: 'Subtítulo', h3: 'Título pequeño', li: 'Viñetas', ol: 'Numeración', todo: 'Por hacer',
  quote: 'Cita', callout: 'Escribe algo que quieras destacar', code: 'Código', table: BLOCK_PH, img: 'Pie de foto (opcional)' };
export const CALLOUT_ICONS = ['💡', '⚠️', '📌', '✅', '❗', '📝', '🔑', '🧠'];
const delBtn = (id, what) => `<button type="button" class="iconbtn nb-del" data-del-block="${id}" aria-label="Quitar ${what}" title="Quitar ${what}">${icon('trash-2', { size: 15 })}</button>`;
// Lo que hace falta saber de toda la página para pintar un bloque: los ocultos (plegados) y los números de las listas
const blockCtx = (p = curPage()) => ({ hidden: hiddenIds(p?.blocks || []), nums: olNumbers(p?.blocks || []), bar: marginStatus(p) });
// El estado que se pinta en el margen de cada bloque: el de su apartado (el título más cercano con preguntas)
// o, fuera de un apartado con preguntas, el de las suyas
const HEAD_LEVEL = { h1: 1, h2: 2, h3: 3 };
function marginStatus(p) {
  const out = new Map();
  if (!p) return out;
  const cards = pageCards(p.id), stack = [];
  for (const b of p.blocks) {
    const L = HEAD_LEVEL[b.type];
    if (L) {
      while (stack.length && stack[stack.length - 1].L >= L) stack.pop();
      const ids = sectionIds(p.blocks, b.id);
      stack.push({ L, st: statusOf(ids.flatMap(id => cards.get(id) || [])) });
    }
    const sec = stack.findLast(x => x.st);
    out.set(b.id, sec ? sec.st : statusOf(cards.get(b.id) || []));
  }
  return out;
}
const blocksHTML = (p, cards = pageCards(p.id)) => { const ctx = blockCtx(p); return p.blocks.map(b => blockHTML(b, cards.get(b.id), ctx)).join(''); };
// El asa de cada bloque: arrastrar para moverlo, clic para sus opciones
const gripBtn = id => `<button type="button" class="nb-grip" data-grip="${id}" tabindex="-1" aria-label="Mover o más opciones" title="Arrastra para mover · clic para más opciones">${icon('grip-vertical', { size: 16 })}</button>`;
export function blockHTML(b, cards = [], ctx = blockCtx()) {
  const cls = `${ctx.hidden.has(b.id) ? ' is-folded' : ''}${S.bsel?.ids.has(b.id) ? ' is-sel' : ''}${S.edit?.open && S.edit.side && S.edit.source?.block_id === b.id ? ' is-src' : ''}`;
  // En el margen, el estado de las preguntas de su apartado
  const bar = ctx.bar?.get(b.id) ? `<span class="nb-bar st-${ctx.bar.get(b.id)}" aria-hidden="true"></span>` : '';
  // Imagen: la imagen y debajo su pie (que se edita como un bloque de texto)
  if (b.type === 'img') {
    return `<figure class="nb nb-img${cls}" data-block="${b.id}">${bar}${gripBtn(b.id)}${imgHTML(b.src, esc(b.text))}${delBtn(b.id, 'la imagen')}
      <figcaption class="nb-text md" data-edit-block="${b.id}" data-ph="${PH.img}">${toLiveHTML(b.text)}</figcaption></figure>`;
  }
  if (b.type === 'hr') return `<div class="nb nb-hr${cls}" data-block="${b.id}">${bar}${gripBtn(b.id)}<hr>${delBtn(b.id, 'el separador')}</div>`;
  const n = cards.length, st = statusOf(cards);
  // El texto se pinta igual que en el editor (con las marcas ocultas): al tocarlo, el cursor cae donde se ha tocado
  const md = !['table', 'code'].includes(b.type);
  const body = md ? toLiveHTML(b.text) : !b.text.trim() ? `<span class="nb-ph">${PH[b.type] || BLOCK_PH}</span>` : b.type === 'table' ? tableHTML(b.text)
    : `<pre class="nb-code">${esc(b.text)}</pre>`;
  // Lo que va delante del texto: el número, la casilla o el icono del destacado
  const lead = b.type === 'ol' ? `<span class="nb-num" aria-hidden="true">${ctx.nums.get(b.id) || 1}.</span>`
    : b.type === 'todo' ? `<button type="button" class="nb-check" role="checkbox" aria-checked="${!!b.checked}" aria-label="Hecho" data-todo="${b.id}">${icon('check', { size: 13 })}</button>`
    : b.type === 'callout' ? `<button type="button" class="nb-icon" data-callout-icon="${b.id}" aria-label="Cambiar el icono" title="Cambiar el icono">${esc(b.icon || '💡')}</button>` : '';
  // En los títulos: estudiar el apartado entero (el título y lo que cuelga de él)
  let sec = '', fold = '';
  const p = curPage();
  if (p && ['h1', 'h2', 'h3'].includes(b.type)) {
    const ids = new Set(sectionIds(p.blocks, b.id));
    // Plegar el apartado (solo si tiene algo debajo)
    if (ids.size > 1 || b.collapsed) fold = `<button type="button" class="nb-fold" data-fold="${b.id}" tabindex="-1" aria-expanded="${!b.collapsed}" aria-label="${b.collapsed ? 'Desplegar' : 'Plegar'} el apartado" title="${b.collapsed ? `Desplegar (${plural(ids.size - 1, 'bloque', 'bloques')})` : 'Plegar el apartado'}">${icon('chevron-right', { size: 15 })}</button>`;
    const secCards = cardList().filter(c => c.page_id === p.id && ids.has(c.block_id));
    if (secCards.length) {
      const pend = pendingIn(`page:${p.id}:${b.id}`), sst = statusOf(secCards);
      sec = `<button type="button" class="nb-sec st-${sst}" data-study-section="${b.id}" ${pend ? '' : 'disabled'} title="${esc(statusLabel(sst))} · ${plural(secCards.length, 'pregunta', 'preguntas')} en este apartado">${pend ? `Estudiar ${pend}` : esc(statusLabel(sst))}</button>`;
    }
  }
  const ind = b.indent ? ` data-ind="${b.indent}" style="--ind:${b.indent}"` : '';
  return `<div class="nb nb-${b.type}${b.type === 'todo' && b.checked ? ' is-done' : ''}${b.collapsed && fold ? ' is-collapsed' : ''}${cls}" data-block="${b.id}"${ind}>${bar}${gripBtn(b.id)}${fold}${lead}<div class="nb-text${md ? ' md' : ''}" data-edit-block="${b.id}"${md ? ` data-ph="${PH[b.type] || BLOCK_PH}"` : ''}>${body}</div>${sec}
    ${n ? `<button type="button" class="nb-cards st-${st}" data-block-cards="${b.id}" title="${esc(statusLabel(st))} · ${plural(n, 'pregunta sale', 'preguntas salen')} de esta parte" aria-label="${plural(n, 'pregunta', 'preguntas')} de esta parte: ${esc(statusLabel(st).toLowerCase())}"><i aria-hidden="true"></i>${n}</button>` : ''}</div>`;
}
// Resumen arriba del apunte: cuántas partes llevas al día, cuáles te cuestan… y estudiarlo entero
function pageStatusHTML(p, cards) {
  const byStatus = new Map();
  for (const list of cards.values()) { const st = statusOf(list); if (st) byStatus.set(st, (byStatus.get(st) || 0) + 1); }
  if (!byStatus.size) return '';
  const pend = pendingIn(`page:${p.id}`);
  const chips = STATUS.filter(s => byStatus.has(s.id)).map(s => `<span class="st-chip st-${s.id}"><i aria-hidden="true"></i>${byStatus.get(s.id)} ${s.label.toLowerCase()}</span>`).join('');
  return `<div class="pg-status" aria-label="Cómo llevas este apunte, por partes">${chips}<span class="spacer"></span>
    ${pend ? `<button class="primary small-btn" data-start="page:${p.id}">Estudiar este apunte · ${pend}</button>` : '<span class="muted small">Todo al día</span>'}</div>`;
}
export function renderPage() {
  const p = S.pages.get(S.pageId);
  if (!p) return go('notes');
  if (!p.blocks.length) p.blocks.push(newBlock());
  const cards = pageCards(p.id);
  const total = [...cards.values()].reduce((s, l) => s + l.length, 0);
  const prop = (ic, label, value, forId = '') => `<div class="prop"><${forId ? `label for="${forId}"` : 'span'} class="prop-k">${icon(ic, { size: 16 })} ${label}</${forId ? 'label' : 'span'}><div class="prop-v">${value}</div></div>`;
  main.innerHTML = `<div class="pg-top">${noteCrumbs(pageFolder(p), pageTitle(p))}<span class="spacer"></span>
      <span id="pgSaved" class="pg-saved" aria-live="polite"></span>
      ${S.session ? '<button class="primary small-btn" data-act="back-study">Volver al estudio</button>' : ''}
      <span class="pg-hist" role="group" aria-label="Deshacer y rehacer">
        <button type="button" class="iconbtn" data-act="pg-undo" aria-label="Deshacer" title="Deshacer (Ctrl+Z)" disabled>${icon('undo-2', { size: 18 })}</button>
        <button type="button" class="iconbtn" data-act="pg-redo" aria-label="Rehacer" title="Rehacer (Ctrl+Mayús+Z)" disabled>${icon('redo-2', { size: 18 })}</button></span>
      <button type="button" class="iconbtn pg-tocbtn" data-act="toc" aria-label="Índice" title="Índice del apunte" aria-haspopup="true" hidden>${icon('list', { size: 18 })}</button>
      <button type="button" class="iconbtn" data-act="find" aria-label="Buscar en el apunte" title="Buscar y reemplazar (Ctrl+F)">${icon('search', { size: 18 })}</button>
      <button type="button" class="ghost small-btn pg-suggest" data-act="suggest-cards" title="Propone preguntas a partir de este apunte">${icon('sugerencia', { size: 15 })} <span>Sugerir preguntas</span></button>
      <button type="button" class="iconbtn" data-act="notes-help" aria-label="Formato y atajos" title="Formato y atajos">${icon('circle-help', { size: 18 })}</button>
      <button type="button" class="iconbtn" data-act="page-menu" aria-label="Más opciones" title="Más opciones">${icon('ellipsis', { size: 18 })}</button></div>
    <div class="pg-head">
      ${p.icon ? `<button type="button" class="pg-icon" data-act="page-icon" aria-label="Cambiar el icono">${esc(p.icon)}</button>`
        : `<button type="button" class="pg-addicon" data-act="page-icon">${icon('smile-plus', { size: 16 })} Añadir icono</button>`}
      <textarea id="pgTitle" class="pg-title" rows="1" maxlength="120" placeholder="Sin título" aria-label="Título" enterkeyhint="done">${esc(p.title || '')}</textarea>
    </div>
    <div class="pg-props">
      ${prop('layers', 'Lista', `<select id="pgDeck" class="prop-select" aria-label="Lista donde van las preguntas de este apunte"><option value="">Sin lista</option>${deckOptions(p.deck_id)}</select>`)}
      ${prop('folder', 'Carpeta', folderSelect('pgFolder', pageFolder(p) || '', null, 'Sin carpeta').replace('<select ', '<select class="prop-select" aria-label="Carpeta" '))}
      ${prop('tag', 'Etiquetas', `${tagChips(p.tags || [])}<button type="button" class="link prop-add" data-act="page-tags">${(p.tags || []).length ? 'Editar' : 'Añadir'}</button>`)}
      ${total ? '' : prop('notebook-text', 'Preguntas', '<span class="muted">Ninguna todavía · selecciona un texto para crear una o </span><button type="button" class="link" data-act="suggest-cards">pide sugerencias</button>')}
    </div>
    ${pageStatusHTML(p, cards)}
    <div class="pg-blocks" id="pgBlocks">${blocksHTML(p, cards)}</div>
    <div class="pg-adds"><button type="button" class="pg-add" data-act="block-menu" aria-haspopup="listbox">${icon('plus', { size: 15 })} Bloque</button><span class="muted small pg-slash">o escribe <kbd>/</kbd> en una línea vacía</span></div>
    <section id="pgLinks" class="pg-links" aria-label="Apuntes que enlazan a este"></section>
    <nav id="pgToc" class="pg-toc" aria-label="Índice del apunte" hidden></nav>
    <div id="blkBar" class="selbar blk-bar" role="toolbar" aria-label="Bloques seleccionados" hidden></div>
    <div id="selBar" class="selbar" role="toolbar" aria-label="Con el texto seleccionado" hidden>
      <div class="fmt-btns" role="group" aria-label="Formato">
        <button type="button" class="fmt" data-nfmt="b" title="Negrita · **texto** (Ctrl+B)" aria-label="Negrita"><b>B</b></button>
        <button type="button" class="fmt" data-nfmt="i" title="Cursiva · *texto* (Ctrl+I)" aria-label="Cursiva"><i>I</i></button>
        <button type="button" class="fmt" data-nfmt="u" title="Subrayado · &lt;u&gt;texto&lt;/u&gt; (Ctrl+U)" aria-label="Subrayado"><u>U</u></button>
        <button type="button" class="fmt" data-nfmt="s" title="Tachado · ~~texto~~ (Ctrl+Mayús+S)" aria-label="Tachado"><s>S</s></button>
        <button type="button" class="fmt" data-nfmt="code" title="Código · \`texto\` (Ctrl+E)" aria-label="Código">${icon('code', { size: 15 })}</button>
        <button type="button" class="fmt fmt-color" data-act="fmt-colors" title="Color del texto o del fondo" aria-label="Color" aria-haspopup="true" aria-expanded="false"><span class="fmt-a">A</span>${icon('chevron-down', { size: 12 })}</button>
        <button type="button" class="fmt fmt-morebtn" data-act="fmt-more" title="Más formato" aria-label="Más formato" aria-haspopup="true" aria-expanded="false">${icon('ellipsis', { size: 16 })}</button>
      </div>
      <span class="selbar-sep" aria-hidden="true"></span>
      <button type="button" class="sb-card" data-act="sel-card">＋ Crear pregunta</button>
      <button type="button" class="sb-cloze" data-act="sel-cloze" title="Convertir en hueco">Hueco</button>
      <button type="button" class="sb-done" data-act="sel-done">Hecho</button></div>
    <div id="fmtMore" class="fmt-more" role="menu" aria-label="Más formato" hidden>
      <button type="button" role="menuitem" class="fmt" data-nfmt="u" aria-label="Subrayado"><u>U</u></button>
      <button type="button" role="menuitem" class="fmt" data-nfmt="s" aria-label="Tachado"><s>S</s></button>
      <button type="button" role="menuitem" class="fmt" data-nfmt="code" aria-label="Código">${icon('code', { size: 15 })}</button>
      <button type="button" role="menuitem" class="fmt fmt-color" data-act="fmt-colors" aria-label="Color" aria-haspopup="true"><span class="fmt-a">A</span>${icon('chevron-down', { size: 12 })}</button></div>
    <div id="fmtColors" class="fmt-colors" role="menu" aria-label="Color" hidden>
      <p class="fmt-h">Color del texto</p>
      <div class="fmt-grid">${['default', ...TEXT_COLORS].map(c => `<button type="button" role="menuitem" class="fmt-sw" data-nfmt="color" data-color="${c}" title="${c === 'default' ? 'Predeterminado' : COLOR_LABEL[c]}" aria-label="Texto ${c === 'default' ? 'predeterminado' : COLOR_LABEL[c].toLowerCase()}"><span class="tc-${c}">A</span></button>`).join('')}</div>
      <p class="fmt-h">Fondo</p>
      <div class="fmt-grid">${['default', ...TEXT_COLORS].map(c => `<button type="button" role="menuitem" class="fmt-sw fmt-bg hl-${c}" data-nfmt="bg" data-color="${c}" title="${c === 'default' ? 'Sin fondo' : `Fondo ${COLOR_LABEL[c].toLowerCase()}`}" aria-label="Fondo ${c === 'default' ? 'ninguno' : COLOR_LABEL[c].toLowerCase()}">A</button>`).join('')}</div>
    </div>`;
  histStart(p);
  if (S.bsel?.pageId !== p.id) S.bsel = null;
  growTitle();
  afterBlocksDrawn();
  if (S.focusBlock) {
    revealBlock(S.focusBlock);
    const el = document.querySelector(`[data-block="${S.focusBlock}"]`);
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); }
    S.focusBlock = null;
  }
}
export const curPage = () => S.pages.get(S.pageId);
// El título es un cuadro de varias líneas que crece con el texto (en el móvil, uno largo no se corta)
export function growTitle() {
  const t = $('#pgTitle');
  if (!t) return;
  t.style.height = 'auto';
  t.style.height = t.scrollHeight + 'px';
}
addEventListener('resize', () => { if (S.view === 'page') growTitle(); });
// Intro en el título no añade una línea: termina de escribirlo
document.addEventListener('keydown', e => { if (e.target.id === 'pgTitle' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.target.blur(); } });
// Quitar del DOM el bloque que tiene el foco dispara «focusout» a mitad del cambio: mientras se
// repinta, ese aviso se ignora (lo escrito ya se ha guardado antes).
let repainting = false;
export function repaint(fn) { repainting = true; try { fn(); } finally { repainting = false; } }
// Vuelve a pintar los bloques y deja editando uno (con el cursor en «caret»)
export function redrawBlocks(editId, caret) {
  const p = curPage(), cards = pageCards(p.id);
  repaint(() => { $('#pgBlocks').innerHTML = blocksHTML(p, cards); });
  afterBlocksDrawn();
  if (editId) editBlock(editId, caret);
}
// Tras pintar los bloques: el índice, los enlaces de otros apuntes, la búsqueda abierta y la selección
function afterBlocksDrawn() {
  updateToc();
  updateLinks();
  if (S.find?.open) runFind(true);
  updateHistBtns();
  paintBlockSel();
  scheduleSugMarks(150);
}
const blockById = id => curPage()?.blocks.find(x => x.id === id);
// Un bloque dentro de un apartado plegado: se despliega lo necesario para verlo
function revealBlock(id) {
  const p = curPage();
  if (!p || !hiddenIds(p.blocks).has(id)) return false;
  for (const b of p.blocks) if (b.collapsed && sectionIds(p.blocks, b.id).includes(id)) delete b.collapsed;
  savePageSoon(p);
  if ($('#pgBlocks')) redrawBlocks();
  return true;
}
export function toggleFold(id) {
  const p = curPage(), b = blockById(id);
  if (!b) return;
  const open = document.querySelector('[data-block-input]');
  if (open) commitBlockEl(open);
  if (b.collapsed) delete b.collapsed; else b.collapsed = true;
  savePageSoon(p);
  redrawBlocks();
}

/* ---------- Deshacer y rehacer en todo el apunte (Ctrl+Z / Ctrl+Mayús+Z) ----------
   Cada cambio guarda una copia del apunte; lo que se escribe seguido en un bloque cuenta como un solo paso.
   Al deshacer, el cursor vuelve a donde estaba el cambio. */
export const H = { id: null, list: [], i: 0, t: 0, kind: '' };
let histApplying = false;
function histFocus() {
  const a = document.activeElement;
  if (a?.dataset?.blockInput) return { id: a.dataset.blockInput, a: a.selectionStart, b: a.selectionEnd };
  const t = a?.closest?.('[data-table-ed]');
  return t ? { id: t.dataset.tableEd } : null;
}
function histStart(p) {
  if (H.id !== p.id) Object.assign(H, { id: p.id, list: [{ json: JSON.stringify(p.blocks), focus: null }], i: 0, t: 0, kind: '' });
}
export function histRecord(kind = 'cmd') {
  const p = curPage();
  if (!p || histApplying || S.view !== 'page' || H.id !== p.id) return;
  const json = JSON.stringify(p.blocks), top = H.list[H.i], focus = histFocus(), now = Date.now();
  if (top.json === json) { if (focus) top.focus = focus; return; }
  if (kind === 'type' && H.kind === 'type' && H.i > 0 && now - H.t < 1500 && top.focus?.id === focus?.id) Object.assign(top, { json, focus });
  else {
    H.list.length = H.i + 1;
    H.list.push({ json, focus });
    if (H.list.length > 300) H.list.shift();
    H.i = H.list.length - 1;
  }
  H.t = now; H.kind = kind;
  updateHistBtns();
}
function updateHistBtns() {
  const u = $('.pg-hist [data-act="pg-undo"]'), r = $('.pg-hist [data-act="pg-redo"]');
  if (u) u.disabled = !(H.id === S.pageId && H.i > 0);
  if (r) r.disabled = !(H.id === S.pageId && H.i < H.list.length - 1);
}
export function histTravel(dir) {
  const p = curPage(), j = H.i + dir;
  if (!p || H.id !== p.id) return;
  if (j < 0 || j >= H.list.length) return toast(dir < 0 ? 'No hay nada que deshacer' : 'No hay nada que rehacer');
  const from = H.list[H.i], to = H.list[j];
  H.i = j; H.kind = 'cmd';
  histApplying = true;
  try {
    p.blocks = JSON.parse(to.json);
    closeBlockMenu(); closeOps(); closeWikiMenu();
    S.bsel = null;
    // El cursor, donde estaba el cambio que se deshace (o el que se rehace)
    const f = [dir < 0 ? from.focus : to.focus, dir < 0 ? to.focus : from.focus].find(x => x && p.blocks.some(b => b.id === x.id));
    savePageSoon(p);
    redrawBlocks(f?.id, f && f.a != null ? { a: f.a, b: f.b } : null);
  } finally { histApplying = false; }
  updateHistBtns();
}
document.addEventListener('live-history', e => { if (S.view === 'page') { e.preventDefault(); histTravel(e.detail); } });

/* ---------- Mover, duplicar, borrar, sangrar y convertir bloques ---------- */
function moveSel(ids, dir) {
  const p = curPage(), next = moveBlocks(p.blocks, ids, dir);
  if (!next) return false;
  p.blocks = next;
  savePageSoon(p);
  return true;
}
// Copia los bloques (con su apartado plegado o sus subpuntos) justo detrás; devuelve las copias
function duplicateBlocks(ids) {
  const p = curPage(), take = new Set();
  let last = -1;
  p.blocks.forEach((b, i) => {
    if (!ids.includes(b.id)) return;
    const [a, z] = unitOf(p.blocks, i);
    for (let k = a; k <= z; k++) take.add(k);
    last = Math.max(last, z);
  });
  if (last < 0) return [];
  const copies = [...take].sort((x, y) => x - y).map(k => ({ ...JSON.parse(JSON.stringify(p.blocks[k])), id: blockId() }));
  p.blocks.splice(last + 1, 0, ...copies);
  savePageSoon(p);
  return copies;
}
// Borra bloques (un título plegado, con su apartado). Las tarjetas que salían de ellos pasan al bloque de antes
function deleteBlocks(ids) {
  const p = curPage(), gone = new Set(ids);
  for (const id of ids) if (blockById(id)?.collapsed) sectionIds(p.blocks, id).forEach(x => gone.add(x));
  const first = p.blocks.findIndex(b => gone.has(b.id));
  const keep = p.blocks.filter(b => !gone.has(b.id));
  const near = keep[Math.max(0, first - 1)] || null;
  if (near) for (const id of gone) moveCards(id, near.id);
  p.blocks = keep.length ? keep : [newBlock()];
  savePageSoon(p);
  return near && keep.length ? near : p.blocks[0];
}
// Tab / Mayús+Tab: los subpuntos se mueven con su punto
function indentBlocks(ids, dir) {
  const p = curPage(), done = new Set();
  let changed = false;
  for (const id of ids) {
    const i = p.blocks.findIndex(x => x.id === id);
    if (done.has(id) || !canIndent(p.blocks, i, dir)) continue;
    const [a, z] = unitOf(p.blocks, i);
    for (let k = a; k <= z; k++) {
      const b = p.blocks[k];
      if (done.has(b.id) || !INDENTABLE.includes(b.type)) continue;
      const d = Math.max(0, Math.min(MAX_INDENT, (b.indent || 0) + dir));
      if (d) b.indent = d; else delete b.indent;
      done.add(b.id);
    }
    changed = true;
  }
  if (changed) savePageSoon(p);
  return changed;
}
const CONVERT = ['p', 'h1', 'h2', 'h3', 'li', 'ol', 'todo', 'quote', 'callout', 'code'];
function convertBlocks(ids, type) {
  const p = curPage();
  for (const id of ids) {
    const b = blockById(id);
    if (!b || !CONVERT.includes(b.type)) continue;
    b.type = type;
    if (type === 'todo' && b.checked == null) b.checked = false;
    if (type === 'callout' && !b.icon) b.icon = '💡';
    if (!INDENTABLE.includes(type)) delete b.indent;
    if (!['h1', 'h2', 'h3'].includes(type)) delete b.collapsed;
  }
  savePageSoon(p);
}

/* ---------- Selección de bloques (Esc, Mayús+clic, arrastrar por varios bloques, Ctrl+A) ---------- */
function visibleIds() {
  const p = curPage(), hid = hiddenIds(p?.blocks || []);
  return (p?.blocks || []).filter(b => !hid.has(b.id)).map(b => b.id);
}
export function selRange(fromId, toId) {
  const vis = visibleIds();
  let a = vis.indexOf(fromId), z = vis.indexOf(toId);
  if (a < 0 || z < 0) return [toId];
  if (a > z) [a, z] = [z, a];
  return vis.slice(a, z + 1);
}
// Los seleccionados, en el orden del apunte
export const selIds = () => (S.bsel ? curPage().blocks.filter(b => S.bsel.ids.has(b.id)).map(b => b.id) : []);
export function setBlockSel(ids, anchor = ids[0], head = ids[ids.length - 1]) {
  S.bsel = ids.length ? { pageId: S.pageId, ids: new Set(ids), anchor, head } : null;
  paintBlockSel();
}
function paintBlockSel() {
  document.querySelectorAll('#pgBlocks .nb').forEach(el => el.classList.toggle('is-sel', !!S.bsel?.ids.has(el.dataset.block)));
  const bar = $('#blkBar');
  if (!bar) return;
  // La barra, con varios bloques (con uno solo, basta su asa o el teclado)
  bar.hidden = !S.bsel || S.bsel.ids.size < 2;
  if (bar.hidden) return;
  bar.innerHTML = `<span class="blk-count">${plural(S.bsel.ids.size, 'bloque', 'bloques')}</span>
    <button type="button" class="ghost small-btn" data-act="bsel-ops" aria-haspopup="true">Convertir y más</button>
    <button type="button" class="ghost small-btn" data-act="bsel-dup" title="Duplicar (Ctrl+D)">${icon('copy', { size: 15 })} <span>Duplicar</span></button>
    <button type="button" class="ghost small-btn danger" data-act="bsel-del" title="Borrar (Supr)">${icon('trash-2', { size: 15 })} <span>Borrar</span></button>
    <button type="button" class="iconbtn" data-act="bsel-clear" aria-label="Quitar la selección" title="Quitar la selección (Esc)">${icon('x', { size: 16 })}</button>`;
}
export function clearBlockSel() { if (S.bsel) { S.bsel = null; paintBlockSel(); } closeOps(); }
// Acciones sobre los bloques seleccionados (o sobre los de la lista «ids»)
export function blockAction(op, ids = selIds()) {
  const p = curPage();
  if (!p || !ids.length) return;
  const open = document.querySelector('[data-block-input]');
  if (open) commitBlockEl(open);
  closeOps();
  if (op === 'del') { const near = deleteBlocks(ids); S.bsel = null; redrawBlocks(); toast(ids.length > 1 ? `${plural(ids.length, 'bloque borrado', 'bloques borrados')} · Ctrl+Z para deshacer` : 'Bloque borrado · Ctrl+Z para deshacer'); return near; }
  if (op === 'dup') { const c = duplicateBlocks(ids); redrawBlocks(); setBlockSel(c.map(x => x.id)); return; }
  if (op === 'up' || op === 'down') { if (moveSel(ids, op === 'up' ? -1 : 1)) { redrawBlocks(); document.querySelector(`[data-block="${ids[0]}"]`)?.scrollIntoView({ block: 'nearest' }); } return; }
  if (op === 'indent' || op === 'outdent') { if (indentBlocks(ids, op === 'indent' ? 1 : -1)) redrawBlocks(); return; }
  if (op === 'fold') { toggleFold(ids[0]); return; }
  if (op.startsWith('to:')) { convertBlocks(ids, op.slice(3)); redrawBlocks(); }
}
// Copiar o cortar bloques: en Markdown y con formato (al pegarlos en los apuntes vuelven a ser los mismos bloques)
function blocksToHTML(blocks) {
  return blocks.map(b => {
    const t = toHTML(b.text), ind = b.indent ? ` data-ind="${b.indent}"` : '';
    if (/^h[123]$/.test(b.type)) return `<${b.type}>${t}</${b.type}>`;
    if (b.type === 'li' || b.type === 'ol') return `<${b.type === 'li' ? 'ul' : 'ol'}><li${ind}>${t}</li></${b.type === 'li' ? 'ul' : 'ol'}>`;
    if (b.type === 'todo') return `<ul><li class="task-list-item"${ind}><input type="checkbox"${b.checked ? ' checked' : ''}>${t}</li></ul>`;
    if (b.type === 'quote' || b.type === 'callout') return `<blockquote>${t}</blockquote>`;
    if (b.type === 'code') return `<pre><code>${esc(b.text)}</code></pre>`;
    if (b.type === 'table') return tableHTML(b.text);
    if (b.type === 'hr') return '<hr>';
    if (b.type === 'img') return `<p>${esc(`![${b.text}](img:${b.src})`)}</p>`;
    return `<p${ind}>${t}</p>`;
  }).join('');
}
function copyBlocks(e, cut) {
  if (!S.bsel || S.view !== 'page' || !e.clipboardData) return;
  const a = document.activeElement;
  if (a?._live || a?.matches?.('input, textarea')) return;
  const p = curPage(), ids = selIds(), blocks = p.blocks.filter(b => ids.includes(b.id));
  e.preventDefault();
  e.clipboardData.setData('text/plain', pageToMarkdown({ title: '', blocks }).trim());
  e.clipboardData.setData('text/html', blocksToHTML(blocks));
  if (cut) blockAction('del', ids);
  else toast(plural(blocks.length, 'bloque copiado', 'bloques copiados'));
}
document.addEventListener('copy', e => copyBlocks(e, false));
document.addEventListener('cut', e => copyBlocks(e, true));
// Teclas con bloques seleccionados (sin estar escribiendo)
function blockSelKey(e) {
  const ids = selIds(), mod = e.ctrlKey || e.metaKey;
  if (!ids.length) return false;
  const vis = visibleIds();
  if (e.key === 'Escape') { clearBlockSel(); return true; }
  if (e.key === 'Backspace' || e.key === 'Delete') { blockAction('del', ids); return true; }
  if (e.key === 'Enter' && !mod) { const id = S.bsel.head; clearBlockSel(); editBlock(id); return true; }
  if (e.key === 'Tab') { blockAction(e.shiftKey ? 'outdent' : 'indent', ids); return true; }
  if (mod && e.key.toLowerCase() === 'd') { blockAction('dup', ids); return true; }
  if (mod && e.key.toLowerCase() === 'a') { setBlockSel(vis); return true; }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    const dir = e.key === 'ArrowUp' ? -1 : 1;
    if (e.altKey || (mod && e.shiftKey)) { blockAction(dir < 0 ? 'up' : 'down', ids); return true; }
    const k = Math.max(0, Math.min(vis.length - 1, vis.indexOf(S.bsel.head) + dir));
    if (e.shiftKey) setBlockSel(selRange(S.bsel.anchor, vis[k]), S.bsel.anchor, vis[k]);
    else setBlockSel([vis[k]]);
    document.querySelector(`[data-block="${vis[k]}"]`)?.scrollIntoView({ block: 'nearest' });
    return true;
  }
  return false;
}
// Arrastrar el ratón por varios bloques (sin estar escribiendo) los selecciona enteros
export let justSelected = 0;
document.addEventListener('pointerup', () => {
  if (S.view !== 'page' || drag) return;
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  const nbOf = n => (n?.nodeType === 1 ? n : n?.parentElement)?.closest?.('#pgBlocks .nb');
  const a = nbOf(sel.anchorNode), z = nbOf(sel.focusNode);
  if (!a || !z || a === z) return;
  setBlockSel(selRange(a.dataset.block, z.dataset.block), a.dataset.block, z.dataset.block);
  sel.removeAllRanges();
  justSelected = Date.now();
});

/* ---------- Asa de cada bloque: arrastrar para moverlo, clic para sus opciones ---------- */
export let drag = null;
document.addEventListener('pointerdown', e => {
  const g = e.target.closest?.('.nb-grip');
  if (!g || S.view !== 'page' || e.button > 0) return;
  e.preventDefault();
  drag = { id: g.dataset.grip, x: e.clientX, y: e.clientY, on: false, pid: e.pointerId, grip: g };
});
function startDrag() {
  const p = curPage();
  const open = document.querySelector('[data-block-input]');
  if (open) commitBlockEl(open);
  closeOps();
  const ids = S.bsel?.ids.has(drag.id) ? selIds() : [drag.id];
  // Lo que se mueve: los bloques y lo que llevan (apartado plegado, subpuntos)
  const idx = p.blocks.map((b, k) => (ids.includes(b.id) ? k : -1)).filter(k => k >= 0);
  const a = idx[0], z = Math.max(idx[idx.length - 1], unitOf(p.blocks, idx[idx.length - 1])[1]);
  drag.ids = p.blocks.slice(a, z + 1).map(b => b.id);
  drag.on = true;
  document.body.classList.add('dragging-blocks');
  drag.ids.forEach(id => document.querySelector(`[data-block="${id}"]`)?.classList.add('is-dragging'));
  let line = $('#dropLine');
  if (!line) { line = document.createElement('div'); line.id = 'dropLine'; line.className = 'drop-line'; document.body.appendChild(line); }
  line.hidden = false;
}
function dragOver(y) {
  if (y < 70) scrollBy(0, -12); else if (y > innerHeight - 90) scrollBy(0, 12);
  const els = [...document.querySelectorAll('#pgBlocks .nb')].filter(el => !drag.ids.includes(el.dataset.block) && !el.classList.contains('is-folded'));
  let before = null, ref = null;
  for (const el of els) { const r = el.getBoundingClientRect(); if (y < r.top + r.height / 2) { before = el.dataset.block; ref = r; break; } }
  drag.before = before;
  const box = $('#pgBlocks').getBoundingClientRect(), line = $('#dropLine');
  const last = els[els.length - 1]?.getBoundingClientRect();
  const top = ref ? ref.top - 2 : (last ? last.bottom + 1 : box.top);
  Object.assign(line.style, { top: `${top}px`, left: `${box.left}px`, width: `${box.width}px` });
}
document.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.pid) return;
  if (!drag.on) { if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return; startDrag(); }
  e.preventDefault();
  dragOver(e.clientY);
});
function endDrag(cancel = false) {
  const d = drag;
  drag = null;
  document.body.classList.remove('dragging-blocks');
  const line = $('#dropLine');
  if (line) line.hidden = true;
  document.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
  if (cancel || !d?.on) return;
  const p = curPage(), group = p.blocks.filter(b => d.ids.includes(b.id)), rest = p.blocks.filter(b => !d.ids.includes(b.id));
  let at = d.before ? rest.findIndex(b => b.id === d.before) : rest.length;
  if (at < 0) at = rest.length;
  rest.splice(at, 0, ...group);
  if (rest.every((b, k) => b === p.blocks[k])) return;
  p.blocks = rest;
  savePageSoon(p);
  redrawBlocks();
  d.ids.forEach(id => document.querySelector(`[data-block="${id}"]`)?.classList.add('flash'));
}
document.addEventListener('pointerup', e => {
  if (!drag || e.pointerId !== drag.pid) return;
  if (drag.on) return endDrag();
  const d = drag;
  drag = null;
  openOps(d.id, d.grip);
});
document.addEventListener('pointercancel', () => { if (drag) endDrag(true); });

/* ---------- Opciones de un bloque (clic en el asa) ---------- */
export function openOps(id, anchor) {
  if (!S.bsel?.ids.has(id)) setBlockSel([id]);
  const ids = selIds(), blocks = ids.map(blockById).filter(Boolean);
  const types = new Set(blocks.map(b => b.type));
  const one = types.size === 1 ? [...types][0] : null;
  const canConv = blocks.every(b => CONVERT.includes(b.type));
  const p = curPage();
  const i0 = p.blocks.findIndex(b => b.id === ids[0]);
  let el = $('#blkOps');
  if (!el) { el = document.createElement('div'); el.id = 'blkOps'; el.className = 'blk-menu blk-ops'; el.setAttribute('role', 'menu'); document.body.appendChild(el); }
  const item = (op, ic, label, key = '', cls = '') => `<button type="button" role="menuitem" class="blk-item${cls}" data-bop="${op}"><span class="blk-glyph" aria-hidden="true">${ic}</span><span class="blk-txt"><b>${label}</b></span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  const heads = blocks.length === 1 && ['h1', 'h2', 'h3'].includes(one) && sectionIds(p.blocks, ids[0]).length > 1;
  el.innerHTML = `${canConv ? `<p class="ops-h">Convertir en</p><div class="ops-types">${CONVERT.map(t => { const m = BLOCK_MENU.find(x => x.type === t); return `<button type="button" role="menuitemradio" aria-checked="${one === t}" class="ops-type" data-bop="to:${t}" title="${esc(m.label)}"><span aria-hidden="true">${esc(GLYPH[t])}</span><small>${esc(m.label)}</small></button>`; }).join('')}</div><div class="ops-sep"></div>` : ''}
    ${item('dup', icon('copy', { size: 15 }), 'Duplicar', 'Ctrl+D')}
    ${item('up', icon('arrow-up', { size: 15 }), 'Mover arriba', 'Alt+↑')}
    ${item('down', icon('arrow-down', { size: 15 }), 'Mover abajo', 'Alt+↓')}
    ${blocks.some(b => INDENTABLE.includes(b.type)) ? `${canIndent(p.blocks, i0, 1) ? item('indent', '→', 'Aumentar sangría', 'Tab') : ''}${blocks.some(b => b.indent) ? item('outdent', '←', 'Reducir sangría', 'Mayús+Tab') : ''}` : ''}
    ${heads ? item('fold', icon('chevron-right', { size: 15 }), blocks[0].collapsed ? 'Desplegar el apartado' : 'Plegar el apartado') : ''}
    <div class="ops-sep"></div>
    ${item('del', icon('trash-2', { size: 15 }), blocks.length > 1 ? `Borrar ${blocks.length} bloques` : 'Borrar', 'Supr', ' danger')}`;
  el.hidden = false;
  const r = anchor.getBoundingClientRect(), w = Math.min(280, innerWidth - 16);
  el.style.width = w + 'px';
  const h = el.offsetHeight;
  el.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  el.style.top = (r.bottom + 4 + h < innerHeight ? r.bottom + 4 : Math.max(8, r.top - h - 4)) + 'px';
  el.querySelector('button')?.focus({ preventScroll: true });
}
export function closeOps() { const el = $('#blkOps'); if (el) el.hidden = true; }
document.addEventListener('pointerdown', e => { if (S.tocOpen && !e.target.closest?.('#pgToc, .pg-tocbtn')) { S.tocOpen = false; updateToc(); } });
document.addEventListener('pointerdown', e => {
  if (S.view !== 'page' || e.target.closest?.('#blkOps, #blkBar, .nb-grip')) return;
  closeOps();
  if (S.bsel && !e.shiftKey) clearBlockSel();
});

/* ---------- Buscar y reemplazar en el apunte (Ctrl+F) ---------- */
export function openFind(withReplace = false) {
  const open = document.querySelector('[data-block-input]');
  const sel = getSelection()?.toString().trim();
  if (open) commitBlockEl(open);
  clearBlockSel();
  S.find = { ...(S.find || { q: '', r: '', i: 0 }), open: true, rep: withReplace || !!S.find?.rep };
  if (sel && !sel.includes('\n') && sel.length < 80) S.find.q = sel;
  let bar = $('#findBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'findBar'; bar.className = 'find-bar'; bar.setAttribute('role', 'search');
    $('.pg-top').after(bar);
  }
  bar.innerHTML = `<div class="find-row">${icon('search', { size: 16 })}<input id="findQ" type="text" placeholder="Buscar en el apunte" aria-label="Buscar en el apunte" value="${esc(S.find.q)}" autocomplete="off">
      <span id="findCount" class="find-count muted small" aria-live="polite"></span>
      <button type="button" class="iconbtn" data-act="find-prev" aria-label="Anterior" title="Anterior (Mayús+Enter)">${icon('arrow-up', { size: 16 })}</button>
      <button type="button" class="iconbtn" data-act="find-next" aria-label="Siguiente" title="Siguiente (Enter)">${icon('arrow-down', { size: 16 })}</button>
      <button type="button" class="iconbtn" data-act="find-rep" aria-label="Reemplazar" aria-pressed="${S.find.rep}" title="Reemplazar (Ctrl+H)">${icon('arrow-up-down', { size: 16 })}</button>
      <button type="button" class="iconbtn" data-act="find-close" aria-label="Cerrar la búsqueda" title="Cerrar (Esc)">${icon('x', { size: 16 })}</button></div>
    <div class="find-row" ${S.find.rep ? '' : 'hidden'}><span class="find-pad" aria-hidden="true"></span><input id="findR" placeholder="Reemplazar por" aria-label="Reemplazar por" value="${esc(S.find.r)}" autocomplete="off">
      <button type="button" class="ghost small-btn" data-act="find-one">Reemplazar</button><button type="button" class="ghost small-btn" data-act="find-all">Todos</button></div>`;
  bar.hidden = false;
  const inp = $(withReplace && S.find.q ? '#findR' : '#findQ');
  inp.focus(); inp.select();
  runFind();
}
export function closeFind() {
  if (S.find) S.find.open = false;
  const bar = $('#findBar');
  if (bar) bar.remove();
  if (window.CSS?.highlights) { CSS.highlights.delete('find'); CSS.highlights.delete('find-cur'); }
}
// Dónde aparece lo buscado: rangos del texto que se ve (sin las marcas del Markdown)
function findMatches(q) {
  const out = [];
  if (!q) return out;
  for (const nb of document.querySelectorAll('#pgBlocks .nb')) {
    const root = nb.querySelector('.nb-text, .nb-input');
    if (!root || root.matches('textarea')) continue;
    const nodes = [];
    let text = '';
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode;
      if (n.parentElement.closest('.mk:not(.on > .mk), .nb-ph, rt')) continue;
      nodes.push({ n, at: text.length });
      text += n.data;
    }
    const start = x => { let j = nodes.length - 1; while (j > 0 && nodes[j].at > x) j--; return [nodes[j].n, x - nodes[j].at]; };
    const end = x => { let j = nodes.length - 1; while (j > 0 && nodes[j].at >= x) j--; return [nodes[j].n, x - nodes[j].at]; };
    let k = 0;
    for (const at of findAll(text, q)) {
      const [sn, so] = start(at), [en, eo] = end(at + q.length);
      const r = document.createRange();
      r.setStart(sn, so); r.setEnd(en, eo);
      out.push({ id: nb.dataset.block, r, k: k++, src: root.classList.contains('md') ? [textOffset(root, sn, so), textOffset(root, en, eo)] : null });
    }
  }
  return out;
}
function runFind(keep = false) {
  const f = S.find;
  if (!f?.open) return;
  f.list = findMatches(f.q);
  if (!keep) f.i = 0;
  f.i = Math.min(f.i, Math.max(0, f.list.length - 1));
  const cnt = $('#findCount');
  if (cnt) cnt.textContent = !f.q ? '' : f.list.length ? `${f.i + 1} de ${f.list.length}` : 'Sin resultados';
  if (window.CSS?.highlights && window.Highlight) {
    CSS.highlights.set('find', new Highlight(...f.list.map(m => m.r)));
    if (f.list[f.i]) CSS.highlights.set('find-cur', new Highlight(f.list[f.i].r)); else CSS.highlights.delete('find-cur');
  }
}
export function gotoFind(dir) {
  const f = S.find;
  if (!f?.list?.length) return;
  f.i = (f.i + dir + f.list.length) % f.list.length;
  const m = f.list[f.i];
  if (revealBlock(m.id)) runFind(true);
  runFind(true);
  const r = f.list[f.i]?.r.getBoundingClientRect();
  if (r && (r.top < 110 || r.bottom > innerHeight - 90)) scrollBy({ top: r.top - innerHeight / 3, behavior: 'smooth' });
}
// Reemplaza en el Markdown del bloque (lo encontrado en un texto con formato, o la misma aparición en una tabla o un código)
function replaceMatch(b, m, rep, q) {
  if (m.src) { b.text = b.text.slice(0, m.src[0]) + rep + b.text.slice(m.src[1]); return true; }
  const at = findAll(b.text, q)[m.k];
  if (at == null) return false;
  b.text = b.text.slice(0, at) + rep + b.text.slice(at + q.length);
  return true;
}
export function replaceFind(all) {
  const f = S.find, p = curPage();
  if (!f?.list?.length) return;
  const list = all ? [...f.list].reverse() : [f.list[f.i]];
  let n = 0;
  for (const m of list) { const b = blockById(m.id); if (b && replaceMatch(b, m, f.r, f.q)) n++; }
  if (!n) return;
  savePageSoon(p);
  redrawBlocks();
  if (all) toast(`${plural(n, 'cambio', 'cambios')} · Ctrl+Z para deshacer`);
}

/* ---------- Índice del apunte (a la derecha en pantallas grandes; si no, en un menú) ---------- */
export function updateToc() {
  const p = curPage(), nav = $('#pgToc'), btn = $('.pg-tocbtn');
  if (!p || !nav) return;
  const heads = p.blocks.filter(b => ['h1', 'h2', 'h3'].includes(b.type) && toPlain(b.text).trim());
  const show = heads.length >= 2;
  if (btn) btn.hidden = !show;
  nav.hidden = !show;
  if (!show) { S.tocOpen = false; nav.innerHTML = ''; return; }
  const min = Math.min(...heads.map(h => +h.type[1]));
  nav.classList.toggle('pop', !!S.tocOpen);
  nav.innerHTML = `<p class="toc-h">En este apunte</p>${heads.map(h => `<a href="#" class="toc-i" style="--lvl:${+h.type[1] - min}" data-toc="${h.id}">${esc(toPlain(h.text))}</a>`).join('')}`;
  tocActive();
}
function tocActive() {
  const nav = $('#pgToc');
  if (!nav || nav.hidden) return;
  let cur = null;
  for (const a of nav.querySelectorAll('[data-toc]')) {
    const el = document.querySelector(`[data-block="${a.dataset.toc}"]`);
    if (el && !el.classList.contains('is-folded') && el.getBoundingClientRect().top < 160) cur = a;
  }
  nav.querySelectorAll('[data-toc]').forEach(a => a.classList.toggle('on', a === (cur || nav.querySelector('[data-toc]'))));
}
addEventListener('scroll', () => { if (S.view === 'page') tocActive(); }, { passive: true });
export function gotoBlock(id) {
  revealBlock(id);
  const el = document.querySelector(`[data-block="${id}"]`);
  if (!el) return;
  scrollTo({ top: el.getBoundingClientRect().top + scrollY - 90, behavior: 'smooth' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

/* ---------- Enlaces entre apuntes: [[Título]] ---------- */
const findPageByTitle = t => [...S.pages.values()].find(p => sameTitle(p.title || '', t)) || [...S.pages.values()].find(p => sameTitle(pageTitle(p), t));
export function openWiki(title) {
  const t = String(title || '').trim();
  if (!t) return;
  const target = findPageByTitle(t);
  if (target) return go('page', { pageId: target.id });
  // Como en Obsidian: si no existe, se crea (en la misma carpeta)
  const here = curPage();
  newPage({ title: t, folder: here ? pageFolder(here) : undefined });
  toast(`Apunte «${t}» creado`);
}
// Al escribir «[[», una lista de apuntes para enlazar
export function wikiCheck(ed) {
  if (!ed?._live) return closeWikiMenu();
  const caret = ed.selectionStart, before = ed.value.slice(0, caret);
  const m = /\[\[([^[\]|\n]{0,60})$/.exec(before);
  if (!m || ed.selectionEnd !== caret) return closeWikiMenu();
  const q = m[1], fq = fold(q.trim());
  const pages = [...S.pages.values()].filter(p => p.id !== S.pageId && (!fq || fold(pageTitle(p)).includes(fq)))
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))).slice(0, 8);
  const items = pages.map(p => ({ title: p.title?.trim() || pageTitle(p), icon: p.icon }));
  if (q.trim() && !items.some(x => sameTitle(x.title, q))) items.push({ title: q.trim(), create: true });
  if (!items.length) return closeWikiMenu();
  const same = S.wiki && S.wiki.start === m.index && S.wiki.blockId === ed.dataset.blockInput;
  S.wiki = { blockId: ed.dataset.blockInput, start: m.index, items, i: same ? Math.min(S.wiki.i, items.length - 1) : 0 };
  let el = $('#wikiMenu');
  if (!el) { el = document.createElement('div'); el.id = 'wikiMenu'; el.className = 'blk-menu'; el.setAttribute('role', 'listbox'); el.setAttribute('aria-label', 'Enlazar a un apunte'); document.body.appendChild(el); }
  el.innerHTML = `<p class="ops-h">Enlazar a un apunte</p>${items.map((x, k) => `<button type="button" class="blk-item" role="option" aria-selected="${k === S.wiki.i}" data-wiki-pick="${k}">
    <span class="blk-glyph" aria-hidden="true">${x.create ? icon('plus', { size: 15 }) : x.icon ? esc(x.icon) : icon('file-text', { size: 15 })}</span>
    <span class="blk-txt"><b>${x.create ? `Crear «${esc(x.title)}»` : esc(x.title)}</b></span></button>`).join('')}`;
  el.hidden = false;
  const r = getSelection()?.rangeCount ? getSelection().getRangeAt(0).getBoundingClientRect() : ed.getBoundingClientRect();
  const w = Math.min(300, innerWidth - 16), h = Math.min(el.scrollHeight, 340);
  el.style.width = w + 'px';
  el.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  el.style.top = (r.bottom + 6 + h < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + 'px';
}
export function closeWikiMenu() { S.wiki = null; const el = $('#wikiMenu'); if (el) el.hidden = true; }
function pickWiki(k) {
  const w = S.wiki, x = w?.items[k], ed = document.activeElement?._live ? document.activeElement : document.querySelector(`[data-block-input="${w?.blockId}"]`);
  if (!x || !ed) return closeWikiMenu();
  const v = ed.value, caret = ed.selectionStart;
  const end = v.slice(caret, caret + 2) === ']]' ? caret + 2 : v[caret] === ']' ? caret + 1 : caret;
  const link = `[[${x.title}]]`;
  closeWikiMenu();
  liveSet(ed, v.slice(0, w.start) + link + v.slice(end), w.start + link.length);
}
function wikiKey(e) {
  if (!S.wiki || $('#wikiMenu')?.hidden) return false;
  const n = S.wiki.items.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    S.wiki.i = (S.wiki.i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    document.querySelectorAll('#wikiMenu .blk-item').forEach((b, k) => b.setAttribute('aria-selected', String(k === S.wiki.i)));
    return true;
  }
  if (e.key === 'Enter' || e.key === 'Tab') { pickWiki(S.wiki.i); return true; }
  if (e.key === 'Escape') { closeWikiMenu(); return true; }
  return false;
}
document.addEventListener('pointerdown', e => {
  if (e.target.closest?.('#wikiMenu')) { e.preventDefault(); const b = e.target.closest('[data-wiki-pick]'); if (b) pickWiki(+b.dataset.wikiPick); return; }
  if (S.wiki) closeWikiMenu();
});
// Debajo del apunte: los que enlazan a él
function updateLinks() {
  const p = curPage(), box = $('#pgLinks');
  if (!p || !box) return;
  const list = backlinks([...S.pages.values()], p);
  box.hidden = !list.length;
  box.innerHTML = list.length ? `<h3 class="sub-h">Enlazado desde <span class="muted">· ${list.length}</span></h3>
    <ul class="list notes-list">${list.map(o => {
      const b = o.blocks.find(x => /\[\[/.test(x.text) && toPlain(x.text));
      return `<li><button class="deck note-row" data-page="${o.id}"><span class="icon">${o.icon ? esc(o.icon) : icon('file-text', { size: 20 })}</span>
        <span class="info"><span class="dname">${esc(pageTitle(o))}</span>${b ? `<span class="snip">${esc(toPlain(b.text).slice(0, 140))}</span>` : ''}</span></button></li>`;
    }).join('')}</ul>` : '';
}
// Al cambiar el título, los enlaces de otros apuntes que lo nombraban se actualizan
document.addEventListener('focusin', e => { if (e.target.id === 'pgTitle') S.titleBefore = curPage()?.title || ''; });
document.addEventListener('change', e => {
  if (e.target.id !== 'pgTitle') return;
  const from = String(S.titleBefore || '').trim(), to = String(curPage()?.title || '').trim();
  S.titleBefore = to;
  if (!from || !to || sameTitle(from, to) && from === to) return;
  let n = 0;
  for (const o of S.pages.values()) {
    if (o.id === S.pageId) continue;
    let changed = false;
    for (const b of o.blocks || []) { const t = renameLinks(b.text, from, to); if (t !== b.text) { b.text = t; changed = true; } }
    if (changed) { savePageSoon(o); n++; }
  }
  if (n) toast(`Enlaces actualizados en ${plural(n, 'apunte', 'apuntes')}`);
});
// Un bloque pasa a editarse: su texto se cambia por un cuadro de texto
export function editBlock(id, caret = null) {
  if (NO_TEXT.includes(curPage()?.blocks.find(x => x.id === id)?.type)) return;
  if (revealBlock(id)) return editBlock(id, caret);   // dentro de un apartado plegado: se despliega
  if (S.bsel) clearBlockSel();
  const open = document.querySelector('[data-block-input]');
  if (open) commitBlockEl(open);
  const openTbl = document.querySelector('[data-table-ed]');
  if (openTbl && openTbl.dataset.tableEd !== id) commitTable(openTbl.dataset.tableEd);
  if (curPage()?.blocks.find(x => x.id === id)?.type === 'table') return openTbl?.dataset.tableEd === id ? null : editTable(id, typeof caret === 'object' ? caret : null);
  return editBlockRaw(id, caret);
}
const WRITE_TIPS = ['Truco: «Término: definición» da una pregunta', 'Truco: lo que pongas en negrita sale como hueco para completar', 'Truco: «Las fases son:» con unas viñetas debajo da una pregunta', 'Truco: Tab en unas viñetas crea subpuntos (y una pregunta con ellos)', 'Truco: una pregunta con la respuesta debajo se convierte en pregunta'];
export function editBlockRaw(id, caret = null) {
  const b = curPage()?.blocks.find(x => x.id === id);
  const el = document.querySelector(`[data-block="${id}"] .nb-text`);
  if (!b || !el) return;
  // En un párrafo vacío, a veces, un truco para que de lo que se escribe salgan tarjetas
  const tip = WRITE_TIPS[[...b.id].reduce((n, ch) => n + ch.charCodeAt(0), 0) % (WRITE_TIPS.length * 2)];
  const ph = b.type === 'p' ? (tip && !b.text ? `Escribe algo · ${tip}` : BLOCK_PH + ' · / para más') : PH[b.type] || BLOCK_PH;
  // Texto: el editor con formato (enseña el Markdown donde está el cursor). Código y tablas como texto: un cuadro de texto
  if (el.classList.contains('md')) {
    el.removeAttribute('data-edit-block');
    el.dataset.blockInput = id;
    el.dataset.ph = ph;
    el.setAttribute('aria-label', b.type === 'img' ? 'Pie de foto' : 'Bloque');
    makeLive(el, b.text, caret == null ? null : typeof caret === 'object' ? caret.a : caret, typeof caret === 'object' && caret ? caret.b : undefined);
    histRecord();   // el paso de antes recuerda dónde estaba el cursor
    return;
  }
  el.outerHTML = `<textarea class="nb-input" data-block-input="${id}" rows="1" placeholder="${ph}" aria-label="${b.type === 'img' ? 'Pie de foto' : 'Bloque'}" ${b.type === 'code' ? 'spellcheck="false"' : ''}>${esc(b.text)}</textarea>`;
  const t = document.querySelector(`[data-block-input="${id}"]`);
  autoGrow(t); t.focus();
  const pos = caret == null ? t.value.length : typeof caret === 'object' ? caret.a ?? t.value.length : caret;
  t.setSelectionRange(pos, pos);
  histRecord();
}
// Guarda lo escrito en un bloque y lo vuelve a mostrar con formato
export function commitBlockEl(t) {
  const p = curPage(), b = p?.blocks.find(x => x.id === t.dataset.blockInput);
  if (!b) return;
  // Un párrafo que en realidad es una tabla en Markdown pasa a ser tabla
  if (b.type === 'p' && isTableText(t.value)) { b.type = 'table'; savePageSoon(p); }
  if (b.text !== t.value) { b.text = t.value; savePageSoon(p); }
  const wrap = t.closest('.nb');
  if (wrap) repaint(() => { wrap.outerHTML = blockHTML(b, pageCards(p.id).get(b.id)); });
  renumber();
  scheduleSugMarks(300);
}
function renumber() {
  const nums = olNumbers(curPage()?.blocks || []);
  document.querySelectorAll('#pgBlocks .nb-ol').forEach(el => { const x = el.querySelector('.nb-num'); if (x) x.textContent = (nums.get(el.dataset.block) || 1) + '.'; });
}
// Cambia el tipo de un bloque (atajo o menú /) y lo deja editando
export function retypeBlock(b, type, text = '', extra = {}) {
  const p = curPage(), i = p.blocks.indexOf(b);
  closeBlockMenu();
  if (type === 'img') { b.text = ''; savePageSoon(p); redrawBlocks(); return pickImage().then(f => f && addImageBlock(f, b.id)); }
  Object.assign(b, { type, text }, extra);
  if (type === 'table' && !text) b.text = tableToMarkdown(TBL_EMPTY());
  if (type === 'todo' && b.checked == null) b.checked = false;
  if (type === 'callout' && !b.icon) b.icon = '💡';
  savePageSoon(p);
  // Un separador no se escribe: se sigue en un párrafo debajo
  if (type === 'hr') {
    let next = p.blocks[i + 1];
    if (!next || NO_TEXT.includes(next.type)) { next = newBlock(); p.blocks.splice(i + 1, 0, next); }
    return redrawBlocks(next.id, 0);
  }
  redrawBlocks(b.id, type === 'table' ? { r: 'h', c: 0 } : b.text.length);
}
// Las tarjetas de un bloque que desaparece pasan al bloque donde se ha juntado
export function moveCards(fromBlock, toBlock) {
  for (const c of cardList()) if (c.page_id === S.pageId && c.block_id === fromBlock) {
    c.block_id = toBlock;
    api.updateCard(c.id, { block_id: toBlock }).catch(() => {});
  }
}
// Teclas dentro de un bloque: Enter parte, Retroceso al principio junta, flechas saltan de bloque
export function blockKey(e) {
  const t = e.target, p = curPage();
  const i = p.blocks.findIndex(x => x.id === t.dataset.blockInput);
  if (i < 0) return;
  const b = p.blocks[i], at = t.selectionStart, collapsed = at === t.selectionEnd;
  // Menú de bloques abierto (/): las flechas lo recorren, Enter elige, Esc lo cierra
  if (S.blockMenu?.blockId === b.id && !$('#blockMenu')?.hidden) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); return moveBlockMenu(e.key === 'ArrowDown' ? 1 : -1); }
    if (e.key === 'Enter' || e.key === 'Tab') { const it = blockMenuItems()[S.blockMenu.i]; if (it) { e.preventDefault(); return retypeBlock(b, it.type); } }
    if (e.key === 'Escape') { e.preventDefault(); return closeBlockMenu(); }
  }
  // Lista de apuntes para enlazar abierta ([[)
  if (wikiKey(e)) { e.preventDefault(); return; }
  const mod = e.ctrlKey || e.metaKey;
  // Alt+↑/↓ (o Ctrl+Mayús+↑/↓): mover el bloque
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && (e.altKey || (mod && e.shiftKey))) {
    e.preventDefault();
    b.text = t.value;
    const caret = { a: at, b: t.selectionEnd };
    if (moveSel([b.id], e.key === 'ArrowUp' ? -1 : 1)) redrawBlocks(b.id, caret);
    return;
  }
  // Ctrl+D: duplicar el bloque
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    b.text = t.value;
    const [copy] = duplicateBlocks([b.id]);
    if (copy) redrawBlocks(copy.id, { a: at, b: t.selectionEnd });
    return;
  }
  // Tab / Mayús+Tab: sangría (en listas, casillas y párrafos)
  if (e.key === 'Tab' && b.type !== 'code' && b.type !== 'table') {
    e.preventDefault();
    b.text = t.value;
    if (indentBlocks([b.id], e.shiftKey ? -1 : 1)) redrawBlocks(b.id, { a: at, b: t.selectionEnd });
    return;
  }
  // En el código, Enter es un salto de línea y Tab mete dos espacios; Enter en una línea vacía al final (o Ctrl+Enter) sale
  if (b.type === 'code') {
    if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); t.setRangeText('  ', at, t.selectionEnd, 'end'); autoGrow(t); return; }
    if (e.key === 'Enter' && !e.isComposing) {
      const out = e.ctrlKey || e.metaKey || (collapsed && at === t.value.length && t.value.endsWith('\n'));
      if (!out) return;
      e.preventDefault();
      b.text = t.value.replace(/\n$/, '');
      const next = newBlock();
      p.blocks.splice(i + 1, 0, next);
      savePageSoon(p);
      return redrawBlocks(next.id, 0);
    }
  }
  // En una tabla, Enter es una fila nueva; Enter en una línea vacía al final (o Ctrl+Enter) sale de ella
  if (b.type === 'table' && e.key === 'Enter' && !e.isComposing) {
    const lineStart = t.value.lastIndexOf('\n', at - 1) + 1;
    const emptyLast = collapsed && at === t.value.length && !t.value.slice(lineStart).trim();
    if (!emptyLast && !e.ctrlKey && !e.metaKey) {
      // Fila nueva con tantas celdas como la cabecera
      const cols = parseTable(t.value)?.head.length || 0;
      if (cols && collapsed && at === t.value.length) {
        e.preventDefault();
        t.value += `\n|${'  |'.repeat(cols)}`;
        t.setSelectionRange(t.value.length - cols * 3 + 1, t.value.length - cols * 3 + 1);
        autoGrow(t);
      }
      return;
    }
    e.preventDefault();
    b.text = t.value.replace(/\n\s*$/, '');
    const next = newBlock();
    p.blocks.splice(i + 1, 0, next);
    savePageSoon(p);
    return redrawBlocks(next.id, 0);
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    b.text = t.value;
    // Enter en un punto vacío: si tiene sangría, sube un nivel; si no, fin de la lista
    if (['li', 'ol', 'todo'].includes(b.type) && !b.text.trim()) {
      if (b.indent) indentBlocks([b.id], -1); else { b.type = 'p'; savePageSoon(p); }
      return redrawBlocks(b.id, 0);
    }
    // Al final de un título plegado: el bloque nuevo va detrás de todo su apartado
    if (b.collapsed && at === b.text.length && ['h1', 'h2', 'h3'].includes(b.type)) {
      const next = newBlock();
      p.blocks.splice(unitOf(p.blocks, i)[1] + 1, 0, next);
      savePageSoon(p);
      return redrawBlocks(next.id, 0);
    }
    const [cur, next] = splitBlock(b, at);
    p.blocks.splice(i, 1, cur, next);
    savePageSoon(p);
    return redrawBlocks(next.id, 0);
  }
  if (e.key === 'Backspace' && collapsed && at === 0) {
    if (b.type === 'img') return;   // el pie de una imagen no se junta con nada (la imagen se quita con su botón)
    // Detrás de una imagen: un párrafo vacío desaparece; si tiene texto, se queda como está
    if (i > 0 && p.blocks[i - 1].type === 'img') {
      if (t.value.trim()) return;
      e.preventDefault();
      p.blocks.splice(i, 1); moveCards(b.id, p.blocks[i - 1].id); savePageSoon(p);
      return redrawBlocks(p.blocks[i - 1].id);
    }
    // Detrás de un separador: Retroceso lo quita
    if (i > 0 && p.blocks[i - 1].type === 'hr') { e.preventDefault(); b.text = t.value; p.blocks.splice(i - 1, 1); savePageSoon(p); return redrawBlocks(b.id, 0); }
    if ((b.type === 'table' || b.type === 'code') && t.value.trim()) return;   // en una tabla o un código con contenido, no hace nada especial
    // Con sangría, primero se quita un nivel
    if (b.indent) { e.preventDefault(); b.text = t.value; indentBlocks([b.id], -1); return redrawBlocks(b.id, 0); }
    if (b.type !== 'p') { e.preventDefault(); b.text = t.value; b.type = 'p'; savePageSoon(p); return redrawBlocks(b.id, 0); }
    if (i > 0) {
      e.preventDefault();
      b.text = t.value;
      const { block, caret } = mergeBlocks(p.blocks[i - 1], b);
      p.blocks.splice(i - 1, 2, block);
      moveCards(b.id, block.id);
      savePageSoon(p);
      return redrawBlocks(block.id, caret);
    }
  }
  // Las flechas se saltan los separadores y lo plegado
  const hid = hiddenIds(p.blocks);
  const near = (dir) => { for (let j = i + dir; j >= 0 && j < p.blocks.length; j += dir) if (!NO_TEXT.includes(p.blocks[j].type) && !hid.has(p.blocks[j].id)) return p.blocks[j]; return null; };
  if (e.key === 'ArrowUp' && collapsed && at === 0 && near(-1)) { e.preventDefault(); return editBlock(near(-1).id); }
  if (e.key === 'ArrowDown' && collapsed && at === t.value.length && near(1)) { e.preventDefault(); return editBlock(near(1).id, 0); }
  // Ctrl+A con todo el bloque ya seleccionado (o vacío): se seleccionan todos los bloques
  if (mod && e.key.toLowerCase() === 'a' && at === 0 && t.selectionEnd === t.value.length) {
    e.preventDefault(); t.blur(); getSelection()?.removeAllRanges(); setBlockSel(visibleIds()); return;
  }
  // Esc: deja de escribir y el bloque queda seleccionado (para moverlo, borrarlo, convertirlo…)
  if (e.key === 'Escape') { e.preventDefault(); t.blur(); getSelection()?.removeAllRanges(); setBlockSel([b.id]); }
}
// Lo seleccionado en la página (para crear una tarjeta): { blockId, text, at }
function readPageSelection() {
  const a = document.activeElement;
  if (a?.matches?.('[data-block-input]')) {
    const x = a.selectionStart, y = a.selectionEnd;
    return y > x ? { blockId: a.dataset.blockInput, text: a.value.slice(x, y), at: x, end: y, live: !!a._live } : null;
  }
  const sel = getSelection(), txt = sel?.toString() || '';
  const node = sel?.anchorNode;
  const nb = node && (node.nodeType === 1 ? node : node.parentElement)?.closest?.('#pgBlocks .nb');
  if (!txt.trim() || !nb) return null;
  // En un bloque de texto sin editar, las posiciones en su Markdown (para darle formato)
  const md = nb.querySelector('.nb-text.md'), o = md && selOffsets(md);
  if (o && o.b > o.a) {
    const b = curPage()?.blocks.find(x => x.id === nb.dataset.block);
    if (b) return { blockId: b.id, text: b.text.slice(o.a, o.b), at: o.a, end: o.b };
  }
  return { blockId: nb.dataset.block, text: txt, at: -1 };
}
document.addEventListener('selectionchange', () => {
  if (S.view !== 'page') return;
  if (S.wiki && document.activeElement?._live) wikiCheck(document.activeElement);
  S.pageSel = readPageSelection();
  const bar = $('#selBar');
  if (!bar) return;
  bar.hidden = !S.pageSel;
  if (!S.pageSel) { closeColorMenu(); closeFmtMore(); return; }
  bar.classList.toggle('editing', !!document.activeElement?._live);
  // Los botones de formato, solo en texto (no en un código o una tabla escrita como texto)
  const b = curPage()?.blocks.find(x => x.id === S.pageSel.blockId);
  const canFmt = S.pageSel.end != null && b && !['code', 'table'].includes(b.type);
  bar.querySelector('.fmt-btns').hidden = !canFmt;
  bar.querySelector('.selbar-sep').hidden = !canFmt;
  if (canFmt) {
    const on = marksAt(b.id === document.activeElement?.dataset?.blockInput ? document.activeElement.value : b.text, S.pageSel.at, S.pageSel.end);
    document.querySelectorAll('#selBar [data-nfmt], #fmtMore [data-nfmt]').forEach(x => x.setAttribute('aria-pressed', String(!!on[x.dataset.nfmt])));
  }
  placeSelBar();
});
// La barra, encima de lo seleccionado (en el móvil, abajo, donde no la tapa el menú del sistema)
function placeSelBar() {
  const bar = $('#selBar'), sel = getSelection();
  if (!bar || bar.hidden) return;
  const r = sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
  const float = innerWidth >= 700 && r && (r.width || r.height);
  bar.classList.toggle('float', !!float);
  if (!float) { bar.style.left = bar.style.top = ''; placeOnKeyboard(); return; }
  const w = bar.offsetWidth, h = bar.offsetHeight;
  const left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const top = r.top - h - 10 > 56 ? r.top - h - 10 : r.bottom + 10;
  bar.style.left = `${left}px`; bar.style.top = `${top}px`;
  const menu = $('#fmtColors');
  if (menu && !menu.hidden) placeColorMenu();
}
addEventListener('scroll', () => { if (S.view === 'page') placeSelBar(); }, { passive: true });
// En el móvil, justo encima del teclado. Si el navegador no dice dónde está el teclado, se queda abajo fija
function placeOnKeyboard() {
  const bar = $('#selBar');
  if (!bar) return;
  let kb = 0;
  try { const v = window.visualViewport; if (v) kb = Math.max(0, Math.round(innerHeight - v.height - v.offsetTop)); } catch { kb = 0; }
  bar.classList.toggle('on-kb', kb > 40);
  document.documentElement.style.setProperty('--kb', `${kb > 40 ? kb : 0}px`);
}
try {
  const onVV = () => { if (S.view === 'page' && !$('#selBar')?.hidden) placeSelBar(); };
  window.visualViewport?.addEventListener('resize', onVV);
  window.visualViewport?.addEventListener('scroll', onVV);
} catch { /* sin visualViewport: la barra se queda abajo */ }
export function toggleFmtMore() {
  const m = $('#fmtMore');
  if (!m) return;
  m.hidden = !m.hidden;
  $('#selBar [data-act="fmt-more"]')?.setAttribute('aria-expanded', String(!m.hidden));
}
function closeFmtMore() { const m = $('#fmtMore'); if (m && !m.hidden) { m.hidden = true; $('#selBar [data-act="fmt-more"]')?.setAttribute('aria-expanded', 'false'); } }
export function toggleColorMenu() {
  const m = $('#fmtColors');
  if (!m) return;
  closeFmtMore();
  m.hidden = !m.hidden;
  $('#selBar [data-act="fmt-colors"]')?.setAttribute('aria-expanded', String(!m.hidden));
  if (!m.hidden) placeColorMenu();
}
function closeColorMenu() { const m = $('#fmtColors'); if (m && !m.hidden) { m.hidden = true; $('#selBar [data-act="fmt-colors"]')?.setAttribute('aria-expanded', 'false'); } }
function placeColorMenu() {
  const m = $('#fmtColors'), btn = $('#selBar [data-act="fmt-colors"]');
  if (!m || !btn) return;
  const r = btn.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left))}px`;
  m.style.top = `${r.bottom + 6 + h < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)}px`;
}
// Negrita, cursiva, color… a lo seleccionado. Se escribe en Markdown: si el bloque se está editando, se ven las marcas
export function formatSelection(kind, color = '') {
  const sel = S.pageSel || readPageSelection(), p = curPage();
  const ed = document.activeElement?._live ? document.activeElement : null;
  const id = ed?.dataset.blockInput || sel?.blockId;
  const b = p?.blocks.find(x => x.id === id);
  if (!b || ['code', 'table'].includes(b.type)) return;
  if (kind === 'color' || kind === 'bg') closeColorMenu();
  closeFmtMore();
  if (ed) {
    const r = toggleMark(ed.value, ed.selectionStart, ed.selectionEnd, kind, color);
    liveSet(ed, r.text, r.a, r.b);
    return;
  }
  if (!sel || sel.end == null) return;
  const r = toggleMark(b.text, sel.at, sel.end, kind, color);
  b.text = r.text;
  savePageSoon(p);
  // Se abre el bloque con lo formateado seleccionado: así se ven las marcas que se han puesto
  editBlock(b.id, { a: r.a, b: r.b });
}
// Atajos de teclado del formato (en un bloque que se está editando)
const FMT_KEYS = { b: 'b', i: 'i', u: 'u', e: 'code' };
document.addEventListener('keydown', e => {
  const t = e.target;
  if (!t?._live || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase();
  let kind = !e.shiftKey ? FMT_KEYS[k] : k === 's' || k === 'x' ? 's' : k === 'h' ? 'bg' : null;
  if (!kind) return;
  e.preventDefault();
  e.stopPropagation();
  S.pageSel = readPageSelection();
  formatSelection(kind, kind === 'bg' ? 'yellow' : '');
}, true);
// Lo escrito pasa al apunte en cuanto se escribe (para deshacer paso a paso y guardar sin salir del bloque)
export function syncBlock(t, kind = 'cmd') {
  const p = curPage(), b = p?.blocks.find(x => x.id === t.dataset.blockInput);
  if (!b || b.text === t.value) return;
  b.text = t.value;
  histRecord(kind);
  savePageSoon(p);
  scheduleSugMarks(900);
}
// Cambios del editor que no son «input» (formato, pegar, Mayús+Enter, deshacer del propio editor…)
document.addEventListener('live-change', e => { if (S.view === 'page' && e.target.dataset?.blockInput) { syncBlock(e.target); wikiCheck(e.target); } });
// Teclas de todo el apunte: deshacer/rehacer, buscar, y las de los bloques seleccionados
document.addEventListener('keydown', e => {
  if (S.view !== 'page' || !$('#sheet').hidden) return;
  const t = e.target, mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  const inPage = t === document.body || !!t.closest?.('#pgBlocks');
  // El título, el buscador y otros campos se quedan con sus teclas de siempre
  const field = !inPage && t.matches?.('input, textarea, select, [contenteditable]');
  if (mod && !e.altKey && (k === 'z' || k === 'y') && !field) { e.preventDefault(); e.stopPropagation(); return histTravel(k === 'y' || e.shiftKey ? 1 : -1); }
  if (mod && !e.altKey && !e.shiftKey && (k === 'f' || k === 'h')) { e.preventDefault(); e.stopPropagation(); return openFind(k === 'h'); }
  if (t.id === 'findQ' || t.id === 'findR') {
    if (e.key === 'Escape') { e.preventDefault(); closeFind(); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (t.id === 'findR') replaceFind(false); else gotoFind(e.shiftKey ? -1 : 1); }
    return;
  }
  if (e.key === 'Escape' && S.tocOpen) { S.tocOpen = false; updateToc(); return; }
  if (S.bsel && !field && !t.closest?.('#blkOps') && blockSelKey(e)) { e.preventDefault(); e.stopPropagation(); }
  if (e.key === 'Escape' && !$('#blkOps')?.hidden) closeOps();
}, true);
document.addEventListener('input', e => {
  if (e.target.id === 'findQ') { S.find.q = e.target.value; runFind(); }
  if (e.target.id === 'findR') S.find.r = e.target.value;
});
// Que pulsar la barra no quite la selección ni cierre el bloque que se está editando
const KEEP_SEL = '#selBar, .tbl-tools, #fmtColors, #fmtMore, .pg-hist, .nb-fold';
document.addEventListener('pointerdown', e => {
  if (e.target.closest?.(KEEP_SEL)) e.preventDefault();
  else { closeColorMenu(); closeFmtMore(); }
});
// (algunos navegadores mueven el foco en el mousedown aunque se cancele el pointerdown)
document.addEventListener('mousedown', e => { if (e.target.closest?.(KEEP_SEL)) e.preventDefault(); });
// Al salir de la cuadrícula (a otra parte de la página), la tabla se guarda y se ve con formato
document.addEventListener('focusout', e => {
  const ed = e.target.closest?.('[data-table-ed]');
  if (!ed || repainting) return;
  setTimeout(() => { if (ed.isConnected && !ed.contains(document.activeElement)) commitTable(ed.dataset.tableEd); }, 0);
});
document.addEventListener('focusin', e => { if (e.target.matches?.('.tc')) { S.tblFocus = { r: e.target.dataset.r, c: +e.target.dataset.c }; placeTblHandles(e.target.parentElement); autoGrow(e.target); const a = $('#tblAlign'); if (a) a.title = `Alinear la columna donde estás (ahora: ${{ '': 'izquierda', left: 'izquierda', center: 'centrada', right: 'derecha' }[tblAlign.get(e.target.closest('[data-table-ed]').dataset.tableEd)?.[S.tblFocus.c] || '']})`; } });
document.addEventListener('focusout', e => { if (!repainting && e.target.matches?.('[data-block-input]') && e.target.isConnected) commitBlockEl(e.target); });
document.addEventListener('paste', e => {
  const t = e.target;
  if (t.matches?.('.tc')) return tablePaste(e);
  // Una imagen pegada: en un campo del editor, dentro del campo; en unos apuntes, como bloque nuevo
  const img = imageFile(e.clipboardData);
  if (img && document.querySelector('.ef-occ') && !t.matches?.('.ef-input')) { e.preventDefault(); return occSetImage(img); }
  if (img && t.matches?.('.ef-input')) { e.preventDefault(); return imageIntoField(t, img); }
  const ed = t.closest?.('[data-block-input]');
  if (img && S.view === 'page' && !t.closest?.('.sheet')) { e.preventDefault(); return addImageBlock(img, ed?.dataset.blockInput); }
  if (!ed) return;
  const text = (e.clipboardData?.getData('text/plain') || '').replace(/\r\n?/g, '\n');
  const p = curPage(), i = p.blocks.findIndex(x => x.id === ed.dataset.blockInput), b = p.blocks[i];
  if (!b || b.type === 'code' || b.type === 'table') return;   // en un código o una tabla como texto, tal cual
  // Con formato (Word, Google Docs, una web…): bloques con su negrita, colores, listas, tablas…
  const html = e.clipboardData?.getData('text/html') || '';
  let blocks = html ? htmlToBlocks(html) : null;
  if (!blocks) {
    if (!text.includes('\n')) {
      if (!ed._live) return;
      e.preventDefault();
      ed.setRangeText(text, ed.selectionStart, ed.selectionEnd, 'end');
      return;
    }
    // Varias líneas pegadas: se convierten en bloques (títulos, listas y párrafos)
    blocks = textToBlocks(text);
  }
  if (!blocks.length) return;
  e.preventDefault();
  // Imágenes copiadas de los propios apuntes: vuelven a ser bloques de imagen
  blocks = blocks.map(x => { const m = x.type === 'p' && /^!\[([^\]\n]*)\]\(img:([\w-]{4,64})\)$/.exec(x.text.trim()); return m ? imageBlock(m[2], m[1]) : x; })
    .filter(x => x.type !== 'img' || x.src);   // imágenes incrustadas en lo pegado: así no se pueden traer
  // Un solo párrafo: dentro del bloque, donde está el cursor
  if (blocks.length === 1 && blocks[0].type === 'p') {
    // Con los espacios de los bordes de lo copiado («palabra » + lo que sigue)
    const lead = /^[ \t]*/.exec(text)[0], trail = /[ \t]*$/.exec(text)[0];
    ed.setRangeText(lead + blocks[0].text + trail, ed.selectionStart, ed.selectionEnd, 'end');
    return;
  }
  // Varios bloques: lo de antes del cursor se queda en este bloque, lo pegado detrás y lo de después al final
  const before = ed.value.slice(0, ed.selectionStart), after = ed.value.slice(ed.selectionEnd);
  let insert = blocks;
  if (!before.trim() && b.type === 'p') { const { id, ...first } = blocks[0]; Object.assign(b, first); insert = blocks.slice(1); }
  else b.text = before;
  let last = insert.length ? insert[insert.length - 1] : b;
  if (['hr', 'table', 'code', 'img'].includes(last.type)) { last = newBlock(); insert.push(last); }
  p.blocks.splice(i + 1, 0, ...insert);
  const caret = last.text.length;
  last.text += after;
  savePageSoon(p);
  redrawBlocks(last.id, caret);
});
/* ---------- Menú de bloques (/ o «+ Bloque») ---------- */
const GLYPH = { p: 'Aa', h1: 'H1', h2: 'H2', h3: 'H3', li: '•', ol: '1.', todo: '☐', quote: '❝', callout: '💡', code: '{ }', table: '▦', hr: '—' };
export const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function blockMenuItems() {
  const q = fold(S.blockMenu?.q);
  return BLOCK_MENU.filter(it => !q || fold(it.label + ' ' + it.keys).includes(q));
}
// mode: 'slash' (cambia el bloque donde se escribe «/») · 'append' (añade uno al final)
export function openBlockMenu({ mode, blockId = null, q = '', anchor }) {
  const same = S.blockMenu && S.blockMenu.mode === mode && S.blockMenu.blockId === blockId;
  S.blockMenu = { mode, blockId, q, i: same && S.blockMenu.q === q ? S.blockMenu.i : 0 };
  let el = $('#blockMenu');
  if (!el) { el = document.createElement('div'); el.id = 'blockMenu'; el.className = 'blk-menu'; el.setAttribute('role', 'listbox'); el.setAttribute('aria-label', 'Tipos de bloque'); document.body.appendChild(el); }
  const items = blockMenuItems();
  if (!items.length) { el.hidden = true; return; }
  S.blockMenu.i = Math.min(S.blockMenu.i, items.length - 1);
  el.innerHTML = items.map((it, k) => `<button type="button" class="blk-item" role="option" aria-selected="${k === S.blockMenu.i}" data-block-type="${it.type}">
    <span class="blk-glyph" aria-hidden="true">${it.type === 'img' ? icon('image', { size: 16 }) : esc(GLYPH[it.type])}</span>
    <span class="blk-txt"><b>${esc(it.label)}</b><small>${esc(it.hint)}</small></span>${it.md ? `<kbd>${esc(it.md)}</kbd>` : ''}</button>`).join('');
  el.hidden = false;
  // Debajo de donde se escribe; si no cabe, encima
  const r = anchor.getBoundingClientRect(), h = Math.min(el.scrollHeight, 340), w = Math.min(300, innerWidth - 16);
  el.style.width = w + 'px';
  el.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  el.style.top = (r.bottom + 6 + h < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + 'px';
  el.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}
function moveBlockMenu(d) {
  const n = blockMenuItems().length;
  if (!n) return;
  S.blockMenu.i = (S.blockMenu.i + d + n) % n;
  document.querySelectorAll('#blockMenu .blk-item').forEach((b, k) => b.setAttribute('aria-selected', String(k === S.blockMenu.i)));
  $('#blockMenu [aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}
export function closeBlockMenu() { S.blockMenu = null; const el = $('#blockMenu'); if (el) el.hidden = true; }
// Elegir un tipo en el menú
export function chooseBlockType(type) {
  const p = curPage(), m = S.blockMenu;
  if (!p || !m) return;
  if (m.mode === 'slash') { const b = p.blocks.find(x => x.id === m.blockId); if (b) retypeBlock(b, type); return; }
  // Al final: se aprovecha el último bloque si es un párrafo vacío
  const open = document.querySelector('[data-block-input]');
  if (open) commitBlockEl(open);
  let b = p.blocks[p.blocks.length - 1];
  if (!b || b.type !== 'p' || b.text.trim()) { b = newBlock(); p.blocks.push(b); }
  retypeBlock(b, type);
}
document.addEventListener('pointerdown', e => {
  if (e.target.closest?.('#blockMenu')) { e.preventDefault(); return; }
  if (S.blockMenu && !e.target.closest?.('[data-act="block-menu"]')) closeBlockMenu();
});
document.addEventListener('focusout', e => { if (S.blockMenu?.mode === 'slash' && e.target.matches?.('[data-block-input]')) setTimeout(() => { if (!document.activeElement?.matches?.('[data-block-input]')) closeBlockMenu(); }, 0); });

// Añade una imagen a los apuntes: detrás del bloque indicado (o al final; si el último está vacío, en su lugar)
export async function addImageBlock(file, afterId = null) {
  const p = curPage();
  if (!p) return;
  const open = document.querySelector('[data-block-input]');
  if (open) commitBlockEl(open);
  const id = await saveImage(file);
  if (!id || curPage() !== p) return;
  const blk = imageBlock(id);
  const i = afterId ? p.blocks.findIndex(x => x.id === afterId) : -1;
  const last = p.blocks[p.blocks.length - 1];
  if (i >= 0) {
    const b = p.blocks[i];
    if (!b.text.trim() && b.type === 'p') p.blocks.splice(i, 1, blk); else p.blocks.splice(i + 1, 0, blk);
  } else if (last && !last.text.trim() && last.type === 'p') p.blocks.splice(p.blocks.length - 1, 1, blk);
  else p.blocks.push(blk);
  // Siempre queda un párrafo detrás para seguir escribiendo
  const j = p.blocks.indexOf(blk);
  if (j === p.blocks.length - 1) p.blocks.push(newBlock());
  savePageSoon(p);
  redrawBlocks();
}
export function removeImageBlock(id) {
  const p = curPage(), i = p?.blocks.findIndex(x => x.id === id);
  if (!p || i < 0) return;
  const b = p.blocks[i];
  const next = p.blocks[i + 1] || p.blocks[i - 1];
  if (next) moveCards(id, next.id);
  p.blocks.splice(i, 1);
  if (!p.blocks.length) p.blocks.push(newBlock());
  savePageSoon(p);
  redrawBlocks();
  toast(`${b.type === 'hr' ? 'Separador quitado' : 'Imagen quitada'}`);
}
// Arrastrar una imagen a los apuntes
document.addEventListener('dragover', e => { if (S.view === 'page' && [...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
document.addEventListener('drop', e => {
  if (S.view !== 'page') return;
  const f = imageFile(e.dataTransfer);
  if (!f) return;
  e.preventDefault();
  addImageBlock(f, e.target.closest?.('[data-block]')?.dataset.block || null);
});
export function newPage({ title = '', blocks = null, folder } = {}) {
  if (S.pagesMissing) return toast('Primero ejecuta supabase/schema.sql en Supabase (lo explica la pantalla de Apuntes)');
  const deckId = S.view === 'deck' ? S.deckId : null;
  // Se crea en la carpeta que estás viendo (en la Biblioteca o en una lista)
  const folderId = folder !== undefined ? folder : S.view === 'decks' ? S.folderId : S.view === 'deck' ? S.decks.get(S.deckId)?.folder_id || null : null;
  const p = { id: api.newId(), owner: S.uid, title, icon: '', deck_id: deckId, folder_id: folderId, tags: [], blocks: blocks?.length ? blocks : [newBlock()] };
  S.pages.set(p.id, p);
  savePageSoon(p, 0);
  go('page', { pageId: p.id });
  if (title || blocks?.length) return;
  setTimeout(() => $('#pgTitle')?.focus(), 30);
}
// Un PDF → un apunte: títulos, párrafos y listas; las páginas escaneadas, como imágenes
export async function importPdf(file) {
  const target = curPage();
  if (!target) return;
  openSheet(`<h2>Importar PDF</h2><p class="muted" role="status" id="pdfStatus">Abriendo «${esc(file.name)}»…</p>`);
  const status = t => { const el = $('#pdfStatus'); if (el) el.textContent = t; };
  try {
    const r = await readPdf(new Uint8Array(await file.arrayBuffer()), { onPage: (i, n) => status(`Leyendo la página ${i} de ${n}…`) });
    const { blocks: raw, title } = pdfToBlocks(r.pages, { newBlock });
    const scanned = raw.filter(b => b.type === 'img').length;
    for (const b of raw) {
      if (b.type !== 'img') continue;
      const blob = r.pages[b.image]?.image;
      delete b.image;
      if (blob) { const id = newImageId(); await storeImage(id, blob, blob.type || 'image/jpeg'); b.src = id; }
    }
    const blocks = raw.filter(b => b.type !== 'img' || b.src);
    if (!blocks.length) throw new Error('No se ha encontrado nada que convertir en este PDF.');
    flushUploads();
    const open = document.querySelector('[data-block-input]');
    if (open) commitBlockEl(open);
    const empty = !target.blocks.some(b => b.text.trim() || b.type === 'img' || b.type === 'hr');
    if (empty) target.blocks = blocks;
    // Añadido a un apunte que ya tiene contenido: el título del PDF encabeza lo añadido
    else target.blocks.push(...((title || r.title) ? [newBlock('h1', title || r.title)] : []), ...blocks);
    if (!String(target.title || '').trim()) target.title = title || r.title || file.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
    savePageSoon(target, 0);
    closeSheet();
    if (S.view === 'page' && S.pageId === target.id) {
      renderPage();
      if (!empty) document.querySelector(`[data-block="${blocks[0].id}"]`)?.scrollIntoView({ block: 'start' });
      if (suggestFor(target, target.deck_id || '').length) openSuggestions();
    }
    toast(scanned === r.pages.length ? 'El PDF está escaneado: sus páginas se han guardado como imágenes'
      : `${empty ? 'Apunte creado' : 'Añadido al apunte'} a partir de ${plural(r.pages.length, 'página', 'páginas')}${r.truncated ? ` (de ${r.total}: solo se importan las ${r.pages.length} primeras)` : ''}`);
  } catch (e) {
    console.error(e);
    const msg = e?.name === 'PasswordException' ? 'El PDF está protegido con contraseña. Quítasela y vuelve a intentarlo.'
      : e?.name === 'InvalidPDFException' ? 'El archivo no es un PDF válido.' : e?.message || 'No se ha podido leer el PDF.';
    openSheet(`<h2>No se ha podido importar</h2><p>${esc(msg)}</p><div class="btnrow"><span class="spacer"></span><button class="primary" data-act="close-sheet">Cerrar</button></div>`);
  }
}
/* ---------- Exportar e importar apuntes en otros formatos ---------- */
const bytesOf = async blob => new Uint8Array(await blob.arrayBuffer());
function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const EXT_OF = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif', 'image/bmp': 'bmp' };
// Una imagen para meterla en otro formato. Word solo entiende PNG y JPEG: las demás se convierten
async function exportImage(id, { wordSafe = false } = {}) {
  let blob = await imageBlob(id);
  if (!blob) return null;
  let w = 0, h = 0;
  try {
    const bmp = await createImageBitmap(blob);
    w = bmp.width; h = bmp.height;
    if (wordSafe && !['image/png', 'image/jpeg'].includes(blob.type)) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(bmp, 0, 0);
      blob = await new Promise(ok => c.toBlob(ok, 'image/png')) || blob;
    }
    bmp.close?.();
  } catch { if (wordSafe && !['image/png', 'image/jpeg'].includes(blob.type)) return null; }
  return { blob, bytes: await bytesOf(blob), ext: EXT_OF[blob.type] || 'png', w, h };
}
const toDataUrl = blob => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ok(null); r.readAsDataURL(blob); });
export function exportSheet() {
  const p = curPage();
  const opt = (fmt, ic, title, sub) => `<li><button class="row-link" data-export="${fmt}">${icon(ic, { size: 20 })}<span><b>${title}</b><small>${sub}</small></span></button></li>`;
  const imgs = pageImageIds(p).length;
  openSheet(`<h2>Exportar «${esc(pageTitle(p))}»</h2>
    <ul class="list linklist">
      ${opt('docx', 'file-text', 'Word (.docx)', 'Con títulos, viñetas, tablas, colores e imágenes. Se abre en Word, Google Docs o Pages')}
      ${opt('pdf', 'download', 'PDF', 'Se abre la ventana de imprimir: elige «Guardar como PDF»')}
      ${opt('md', 'code', `Markdown${imgs ? ' (.zip con las imágenes)' : ' (.md)'}`, 'Para abrirlo en otras aplicaciones de notas. Conserva el formato y los enlaces [[ ]]')}
      ${opt('html', 'link', 'Página web (.html)', 'Un solo archivo con todo dentro, para verlo en cualquier navegador')}
    </ul>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button></div>`);
}
export async function exportPage(fmt) {
  const p = curPage();
  if (!p) return;
  const open = document.querySelector('[data-block-input]');
  if (open) commitBlockEl(open);
  const name = safeName(pageTitle(p)), ids = pageImageIds(p);
  closeSheet();
  toast('Preparando…');
  try {
    if (fmt === 'md') {
      if (!ids.length) return download(pageToMarkdown(p), `${name}.md`, 'text/markdown;charset=utf-8');
      const names = new Map(), files = [];
      for (const id of ids) { const im = await exportImage(id); if (im) { names.set(id, `${id}.${im.ext}`); files.push({ name: `imagenes/${id}.${im.ext}`, data: im.bytes }); } }
      files.unshift({ name: `${name}.md`, data: markdownWithImages(p, names) });
      return downloadBlob(new Blob([writeZip(files)], { type: 'application/zip' }), `${name}.zip`);
    }
    if (fmt === 'docx') {
      const images = new Map();
      for (const id of ids) { const im = await exportImage(id, { wordSafe: true }); if (im) images.set(id, im); }
      return downloadBlob(new Blob([pageToDocx(p, images)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), `${name}.docx`);
    }
    // HTML y PDF: un solo archivo con las imágenes dentro
    const urls = new Map();
    for (const id of ids) { const b = await imageBlob(id); const u = b && await toDataUrl(b); if (u) urls.set(id, u); }
    if (fmt === 'html') return download(pageToHTML(p, urls), `${name}.html`, 'text/html;charset=utf-8');
    // PDF: la página en un marco invisible, y la ventana de imprimir del navegador
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(frame);
    frame.srcdoc = pageToHTML(p, urls);
    frame.onload = () => {
      setTimeout(() => {
        try { frame.contentWindow.focus(); frame.contentWindow.print(); }
        catch { download(pageToHTML(p, urls, { print: true }), `${name}.html`, 'text/html;charset=utf-8'); toast('Abre el archivo y elige «Imprimir» → «Guardar como PDF»'); }
        setTimeout(() => frame.remove(), 60000);
      }, 250);
    };
  } catch (e) { console.error(e); toast('No se ha podido exportar'); }
}
// Todos los apuntes, en Markdown y por carpetas, con sus imágenes (para una copia o para llevarlos a Obsidian)
export async function exportAllNotes() {
  const pages = [...S.pages.values()];
  if (!pages.length) return toast('No tienes apuntes todavía');
  toast('Preparando…');
  const files = [], used = new Set(), names = new Map();
  for (const id of new Set(pages.flatMap(pageImageIds))) { const im = await exportImage(id); if (im) { names.set(id, `${id}.${im.ext}`); files.push({ name: `imagenes/${id}.${im.ext}`, data: im.bytes }); } }
  for (const p of pages) {
    const dirs = pageFolder(p) ? folderPath(S.folders, p.folder_id).map(f => safeName(f.name)) : [];
    let path = [...dirs, safeName(pageTitle(p))].join('/'), k = 2;
    while (used.has(path.toLowerCase())) path = `${[...dirs, safeName(pageTitle(p))].join('/')} (${k++})`;
    used.add(path.toLowerCase());
    files.push({ name: `${path}.md`, data: markdownWithImages(p, names, `${'../'.repeat(dirs.length)}imagenes`) });
  }
  downloadBlob(new Blob([writeZip(files)], { type: 'application/zip' }), `Apuntes de Flaski ${new Date().toISOString().slice(0, 10)}.zip`);
}
// Las imágenes que vienen dentro de lo importado (data: o archivos) se guardan como las demás
async function storeImages(blocks) {
  for (const b of blocks) {
    if (b.type !== 'img' || b.src) continue;
    try {
      const blob = b.blob || (b.dataUrl ? await (await fetch(b.dataUrl)).blob() : null);
      if (blob) { const id = newImageId(); await storeImage(id, blob, blob.type || 'image/png'); b.src = id; }
    } catch { /* se queda sin imagen */ }
    delete b.dataUrl; delete b.blob;
  }
  return blocks.filter(b => b.type !== 'img' || b.src);
}
const EXT = name => String(name).split('.').pop().toLowerCase();
// Un archivo → [{ title, blocks }] (un .zip puede traer varios apuntes)
async function fileToPages(file) {
  const ext = EXT(file.name), title = titleFromFile(file.name);
  if (ext === 'docx') {
    const html = await docxToHTML(await bytesOf(file));
    const blocks = htmlToBlocks(html) || [];
    const t = blocks[0]?.type === 'h1' ? blocks.shift().text.replace(/[*_]/g, '') : title;
    return [{ title: t, blocks: await storeImages(blocks) }];
  }
  if (ext === 'html' || ext === 'htm') {
    const html = await file.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const blocks = htmlToBlocks(doc.body?.innerHTML || '') || [];
    const t = doc.title?.trim() || (blocks[0]?.type === 'h1' ? blocks.shift().text : title);
    if (doc.title?.trim() && blocks[0]?.type === 'h1' && sameTitle(blocks[0].text, doc.title)) blocks.shift();
    return [{ title: t, blocks: await storeImages(blocks) }];
  }
  if (ext === 'csv' || ext === 'tsv') return [{ title, blocks: csvToBlocks(await file.text()) }];
  if (/^image\//.test(file.type)) { const id = await saveImage(file); return id ? [{ title, blocks: [imageBlock(id)] }] : []; }
  if (ext === 'zip') {
    const zip = readZip(await bytesOf(file));
    const out = [], stored = new Map();
    const names = [...zip.keys()];
    for (const path of names.filter(n => /\.(md|markdown|txt)$/i.test(n) && !/(^|\/)(__MACOSX|\.)/.test(n))) {
      let md = new TextDecoder().decode(await zip.get(path).read());
      // Imágenes citadas con su ruta dentro del .zip (relativa al apunte) o por su nombre (![[foto.png]] de Obsidian)
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
      for (const ref of markdownImageRefs(md)) {
        let p = decodeURIComponent(ref.path);
        let full = ref.wiki ? names.find(n => n.split('/').pop() === p.split('/').pop()) : (dir + p).split('/').reduce((a, seg) => (seg === '..' ? a.slice(0, -1) : seg === '.' ? a : [...a, seg]), []).join('/');
        if (!full || !zip.has(full) || !imageType(full)) continue;
        if (!stored.has(full)) { const id = newImageId(); await storeImage(id, await zip.get(full).read(), imageType(full)); stored.set(full, id); }
        md = md.split(ref.full).join(`![${ref.alt}](img:${stored.get(full)})`);
      }
      out.push(markdownToPage(md, path));
    }
    if (!out.length) throw new Error(`«${file.name}» no tiene apuntes en Markdown dentro.`);
    return out;
  }
  if (['md', 'markdown', 'txt'].includes(ext) || file.type.startsWith('text/')) return [markdownToPage(await file.text(), file.name)];
  throw new Error(`No sé abrir «${file.name}». Prueba con PDF, Word, Markdown, HTML o CSV.`);
}
// Importar: en el apunte abierto (se añade al final, o lo llena si está vacío) o como apuntes nuevos (uno por archivo)
async function importNoteFiles(files, into) {
  files = [...files];
  if (!files.length) return;
  // Los PDF van por su camino (con su progreso y las sugerencias de tarjetas)
  if (files.length === 1 && EXT(files[0].name) === 'pdf') {
    if (!into) newPage({ title: titleFromFile(files[0].name) });
    return importPdf(files[0]);
  }
  openSheet(`<h2>Importar</h2><p class="muted" role="status" id="impStatus">Leyendo…</p>`);
  const status = t => { const el = $('#impStatus'); if (el) el.textContent = t; };
  const made = [], errors = [];
  for (const [k, f] of files.entries()) {
    status(`Leyendo «${f.name}»${files.length > 1 ? ` (${k + 1} de ${files.length})` : ''}…`);
    try {
      if (EXT(f.name) === 'pdf') { errors.push(`«${f.name}»: los PDF, de uno en uno`); continue; }
      made.push(...await fileToPages(f));
    } catch (e) { console.error(e); errors.push(e.message || `No se ha podido leer «${f.name}»`); }
  }
  flushUploads();
  const good = made.filter(x => x.blocks.length);
  if (!good.length) {
    return openSheet(`<h2>No se ha podido importar</h2><p>${esc(errors[0] || 'No se ha encontrado nada que importar.')}</p><div class="btnrow"><span class="spacer"></span><button class="primary" data-act="close-sheet">Cerrar</button></div>`);
  }
  closeSheet();
  if (into && curPage()) {
    const p = curPage(), open = document.querySelector('[data-block-input]');
    if (open) commitBlockEl(open);
    const empty = !p.blocks.some(b => b.text.trim() || b.type === 'img' || b.type === 'hr');
    const add = good.flatMap((x, i) => [...(empty && i === 0 ? [] : x.title ? [newBlock('h1', x.title)] : []), ...x.blocks]);
    if (empty) p.blocks = add; else p.blocks.push(...add);
    if (!String(p.title || '').trim() && good[0].title) p.title = good[0].title;
    savePageSoon(p, 0);
    renderPage();
    toast(`Importado${errors.length ? ` (${errors.length} con problemas)` : ''}`);
  } else {
    const folder = S.view === 'decks' ? S.folderId : S.view === 'page' ? pageFolder(curPage()) : null;
    const pages = good.map(x => { const p = { id: api.newId(), owner: S.uid, title: x.title || '', icon: '', deck_id: null, folder_id: folder || null, tags: [], blocks: x.blocks }; S.pages.set(p.id, p); savePageSoon(p, 0); return p; });
    if (pages.length === 1) go('page', { pageId: pages[0].id });
    else go('decks', { folderId: folder || null });
    toast(`${plural(pages.length, 'apunte importado', 'apuntes importados')}${errors.length ? ` · ${errors.length} con problemas` : ''}`);
  }
  if (errors.length) console.warn(errors);
}
let importInto = false;
export const setImportInto = v => { importInto = v; };
$('#noteFile').addEventListener('change', e => { const f = e.target.files; if (f?.length) importNoteFiles(f, importInto); e.target.value = ''; });
// Crear una tarjeta (o un hueco) con lo seleccionado en los apuntes, ya vinculada a su bloque
export function cardFromSelection(kind) {
  const sel = S.pageSel, p = curPage();
  if (!sel || !p) return;
  const open = document.querySelector('[data-block-input]');
  if (open) commitBlockEl(open);
  const b = p.blocks.find(x => x.id === sel.blockId);
  if (!b) return;
  const deckId = p.deck_id && S.decks.has(p.deck_id) ? p.deck_id : [...S.decks.values()].find(d => !d.archived)?.id;
  const text = sel.text.trim();
  let prefill = null;
  if (kind === 'cloze') {
    const x = clozeFrom(b.text, text, sel.at);
    if (x) prefill = { typeId: 'cloze', fields: { x } };
    else toast('No se ha podido marcar el hueco aquí: complétalo a mano');
  }
  if (!prefill) prefill = deckLang(deckId) ? { typeId: 'vocab', fields: { w: text } } : { typeId: 'basic', fields: { a: text } };
  getSelection()?.removeAllRanges();
  S.pageSel = null;
  cardForm(null, { deckId, prefill, source: { page_id: p.id, block_id: b.id } });
}
export function blockCardsSheet(blockId) {
  const list = cardList().filter(c => c.page_id === S.pageId && c.block_id === blockId);
  openSheet(`<h2>Preguntas de esta parte</h2>
    <ul class="list">${list.map(c => `<li><button class="row" data-card="${c.id}"><span class="f">${fmt(c.front)}</span>${statusChip(c.id)}<span class="b">${fmt(c.back)}</span></button></li>`).join('')}</ul>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button></div>`);
}
