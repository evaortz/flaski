// Flaski · Mis mazos, un mazo e importar/exportar mazos (sale de app.js)
import * as api from '../api.js';
import { toRow } from '../rows.js';
import { fmtWhen, dateKey } from '../srs.js';
import { cardsToCSV } from '../csv.js';
import { icon } from '../icons.js';
import { LANGS } from '../cardtypes.js';
import { folderPath, iconText } from '../org.js';
import { parsePasted } from '../notes.js';
import { readApkg, ankiToFlaski, ankiProgress, ankiHistory } from '../anki.js';
import { storeImage, imageType, newImageId, flushUploads, imageIdsOf, exportImages } from '../media.js';
import { pageTitle } from '../pages.js';
import { $, main, S, esc, fmt, norm, cardList, toast, fail, deckIcon, tagChips, algo, counts } from '../comun.js';
import { typeIcon, getType, deckLang, langLabel } from './estudio.js';
import { previewImport } from './explorar.js';
import { drag } from './apuntes.js';
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
      <div class="btnrow">${deckLang(d.id) ? `<span class="chip">${icon('languages', { size: 13 })} ${esc(langLabel(deckLang(d.id)))}</span>` : ''}${tagChips(d.tags)}<span class="chip">${c.total} ${c.total === 1 ? 'pregunta' : 'preguntas'}</span><span class="chip">${c.due} por repasar${c.dueAll > c.due ? ` (+${c.dueAll - c.due} tras el límite)` : ''}</span>${d.pinned ? '<span class="chip">Fijado</span>' : ''}${d.archived ? '<span class="chip">Archivada</span>' : ''}${d.is_public ? '<span class="chip">Compartida</span>' : ''}</div></div>
    <div class="btnrow">
      <button class="primary" data-start="${d.id}" ${c.due + c.newToday ? '' : 'disabled'}>Estudiar</button>
      <button class="ghost" data-act="new-card">+ Pregunta</button>
      <button class="ghost" data-act="quick-add">Crear varias</button>
      <button class="ghost" data-act="share">Compartir</button>
      <button class="ghost" data-act="move-deck">Mover</button>
      <button class="ghost" data-act="edit-deck">Editar</button>
      <button class="ghost" data-stats="${d.id}">${icon('chart-column', { size: 16 })} Estadísticas</button>
    </div>
    ${deckNotesHTML(d.id)}
    <div class="toolbar"><input id="cardSearch" type="search" placeholder="Buscar en esta lista" aria-label="Buscar preguntas" value="${esc(S.cardQuery)}"></div>
    <p class="muted small" id="cardCount">${rows.length === all.length ? `${all.length} ${all.length === 1 ? 'pregunta' : 'preguntas'}` : `${rows.length} de ${all.length} preguntas`}</p>
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
  openSheet(`<h2>Importar de Anki</h2><p class="muted" role="status">Leyendo «${esc(file.name)}»…</p>`);
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
    openSheet(`<h2>Importar de Anki</h2>
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
