// Flaski · hojas: formularios de mazo y carpeta, editor de tarjetas y de tipos (sale de app.js)
import * as api from '../api.js';
import { ALGO_PRESETS } from '../srs.js';
import { icon } from '../icons.js';
import { BUILTIN_TYPES, MODES, LANGS, RUBY_RE, NEEDS_ANSWER, activeTemplates, summarize, missingFor, splitQuick, detectSep, choiceOptions, typeFit, typeScope, LANG_ROLES, baseLang, parseMasks, masksToText, imageIdIn, MAX_MASKS } from '../cardtypes.js';
import { ttsAvailable } from '../tts.js';
import { COLORS, colorVar, FOLDER_COLORS, folderColorId, TAG_COLORS, tagColor, folderPath, folderTree, sortDecks, DRAWINGS, drawingOf, drawingSVG, imageOf, iconText } from '../org.js';
import { addImage, imgToken, imageIdsOf, deleteImage } from '../media.js';
import { pageTitle } from '../pages.js';
import { $, main, S, esc, fmt, plain, norm, cardList, toast, fail, tagSticker, deckIcon, folderIcon, folderArt, shareUrl, algo, counts } from '../comun.js';
import { typeIcon, getType, deckLang, typeIn, langLabel, cardModel, SPEAK_ICON, faceHTML, occlusionHTML, clozeChoices } from './estudio.js';
import { plural, renderDeck } from './mazos.js';
import { savePageSoon } from './apuntes.js';
import { drawSuggestions } from './sugerencias.js';
import { seg, tabs } from './perfil.js';
import { go, render } from '../app.js';

/* ===================== hojas (editores) ===================== */
// side: panel a la derecha (escritorio) u hoja baja (móvil) que deja ver y tocar el apunte de detrás
export function openSheet(html, { full = false, side = false } = {}) {
  $('#sheetBody').innerHTML = html;
  $('#sheet').classList.toggle('sheet-full', full && !side);
  $('#sheet').classList.toggle('sheet-side', side);
  document.documentElement.classList.toggle('side-open', side);
  // Una hoja completa (editar una pregunta) durante la tanda va con los colores de siempre, no los de la tanda
  if (full && document.body.classList.contains('in-study')) document.body.classList.replace('in-study', 'study-sheet');
  $('#sheet').hidden = false;
  const f = $('#sheetBody').querySelector('input,textarea');
  if (f && matchMedia('(hover:hover)').matches) setTimeout(() => f.focus(), 30);
}
export function closeSheet() {
  const backToSug = S.edit?.open && S.edit.sugIndex != null && S.sug;
  closeSheetOnly();
  if (backToSug) { S.edit = null; drawSuggestions(); }
}
function closeSheetOnly() {
  $('#sheet').hidden = true; $('#sheetBody').innerHTML = ''; $('#sheet').classList.remove('sheet-full', 'sheet-side');
  document.documentElement.classList.remove('side-open');
  if (document.body.classList.contains('study-sheet')) document.body.classList.replace('study-sheet', 'in-study');
  document.querySelectorAll('.nb.is-src').forEach(el => el.classList.remove('is-src'));
  if (S.edit) S.edit.open = false;
  if (S.folderPick) { const fp = S.folderPick; S.folderPick = null; dropFolderImages(fp); }
}
// Al cerrar el formulario de una carpeta: se borran la imagen que tenía y las que se subieron para probar,
// si ya no las usa nada (otra carpeta, una pregunta o un apunte)
function dropFolderImages({ orig, picked }) {
  const used = imageIdsOf({ cards: cardList(), pages: [...S.pages.values()], folders: [...S.folders.values()] });
  for (const id of new Set([orig, ...picked])) if (id && !used.has(id)) deleteImage(id);
}
// Cerrar pidiendo confirmación si hay cambios sin guardar en el editor de tarjetas
export function requestClose() {
  if (S.edit?.open && S.edit.dirty && $('.ed')) {
    const bar = $('#edDiscard');
    if (bar) { bar.hidden = false; bar.querySelector('button')?.focus(); return; }
  }
  closeSheet();
}
const CHARS = ['ç', 'ğ', 'ı', 'İ', 'ö', 'ş', 'ü', 'ñ', 'á', 'é'];
// Letras especiales según el idioma del campo (en japonés, chino, coreano… se usa el teclado del sistema)
const CHARS_BY_LANG = {
  tr: ['ç', 'ğ', 'ı', 'İ', 'ö', 'ş', 'ü', 'â'], es: ['ñ', 'á', 'é', 'í', 'ó', 'ú', 'ü', '¿', '¡'],
  fr: ['é', 'è', 'ê', 'à', 'ç', 'ô', 'û', 'î', 'ë', 'œ'], de: ['ä', 'ö', 'ü', 'ß'], pt: ['ã', 'õ', 'ç', 'á', 'é', 'ê', 'ó', 'ô', 'à'],
  it: ['à', 'è', 'é', 'ì', 'ò', 'ù'], ca: ['à', 'è', 'é', 'í', 'ï', 'ò', 'ó', 'ú', 'ü', 'ç', 'l·l'], nl: ['ë', 'ï', 'é', 'ü'], gl: ['ñ', 'á', 'é', 'í', 'ó', 'ú'], eu: ['ñ'],
};
export function charsFor(lang) {
  if (!lang) return CHARS;
  return CHARS_BY_LANG[lang.split('-')[0]] || [];
}

