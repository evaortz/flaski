// Flaski · papelera: lo borrado (una lista, un apunte o una carpeta entera con lo que tiene dentro) se queda aquí
// 30 días con sus preguntas y tu progreso. En la base de datos solo se marca con «deleted_at»; al cargar, lo marcado
// sale de S.decks / S.pages / S.folders (y sus preguntas y su progreso, de S.cards / S.progress) y se guarda en S.trash.
// Lo que pasa de 30 días se borra del todo al abrir la app.
import * as api from '../api.js';
import { icon } from '../icons.js';
import { $, main, S, esc, toast, toastAction, fail, deckIcon, folderIcon } from '../comun.js';
import { plural } from './mazos.js';
import { openSheet, closeSheet } from './editor.js';
import { pageRow } from './apuntes.js';
import { imageIdsOf, deleteImage } from '../media.js';
import { go, render } from '../app.js';

const DAY = 864e5, KEEP = 30;
const keyOf = e => `${e.kind}:${e.id}`;
const at = x => (x.deleted_at ? new Date(x.deleted_at).getTime() : Date.now());
export const trashList = () => [...(S.trash || new Map()).values()].sort((a, b) => b.at - a.at);
export const daysLeft = e => Math.max(0, Math.ceil((e.at + KEEP * DAY - Date.now()) / DAY));
const nameOf = e => (e.kind === 'page' ? e.item.title || 'Sin título' : e.item.name || 'Sin nombre');

/* ---------------- dentro y fuera de S ---------------- */
// Saca algo de la app y lo guarda en la papelera (con todo lo que cuelga de ello)
function stash(kind, x) {
  const e = { kind, id: x.id, at: at(x), item: x, folders: [], decks: [], pages: [], cards: [], progress: [] };
  const takeDeck = d => {
    S.decks.delete(d.id); e.decks.push(d);
    for (const c of [...S.cards.values()]) {
      if (c.deck_id !== d.id) continue;
      S.cards.delete(c.id); e.cards.push(c);
      if (S.progress.has(c.id)) { e.progress.push([c.id, S.progress.get(c.id)]); S.progress.delete(c.id); }
    }
  };
  if (kind === 'deck') takeDeck(x);
  else if (kind === 'page') { S.pages.delete(x.id); e.pages.push(x); }
  else {
    // La carpeta entera: sus subcarpetas, listas y apuntes (lo que ya estaba en la papelera por su cuenta, no)
    const ids = new Set([x.id]);
    for (let grew = true; grew;) { grew = false; for (const f of S.folders.values()) if (!ids.has(f.id) && ids.has(f.parent_id) && !f.deleted_at) { ids.add(f.id); grew = true; } }
    for (const id of ids) { const f = S.folders.get(id); S.folders.delete(id); if (id !== x.id) e.folders.push(f); }
    for (const d of [...S.decks.values()]) if (ids.has(d.folder_id) && !d.deleted_at) takeDeck(d);
    for (const p of [...S.pages.values()]) if (ids.has(p.folder_id) && !p.deleted_at) { S.pages.delete(p.id); e.pages.push(p); }
  }
  S.trash.set(keyOf(e), e);
  return e;
}
function unstash(e) {
  if (e.kind === 'folder') S.folders.set(e.item.id, e.item);
  for (const f of e.folders) S.folders.set(f.id, f);
  for (const d of e.decks) S.decks.set(d.id, d);
  for (const p of e.pages) S.pages.set(p.id, p);
  for (const c of e.cards) S.cards.set(c.id, c);
  for (const [id, p] of e.progress) S.progress.set(id, p);
  S.trash.delete(keyOf(e));
}
// Al cargar los datos: lo marcado como borrado pasa a la papelera
export function splitTrash() {
  S.trash = new Map();
  for (const f of [...S.folders.values()]) if (f.deleted_at && S.folders.has(f.id)) stash('folder', f);
  for (const d of [...S.decks.values()]) if (d.deleted_at) stash('deck', d);
  for (const p of [...S.pages.values()]) if (p.deleted_at) stash('page', p);
}
// Marca (o desmarca, con null) en la base de datos
async function mark(kind, id, when, fields = {}) {
  if (kind === 'deck') return api.updateDeck(id, { deleted_at: when, ...fields });
  if (kind === 'folder') return api.updateFolder(id, { deleted_at: when, ...fields });
  return api.trashPage(id, when, fields);
}

