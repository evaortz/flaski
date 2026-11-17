// Japonés · los cursos de Explorar hechos de apuntes: «JLPT N5 · Gramática» son doce apuntes con sus preguntas
// (decks/jlpt-n5/). Al añadirlos, van a la carpeta «JLPT N5» y sus preguntas, a una sola lista, cada una unida al
// apartado del que sale. Lo que ya tengas (un apunte con el mismo título en esa carpeta) no se repite.
import * as api from '../api.js';
import { S, esc, toast, fail, cardList } from '../comun.js';
import { notesToDeck, splitPagePaste, sectionBlockId, notesOf } from '../notes.js';
import { markdownToPage } from '../notesio.js';
import { openSheet, closeSheet } from './editor.js';
import { folderNamed, ownedDeck } from './explorar.js';
import { makeSuggested } from './sugerencias.js';
import { pageRow } from './apuntes.js';
import { go } from '../app.js';

const BASE = 'decks/';
const read = async file => (await fetch(BASE + file, { cache: 'no-cache' })).json();
const source = file => 'incluido:' + file;

// La hoja del curso: qué trae y «Añadir»
export async function cursoSheet(file) {
  openSheet('<div class="spin" aria-label="Cargando"></div>');
  try {
    const c = await read(file), own = ownedDeck(source(file));
    openSheet(`<div class="jc"><h2 class="sheet-hand">${esc(c.name)}</h2>
      <p class="muted small">${c.files.length} apuntes · ${c.count} preguntas · en la carpeta «${esc(c.folder)}»</p>
      <p>${esc(c.description)}</p>
      <ol class="jc-list">${c.titles.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
      <p class="muted small">${esc(c.source)}</p>
      <div class="btnrow"><button class="ghost" data-act="close-sheet">Cerrar</button><span class="spacer"></span>
        ${own ? `<button class="primary" data-ex="open-curso" data-file="${esc(file)}">Abrir</button>` : `<button class="primary" data-ex="add-curso" data-file="${esc(file)}">Añadir los ${c.files.length} apuntes</button>`}</div></div>`);
  } catch (e) { closeSheet(); fail(e); }
}

// Añade el curso: la carpeta, la lista y cada apunte con sus preguntas
export async function addCurso(file, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Añadiendo…'; }
  try {
    const c = await read(file), folder = await folderNamed(c.folder);
    let deck = ownedDeck(source(file));
    if (!deck) {
      deck = await api.createDeck({ owner: S.uid, name: c.name.slice(0, 80), description: c.description.slice(0, 300), source: source(file), folder_id: folder.id, options: { lang: c.lang } });
      S.decks.set(deck.id, { tags: [], ...deck });
    }
    let first = null, made = 0;
    for (const [i, f] of c.files.entries()) {
      if (btn) btn.textContent = `Añadiendo ${i + 1} de ${c.files.length}…`;
      const sp = splitPagePaste(await (await fetch(BASE + f, { cache: 'no-cache' })).text());
      const { title, blocks } = markdownToPage(sp.md);
      let p = [...S.pages.values()].find(x => x.title === title && x.folder_id === folder.id && !x.deleted_at);
      if (p && cardList().some(x => x.page_id === p.id)) { first ||= p; continue; }
      if (!p) { p = await api.createPage({ owner: S.uid, title, icon: '', deck_id: deck.id, folder_id: folder.id, tags: [], blocks }); S.pages.set(p.id, p); }
      else if (p.deck_id !== deck.id) { p.deck_id = deck.id; S.pages.set(p.id, p); await api.savePage(pageRow(p)); }
      const picked = notesOf(notesToDeck(sp.data)).map(n => ({ ...n, blockId: sectionBlockId(p.blocks, n.section) }));
      made += (await makeSuggested(p, picked, deck.id, source(file))).made.length;
      first ||= p;
    }
    closeSheet();
    toast(`«${c.name}» añadida: ${c.files.length} apuntes${made ? ` y ${made} preguntas` : ''}`);
    if (first) go('page', { pageId: first.id });
  } catch (e) { if (btn) { btn.disabled = false; btn.textContent = 'Reintentar'; } fail(e); }
}

export function openCurso(file) {
  closeSheet();
  const d = ownedDeck(source(file));
  const p = d && [...S.pages.values()].filter(x => x.deck_id === d.id && !x.deleted_at).sort((a, b) => a.title.localeCompare(b.title, 'es', { numeric: true }))[0];
  if (p) return go('page', { pageId: p.id });
  if (d) return go('deck', { deckId: d.id, cardQuery: '' });
  toast('No encuentro ese curso en tu Biblioteca');
}