// El icono elegido: un emoji o, en las carpetas, uno de los dibujos de Flaski o una imagen propia
const iconShown = e => folderArt(e, 'draw-ic', drawingOf(e)?.label || (imageOf(e) ? 'Tu imagen' : '')) || (e ? esc(e) : `<span class="muted">${icon('smile-plus', { size: 22 })}</span>`);
// En las carpetas, tres maneras: Emoji (por defecto) · Dibujos de Flaski · Tu imagen
const ICON_TABS = [['emoji', 'Emoji'], ['draw', 'Dibujos de Flaski'], ['img', 'Tu imagen']];
const iconTab = e => (drawingOf(e) ? 'draw' : imageOf(e) ? 'img' : 'emoji');
export function iconPicker(current, { drawings = false } = {}) {
  const tab = iconTab(current);
  return `<input type="hidden" id="f-icon" value="${esc(current || '')}">
    ${drawings ? `<div class="seg icon-tabs" role="group" aria-label="Tipo de icono">${ICON_TABS.map(([id, l]) => `<button type="button" class="seg-b" data-icon-tab="${id}" aria-pressed="${id === tab}">${l}</button>`).join('')}</div>` : ''}
    <div class="iconfield"${drawings ? ` data-tab="${tab}"` : ''}>
      <button type="button" class="icon-current" data-act="toggle-emoji" aria-expanded="false" aria-label="Elegir icono">${iconShown(current)}</button>
      <div class="iconfield-txt"><button type="button" class="link" data-act="toggle-emoji">${current ? 'Cambiar icono' : 'Elegir un emoji'}</button>
        ${current ? '<button type="button" class="link" data-act="clear-icon">Quitar</button>' : ''}</div>
    </div>
    ${drawings ? `<div class="draw-pick" role="group" aria-label="Dibujos de Flaski" data-icon-pane="draw" ${tab === 'draw' ? '' : 'hidden'}>${DRAWINGS.map(d => `<button type="button" data-drawing="d:${d.id}" aria-pressed="${current === 'd:' + d.id}" title="${esc(d.label)}" aria-label="${esc(d.label)}">${drawingSVG(d)}</button>`).join('')}</div>
    <div class="own-pick" data-icon-pane="img" ${tab === 'img' ? '' : 'hidden'}><button type="button" class="ghost small-btn" data-act="folder-image">${icon('image', { size: 16 })} ${imageOf(current) ? 'Cambiar la imagen' : 'Subir una imagen'}</button>
      <span class="hint">Se recorta cuadrada.</span></div>` : ''}
    <div class="emoji-panel" id="emojiPanel" hidden></div>`;
}
// Cambiar de pestaña: en «Emoji» se abre la lista de emojis
export function showIconTab(id) {
  for (const b of document.querySelectorAll('[data-icon-tab]')) b.setAttribute('aria-pressed', String(b.dataset.iconTab === id));
  for (const p of document.querySelectorAll('[data-icon-pane]')) p.hidden = p.dataset.iconPane !== id;
  const field = document.querySelector('.iconfield[data-tab]'); if (field) field.dataset.tab = id;
  const panel = $('#emojiPanel');
  if (panel && (id === 'emoji') === panel.hidden) $('.icon-current')?.click();
}
// «Tu imagen»: se recorta cuadrada por el centro, se reduce a 256 px y se guarda como las demás imágenes
// (en el navegador y, con cuenta, en la nube: así se ve sin conexión y en otros dispositivos)
export function pickFolderImage() {
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
  inp.addEventListener('change', async () => {
    const file = inp.files?.[0];
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file), s = Math.min(bmp.width, bmp.height), N = Math.min(256, s);
      const c = Object.assign(document.createElement('canvas'), { width: N, height: N });
      c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, N, N);
      bmp.close?.();
      const blob = await new Promise(ok => c.toBlob(b => (b?.type === 'image/webp' ? ok(b) : c.toBlob(ok, 'image/jpeg', 0.88)), 'image/webp', 0.88));
      const id = await addImage(blob);
      S.folderPick?.picked.add(id);
      if ($('#f-icon')) { setIcon('i:' + id); const b = $('[data-act="folder-image"]'); if (b) b.lastChild.textContent = ' Cambiar la imagen'; }
    } catch (e) { fail(e); }
  });
  inp.click();
}
export function setIcon(e) {
  $('#f-icon').value = e;
  $('.icon-current').innerHTML = iconShown(e);
  $('.iconfield-txt').innerHTML = `<button type="button" class="link" data-act="toggle-emoji">${e ? 'Cambiar icono' : 'Elegir un emoji'}</button>${e ? '<button type="button" class="link" data-act="clear-icon">Quitar</button>' : ''}`;
  for (const b of document.querySelectorAll('.draw-pick [data-drawing]')) b.setAttribute('aria-pressed', String(b.dataset.drawing === e));
  const panel = $('#emojiPanel'); panel.hidden = true; $('.icon-current').setAttribute('aria-expanded', 'false');
}
// palette: COLORS (listas) o FOLDER_COLORS (carpetas, los 9 acentos)
function colorPicker(current, palette = COLORS) {
  const cur = palette === FOLDER_COLORS ? folderColorId(current) : current || '';
  return `<div class="colors" role="radiogroup" aria-label="Color">${palette.map(c => `<label class="cpick" title="${c.label}">
    <input type="radio" name="f-color" value="${c.id}" ${c.id === cur ? 'checked' : ''}><span style="background:${c.id ? c.hex || colorVar(c.id) : 'transparent'}" class="${c.id ? '' : 'none'}"></span><span class="sr">${c.label}</span></label>`).join('')}</div>`;
}
export function folderSelect(id, selected, exclude = null, rootLabel = 'Ninguna (en «Mis listas»)') {
  return `<select id="${id}"><option value="">${rootLabel}</option>${folderTree(S.folders, exclude).map(f =>
    `<option value="${f.id}" ${f.id === selected ? 'selected' : ''}>${'   '.repeat(f.depth)}${esc(iconText(f.icon) ? iconText(f.icon) + ' ' : '')}${esc(f.name)}</option>`).join('')}</select>`;
}
// Selector de etiquetas: buscar o crear arriba, las pegatinas (tocar para elegir) y el color de la que se cree.
// «compact» (editor de una pregunta): solo las elegidas, con ✕, y «+ etiqueta» abre el buscar o crear.
export function tagPicker(selected = [], color = nextTagColor(), { compact = false, open = false } = {}) {
  const tags = [...S.tags.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const opt = (t, top) => `<label class="tagopt" data-tag-name="${esc(norm(t.name))}" ${top ? 'data-top' : 'hidden'}><input type="checkbox" name="f-tag" value="${t.id}" ${selected.includes(t.id) ? 'checked' : ''}>${tagSticker(t, { big: true })}</label>`;
  const search = `<input id="f-newtag" maxlength="25" placeholder="Buscar o crear etiqueta" aria-label="Buscar o crear etiqueta" autocomplete="off">`;
  const colors = `<div class="tagpick-colors" role="radiogroup" aria-label="Color de la etiqueta nueva"><span>Color</span>${TAG_COLORS.map(c => `<label class="tcdot" data-tc="${c.id}" title="${c.label}"><input type="radio" name="f-newtag-color" value="${c.id}" ${c.id === color ? 'checked' : ''}><span class="sr">${c.label}</span></label>`).join('')}</div>`;
  const create = '<button type="button" class="link tag-create" data-act="add-tag-inline" hidden>Crear</button>';
  if (!compact) return `<div class="tagpick" id="tagPick">${search}
    <div class="tagpick-list">${tags.map(t => opt(t, true)).join('')}${create}</div>${colors}</div>`;
  // Sin buscar, las 6 que más usas de las que aún no lleva
  const rest = tags.filter(t => !selected.includes(t.id));
  const top = new Set(rest.map(t => [t, tagCount(t.id)]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t.id));
  return `<div class="tagpick compact" id="tagPick">
    <div class="tagpick-sel">${selected.map(id => S.tags.get(id)).filter(Boolean).map(t => `<span class="tagsel"><input type="checkbox" name="f-tag" value="${t.id}" checked hidden>${tagSticker(t, { big: true })}<button type="button" class="tag-x" data-act="untag" data-id="${t.id}" aria-label="Quitar #${esc(t.name)}">${icon('x', { size: 14 })}</button></span>`).join('')}
      <button type="button" class="tag-add" data-act="tagpick-open" aria-expanded="${open}">+ etiqueta</button></div>
    <div class="tagpick-pop" ${open ? '' : 'hidden'}>${search}
      <div class="tagpick-list">${rest.map(t => opt(t, top.has(t.id))).join('')}${create}</div>${colors}</div>
  </div>`;
}
// Redibuja el selector con lo elegido ahora (tras elegir, quitar o crear una)
export function redrawTagPicker(checked, { open = false } = {}) {
  const box = $('#tagPick');
  if (!box) return;
  const compact = box.classList.contains('compact');
  box.outerHTML = tagPicker(checked ?? [...box.querySelectorAll('input[name="f-tag"]:checked')].map(i => i.value), undefined, { compact, open });
  if (S.edit?.open) S.edit.dirty = true;
}
// Al escribir en «Buscar o crear»: solo las que encajan (sin buscar, las de siempre) y, si no hay una que se llame así, «Crear #…»
export function filterTagPicker() {
  const name = tagName($('#f-newtag')?.value), q = norm(name), btn = document.querySelector('#tagPick .tag-create');
  for (const l of document.querySelectorAll('#tagPick .tagopt')) l.hidden = q ? !l.dataset.tagName.includes(q) : !('top' in l.dataset);
  const exact = [...S.tags.values()].some(t => norm(t.name) === q);
  if (btn) { btn.hidden = !q || exact; btn.textContent = `Crear #${name}`; }
}
// El color de una etiqueta nueva: el primero que aún no usa ninguna (si están todos, por orden)
export function nextTagColor() {
  const used = [...S.tags.values()].map(t => tagColor(t.color));
  return TAG_COLORS.find(c => !used.includes(c.id))?.id || TAG_COLORS[used.length % TAG_COLORS.length].id;
}
// Cuántas preguntas llevan la etiqueta: las que la tienen y las de las listas que la tienen
function tagCount(id) {
  const decks = new Set([...S.decks.values()].filter(d => (d.tags || []).includes(id)).map(d => d.id));
  return [...S.cards.values()].filter(c => decks.has(c.deck_id) || (c.tags || []).includes(id)).length;
}

// «¿Qué vas a estudiar?»: un idioma (cuál) u otra cosa. Para un mazo nuevo, lo que más usas.
function studyPicker(d) {
  const counts = new Map();
  for (const x of S.decks.values()) { const l = x.options?.lang || ''; counts.set(l, (counts.get(l) || 0) + 1); }
  const common = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const lang = d ? (d.options?.lang || '') : common;
  const commonLang = [...counts].filter(([l]) => l).sort((a, b) => b[1] - a[1])[0]?.[0] || 'en-GB';
  const sel = lang || commonLang;
  return `<label>¿Qué vas a estudiar?</label>
      <div class="seg" role="group" aria-label="Qué vas a estudiar"><button type="button" data-kind="lang" aria-pressed="${!!lang}">Un idioma</button><button type="button" data-kind="other" aria-pressed="${!lang}">Otra cosa</button></div>
      <div id="d-lang-row" ${lang ? '' : 'hidden'}><label for="d-lang">Idioma</label>
        <select id="d-lang">${LANGS.filter(l => l.id).map(l => `<option value="${l.id}" ${l.id === sel ? 'selected' : ''}>${l.label}</option>`).join('')}</select>
        <p class="hint">Se usa para el audio, para corregir lo que escribes y para proponerte los tipos de pregunta que encajan.</p></div>`;
}
export function deckForm(d) {
  const folderDefault = d ? d.folder_id : (S.view === 'decks' ? S.folderId : null);
  openSheet(`<h2>${d ? 'Editar lista' : 'Nueva lista'}</h2>
    <form data-form="deck" data-id="${d ? d.id : ''}">
      <label for="d-name">Nombre</label><input id="d-name" maxlength="80" required value="${esc(d?.name || '')}">
      <label for="d-desc">Descripción (opcional)</label><textarea id="d-desc" rows="2" maxlength="300">${esc(d?.description || '')}</textarea>
      ${studyPicker(d)}
      <label>Icono</label>${iconPicker(d?.icon)}
      <label>Color</label>${colorPicker(d?.color)}
      <label for="d-folder">Carpeta</label>${folderSelect('d-folder', folderDefault || '')}
      <label>Etiquetas</label>${tagPicker(d?.tags || [])}
      <label class="check"><input type="checkbox" id="d-pinned" ${d?.pinned ? 'checked' : ''}><span><b>Fijar arriba</b><br><span class="hint">Aparece el primero en su carpeta y en Inicio.</span></span></label>
      ${d ? `<label class="check"><input type="checkbox" id="d-archived" ${d.archived ? 'checked' : ''}><span><b>Archivar</b><br><span class="hint">Se oculta y no entra en las tandas. La encuentras en el filtro «Archivadas».</span></span></label>` : ''}
      <details class="opts" ${d?.options?.preset || (d?.options?.newPerDay ?? '') !== '' ? 'open' : ''}><summary>${icon('sliders-horizontal', { size: 16 })} Opciones de estudio de esta lista</summary>
        <p class="hint">Déjalo vacío para usar lo que tengas en Ajustes.</p>
        <div class="field"><label for="d-new">Nuevas por día en esta lista</label><input id="d-new" type="number" min="0" max="500" inputmode="numeric" placeholder="Global (${S.newPerDay})" value="${esc(d?.options?.newPerDay ?? '')}"></div>
        <div class="field"><label for="d-preset">Ritmo de repaso</label><select id="d-preset"><option value="">Global (${esc(S.prefs.algo.preset === 'custom' ? 'Personalizado' : ALGO_PRESETS[S.prefs.algo.preset]?.label || 'Estándar')})</option>
          ${Object.entries(ALGO_PRESETS).map(([k, v]) => `<option value="${k}" ${d?.options?.preset === k ? 'selected' : ''}>${v.label}</option>`).join('')}
          <option value="custom" ${d?.options?.preset === 'custom' ? 'selected' : ''}>Personalizado (el de Ajustes)</option></select></div>
        ${d ? '<div class="btnrow"><button type="button" class="ghost small-btn danger" data-act="ask-reset-deck">Reiniciar el progreso de esta lista</button></div>' : ''}
      </details>
      <label class="check"><input type="checkbox" id="d-public" ${d?.is_public ? 'checked' : ''}><span><b>Compartir con la comunidad</b><br><span class="hint">Cualquier usuario podrá verla en Explorar y copiarla. Tus cambios posteriores no se aplican a sus copias.</span></span></label>
      <div class="btnrow" style="margin-top:14px">${d ? '<button type="button" class="ghost danger" data-act="ask-delete-deck">Borrar lista</button>' : ''}<span class="spacer"></span>
        <button type="button" class="ghost" data-act="close-sheet">Cancelar</button><button type="submit" class="primary">Guardar</button></div>
    </form>`);
}
export function folderForm(f) {
  const parentDefault = f ? f.parent_id : S.folderId;
  S.folderPick = { orig: imageOf(f?.icon), picked: new Set() };
  openSheet(`<h2 class="sheet-hand">${f ? 'Editar carpeta' : 'Nueva carpeta'}</h2>
    <form data-form="folder" data-id="${f ? f.id : ''}">
      <label for="fo-name">Nombre</label><input id="fo-name" maxlength="80" required value="${esc(f?.name || '')}">
      <label>Icono</label>${iconPicker(f?.icon, { drawings: true })}
      <label>Color de la carpeta</label>${colorPicker(f?.color, FOLDER_COLORS)}
      <label for="fo-parent">Dentro de</label>${folderSelect('fo-parent', parentDefault || '', f?.id, 'Ninguna, en Biblioteca')}
      ${f ? '' : '<p class="hint">Las carpetas son comunes a listas y apuntes: un tema puede tener los dos.</p>'}
      <div class="btnrow" style="margin-top:14px">${f ? '<button type="button" class="ghost danger" data-act="ask-delete-folder">Borrar carpeta</button>' : ''}<span class="spacer"></span>
        <button type="button" class="ghost" data-act="close-sheet">Cancelar</button><button type="submit" class="primary">Guardar</button></div>
      ${f ? '<p class="hint">Al borrarla, sus listas, apuntes y subcarpetas no se borran: pasan a la carpeta de arriba.</p>' : ''}
    </form>`);
}
// Gestionar etiquetas: cada una con su pegatina, cuántas preguntas la llevan, sus 7 colores, Renombrar y Borrar
export function tagsSheet(renaming = null) {
  const tags = [...S.tags.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const row = t => `<li data-tag-row="${t.id}">
      ${renaming === t.id ? `<form data-form="renametag" data-id="${t.id}" class="tl-rename"><input class="t-name" value="${esc(t.name)}" maxlength="25" aria-label="Nombre de la etiqueta" required><button class="primary small-btn" type="submit">Guardar</button><button type="button" class="link" data-act="manage-tags">Cancelar</button></form>`
        : `<span class="tl-tag">${tagSticker(t, { big: true })}</span>`}
      <span class="tl-n">${plural(tagCount(t.id), 'pregunta', 'preguntas')}</span>
      <span class="tl-colors" role="group" aria-label="Color de #${esc(t.name)}">${TAG_COLORS.map(c => `<button type="button" class="tcdot" data-tc="${c.id}" data-tag-color="${t.id}" data-color="${c.id}" aria-pressed="${tagColor(t.color) === c.id}" aria-label="${c.label}" title="${c.label}"></button>`).join('')}</span>
      <span class="tl-acts">${renaming === t.id ? '' : `<button type="button" class="link" data-rename-tag="${t.id}">Renombrar</button>`}<button type="button" class="link danger" data-del-tag="${t.id}">Borrar</button></span></li>`;
  openSheet(`<h2 class="hand-h">Gestionar etiquetas</h2>
    <p class="muted small">Sirven para juntar listas y apuntes de distintas carpetas (<i>examen junio</i>, <i>verbos</i>…) y estudiarlos juntos. Al borrar una, las preguntas se quedan: solo pierden la etiqueta.</p>
    <ul class="taglist">${tags.map(row).join('') || '<li class="muted small">Aún no tienes etiquetas.</li>'}</ul>
    <form data-form="newtag" class="newtag-row"><input id="nt-name" maxlength="25" placeholder="Nueva etiqueta" aria-label="Nueva etiqueta"><button class="primary" type="submit">Crear</button></form>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="save-tags">Hecho</button></div>`);
  if (renaming) { const i = document.querySelector('.tl-rename .t-name'); i?.focus(); i?.select(); }
}
export function deckOptions(selected) {
  return sortDecks([...S.decks.values()], 'name', new Map()).map(d => `<option value="${d.id}" ${d.id === selected ? 'selected' : ''}>${esc(d.icon ? d.icon + ' ' : '')}${esc(deckOptionName(d))}</option>`).join('');
}
// El nombre de una lista en un selector: si otra se llama igual, con su carpeta detrás («Título Preliminar · Oposición»)
export function deckOptionName(d) {
  const same = [...S.decks.values()].some(x => x.id !== d.id && x.name.trim().toLocaleLowerCase() === d.name.trim().toLocaleLowerCase());
  const where = same ? ` · ${(d.folder_id && S.folders.get(d.folder_id)?.name) || 'Sin carpeta'}` : '';
  return `${d.name}${where}${d.archived ? ' (archivada)' : ''}`;
}
// Tipos usados hace poco en cada mazo (los más recientes primero), para tenerlos a un toque
function recentTypes(deckId) {
  try { const v = JSON.parse(localStorage.getItem('flaski-last-type') || '{}')[deckId]; return Array.isArray(v) ? v : v ? [v] : []; } catch { return []; }
}
const lastTypeFor = deckId => recentTypes(deckId)[0] || null;
function rememberType(deckId, typeId) {
  try {
    const m = JSON.parse(localStorage.getItem('flaski-last-type') || '{}');
    m[deckId] = [typeId, ...recentTypes(deckId).filter(x => x !== typeId)].slice(0, 6);
    localStorage.setItem('flaski-last-type', JSON.stringify(m));
  } catch {}
}
const typeHidden = t => S.prefs.types.hidden.includes(t.id);
// Tipos que se proponen en un mazo cuando aún no has usado ninguno
function suggestedTypes(deckId) {
  const study = deckLang(deckId);
  if (!study) return ['basic', 'cloze', 'choice', 'typing'];
  const own = BUILTIN_TYPES.filter(t => typeFit(t, study) === 'own').map(t => t.id);
  return [...own, 'vocab', 'reverse', 'cloze', 'listen'];
}
// El tipo con el que empieza una tarjeta nueva: el último que usaste ahí, o el primero que encaje
function defaultTypeFor(deckId) {
  const fits = t => t && (typeFit(t, deckLang(deckId)) || !BUILTIN_TYPES.includes(t));
  return [lastTypeFor(deckId), ...suggestedTypes(deckId)].map(getType).find(fits) || BUILTIN_TYPES[0];
}
// Los 4 tipos a un toque, fijos según el idioma de la lista (el elegido, si no está entre ellos, ocupa el cuarto)
const SHORT_NAME = { reverse: 'Con inversa', typing: 'Escribir respuesta', explain: 'Explícalo' };
function segTypes(deckId) {
  const study = deckLang(deckId);
  const base = study ? ['vocab', 'basic', 'typing', BUILTIN_TYPES.find(t => typeFit(t, study) === 'own' && !typeHidden(t))?.id || 'listen'] : ['basic', 'reverse', 'cloze', 'choice'];
  const spare = study ? ['reverse', 'listen', 'cloze', 'choice'] : ['typing', 'truefalse', 'number', 'match'];
  return [...new Set([...base, ...spare])].map(getType).filter(t => t && !typeHidden(t)).slice(0, 4).map(t => t.id);
}
// attr: el atributo con el que cada segmento cambia el tipo (data-set-type en el editor, data-quick-type en «Varias de golpe»)
export function typeSegs(sel, deckId, attr = 'data-set-type') {
  const ids = segTypes(deckId);
  if (!ids.includes(sel)) ids[Math.min(3, ids.length)] = sel;
  return `<div class="ed-segs" role="group" aria-label="Tipo de pregunta">${ids.map(id => {
    const t = getType(id) || BUILTIN_TYPES[0];
    return `<button type="button" class="ed-seg${id === sel ? ' ed-typesel' : ''}" ${attr}="${id}" aria-pressed="${id === sel}" title="${esc(t.name)}">${esc(SHORT_NAME[id] || t.name)}</button>`;
  }).join('')}</div><button type="button" class="ed-seg-more" data-act="pick-type" aria-haspopup="dialog">Más tipos ${icon('chevron-down', { size: 15 })}</button>`;
}
// Todos los tipos, por lo que se hace con ellos
const TYPE_GROUPS = [
  ['Recordar', ['basic', 'reverse', 'vocab', 'de-noun']],
  ['Escribir', ['typing', 'kanji', 'handwrite', 'listen', 'conj', 'number']],
  ['Elegir', ['choice', 'truefalse', 'clozechoice']],
  ['Completar', ['cloze']],
  ['Relacionar y ordenar', ['match', 'sort', 'order', 'steps']],
  ['Entender', ['explain', 'whatif']],
  ['Con imagen', ['occlusion']],
];
const langOf = t => { const s = typeScope(t); return Array.isArray(s) && s.length === 1 ? (LANGS.find(l => l.id && baseLang(l.id) === s[0])?.label || '').toLowerCase() : ''; };
const nWords = s => String(s).split(/\s+/).filter(Boolean).length;
// Lo que encaja con lo seleccionado en un apunte: 3 tipos y por qué
function fitTypes(text, study) {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const own = BUILTIN_TYPES.find(t => typeFit(t, study) === 'own')?.id;
  if (lines.length >= 2 && lines.every(l => /\s(=|→|-|–)\s|:\s/.test(l))) return { why: `${lines.length} líneas «palabra = significado»`, ids: study ? ['match', 'vocab', own || 'reverse'] : ['match', 'basic', 'sort'] };
  if (lines.length >= 3) return { why: `${lines.length} pasos encadenados`, ids: ['steps', 'basic', 'cloze'] };
  if (/\d/.test(text) && nWords(text) <= 25) return { why: 'una frase con un número', ids: ['number', 'cloze', 'basic'] };
  return { why: nWords(text) <= 4 ? 'una palabra o un término' : 'una frase', ids: ['cloze', 'basic', 'choice'] };
}
// Selector de tipos («Más tipos»): S.pick = { deckId, sel, q, all, text, apply(id) }; en el editor y en «Varias de golpe»
export function drawTypePicker() {
  const box = $('#typePicker'), P = S.pick;
  if (!box || !P) return;
  const study = deckLang(P.deckId), nq = norm(P.q.trim());
  const match = t => !nq || norm(`${t.name} ${t.description || ''}`).includes(nq);
  // Sin buscar: los que encajan con la lista (sin los ocultos); «Ver todos» añade los de idiomas o los de otro idioma
  const visible = t => match(t) && (nq || (!typeHidden(t) && (P.all || typeFit(t, study))));
  const chip = t => `<button type="button" class="tp-chip" data-pick-type="${t.id}" aria-pressed="${t.id === P.sel}" title="${esc(t.description || '')}"><span class="tci">${typeIcon(t, 16)}</span>${esc(t.name)}${langOf(t) ? `<em>${esc(langOf(t))}</em>` : ''}</button>`;
  let body = '';
  const fit = !nq && fitTypes(P.text, study);
  if (fit) {
    const cards = fit.ids.map(getType).filter(t => t && !typeHidden(t));
    body += `<h3 class="tp-h">Encaja con tu selección</h3><p class="tp-why">${icon('sugerencia', { size: 14 })} ${esc(fit.why)}</p>
      <div class="tp-fits">${cards.map(t => `<button type="button" class="tp-fit" data-pick-type="${t.id}" aria-pressed="${t.id === P.sel}"><span class="tp-art">${typeIcon(t, 30)}</span><span class="tp-txt"><b>${esc(t.name)}</b><small>${esc(t.description || '')}</small></span><span class="tp-check" aria-hidden="true">${icon('check', { size: 15 })}</span></button>`).join('')}</div>`;
  }
  const groups = TYPE_GROUPS.map(([h, ids]) => [h, ids.map(getType).filter(t => t && visible(t))]).filter(g => g[1].length);
  const listed = new Set(TYPE_GROUPS.flatMap(g => g[1]));
  const extra = BUILTIN_TYPES.filter(t => !listed.has(t.id) && visible(t));   // por si llega un tipo nuevo sin grupo
  if (extra.length) groups.push(['Otros', extra]);
  const own = [...S.types.values()].filter(match).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const all = groups.map(([h, list]) => `<h4 class="tp-g">${esc(h)}</h4><div class="tp-chips">${list.map(chip).join('')}</div>`).join('')
    + (nq && !own.length ? '' : `<h4 class="tp-g">Tus tipos</h4><div class="tp-chips">${own.map(chip).join('')}${nq ? '' : `<button type="button" class="tp-chip tp-new" data-act="manage-types">${icon('plus', { size: 15 })} Crear un tipo</button>`}</div>`);
  body += `<div class="tp-allh"><h3 class="tp-h">Todos los tipos</h3>${nq ? '' : `<button type="button" class="link" data-act="types-all">${P.all ? 'Ver solo los que encajan' : study ? 'Ver todos' : 'Ver también los de idiomas'}</button>`}</div>${groups.length || own.length ? all : '<p class="muted">Ningún tipo coincide con la búsqueda.</p>'}`;
  box.querySelector('.tp-body').innerHTML = body;
  const cur = getType(P.sel);
  box.querySelector('[data-act="use-type"]').textContent = cur ? `Usar «${cur.name}»` : 'Usar';
}
export function openTypePicker(open = true, ctx = null) {
  const box = $('#typePicker');
  if (!box) return;
  S.pick = open ? { q: '', all: false, text: '', ...ctx } : null;
  box.hidden = !open;
  box.closest('form')?.classList.toggle('picking', open);
  if (open) { $('#typeSearch').value = ''; drawTypePicker(); if (matchMedia('(hover:hover)').matches) $('#typeSearch').focus(); }
}
// Toca un tipo para marcarlo; «Usar» (o Intro al buscar) lo aplica
export function markPickedType(id, apply = false) {
  if (!S.pick) return;
  if (apply) { const fn = S.pick.apply; openTypePicker(false); return fn?.(id); }
  S.pick.sel = id;
  drawTypePicker();
}
export function useType() { if (S.pick?.sel) markPickedType(S.pick.sel, true); }
const typePickerHTML = () => `<div class="ed-picker" id="typePicker" role="dialog" aria-label="Elige el tipo" hidden>
      <div class="tp-top"><button type="button" class="back-round" data-act="close-picker" aria-label="Volver">${icon('chevron-left', { size: 20 })}</button><h2 class="tp-title">Elige el tipo</h2></div>
      <label class="tp-search">${icon('search', { size: 17 })}<input id="typeSearch" type="search" placeholder="Buscar un tipo" aria-label="Buscar un tipo" autocomplete="off"></label>
      <div class="tp-body"></div>
      <div class="tp-foot"><button type="button" class="primary" data-act="use-type">Usar</button><button type="button" class="ghost" data-act="close-picker">Cancelar</button></div>
    </div>`;
// El selector desde el editor de una pregunta
export function openEditorPicker() {
  readEditor();
  const vals = Object.values(S.edit.fields).filter(Boolean);
  openTypePicker(true, { deckId: edDeck(), sel: S.edit.typeId, text: S.edit.source ? vals[0] || '' : '', apply: setEditorType });
}
// Mazo elegido en el editor de tarjetas
export const edDeck = () => $('#c-deck')?.value || S.edit?.deckId || null;
/* ===================== editor de tarjetas ===================== */
// Qué papel tiene cada campo en las tarjetas que se generan (para orientarte mientras escribes)
function fieldRoles(type, id) {
  const r = new Set();
  for (const t of type.templates) {
    if (t.mode === 'match' && t.answer === id) { r.add('parejas'); continue; }
    if (t.mode === 'conj' && t.answer === id) { r.add('formas'); continue; }
    if (t.mode === 'sort' && t.answer === id) { r.add('grupos'); continue; }
    if (t.mode === 'clozechoice' && t.answer === id) { r.add('huecos'); continue; }
    if (t.mode === 'occlusion') { if (t.front.includes(id)) r.add('anverso'); else if (t.back.includes(id)) r.add('reverso'); continue; }
    if (t.mode === 'cloze' && t.front[0] === id) r.add('huecos');
    else if (t.front.includes(id)) r.add('anverso');
    if (t.answer === id) r.add(t.mode === 'draw' ? 'a mano' : t.mode === 'listen' ? 'dictado' : t.mode === 'order' ? 'ordenar' : 'respuesta');
    else if (t.back.includes(id)) r.add('reverso');
  }
  return [...r];
}
function requiredField(type, id) {
  return type.templates.some(t => (t.front[0] === id && !['match', 'occlusion'].includes(t.mode)) || t.answer === id || t.image === id);
}
function fieldPlaceholder(f, type) {
  const roles = fieldRoles(type, f.id);
  if (roles.includes('huecos')) return 'Escribe el texto y marca los huecos con {{ }}';
  if (roles.includes('ordenar')) return 'La frase en orden correcto. Piezas separadas por espacios o «/»';
  if (/^nota$/i.test(f.name)) return 'Truco para recordarla, raíz, falsos amigos…';
  return requiredField(type, f.id) ? `Escribe ${f.name.replace(/\s*\(opcional\)/i, '').toLowerCase()}…` : '';
}
function fieldInputs(type, values) {
  const occ = type.templates.find(t => t.mode === 'occlusion');
  return type.fields.map((f, i) => {
    // Imagen tapada: la imagen y sus recuadros se editan juntos, dibujando encima
    if (occ && f.id === occ.answer) return '';
    if (occ && f.id === occ.image) return occEditorHTML(values[occ.image], values[occ.answer]);
    const req = requiredField(type, f.id);
    // Los campos que dan la pregunta llevan su nombre grande; los demás, «· opcional» (la nota, cuándo se ve)
    const optName = /\s*\(opcional\)/i.test(f.name), name = f.name.replace(/\s*\(opcional\)/i, '');
    const main = !optName && (req || (i < 2 && fieldRoles(type, f.id).length > 0 && !/^nota$/i.test(f.name)));
    const cjk = /^(ja|zh)/.test(f.lang || '');
    const help = f.help || (f.lang?.startsWith('ja') ? 'Furigana: escribe el kanji y pulsa 振 en la barra (o escribe 漢字[かんじ]).' : '');
    return `<div class="ef${main ? ' ef-req' : ''}" data-ef="${f.id}">
      <div class="ef-head">
        <label class="ef-name" for="fld-${f.id}">${esc(name)}${main ? '' : `<span class="ef-opt">${/^nota$/i.test(f.name) ? ' · solo la ves al dar la vuelta' : ' · opcional'}</span>`}</label>
        ${f.lang && ttsAvailable() ? `<button type="button" class="ef-say" data-say-input="${f.id}" aria-label="Escuchar ${esc(f.name)}" title="Escuchar">${SPEAK_ICON}</button>` : ''}
      </div>
      <textarea id="fld-${f.id}" class="ef-input" data-fld="${f.id}" rows="1" maxlength="2000" ${f.lang ? `lang="${f.lang}"` : ''} placeholder="${esc(fieldPlaceholder(f, type))}">${esc(values[f.id] || '')}</textarea>
      ${fieldRoles(type, f.id).includes('huecos') ? `<div class="ef-cz" data-cz-for="${f.id}" aria-hidden="true" ${/\{\{.+?\}\}/.test(values[f.id] || '') ? '' : 'hidden'}>${czHTML(values[f.id])}</div>` : ''}
      ${cjk ? `<div class="ef-ruby" data-ruby-for="${f.id}" lang="${f.lang}" aria-hidden="true" ${hasRuby(values[f.id]) ? '' : 'hidden'}>${hasRuby(values[f.id]) ? fmt(values[f.id]) : ''}</div>` : ''}
      ${help ? `<p class="ef-help">${esc(help)}</p>` : ''}
    </div>`;
  }).join('');
}
// Barra de formato; las letras especiales y la furigana, según el idioma del mazo
const TOOLBAR = deckId => {
  const study = deckLang(deckId), chars = study ? charsFor(study) : [];
  return `<div class="ed-tools" role="toolbar" aria-label="Formato">
  <button type="button" data-fmt="bold" title="Negrita (Ctrl+B)" aria-label="Negrita"><b>B</b></button>
  <button type="button" data-fmt="italic" title="Cursiva (Ctrl+I)" aria-label="Cursiva"><i>I</i></button>
  <button type="button" data-fmt="cloze" title="Convertir en hueco {{ }}" aria-label="Hueco">{{&thinsp;}}</button>
  ${['ja', 'zh'].includes(baseLang(study)) ? '<button type="button" data-fmt="ruby" title="Añadir furigana al kanji seleccionado" aria-label="Furigana" lang="ja">振</button>' : ''}
  <button type="button" data-fmt="slash" title="Separar piezas con /" aria-label="Separador de piezas">/</button>
  <button type="button" data-fmt="image" title="Añadir una imagen al campo (también puedes pegarla)" aria-label="Añadir imagen">${icon('image', { size: 16 })}</button>
  ${chars.length ? `<span class="ed-sep" aria-hidden="true"></span>${chars.map(ch => `<button type="button" data-char="${ch}" aria-label="Insertar ${ch}">${ch}</button>`).join('')}` : ''}
</div><div class="ruby-pop" id="rubyPop" role="dialog" aria-label="Furigana" hidden></div>`;
};

// En el editor de tarjetas: de qué apuntes sale la tarjeta
function linkProp(link) {
  const pg = link && S.pages.get(link.page_id);
  if (!pg) return '';
  const b = pg.blocks.find(x => x.id === link.block_id);
  return `<div class="prop"><span class="prop-k">${icon('notebook-text', { size: 16 })} Apuntes</span>
    <span class="prop-v prop-link">${esc(pageTitle(pg))}${b ? ` · <span class="muted">«${esc(plain(b.text).slice(0, 50))}${b.text.length > 50 ? '…' : ''}»</span>` : ''}</span></div>`;
}
// «de: …» en el panel: el apartado del que sale (el título de encima) o, si no hay, el principio del bloque
function sourceName(link) {
  const blocks = S.pages.get(link.page_id)?.blocks || [];
  const i = blocks.findIndex(x => x.id === link.block_id);
  if (i < 0) return '';
  for (let j = i; j >= 0; j--) if (['h1', 'h2', 'h3'].includes(blocks[j].type)) return plain(blocks[j].text).trim();
  const t = plain(blocks[i].text).trim();
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
}
export function cardForm(c, { deckId: forcedDeck, prefill = null, source = null, sugIndex = null } = {}) {
  const sessionDeck = S.session && S.decks.has(S.session.scope) ? S.session.scope : null;
  const deckId = c?.deck_id || forcedDeck || (S.view === 'deck' && S.deckId) || sessionDeck || [...S.decks.values()].find(d => !d.archived)?.id || [...S.decks.keys()][0];
  if (!deckId && sugIndex == null) { toast('Crea primero una lista'); return deckForm(null); }   // (una sugerencia se edita aunque aún no haya listas)
  let model, siblings = [];
  if (c) {
    model = cardModel(c);
    siblings = c.note_id ? cardList().filter(x => x.note_id === c.note_id) : [c];
  } else if (prefill) {
    model = { type: getType(prefill.typeId) || BUILTIN_TYPES[0], fields: { ...prefill.fields } };
    model.tpl = model.type.templates[0];
  } else {
    const t = defaultTypeFor(deckId);
    model = { type: t, tpl: t.templates[0], fields: {} };
  }
  // Una pregunta nueva desde lo seleccionado en un apunte: en el panel, con el apunte a la vista
  const side = !c && !!source && sugIndex == null && S.view === 'page';
  S.edit = { open: true, side, dirty: !!source && sugIndex == null, deckId, source, sugIndex, cardId: c?.id || null, noteId: c?.note_id || null, siblings: siblings.map(x => x.id), typeId: model.type.id,
    fields: { ...model.fields }, pv: model.tpl.id, pvSide: 'front', hint: prefill?.hint ?? c?.hint ?? '', tags: prefill?.tags ?? c?.tags ?? [] };
  const p = c && S.progress.get(c.id);
  const deck = S.decks.get(deckId);
  const route = deck ? [...(deck.folder_id ? folderPath(S.folders, deck.folder_id).map(f => f.name) : []), deck.name].join(' / ') : '';
  const title = c ? 'Editar pregunta' : sugIndex != null ? 'Editar sugerencia' : 'Nueva pregunta';
  openSheet(`<form data-form="card" data-id="${c ? c.id : ''}" class="ed${side ? '' : ' ed-page'}" autocomplete="off">
    <header class="ed-top">
      <button type="button" class="back-round ed-x" data-act="close-sheet" aria-label="Cerrar">${icon(side ? 'x' : 'chevron-left', { size: 20 })}</button>
      <div class="ed-title">${route && !side ? `<small class="ed-route">${esc(route)}</small>` : ''}<span>${title}</span>
        ${side && sourceName(source) ? `<small class="ed-from"><span>de:</span> <button type="button" class="link" data-act="goto-src">${esc(sourceName(source))}</button></small>` : ''}</div>
      ${side ? '' : '<button type="button" class="link ed-cancel" data-act="close-sheet">Cancelar</button>'}
    </header>
    <div class="ed-discard" id="edDiscard" hidden role="alert"><span>Tienes cambios sin guardar.</span>
      <button type="button" class="ghost small-btn" data-act="discard-edit">Descartar</button><button type="button" class="primary small-btn" data-act="keep-edit">Seguir editando</button></div>
    <div class="ed-body">
      <section class="ed-main">
        <div class="ed-row"><label class="ed-lab" for="c-deck">Lista</label>
          <label class="ed-deck">${icon('layers', { size: 18 })}<select id="c-deck" aria-label="Lista">${deckOptions(deckId)}</select></label></div>
        <input type="hidden" id="c-type" value="${model.type.id}">
        <div class="ed-row"><span class="ed-lab" id="typeLab">Tipo de pregunta</span>
          <div class="ed-typebar" id="typeBar">${typeSegs(model.type.id, deckId)}</div>
          <p class="ed-typedesc" id="typeDesc">${esc(model.type.description || '')}</p></div>
        <div id="fieldsBox" class="ed-fields">${fieldInputs(typeIn(model.type, deckId), model.fields)}</div>
        <div id="toolsBox">${TOOLBAR(deckId)}</div>
        <div class="ed-props">
          <div class="prop prop-tags"><span class="prop-k">Etiquetas</span><div class="prop-v">${tagPicker(S.edit.tags, undefined, { compact: true })}</div></div>
          <div class="prop"><span class="prop-k">Pista · opcional</span><input id="c-hint" class="prop-v" maxlength="500" value="${esc(S.edit.hint)}" placeholder="Se puede ver antes de responder"></div>
          ${linkProp(source || (c?.page_id ? { page_id: c.page_id, block_id: c.block_id } : null))}
        </div>
        ${siblings.length > 1 ? `<p class="ed-note">Esta nota genera ${siblings.length} preguntas. Los cambios se aplican a todas.</p>` : ''}
        ${side ? '' : '<p class="ed-kbd"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> para guardar · <kbd>Esc</kbd> para cancelar</p>'}
      </section>
      <aside class="ed-side" aria-label="Vista previa">
        <div class="pv-h"><h2>Vista previa</h2><span class="pv-sub">así la verás al estudiar</span>
          <div class="pv-sides" role="group" aria-label="Cara"><button type="button" data-pvside="front" aria-pressed="true">Anverso</button><button type="button" data-pvside="back" aria-pressed="false">Reverso</button></div></div>
        <div class="pv-tabs" id="pvTabs"></div>
        <div id="pvBody"></div>
        <span class="pv-count" id="pvCount" hidden></span>
      </aside>
    </div>
    ${typePickerHTML()}
    <footer class="ed-foot">
      ${c ? `<span class="ed-extra" id="edExtra"><button type="button" class="ghost danger small-btn" data-act="ask-delete-card">Borrar</button>
        <button type="button" class="ghost small-btn" data-act="dup-card">Duplicar</button>
        ${p ? '<button type="button" class="ghost small-btn" data-act="ask-reset-card">Reiniciar progreso</button>' : ''}</span>
        <button type="button" class="ghost small-btn ed-xbtn" data-act="ed-extra" aria-expanded="false" aria-controls="edExtra">${icon('ellipsis', { size: 18 })} Más</button>` : ''}
      ${side ? `<button type="submit" class="primary">Crear pregunta</button>
        <button type="button" class="ghost" data-act="save-card-more">Crear y otra</button><span class="spacer"></span><kbd class="ed-kb">Ctrl+Enter</kbd>`
      : `<span class="spacer"></span>
      ${c || sugIndex != null ? '' : '<button type="button" class="soft ed-more" data-act="save-card-more">Guardar y añadir otra</button>'}
      <button type="submit" class="primary ed-save">Guardar</button>`}
    </footer>
  </form>`, { full: true, side });
  if (side) document.querySelector(`[data-block="${source.block_id}"]`)?.classList.add('is-src');
  document.querySelectorAll('.ef-input').forEach(autoGrow);
  showSelectedSeg();
  drawPreview();
  if (matchMedia('(hover:hover)').matches) setTimeout(() => document.querySelector('.ef-input')?.focus(), 40);
}
export function autoGrow(t) { if (t.tagName !== 'TEXTAREA') return; t.style.height = 'auto'; t.style.height = Math.min(320, t.scrollHeight + 2) + 'px'; }
export function setEditorType(id) {
  const old = getType(S.edit.typeId) || BUILTIN_TYPES[0], nt = getType(id) || BUILTIN_TYPES[0];
  readEditor();
  // Los valores pasan a los campos del tipo nuevo: primero por nombre igual, luego en el mismo orden
  const byName = new Map(old.fields.map(f => [f.name.toLowerCase(), S.edit.fields[f.id] || '']));
  const vals = old.fields.map(f => S.edit.fields[f.id] || '');
  const used = new Set();
  S.edit.fields = Object.fromEntries(nt.fields.map((f, i) => {
    const v = byName.get(f.name.toLowerCase());
    if (v) { used.add(f.name.toLowerCase()); return [f.id, v]; }
    return [f.id, vals[i] || ''];
  }));
  if (nt.id !== old.id) S.edit.dirty = true;
  S.edit.typeId = nt.id;
  $('#c-type').value = nt.id;
  redrawEditorFields();
}
// Tipo, campos y barras del editor según el tipo y el mazo elegidos (el idioma del mazo cambia los campos)
export function redrawEditorFields() {
  const deckId = edDeck(), t = getType(S.edit.typeId) || BUILTIN_TYPES[0];
  $('#typeBar').innerHTML = typeSegs(t.id, deckId);
  $('#fieldsBox').innerHTML = fieldInputs(typeIn(t, deckId), S.edit.fields);
  $('#toolsBox').innerHTML = TOOLBAR(deckId);
  $('#typeDesc').textContent = t.description || '';
  document.querySelectorAll('.ef-input').forEach(autoGrow);
  showSelectedSeg();
  drawPreview();
}
// El tipo elegido, a la vista en la barra de segmentos (en el móvil se desplaza)
export function showSelectedSeg() {
  const b = document.querySelector('.ed-segs [aria-pressed="true"]'), bar = b?.parentElement;
  if (b && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = b.offsetLeft - (bar.clientWidth - b.offsetWidth) / 2;
}
// Formato sobre el campo activo
export function applyFormat(kind) {
  const t = (S.lastField?.isConnected && S.lastField.matches('.ef-input') && S.lastField) || document.querySelector('.ef-input');
  if (!t) return;
  const a = t.selectionStart, z = t.selectionEnd, sel = t.value.slice(a, z);
  const wrap = (l, r, empty = '') => {
    const inner = sel || empty;
    t.value = t.value.slice(0, a) + l + inner + r + t.value.slice(z);
    t.focus();
    t.selectionStart = a + l.length; t.selectionEnd = a + l.length + inner.length;
  };
  if (kind === 'bold') wrap('**', '**', 'texto');
  else if (kind === 'italic') wrap('*', '*', 'texto');
  else if (kind === 'cloze') { if (!sel) return toast('Selecciona la parte que quieres ocultar'); wrap('{{', '}}'); }
  else if (kind === 'ruby') return rubyPrompt(t);
  else if (kind === 'image') return pickImage().then(f => f && imageIntoField(t, f));
  else if (kind === 'slash') {
    t.value = t.value.slice(0, a) + ' / ' + t.value.slice(z);
    t.focus(); t.selectionStart = t.selectionEnd = a + 3;
  }
  S.edit.dirty = true;
  autoGrow(t); readEditor(); drawPreview();
}
/* ---------- Imágenes ---------- */
// Abre el selector de archivos y devuelve la imagen elegida (o null)
export function pickImage() {
  return new Promise(ok => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
    inp.addEventListener('change', () => ok(inp.files?.[0] || null));
    inp.addEventListener('cancel', () => ok(null));
    inp.click();
  });
}
// Guarda la imagen y devuelve su id (o null si no se ha podido)
export async function saveImage(file) {
  try { return await addImage(file); } catch (e) { toast(e.message || 'No se ha podido añadir la imagen'); return null; }
}
// Mete una imagen en un campo del editor, donde está el cursor (en su propia línea)
export async function imageIntoField(t, file) {
  const id = await saveImage(file);
  if (!id || !t.isConnected) return;
  const a = t.selectionStart, z = t.selectionEnd, before = t.value.slice(0, a), after = t.value.slice(z);
  const tok = (before && !before.endsWith('\n') ? '\n' : '') + imgToken(id) + (after && !after.startsWith('\n') ? '\n' : '');
  t.value = before + tok + after;
  t.focus(); t.selectionStart = t.selectionEnd = a + tok.length;
  S.edit.dirty = true;
  autoGrow(t); readEditor(); drawPreview();
}
export const imageFile = dt => [...(dt?.files || [])].find(f => /^image\//.test(f.type)) || null;
/* ---------- Furigana en el editor ---------- */
const KANJI = /[㐀-䶿一-鿿豈-﫿々〆ヶ]/;
export const hasRuby = s => new RegExp(RUBY_RE.source).test(String(s || ''));
// Vista previa con la furigana bajo un campo (solo cuando la lleva)
// Un campo de huecos se ve también tal cual, con el hueco resaltado (sin las llaves)
const czHTML = v => esc(v || '').replace(/\{\{(.+?)(?:::.+?)?\}\}/g, '<mark class="cz-mark">$1</mark>');
export function rubyLine(t) {
  const cz = document.querySelector(`[data-cz-for="${t.dataset.fld}"]`);
  if (cz) { cz.hidden = !/\{\{.+?\}\}/.test(t.value); cz.innerHTML = czHTML(t.value); }
  const box = document.querySelector(`[data-ruby-for="${t.dataset.fld}"]`);
  if (!box) return;
  box.hidden = !hasRuby(t.value);
  box.innerHTML = box.hidden ? '' : fmt(t.value);
}
// 振: pide la lectura del kanji seleccionado (o del que está justo antes del cursor), con vista previa.
// Si ya tenía lectura, se edita o se quita.
function rubyPrompt(t) {
  const v = t.value;
  let a = t.selectionStart, z = t.selectionEnd;
  // Cursor dentro de una lectura «漢字[かん|じ]»: se edita esa
  const open = v.lastIndexOf('[', a - 1), close = v.indexOf(']', a);
  if (a === z && open >= 0 && close >= a && !v.slice(open, close).includes('\n') && !v.slice(open + 1, a).includes(']')) { z = open; a = open; }
  // Sin selección: la palabra en kanji donde está el cursor (hacia atrás y hacia delante)
  if (a === z) { while (a > 0 && KANJI.test(v[a - 1])) a--; while (z < v.length && KANJI.test(v[z])) z++; }
  const base = v.slice(a, z);
  if (!base || ![...base].every(c => KANJI.test(c))) return toast('Escribe o selecciona el kanji y pulsa 振');
  const m = /^\[([^\]\n]*)\]/.exec(v.slice(z));
  S.rubyEdit = { t, z, old: m ? m[0].length : 0 };
  const box = $('#rubyPop');
  box.hidden = false;
  box.innerHTML = `<span class="rp-pv" lang="ja" aria-hidden="true"><ruby>${esc(base)}<rt id="rpRt">${esc(m?.[1] || '')}</rt></ruby></span>
    <input id="rpIn" lang="ja" value="${esc(m?.[1] || '')}" placeholder="Lectura (hiragana)" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Lectura de ${esc(base)}">
    ${m ? '<button type="button" class="link small" data-act="ruby-del">Quitar</button>' : ''}
    <button type="button" class="primary small-btn" data-act="ruby-ok">${m ? 'Cambiar' : 'Añadir'}</button>`;
  $('#rpIn').focus();
  $('#rpIn').select();
}
export function rubyApply(remove = false) {
  const r = S.rubyEdit;
  if (!r || !r.t.isConnected) return rubyClose();
  const reading = remove ? '' : ($('#rpIn')?.value || '').replace(/[[\]\n]/g, '').trim();
  const insert = reading ? `[${reading}]` : '';
  const v = r.t.value;
  r.t.value = v.slice(0, r.z) + insert + v.slice(r.z + r.old);
  rubyClose();
  const pos = r.z + insert.length;
  r.t.focus(); r.t.setSelectionRange(pos, pos);
  S.edit.dirty = true; autoGrow(r.t); readEditor(); drawPreview(); rubyLine(r.t);
}
export function rubyClose() {
  S.rubyEdit = null;
  const box = $('#rubyPop');
  if (box) { box.hidden = true; box.innerHTML = ''; }
}
// Editor de «Tapar partes de una imagen»: la imagen, y encima los recuadros (se dibujan arrastrando)
function occEditorHTML(imgText, maskText) {
  const has = !!imageIdIn(imgText), n = parseMasks(maskText).length;
  return `<div class="ef ef-req ef-occ" data-ef="img"><div class="ef-head"><span class="ef-name">Imagen y recuadros<span class="ef-dot" aria-label="necesario">•</span></span>
      <span class="ef-badges">${has ? `<span class="ef-role">${plural(n, 'recuadro', 'recuadros')} · ${plural(n, 'pregunta', 'preguntas')}</span>` : ''}</span></div>
    <textarea data-fld="img" hidden>${esc(imgText || '')}</textarea><textarea data-fld="m" hidden>${esc(maskText || '')}</textarea>
    <div id="occEd">${has ? `${occlusionHTML(imgText, maskText, -1, false, { edit: true })}
      <p class="ef-help">Arrastra sobre la imagen para tapar una parte: cada recuadro será una pregunta. Toca un recuadro para quitarlo.</p>
      <div class="btnrow"><button type="button" class="ghost small-btn" data-act="occ-pick">${icon('image', { size: 15 })} Cambiar imagen</button>${n ? '<button type="button" class="ghost small-btn" data-act="occ-clear">Quitar los recuadros</button>' : ''}</div>`
      : `<button type="button" class="occ-empty" data-act="occ-pick">${icon('image', { size: 22 })}<b>Elegir imagen</b><small>Un mapa, un esquema, un diagrama… (también puedes pegarla)</small></button>`}</div></div>`;
}
export function occFields() { return { img: document.querySelector('[data-fld="img"]'), m: document.querySelector('[data-fld="m"]') }; }
export function occRedraw() {
  const { img, m } = occFields();
  const box = document.querySelector('.ef-occ');
  if (!img || !box) return;
  box.outerHTML = occEditorHTML(img.value, m.value);
  S.edit.dirty = true;
  readEditor(); drawPreview();
}
export async function occSetImage(file) {
  const id = await saveImage(file);
  const { img } = occFields();
  if (!id || !img) return;
  img.value = imgToken(id);
  occRedraw();
}
export function occDelete(k) {
  const { m } = occFields();
  if (!m) return;
  const masks = parseMasks(m.value);
  masks.splice(k, 1);
  m.value = masksToText(masks);
  occRedraw();
}
// Dibujar un recuadro arrastrando sobre la imagen
let occDrag = null;
document.addEventListener('pointerdown', e => {
  const stage = e.target.closest?.('#occStage');
  if (!stage || e.target.closest('.occ-m') || e.button > 0) return;
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'occ-m occ-new';
  stage.appendChild(el);
  occDrag = { r, x0: e.clientX, y0: e.clientY, el };
  stage.setPointerCapture?.(e.pointerId);
});
const occBox = (d, x, y) => {
  const pct = (v, a, len) => Math.min(100, Math.max(0, ((v - a) / len) * 100));
  const xa = pct(d.x0, d.r.left, d.r.width), xb = pct(x, d.r.left, d.r.width), ya = pct(d.y0, d.r.top, d.r.height), yb = pct(y, d.r.top, d.r.height);
  return { x: Math.min(xa, xb), y: Math.min(ya, yb), w: Math.abs(xb - xa), h: Math.abs(yb - ya) };
};
document.addEventListener('pointermove', e => {
  if (!occDrag) return;
  const b = occBox(occDrag, e.clientX, e.clientY);
  Object.assign(occDrag.el.style, { left: b.x + '%', top: b.y + '%', width: b.w + '%', height: b.h + '%' });
});
document.addEventListener('pointerup', e => {
  if (!occDrag) return;
  const b = occBox(occDrag, e.clientX, e.clientY);
  occDrag = null;
  const { m } = occFields();
  if (!m) return;
  const masks = parseMasks(m.value);
  if (b.w < 1.5 || b.h < 1.5) return occRedraw();   // un toque, no un recuadro
  if (masks.length >= MAX_MASKS) { toast(`Como mucho ${MAX_MASKS} recuadros por imagen`); return occRedraw(); }
  masks.push(b);
  m.value = masksToText(masks);
  occRedraw();
});
export function readEditor() {
  const e = S.edit;
  document.querySelectorAll('[data-fld]').forEach(t => { e.fields[t.dataset.fld] = t.value; });
  if ($('#c-hint')) e.hint = $('#c-hint').value;
  return e;
}
export function drawPreview() {
  const e = S.edit, box = $('#pvBody');
  if (!e || !box) return;
  const type = typeIn(getType(e.typeId) || BUILTIN_TYPES[0], edDeck());
  const active = activeTemplates(type, e.fields);
  const tpls = type.templates;
  if (!tpls.some(t => t.id === e.pv)) e.pv = (active[0] || tpls[0]).id;
  const isActive = t => active.some(a => a.id === t.id);
  $('#pvTabs').innerHTML = tpls.length > 1 ? tpls.map(t => `<button type="button" class="pvtab${isActive(t) ? '' : ' off'}" data-pv="${t.id}" aria-pressed="${t.id === e.pv}" title="${isActive(t) ? 'Se creará' : 'Faltan campos para crear esta pregunta'}">${isActive(t) ? icon('check', { size: 13 }) + ' ' : ''}${esc(t.name)}</button>`).join('') : '';
  $('#pvCount').textContent = active.length ? `${active.length} ${active.length === 1 ? 'pregunta' : 'preguntas'}` : 'Faltan campos';
  // En el móvil se ve una cara (Anverso | Reverso); en el ordenador, las dos
  document.querySelectorAll('.pv-sides [data-pvside]').forEach(b => b.setAttribute('aria-pressed', b.dataset.pvside === e.pvSide));
  const tpl = tpls.find(t => t.id === e.pv);
  const model = { type, tpl, fields: e.fields };
  let choice = null;
  if (tpl.mode === 'choice' || tpl.mode === 'clozechoice') {
    const pool = cardList().filter(x => x.deck_id === $('#c-deck')?.value).map(x => x.back).filter(Boolean);
    while (pool.length < 3) pool.push(`Otra opción ${pool.length + 1}`);
    choice = tpl.mode === 'clozechoice' ? clozeChoices(null, model, pool) : { ...choiceOptions(tpl, e.fields, pool), picked: -1 };
  }
  const face = revealed => faceHTML(model, { revealed, typed: null, choice }, { preview: true });
  const f = face(false), b = face(true);
  const state = e.cardId && S.progress.get(e.cardId) ? 'repaso' : 'nueva';
  const reveal = ['flip', 'cloze', 'occlusion'].includes(tpl.mode) ? '<span class="pv-reveal">Ver respuesta</span>' : '';
  const grades = `<div class="pv-grades" aria-hidden="true"><span class="g1">Otra vez</span><span class="g2">Difícil</span><span class="g3">Bien</span><span class="g4">Fácil</span></div>`;
  const plainFront = plain(summarize(type, tpl, e.fields).front).slice(0, 40);
  box.innerHTML = `<div class="pv-card pv-front mode-${tpl.mode}${e.pvSide === 'front' ? ' is-on' : ''}" title="Toca para darle la vuelta">
      <div class="pv-meta"><span>anverso</span><span>${state}</span></div>
      <div class="front">${f.front || '<span class="pv-empty">Rellena los campos…</span>'}</div>${f.ask}${reveal}
    </div>
    <div class="pv-card pv-back mode-${tpl.mode}${e.pvSide === 'back' ? ' is-on' : ''}" title="Toca para darle la vuelta">
      <div class="pv-meta"><span>reverso</span><span>${esc(plainFront)}</span></div>
      ${b.answer ? `<div class="answer">${b.answer}</div>` : `<div class="front">${b.front || ''}</div>`}
      ${grades}
    </div>
    ${!isActive(tpl) ? `<p class="hint pv-miss">Esta pregunta no se creará hasta que rellenes ${esc(missingFor(type, tpl, e.fields))}.</p>` : ''}
    ${active.length > 1 ? `<p class="pv-also">${alsoLine(type, active, tpl)}</p>` : ''}`;
}
// «Con «Doble sentido» también se crea la pregunta biblioteca → kütüphane.»
function alsoLine(type, active, cur) {
  const others = active.filter(t => t.id !== cur.id);
  const s = summarize(type, others[0], S.edit.fields);
  const one = `<b>${esc(plain(s.front).slice(0, 50))}</b> → <b>${esc(plain(s.back).split('\n')[0].slice(0, 50))}</b>`;
  return others.length === 1 ? `Con «${esc(type.name)}» también se crea la pregunta ${one}.` : `Con «${esc(type.name)}» se crean ${active.length} preguntas.`;
}
export function confirmSheet(text, act, label) {
  openSheet(`<h2>${text}</h2><p class="muted">No se puede deshacer.</p>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="danger solid primary" data-act="${act}">${label}</button></div>`);
}
export function shareSheet() {
  const d = S.decks.get(S.deckId);
  const url = shareUrl(d.id);
  openSheet(`<h2>Compartir «${esc(d.name)}»</h2>
    ${d.is_public
      ? `<p>Envía este enlace a tus amigos. Al abrirlo con su cuenta podrán copiarse la lista.</p>
         <input id="shareUrl" readonly value="${esc(url)}" aria-label="Enlace para compartir">
         <div class="btnrow"><button class="primary" data-act="copy-link">Copiar enlace</button><button class="ghost" data-act="toggle-public">Dejar de compartir</button></div>`
      : `<p>Ahora mismo esta lista es privada. Si la compartes, cualquier usuario podrá verla en Explorar y copiarla.</p>
         <button class="primary" data-act="toggle-public">Compartir con la comunidad</button>`}
    <hr style="border:0;border-top:1px solid var(--line);width:100%">
    <p class="small muted">También puedes descargarlo y mandarlo por WhatsApp o email. Se importa desde «Mis listas».</p>
    <div class="btnrow"><button class="ghost" data-act="export-csv">Descargar CSV</button><button class="ghost" data-act="export-deck">Descargar copia Flaski</button></div>
    <p class="hint">El CSV se abre con Excel, Google Sheets o Anki. La copia Flaski (.json) conserva también la descripción de la lista.</p>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button></div>`);
}

/* ===================== guardar ===================== */
export const readIcon = () => ($('#f-icon')?.value || '').slice(0, 16);
const readColor = () => document.querySelector('input[name="f-color"]:checked')?.value || '';
export async function saveDeckForm(form) {
  const id = form.dataset.id;
  const fields = {
    name: $('#d-name').value.trim(), description: $('#d-desc').value.trim(),
    icon: readIcon(), color: readColor(),
    folder_id: $('#d-folder').value || null,
    tags: [...document.querySelectorAll('input[name="f-tag"]:checked')].map(i => i.value),
    pinned: $('#d-pinned').checked, is_public: $('#d-public').checked,
  };
  const nv = $('#d-new').value.trim();
  const isLang = document.querySelector('[data-kind="lang"]')?.getAttribute('aria-pressed') === 'true';
  fields.options = { ...(S.decks.get(id)?.options || {}), newPerDay: nv === '' ? null : Math.max(0, Math.min(500, Math.round(Number(nv) || 0))), preset: $('#d-preset').value,
    lang: isLang ? $('#d-lang').value : '' };
  if (id && fields.is_public) fields.types = deckTypes(id);
  if ($('#d-archived')) fields.archived = $('#d-archived').checked;
  if (!fields.name) return toast('Ponle un nombre a la lista');
  const btn = form.querySelector('[type=submit]'); btn.disabled = true;
  try {
    const d = id ? await api.updateDeck(id, fields) : await api.createDeck({ ...fields, owner: S.uid });
    S.decks.set(d.id, { tags: [], ...d });
    S.pub = null;
    toast(id ? 'Lista guardada' : 'Lista creada');
    go('deck', { deckId: d.id, cardQuery: '' });
  } catch (e) { btn.disabled = false; fail(e); }
}
export async function saveFolderForm(form) {
  const id = form.dataset.id;
  const fields = { name: $('#fo-name').value.trim(), icon: readIcon(), color: readColor(), parent_id: $('#fo-parent').value || null };
  if (!fields.name) return toast('Ponle un nombre a la carpeta');
  const btn = form.querySelector('[type=submit]'); btn.disabled = true;
  try {
    const f = id ? await api.updateFolder(id, fields) : await api.createFolder({ ...fields, owner: S.uid });
    S.folders.set(f.id, f);
    // Creada desde «Mover a otra carpeta»: lo que se movía va a la carpeta nueva
    const moving = !id && S.moveAfterFolder;
    S.moveAfterFolder = null;
    if (moving?.length) { await moveDecks(moving, f.id); return go('decks', { folderId: f.id }); }
    toast(id ? 'Carpeta guardada' : 'Carpeta creada');
    go('decks', { folderId: f.id });
  } catch (e) { btn.disabled = false; fail(e); }
}
// El nombre de una etiqueta: sin la «#» del principio ni espacios alrededor, y como mucho 24 letras
export const TAG_MAX = 24;
export const tagName = s => String(s ?? '').trim().replace(/^#+/, '').trim().slice(0, TAG_MAX);
export async function addTag(name, color = nextTagColor()) {
  name = tagName(name);
  if (!name) return null;
  const existing = [...S.tags.values()].find(t => t.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (existing) return existing;
  const t = await api.createTag({ name, color, owner: S.uid });
  S.tags.set(t.id, t);
  return t;
}
export async function saveTagsSheet() { closeSheet(); render(); }
// Cambia el nombre o el color de una etiqueta y vuelve a pintar la hoja
export async function updateTagFields(id, fields) {
  const t = S.tags.get(id);
  if (!t) return;
  S.tags.set(id, await api.updateTag(id, fields));
  tagsSheet();
}
export function moveSheet(ids) {
  const decks = ids.map(id => S.decks.get(id)).filter(Boolean);
  if (!decks.length) return;
  const cur = decks.length === 1 ? (decks[0].folder_id || '') : null;
  const tree = folderTree(S.folders);
  const row = (id, label, depth, icon) => `<li><button class="moverow" data-move-to="${id}" ${id === cur ? 'aria-current="true"' : ''} style="padding-left:${10 + depth * 18}px">
    ${icon}<span>${label}</span>${id === cur ? '<span class="muted small">aquí está</span>' : ''}</button></li>`;
  openSheet(`<h2 class="sheet-hand">Mover ${decks.length === 1 ? `«${esc(decks[0].name)}»` : `${decks.length} listas`}</h2>
    <p class="muted small">Toca la carpeta de destino.</p>
    <ul class="movelist" data-moving='${esc(JSON.stringify(ids))}'>
      ${row('', 'Sueltos', 0, `<span class="icon">${icon('house', { size: 18 })}</span>`)}
      ${tree.map(f => row(f.id, esc(f.name), f.depth + 1, folderIcon(S.folders.get(f.id)))).join('')}
    </ul>
    <div class="btnrow"><button class="ghost" data-act="new-folder">+ Carpeta nueva</button><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button></div>`);
}
export function addDecksSheet() {
  const here = S.folderId;
  const others = sortDecks([...S.decks.values()].filter(d => (d.folder_id || null) !== here && !d.archived), 'name', new Map());
  if (!others.length) return toast('No hay más listas para traer aquí');
  const where = d => (d.folder_id && S.folders.has(d.folder_id) ? folderPath(S.folders, d.folder_id).map(f => f.name).join(' / ') : 'Mis listas');
  openSheet(`<h2>Añadir listas a «${esc(S.folders.get(here)?.name || '')}»</h2>
    <p class="muted small">Marca las listas que quieres mover a esta carpeta.</p>
    <ul class="picklist">${others.map(d => `<li><label class="pickrow"><input type="checkbox" name="pick-deck" value="${d.id}">${deckIcon(d)}
      <span class="info"><span class="dname">${esc(d.name)}</span><span class="meta">${esc(where(d))}</span></span></label></li>`).join('')}</ul>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-act="confirm-add-decks">Mover aquí</button></div>`);
}
export async function moveDecks(ids, folderId) {
  try {
    for (const id of ids) S.decks.set(id, { tags: [], ...await api.updateDeck(id, { folder_id: folderId }) });
    // El apunte de una lista va con ella (que no se separen)
    for (const p of S.pages.values()) if (ids.includes(p.deck_id) && (p.folder_id || null) !== (folderId || null)) { p.folder_id = folderId || null; savePageSoon(p, 0); }
    const name = folderId ? S.folders.get(folderId)?.name : 'Mis listas';
    toast(ids.length === 1 ? `Movida a «${name}»` : `${ids.length} listas movidas a «${name}»`);
    closeSheet(); render();
  } catch (e) { fail(e); }
}

export async function deleteFolder(id) {
  const f = S.folders.get(id);
  if (!f) return;
  const parent = f.parent_id && S.folders.has(f.parent_id) ? f.parent_id : null;
  // Primero subimos su contenido un nivel, para no perder nada
  for (const d of [...S.decks.values()].filter(d => d.folder_id === id)) S.decks.set(d.id, { tags: [], ...await api.updateDeck(d.id, { folder_id: parent }) });
  for (const sub of [...S.folders.values()].filter(x => x.parent_id === id)) S.folders.set(sub.id, await api.updateFolder(sub.id, { parent_id: parent }));
  for (const p of [...S.pages.values()].filter(x => x.folder_id === id)) { p.folder_id = parent; savePageSoon(p, 0); }
  await api.deleteFolder(id);
  S.folders.delete(id);
  // Su imagen, si ya no la usa nada
  dropFolderImages({ orig: imageOf(f.icon), picked: [] });
}
// Guarda una nota: crea, actualiza o borra sus tarjetas según las plantillas que tengan contenido
// source: { page_id, block_id } si la tarjeta sale de unos apuntes (las ya vinculadas lo conservan)
async function saveNote({ type, fields, deckId, hint = '', tags = [], noteId = null, siblings = [], source = null }) {
  const active = activeTemplates(type, fields);
  if (!active.length) throw new Error(type.templates.some(t => t.mode === 'cloze') ? 'Marca al menos un hueco con {{ }}' : 'Rellena al menos el anverso y la respuesta');
  noteId = noteId || api.newId();
  const existing = siblings.map(id => S.cards.get(id)).filter(Boolean);
  const byTpl = new Map(existing.map(c => [c.template || 't1', c]));
  const base = { deck_id: deckId, type_id: type.id, fields, hint, tags, note_id: noteId };
  const link = source || (existing[0]?.page_id ? { page_id: existing[0].page_id, block_id: existing[0].block_id } : null);
  if (link) Object.assign(base, { page_id: link.page_id, block_id: link.block_id });
  const out = [];
  const toCreate = [];
  for (const tpl of active) {
    const sum = summarize(type, tpl, fields);
    const row = { ...base, template: tpl.id, front: sum.front.slice(0, 2000) || '—', back: sum.back.slice(0, 2000) || '—', note: sum.note.slice(0, 2000) };
    let old = byTpl.get(tpl.id);
    // Si cambiaste de tipo y las plantillas no coinciden, reaprovechamos la tarjeta para no perder su progreso
    if (!old && !out.length && existing.length && !active.some(a => byTpl.has(a.id))) old = existing[0];
    if (old) { byTpl.delete(old.template || 't1'); existing.splice(existing.indexOf(old), 1); out.push(await api.updateCard(old.id, row)); }
    else toCreate.push({ ...row, owner: S.uid, position: Date.now() / 1000 + toCreate.length / 1000 });
  }
  if (toCreate.length) out.push(...await api.createCards(toCreate));
  for (const c of existing) { await api.deleteCard(c.id); S.cards.delete(c.id); S.progress.delete(c.id); }
  for (const c of out) S.cards.set(c.id, c);
  if (S.decks.get(deckId)?.is_public && !type.builtin) refreshDeckTypes(deckId).catch(() => {});
  return out;
}
export async function saveCardForm(form, more) {
  const e = readEditor();
  const type = getType(S.edit.typeId) || BUILTIN_TYPES[0];
  const deckId = $('#c-deck').value;
  if (!deckId) return toast('Crea primero una lista');
  const fields = {};
  for (const f of type.fields) fields[f.id] = String(e.fields[f.id] || '').trim();
  const btns = form.querySelectorAll('button'); btns.forEach(b => { b.disabled = true; });
  try {
    const out = await saveNote({
      type, fields, deckId, hint: (e.hint || '').trim(),
      tags: [...document.querySelectorAll('input[name="f-tag"]:checked')].map(i => i.value),
      noteId: e.noteId, siblings: e.siblings, source: e.source,
    });
    rememberType(deckId, type.id);
    // Primera tarjeta desde unos apuntes: ese mazo queda como el de la página
    const pg = e.source && S.pages.get(e.source.page_id);
    if (pg && !pg.deck_id) { pg.deck_id = deckId; savePageSoon(pg); }
    if (S.session) S.session.st = null;
    toast(e.cardId ? 'Pregunta guardada' : out.length > 1 ? `${out.length} preguntas añadidas` : 'Pregunta añadida');
    if (more) {
      const src = S.edit.side ? e.source : null;
      S.edit.dirty = false; cardForm(null, { deckId, source: src }); S.edit.dirty = false;
      if (S.view === 'deck') renderDeck();
      if (src) render(); setTimeout(() => document.querySelector('[data-fld]')?.focus(), 40); }
    else { S.edit.dirty = false; closeSheet(); render(); }
  } catch (err) { btns.forEach(b => { b.disabled = false; }); fail(err); }
}

/* ---------- Creación rápida: pegar una lista ---------- */
export function quickSheet() {
  const deckId = S.deckId;
  const t = defaultTypeFor(deckId);
  openSheet(`<form data-form="quick" class="cardform quickform">
    <h2 class="sheet-hand">Varias de golpe</h2>
    <p class="muted small">Pega una lista con una pregunta por línea. Cada columna rellena un campo, en orden.</p>
      <label for="q-deck">Lista</label><select id="q-deck">${deckOptions(deckId)}</select>
      <span class="ed-lab">Tipo de pregunta</span>
      <input type="hidden" id="q-type" value="${t.id}"><div class="ed-typebar" id="qTypes">${typeSegs(t.id, deckId, 'data-quick-type')}</div>
      <label for="q-sep">Separador</label><select id="q-sep">
          <option value="auto">Detectar solo</option><option value="	">Tabulador (copiado de Excel)</option><option value=" - ">Guion ( - )</option>
          <option value=";">Punto y coma (;)</option><option value=",">Coma (,)</option><option value=" = ">Igual ( = )</option><option value="|">Barra (|)</option></select>
      <p class="hint" id="qMap"></p>
      <textarea id="q-text" rows="8"></textarea>
      <div id="qPrev"></div>
      <div class="btnrow" style="margin-top:8px"><span class="spacer"></span><button type="button" class="ghost" data-act="close-sheet">Cancelar</button><button type="submit" class="primary" id="qGo" disabled>Crear preguntas</button></div>
      ${typePickerHTML()}
    </form>`);
  drawQuick();
}
// El tipo de «Varias de golpe» (los segmentos y «Más tipos»)
export function setQuickType(id) { const i = $('#q-type'); if (!i || !getType(id)) return; i.value = id; drawQuick(); }
export function openQuickPicker() { openTypePicker(true, { deckId: $('#q-deck').value, sel: $('#q-type').value, apply: setQuickType }); }
// Ejemplo de la hoja según el tipo elegido y el idioma de la lista (una línea por nota)
const QUICK_WORDS = {
  de: [['Haus', 'la casa'], ['Buch', 'el libro'], ['Wasser', 'el agua']], tr: [['ev', 'casa'], ['kitap', 'libro'], ['su', 'agua']],
  ja: [['家', 'casa'], ['本', 'libro'], ['水', 'agua']], en: [['house', 'casa'], ['book', 'libro'], ['water', 'agua']],
  fr: [['maison', 'casa'], ['livre', 'libro'], ['eau', 'agua']], it: [['casa', 'casa'], ['libro', 'libro'], ['acqua', 'agua']],
  pt: [['casa', 'casa'], ['livro', 'libro'], ['água', 'agua']],
};
function quickExample(type, deckId) {
  const words = QUICK_WORDS[deckLang(deckId).split('-')[0]];
  const rows = {
    basic: [['¿Capital de Francia?', 'París'], ['¿Cuántos lados tiene un hexágono?', '6']],
    typing: [['¿Capital de Francia?', 'París'], ['¿Capital de Italia?', 'Roma']],
    'de-noun': [['die', 'Wohnung', 'die Wohnungen', 'el piso'], ['der', 'Bahnhof', 'die Bahnhöfe', 'la estación de tren'], ['das', 'Haus', 'die Häuser', 'la casa']],
    truefalse: [['El agua hierve a 100 °C a nivel del mar', 'V'], ['La Luna tiene luz propia', 'F']],
    number: [['¿En qué año cayó Constantinopla?', '1453'], ['¿Cuántos lados tiene un hexágono?', '6']],
  }[type.id] || (['reverse', 'vocab', 'listen'].includes(type.id) ? words : null);
  // Sin ejemplo para este tipo: los nombres de sus columnas
  return rows ? rows.map(r => r.join(' - ')).join('\n') : type.fields.map(f => f.name.toLocaleLowerCase()).join(' - ');
}
const SEP_NAMES = { '\t': 'tabulador', ',': 'coma', ';': 'punto y coma', '|': 'barra', ':': 'dos puntos' };
function quickRows() {
  const type = getType($('#q-type').value) || BUILTIN_TYPES[0];
  const lines = $('#q-text').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // «Detectar solo» mira todas las líneas a la vez (así también la coma, si sale igual en todas)
  const sep = $('#q-sep').value === 'auto' ? detectSep(lines) || 'auto' : $('#q-sep').value;
  const notes = lines.map(l => {
    const cols = splitQuick(l, sep);
    const fields = {};
    type.fields.forEach((f, i) => { fields[f.id] = i === type.fields.length - 1 && cols.length > type.fields.length ? cols.slice(i).join(' ') : (cols[i] || ''); });
    return fields;
  });
  return { type, notes, sep, valid: notes.filter(f => activeTemplates(type, f).length) };
}
export function drawQuick() {
  const { type, notes, valid, sep } = quickRows();
  $('#qTypes').innerHTML = typeSegs(type.id, $('#q-deck').value, 'data-quick-type');
  showSelectedSeg();
  $('#qMap').innerHTML = type.fields.map((f, i) => `Columna ${i + 1} → <b>${esc(f.name)}</b>`).join(' · ')
    + ($('#q-sep').value === 'auto' && notes.length && sep !== 'auto' ? ` · separador: <b>${esc(SEP_NAMES[sep.trim() || sep] || `«${sep.trim()}»`)}</b>` : '');
  $('#q-text').placeholder = quickExample(type, $('#q-deck').value);
  const cards = valid.reduce((n, f) => n + activeTemplates(type, f).length, 0);
  $('#qPrev').innerHTML = notes.length ? `<div class="qtable-wrap"><table class="qtable"><thead><tr>${type.fields.map(f => `<th>${esc(f.name)}</th>`).join('')}</tr></thead>
    <tbody>${notes.slice(0, 5).map(f => `<tr class="${activeTemplates(type, f).length ? '' : 'bad'}">${type.fields.map(x => `<td>${esc(f[x.id] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="hint">${notes.length > 5 ? `…y ${notes.length - 5} líneas más. ` : ''}Se crearán <b>${cards}</b> ${cards === 1 ? 'pregunta' : 'preguntas'}${notes.length - valid.length ? ` (${notes.length - valid.length} líneas incompletas se saltarán)` : ''}.</p>` : '';
  $('#qGo').disabled = !valid.length;
  // Cada línea es una nota; según el tipo, una nota da una o varias preguntas
  const nq = `${cards} ${cards === 1 ? 'pregunta' : 'preguntas'}`;
  $('#qGo').textContent = !cards ? 'Crear preguntas' : cards === valid.length ? `Crear ${nq}` : `Crear ${valid.length} ${valid.length === 1 ? 'nota' : 'notas'} · ${nq}`;
}
export async function saveQuick(form) {
  const { type, valid } = quickRows();
  const deckId = $('#q-deck').value;
  if (!valid.length || !deckId) return;
  const btn = $('#qGo'); btn.disabled = true; btn.textContent = 'Creando…';
  try {
    const rows = [];
    const base = Date.now() / 1000;
    valid.forEach((fields, n) => {
      const noteId = api.newId();
      for (const tpl of activeTemplates(type, fields)) {
        const sum = summarize(type, tpl, fields);
        rows.push({ deck_id: deckId, owner: S.uid, type_id: type.id, template: tpl.id, fields, note_id: noteId, hint: '', tags: [],
          front: sum.front.slice(0, 2000) || '—', back: sum.back.slice(0, 2000) || '—', note: sum.note.slice(0, 2000), position: base + rows.length / 1000 });
      }
    });
    const created = await api.createCards(rows);
    for (const c of created) S.cards.set(c.id, c);
    rememberType(deckId, type.id);
    toast(`${created.length} preguntas creadas`);
    go('deck', { deckId, cardQuery: '' });
  } catch (e) { btn.disabled = false; drawQuick(); fail(e); }
}

/* ---------- Tipos de tarjeta: gestor y editor ---------- */
export function typeUsage(id) { return cardList().filter(c => c.type_id === id).length; }
export function typesSheet() {
  const scopeText = t => { const s = typeScope(t); return s === 'general' ? 'Cualquier tema' : s === 'lang' ? 'Idiomas' : s.map(b => LANGS.find(l => l.id.split('-')[0] === b)?.label || b).join(', '); };
  const row = (t, own) => `<li class="typerow${typeHidden(t) ? ' is-hidden' : ''}"><span class="icon">${typeIcon(t, 20)}</span>
    <span class="info"><span class="dname">${esc(t.name)}</span><span class="meta">${esc(scopeText(t))} · ${esc(t.description || `${t.fields.length} campos · ${t.templates.length} ${t.templates.length === 1 ? 'pregunta' : 'preguntas'} por nota`)}</span></span>
    <button class="ghost small-btn" data-hide-type="${t.id}" aria-pressed="${typeHidden(t)}" title="${typeHidden(t) ? 'Volver a mostrarlo en el editor' : 'No mostrarlo en el editor'}">${typeHidden(t) ? 'Mostrar' : 'Ocultar'}</button>
    ${own ? `<button class="ghost small-btn" data-edit-type="${t.id}">Editar</button>` : `<button class="ghost small-btn" data-copy-type="${t.id}">Personalizar</button>`}</li>`;
  // Por para qué sirven: cualquier tema, cualquier idioma y luego cada idioma (los tuyos primero en cada grupo)
  const groups = new Map();
  const keyOf = t => { const sc = typeScope(t); return sc === 'general' ? '0' : sc === 'lang' ? '1' : '2' + scopeText(t); };
  const own = [...S.types.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  for (const [t, mine] of [...own.map(t => [t, true]), ...BUILTIN_TYPES.map(t => [t, false])]) {
    const k = keyOf(t);
    if (!groups.has(k)) groups.set(k, { title: k === '0' ? 'Para cualquier tema' : k === '1' ? 'Para idiomas' : `Para ${scopeText(t).toLowerCase()}`, rows: [] });
    groups.get(k).rows.push(row(t, mine));
  }
  openSheet(`<h2>Tipos de pregunta</h2>
    <p class="muted small">Un tipo define qué campos rellenas y qué preguntas se crean con ellos. En el editor solo salen los que sirven para la lista (los de japonés, en listas de japonés). Los que ocultes no saldrán en el editor (siguen en «Ver todos los tipos»).</p>
    ${[...groups].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([, g]) => `<h3 class="sub-h">${esc(g.title)}</h3><ul class="typelist">${g.rows.join('')}</ul>`).join('')}
    <div class="btnrow"><button class="primary" data-act="new-type">+ Tipo nuevo</button><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button></div>`);
}
export function typeEditor(t) {
  S.typeEdit = JSON.parse(JSON.stringify(t));
  drawTypeEditor();
}
export function drawTypeEditor() {
  const t = S.typeEdit;
  const fieldOpts = sel => t.fields.map(f => `<option value="${f.id}" ${f.id === sel ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
  const checks = (tpl, side) => t.fields.map(f => `<label class="fcheck"><input type="checkbox" data-tside="${side}" value="${f.id}" ${tpl[side].includes(f.id) ? 'checked' : ''}>${esc(f.name)}</label>`).join('');
  const sample = Object.fromEntries(t.fields.map(f => [f.id, f.name]));
  if (t.templates.some(x => x.mode === 'cloze')) { const tpl = t.templates.find(x => x.mode === 'cloze'); sample[tpl.front[0]] = `Ev{{de}}yim (${t.fields.find(f => f.id === tpl.front[0])?.name || ''})`; }
  const pvTpl = t.templates[0];
  let pv = '';
  if (pvTpl && pvTpl.front.length) {
    const st = { revealed: true, typed: null, choice: pvTpl.mode === 'choice' ? { correct: sample[pvTpl.answer] || 'Respuesta', opts: [sample[pvTpl.answer] || 'Respuesta', 'Opción B', 'Opción C', 'Opción D'], picked: -1 } : null };
    const f = faceHTML({ type: t, tpl: pvTpl, fields: sample }, st, { preview: true });
    pv = `<div class="card card-pv mode-${pvTpl.mode}"><div class="front">${f.front}</div>${f.ask}<div class="answer">${f.answer}</div></div>`;
  }
  openSheet(`<h2>${t.id ? 'Editar tipo' : 'Tipo nuevo'}</h2>
    <form data-form="type" class="cardform typeform">
      <div class="two"><div><label for="ty-name">Nombre</label><input id="ty-name" maxlength="60" value="${esc(t.name)}" required></div>
        <div><label for="ty-icon">Icono</label><input id="ty-icon" maxlength="8" value="${esc(t.icon || '')}" placeholder="Emoji (opcional)"></div></div>
      <label for="ty-desc">Descripción (opcional)</label><input id="ty-desc" maxlength="300" value="${esc(t.description || '')}">

      <h3 class="sub-h">1 · Campos</h3>
      <p class="hint">Lo que rellenarás en cada nota. Si eliges un idioma, el campo tendrá botón de audio. «Idioma de la lista» y «Tu idioma» se adaptan a cada lista: el mismo tipo sirve para turco, alemán o japonés.</p>
      <ol class="tfields">${t.fields.map((f, i) => `<li data-fi="${i}">
        <input class="tf-name" value="${esc(f.name)}" maxlength="40" aria-label="Nombre del campo ${i + 1}">
        <select class="tf-lang" aria-label="Idioma del audio"><option value="" ${!f.lang ? 'selected' : ''}>Sin audio</option>
          <optgroup label="Según la lista">${LANG_ROLES.map(l => `<option value="${l.id}" ${l.id === f.lang ? 'selected' : ''}>${l.label}</option>`).join('')}</optgroup>
          <optgroup label="Siempre el mismo">${LANGS.filter(l => l.id).map(l => `<option value="${l.id}" ${l.id === f.lang ? 'selected' : ''}>${l.label}</option>`).join('')}</optgroup></select>
        <label class="tf-auto" title="Reproducir solo al aparecer"><input type="checkbox" class="tf-autoplay" ${f.autoplay ? 'checked' : ''} ${f.lang ? '' : 'disabled'}>Auto</label>
        <span class="tf-btns"><button type="button" class="iconbtn" data-fmove="${i}:-1" aria-label="Subir" ${i ? '' : 'disabled'}>${icon('arrow-up', { size: 15 })}</button><button type="button" class="iconbtn" data-fmove="${i}:1" aria-label="Bajar" ${i < t.fields.length - 1 ? '' : 'disabled'}>${icon('arrow-down', { size: 15 })}</button><button type="button" class="iconbtn danger" data-fdel="${i}" aria-label="Quitar campo" ${t.fields.length > 1 ? '' : 'disabled'}>${icon('x', { size: 15 })}</button></span>
      </li>`).join('')}</ol>
      <button type="button" class="ghost small-btn" data-act="add-field">+ Campo</button>

      <h3 class="sub-h">2 · Preguntas que se crean</h3>
      <p class="hint">Cada una genera una pregunta por nota. Por ejemplo, una de «turco → español» y otra de «español → turco».</p>
      <div class="ttpls">${t.templates.map((tpl, i) => `<fieldset class="ttpl" data-ti="${i}">
        <div class="two"><div><label>Nombre</label><input class="tt-name" value="${esc(tpl.name)}" maxlength="60"></div>
          <div><label>Cómo se estudia</label><select class="tt-mode">${MODES.filter(m => !m.builtinOnly || m.id === tpl.mode).map(m => `<option value="${m.id}" ${m.id === tpl.mode ? 'selected' : ''}>${m.label}</option>`).join('')}</select></div></div>
        <p class="hint">${esc(MODES.find(m => m.id === tpl.mode)?.help || '')}</p>
        ${tpl.mode === 'cloze'
          ? `<label>Campo con los huecos</label><select class="tt-cloze">${fieldOpts(tpl.front[0])}</select>`
          : `<label>Se ve delante${['listen', 'order'].includes(tpl.mode) ? ' (opcional)' : ''}</label><div class="fchecks">${checks(tpl, 'front')}</div>`}
        ${NEEDS_ANSWER.includes(tpl.mode) ? `<label>${{ type: 'Respuesta correcta', choice: 'Respuesta correcta', draw: 'Lo que hay que escribir a mano', listen: 'Lo que se escucha y se escribe', order: 'Frase correcta (las piezas)' }[tpl.mode]}</label><select class="tt-answer">${fieldOpts(tpl.answer)}</select>` : ''}
        ${tpl.mode === 'draw' ? `<label class="check"><input type="checkbox" class="tt-guide" ${tpl.guide ? 'checked' : ''}><span>Mostrar la silueta como guía <span class="hint">(para calcar; desmárcalo para escribir de memoria)</span></span></label>` : ''}
        <label class="check"><input type="checkbox" class="tt-hideruby" ${tpl.hideRuby ? 'checked' : ''}><span>Ocultar el furigana delante <span class="hint">(漢字[かんじ] se lee solo al responder)</span></span></label>
        ${tpl.mode === 'choice' ? `<label>Respuestas incorrectas (opcional)</label><select class="tt-wrong"><option value="">Coger de otras preguntas de la lista</option>${fieldOpts(tpl.wrong)}</select>` : ''}
        <label>${tpl.mode === 'flip' ? 'Se ve detrás' : 'Se ve también al responder'}</label><div class="fchecks">${checks(tpl, 'back')}</div>
        <div class="btnrow"><span class="spacer"></span><button type="button" class="ghost small-btn danger" data-tdel="${i}" ${t.templates.length > 1 ? '' : 'disabled'}>Quitar esta pregunta</button></div>
      </fieldset>`).join('')}</div>
      <button type="button" class="ghost small-btn" data-act="add-template">+ Pregunta</button>

      <h3 class="sub-h">Vista previa</h3>${pv || '<p class="hint">Elige qué campos se ven delante.</p>'}
      <div class="btnrow" style="margin-top:10px">${t.id ? '<button type="button" class="ghost danger" data-act="delete-type">Borrar tipo</button>' : ''}<span class="spacer"></span>
        <button type="button" class="ghost" data-act="manage-types">Volver</button><button type="submit" class="primary">Guardar tipo</button></div>
    </form>`);
}
// Lee el formulario del editor de tipos y lo vuelca en S.typeEdit
export function readTypeEditor() {
  const t = S.typeEdit;
  if (!t || !$('#ty-name')) return t;
  t.name = $('#ty-name').value; t.icon = $('#ty-icon').value.trim(); t.description = $('#ty-desc').value;
  document.querySelectorAll('[data-fi]').forEach(li => {
    const f = t.fields[+li.dataset.fi];
    f.name = li.querySelector('.tf-name').value;
    f.lang = li.querySelector('.tf-lang').value;
    f.autoplay = !!f.lang && li.querySelector('.tf-autoplay').checked;
  });
  document.querySelectorAll('[data-ti]').forEach(fs => {
    const tpl = t.templates[+fs.dataset.ti];
    tpl.name = fs.querySelector('.tt-name').value;
    const mode = fs.querySelector('.tt-mode').value;
    if (fs.querySelector('.tt-cloze')) tpl.front = [fs.querySelector('.tt-cloze').value];
    else tpl.front = [...fs.querySelectorAll('[data-tside="front"]:checked')].map(i => i.value);
    tpl.back = [...fs.querySelectorAll('[data-tside="back"]:checked')].map(i => i.value);
    if (fs.querySelector('.tt-answer')) tpl.answer = fs.querySelector('.tt-answer').value;
    if (fs.querySelector('.tt-wrong')) tpl.wrong = fs.querySelector('.tt-wrong').value;
    if (fs.querySelector('.tt-guide')) tpl.guide = fs.querySelector('.tt-guide').checked;
    tpl.hideRuby = !!fs.querySelector('.tt-hideruby')?.checked;
    if (mode !== tpl.mode) {
      tpl.mode = mode;
      if (mode === 'cloze') tpl.front = [tpl.front[0] || t.fields[0].id];
      if (NEEDS_ANSWER.includes(mode) && !tpl.answer) tpl.answer = t.fields.find(f => !tpl.front.includes(f.id))?.id || t.fields[0].id;
    }
  });
  return t;
}
export async function saveTypeEditor() {
  const t = readTypeEditor();
  t.name = t.name.trim();
  if (!t.name) return toast('Ponle un nombre al tipo');
  t.fields.forEach((f, i) => { f.name = f.name.trim() || `Campo ${i + 1}`; });
  for (const tpl of t.templates) {
    tpl.name = tpl.name.trim() || 'Pregunta';
    if (!tpl.front.length && !['listen', 'order'].includes(tpl.mode)) return toast(`En «${tpl.name}» elige al menos un campo para delante`);
    if (NEEDS_ANSWER.includes(tpl.mode) && !tpl.answer) return toast(`En «${tpl.name}» elige la respuesta correcta`);
    if (tpl.mode === 'listen' && !t.fields.find(f => f.id === tpl.answer)?.lang) return toast(`En «${tpl.name}» el campo que se escucha necesita un idioma de audio`);
    if (tpl.mode !== 'choice') delete tpl.wrong;
    if (tpl.mode !== 'draw') delete tpl.guide;
    if (!NEEDS_ANSWER.includes(tpl.mode)) delete tpl.answer;
  }
  const row = { name: t.name.slice(0, 60), icon: t.icon.slice(0, 16), description: (t.description || '').slice(0, 300), fields: t.fields, templates: t.templates };
  try {
    const saved = t.id ? await api.updateType(t.id, row) : await api.createType({ ...row, owner: S.uid });
    S.types.set(saved.id, saved);
    // Si algún mazo compartido usa este tipo, actualizamos su copia
    for (const d of S.decks.values()) if (d.is_public && cardList().some(c => c.deck_id === d.id && c.type_id === saved.id)) refreshDeckTypes(d.id).catch(() => {});
    toast('Tipo guardado');
    S.typeEdit = null;
    if (S.edit) { closeSheet(); return cardForm(null, { deckId: S.deckId }); }
    typesSheet();
  } catch (e) { fail(e); }
}

// Copia de los tipos personalizados que usa un mazo, para compartirlo o exportarlo tal cual
export function deckTypes(deckId) {
  const ids = new Set(cardList().filter(c => c.deck_id === deckId).map(c => c.type_id));
  return [...S.types.values()].filter(t => ids.has(t.id)).map(({ id, name, icon, description, fields, templates }) => ({ id, name, icon, description, fields, templates }));
}
async function refreshDeckTypes(deckId) {
  const d = await api.updateDeck(deckId, { types: deckTypes(deckId) });
  S.decks.set(d.id, { tags: [], ...d });
}
// Crea en tu cuenta los tipos personalizados que trae un mazo ajeno y devuelve la traducción de ids
// JSON con las claves ordenadas: Supabase no conserva el orden de las claves, así que sin esto dos tipos iguales no lo parecen
const canonJSON = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(y => [y, x[y]])) : x));
export async function adoptTypes(types = []) {
  const map = new Map();
  for (const t of types || []) {
    if (!t || !Array.isArray(t.fields) || !Array.isArray(t.templates) || BUILTIN_TYPES.some(b => b.id === t.id)) continue;
    const same = [...S.types.values()].find(x => x.name === t.name && canonJSON(x.fields) === canonJSON(t.fields) && canonJSON(x.templates) === canonJSON(t.templates));
    if (same) { map.set(t.id, same.id); continue; }
    const created = await api.createType({ owner: S.uid, name: String(t.name || 'Tipo').slice(0, 60), icon: String(t.icon || '').slice(0, 16), description: String(t.description || '').slice(0, 300), fields: t.fields, templates: t.templates });
    S.types.set(created.id, created);
    map.set(t.id, created.id);
  }
  return map;
}

/* ---------- Idioma de los mazos: migración de lo anterior ---------- */
// Antes el idioma iba en los tipos (Vocabulario, Dictado y Ordenar frase en turco, y copias como
// «Vocabulario · Japonés» para el resto). Ahora es del mazo. Esto se hace una vez por mazo y por copia.
const LEGACY_LANG = { vocab: 'tr-TR', listen: 'tr-TR', order: 'tr-TR', kanji: 'ja-JP', 'de-noun': 'de-DE' };
function guessDeckLang(d) {
  const votes = new Map();
  const vote = l => { if (l) votes.set(l, (votes.get(l) || 0) + 1); };
  for (const c of cardList()) {
    if (c.deck_id !== d.id || !c.fields || !Object.keys(c.fields).length) continue;
    const t = getType(c.type_id);
    if (!t) continue;
    if (t.builtin) { vote(LEGACY_LANG[t.id]); continue; }
    vote(t.fields.map(f => f.lang).find(l => l && !l.startsWith('@') && baseLang(l) !== 'es'));
  }
  if (votes.size) return [...votes].sort((a, b) => b[1] - a[1])[0][0];
  const src = String(d.source || '');
  if (src.includes('incluido:turco')) return 'tr-TR';
  if (src.includes('incluido:japones')) return 'ja-JP';
  // Por el nombre: «Turco básico», «Alemán · La casa»…
  const name = ` ${norm(d.name).replace(/[^\p{L}]+/gu, ' ')} `;
  return LANGS.find(l => l.id && l.id !== 'es-ES' && name.includes(` ${norm(l.label.split(' ')[0])} `))?.id || '';
}
// «Vocabulario · Japonés» creado al importar con el formato anterior → el tipo incluido del que salió
function legacyCopyOf(t) {
  const m = /^(.+) · (.+)$/.exec(t.name || '');
  return m ? BUILTIN_TYPES.find(b => b.name === m[1] && JSON.stringify(b.templates) === JSON.stringify(t.templates)) || null : null;
}
// Se aplica en memoria en el acto (para pintar ya con el idioma) y se guarda después; si no se puede
// guardar (sin red), se repite la próxima vez que se cargue.
let dedupedFor = null;
export async function dedupeTypes() {
  if (dedupedFor === S.uid || S.fromCache) return;
  dedupedFor = S.uid;
  const sig = t => canonJSON([t.name, t.fields, t.templates]);
  const first = new Map();
  const list = [...S.types.values()].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  for (const t of list) {
    const keep = first.get(sig(t));
    if (!keep) { first.set(sig(t), t); continue; }
    try {
      await api.retypeCards(t.id, keep.id);
      for (const c of S.cards.values()) if (c.type_id === t.id) c.type_id = keep.id;
      await api.deleteType(t.id);
      S.types.delete(t.id);
    } catch (e) { console.warn('No se ha podido juntar el tipo repetido', t.name, e); }
  }
}
export function migrateDeckLangs() {
  const decks = [...S.decks.values()].filter(x => !x.options || !('lang' in x.options));
  for (const d of decks) d.options = { ...(d.options || {}), lang: guessDeckLang(d) };
  const copies = [...S.types.values()].map(t => [t, legacyCopyOf(t)]).filter(([, base]) => base);
  const touched = new Set();
  for (const [t, base] of copies) {
    for (const c of S.cards.values()) if (c.type_id === t.id) { c.type_id = base.id; touched.add(c.deck_id); }
    S.types.delete(t.id);
  }
  if (S.fromCache || (!decks.length && !copies.length)) return Promise.resolve();
  return (async () => {
    for (const d of decks) { try { await api.updateDeck(d.id, { options: d.options }); } catch {} }
    for (const [t, base] of copies) { try { await api.retypeCards(t.id, base.id); await api.deleteType(t.id); } catch {} }
    for (const id of touched) if (S.decks.get(id)?.is_public) refreshDeckTypes(id).catch(() => {});
  })();
}