/* ---------------- borrar, deshacer, recuperar y borrar del todo ---------------- */
const LABEL = { deck: 'Lista', page: 'Apunte', folder: 'Carpeta' };
export async function trashItem(kind, id) {
  const x = kind === 'deck' ? S.decks.get(id) : kind === 'page' ? S.pages.get(id) : S.folders.get(id);
  if (!x) return null;
  const when = new Date().toISOString();
  await mark(kind, id, when);
  x.deleted_at = when;
  const e = stash(kind, x);
  if (kind === 'deck') S.pub = null;
  toastAction(`${LABEL[kind]} en la papelera`, 'Deshacer', () => undoTrash(e), { icon: 'trash-2' });
  return e;
}
// «Deshacer»: vuelve exactamente donde estaba
async function undoTrash(e) {
  try { await mark(e.kind, e.id, null); } catch (err) { return fail(err); }
  e.item.deleted_at = null;
  unstash(e);
  toast(`${LABEL[e.kind]} recuperad${e.kind === 'page' ? 'o' : 'a'}`);
  render();
}
// Dónde estaba (la carpeta, si sigue existiendo; si no, Biblioteca)
const placeOf = e => { const f = e.kind === 'folder' ? e.item.parent_id : e.item.folder_id; return f && S.folders.has(f) ? f : null; };
const siblingsIn = (e, folder) => e.kind === 'deck' ? [...S.decks.values()].filter(d => (d.folder_id || null) === folder).map(d => d.name)
  : e.kind === 'page' ? [...S.pages.values()].filter(p => (p.folder_id || null) === folder).map(p => p.title)
  : [...S.folders.values()].filter(f => (f.parent_id || null) === folder).map(f => f.name);
export async function restoreItem(e, folder = placeOf(e)) {
  const x = e.item, nameKey = e.kind === 'page' ? 'title' : 'name', placeKey = e.kind === 'folder' ? 'parent_id' : 'folder_id';
  // Si ya hay otra con el mismo nombre en ese sitio: «(recuperada)»
  const taken = new Set(siblingsIn(e, folder).map(n => String(n || '').trim().toLowerCase()));
  const name = taken.has(String(x[nameKey] || '').trim().toLowerCase()) && x[nameKey] ? `${x[nameKey]} (recuperad${e.kind === 'page' ? 'o' : 'a'})` : x[nameKey];
  const fields = { [placeKey]: folder };
  if (name !== x[nameKey]) fields[nameKey] = name;
  if (e.kind === 'page') await api.trashPage(e.id, null, fields);
  else await mark(e.kind, e.id, null, fields);
  Object.assign(x, fields, { deleted_at: null });
  unstash(e);
  const where = folder ? `«${S.folders.get(folder)?.name}»` : 'Biblioteca';
  const open = () => (e.kind === 'deck' ? go('deck', { deckId: e.id, cardQuery: '' }) : e.kind === 'page' ? go('page', { pageId: e.id }) : go('decks', { folderId: e.id }));
  toastAction(`«${name}» recuperad${e.kind === 'page' ? 'o' : 'a'} en ${where}`, 'Ver', open, { icon: 'check' });
  return e;
}
// Las imágenes de lo que se ha borrado del todo, si ya no las usa nada (ni lo que queda ni lo demás de la papelera):
// fuera del navegador y, con cuenta, del almacén «media»
const foldersOf = e => [...(e.kind === 'folder' ? [e.item] : []), ...e.folders];
async function dropImages(e) {
  const ids = imageIdsOf({ cards: e.cards, pages: e.pages, folders: foldersOf(e) });
  if (!ids.size) return;
  const rest = [...S.trash.values()];
  const used = imageIdsOf({ cards: [...S.cards.values(), ...rest.flatMap(x => x.cards)], pages: [...S.pages.values(), ...rest.flatMap(x => x.pages)], folders: [...S.folders.values(), ...rest.flatMap(foldersOf)] });
  for (const id of ids) if (!used.has(id)) await deleteImage(id).catch(() => {});
}
// Borrar del todo (con todo lo que llevaba dentro)
async function purge(e) {
  if (e.kind === 'deck') await api.deleteDeck(e.id);
  else if (e.kind === 'page') await api.deletePage(e.id);
  else {
    for (const d of e.decks) await api.deleteDeck(d.id);
    for (const p of e.pages) await api.deletePage(p.id);
    for (const f of [...e.folders].reverse()) await api.deleteFolder(f.id);
    await api.deleteFolder(e.id);
  }
  S.trash.delete(keyOf(e));
  await dropImages(e);
}
// Al abrir la app: lo que lleva más de 30 días en la papelera se borra del todo
export async function purgeExpired() {
  for (const e of trashList()) if (Date.now() - e.at > KEEP * DAY) await purge(e).catch(() => {});
}

/* ---------------- textos ---------------- */
function contents(e) {
  const n = e.decks.length, p = e.pages.length, f = e.folders.length;
  return [n && plural(n, 'lista', 'listas'), p && plural(p, 'apunte', 'apuntes'), f && plural(f, 'carpeta', 'carpetas')].filter(Boolean).join(' y ').replace(/ y (?=.* y )/, ', ');
}
function metaOf(e) {
  if (e.kind === 'deck') return `lista · ${plural(e.cards.length, 'pregunta', 'preguntas')}`;
  if (e.kind === 'folder') return `carpeta${contents(e) ? ` · ${contents(e)}` : ' vacía'}`;
  const empty = !(e.item.blocks || []).some(b => String(b.text || '').trim() || b.src);
  return empty ? 'apunte vacío' : 'apunte';
}
const fem = e => e.kind !== 'page';
function whenText(e, long = true) {
  const d = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(e.at).setHours(0, 0, 0, 0)) / DAY);
  if (!long) return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : new Date(e.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
  return d <= 0 ? `borrad${fem(e) ? 'a' : 'o'} hoy` : d === 1 ? `borrad${fem(e) ? 'a' : 'o'} ayer` : `hace ${d} días`;
}
// El icono del tipo (lista, carpeta o apunte), como en los botones de Biblioteca
const kindIcon = e => icon(e.kind === 'deck' ? 'copy' : e.kind === 'folder' ? 'folder' : 'file-text', { size: 20 });
// Para Ajustes › Datos: «3 cosas · lo más antiguo se borra del todo en 3 días»
export function trashSummary() {
  const list = trashList();
  if (!list.length) return 'Vacía. Lo que borres se queda aquí 30 días.';
  const min = Math.min(...list.map(daysLeft));
  return `${plural(list.length, 'cosa', 'cosas')} · lo más antiguo se borra del todo ${min <= 0 ? 'hoy' : min === 1 ? 'mañana' : `en ${min} días`}.`;
}

/* ---------------- la pantalla ---------------- */
export function renderTrash() {
  const list = trashList();
  const row = e => {
    const left = daysLeft(e);
    return `<li class="tr-row" data-trash-key="${esc(keyOf(e))}"><span class="tr-ic">${kindIcon(e)}</span>
      <span class="tr-t"><b>${esc(nameOf(e))}</b><small>${esc(metaOf(e))}<span class="tr-when-m"> · ${whenText(e)}</span></small></span>
      <span class="tr-when">${whenText(e, false)}</span>
      <span class="tr-left${left <= 3 ? ' soon' : ''}">${left === 1 ? '1 día' : `${left} días`}</span>
      <span class="tr-btns"><button type="button" class="primary small-btn" data-tr="restore" data-key="${esc(keyOf(e))}">${icon('rotate-ccw', { size: 16 })} Recuperar</button><button type="button" class="ghost small-btn" data-tr="ask-purge" data-key="${esc(keyOf(e))}">Borrar ya</button></span></li>`;
  };
  main.innerHTML = `<div class="tr-page"><div class="crumbs-row"><button class="back-round" data-nav="library" aria-label="Volver a Biblioteca">${icon('chevron-left', { size: 22 })}</button><button class="link crumb-link" data-nav="library">Biblioteca ›</button></div>
    <div class="tr-head"><h1>Papelera</h1>${list.length ? `<button type="button" class="tr-empty" data-tr="ask-empty">${icon('trash-2', { size: 18 })}<span>Vaciar<span class="tr-long"> la papelera</span></span></button>` : ''}</div>
    <p class="muted tr-lead">Lo que borras se queda aquí 30 días, con sus preguntas y tu progreso. Después se borra del todo.</p>
    ${list.length ? `<div class="tr-cols" aria-hidden="true"><span>Nombre</span><span>Borrado</span><span>Se borra en</span></div><ul class="tr-list">${list.map(row).join('')}</ul>
      <p class="tr-note">${icon('alert-triangle', { size: 16 })}<span>Las preguntas sueltas que borras van con su lista. Una pregunta borrada desde la tanda o el editor se recupera con «Deshacer», al momento.</span></p>`
      : `<div class="empty tr-none"><p class="muted">La papelera está vacía. Lo que borres se queda aquí 30 días.</p></div>`}</div>`;
}
// Recuperar: una lista o un apunte cuyo sitio sigue existiendo, al momento; una carpeta (o si su sitio ya no está), con la hoja
function restoreSheet(e) {
  const here = placeOf(e), folders = [...S.folders.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const inside = e.kind === 'folder' ? [...e.decks.map(d => `<li>${deckIcon(d)} ${esc(d.name)} · ${plural(e.cards.filter(c => c.deck_id === d.id).length, 'pregunta', 'preguntas')}</li>`),
    ...e.pages.map(p => `<li>${icon('file-text', { size: 16 })} Apunte · ${esc(p.title || 'Sin título')}</li>`), ...e.folders.map(f => `<li>${folderIcon(f)} ${esc(f.name)}</li>`)] : [];
  openSheet(`<h2 class="sheet-hand">Recuperar «${esc(nameOf(e))}»</h2>
    ${inside.length ? `<p>Vuelve con todo lo que tenía dentro:</p><ul class="tr-inside">${inside.join('')}</ul>` : ''}
    <label class="st-lab" for="trWhere">Dónde</label>
    <select id="trWhere"><option value="">Biblioteca</option>${folders.filter(f => f.id !== e.id).map(f => `<option value="${f.id}" ${f.id === here ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>
    <p class="muted small">Donde estaba. Si esa carpeta ya no existe, va a Biblioteca.</p>
    <p class="muted small">Tu progreso vuelve igual. Lo que tocaba repasar mientras estaba borrad${fem(e) ? 'a' : 'o'} sale ahora en Hoy.</p>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-tr="restore-ok" data-key="${esc(keyOf(e))}">Recuperar</button></div>`);
}
const confirm = (title, act, key = '') => openSheet(`<h2>${title}</h2><p class="muted">Se borra del todo. No se puede deshacer.</p>
  <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="danger solid primary" data-tr="${act}" data-key="${esc(key)}">Borrar del todo</button></div>`);
const redraw = () => { if (S.view === 'trash') { const y = scrollY; renderTrash(); scrollTo(0, y); } };

document.addEventListener('click', async e => {
  const b = e.target.closest?.('[data-tr]');
  if (!b) return;
  const ent = S.trash?.get(b.dataset.key);
  try {
    switch (b.dataset.tr) {
      case 'restore':
        if (!ent) return;
        if (ent.kind === 'folder' || (ent.item.folder_id && !placeOf(ent))) return restoreSheet(ent);
        b.disabled = true; await restoreItem(ent); return redraw();
      case 'restore-ok': if (!ent) return; b.disabled = true; await restoreItem(ent, $('#trWhere').value || null); closeSheet(); return redraw();
      case 'ask-purge': return ent && confirm(`¿Borrar «${esc(nameOf(ent))}» del todo?`, 'purge', b.dataset.key);
      case 'purge': if (!ent) return; b.disabled = true; await purge(ent); closeSheet(); toast('Borrado del todo'); return redraw();
      case 'ask-empty': return confirm('¿Vaciar la papelera?', 'empty');
      case 'empty': b.disabled = true; for (const x of trashList()) await purge(x); closeSheet(); toast('Papelera vacía'); return redraw();
    }
  } catch (err) { b.disabled = false; fail(err); }
});

/* ---------------- las hojas de borrar ---------------- */
// «Va a la papelera con sus N preguntas y tu progreso…»; si la lista tiene un apunte unido, que no se borra
export function askTrash(kind, id) {
  let text = '', title = '', note = '';
  if (kind === 'deck') {
    const d = S.decks.get(id); if (!d) return;
    const n = [...S.cards.values()].filter(c => c.deck_id === id).length;
    title = `¿Borrar «${esc(d.name)}»?`;
    text = `Va a la <b>papelera</b> con sus ${plural(n, 'pregunta', 'preguntas')} y tu progreso. Durante 30 días puedes recuperarla tal cual; después se borra del todo.`;
    if ([...S.pages.values()].some(p => p.deck_id === id)) note = `<p class="tr-linked">${icon('file-text', { size: 16 })} El apunte unido no se borra: se queda sin lista.</p>`;
  } else if (kind === 'page') {
    const p = S.pages.get(id); if (!p) return;
    title = `¿Borrar «${esc(p.title || 'Sin título')}»?`;
    text = 'Va a la <b>papelera</b>. Durante 30 días puedes recuperarlo tal cual; después se borra del todo. Sus preguntas no se borran.';
  } else {
    const f = S.folders.get(id); if (!f) return;
    title = `¿Borrar la carpeta «${esc(f.name)}»?`;
    text = 'Va a la <b>papelera</b> entera, con todo lo que tiene dentro y tu progreso. Durante 30 días puedes recuperarla tal cual; después se borra del todo.';
  }
  openSheet(`<h2 class="sheet-hand">${title}</h2><p>${text}</p>${note}
    <div class="btnrow tr-ask"><button class="ghost" data-act="close-sheet">Cancelar</button><button class="danger solid primary" data-act="delete-${kind === 'deck' ? 'deck' : kind}">${icon('trash-2', { size: 16 })} Borrar</button></div>`);
}
