// Flaski · Explorar, vistas previas e importar (sale de app.js)
import * as api from '../api.js';
import { cardsFromCSV } from '../csv.js';
import { icon } from '../icons.js';
import { isNotesDeck, notesToDeck } from '../notes.js';
import { importImages } from '../media.js';
import { $, main, S, esc, fmt, norm, toast, fail } from '../comun.js';
import { langLabel } from './estudio.js';
import { plural, parseDeckFile, download } from './mazos.js';
import { openSheet, closeSheet, addTag, adoptTypes, migrateDeckLangs } from './editor.js';
import { go } from '../app.js';

/* ===================== explorar ===================== */
async function loadExplore(force) {
  if (!S.builtin || force) {
    try { S.builtin = await (await fetch('decks/index.json', { cache: 'no-cache' })).json(); } catch { S.builtin = []; }
  }
  if (!S.pub || force) {
    try { S.pub = await api.publicDecks(); } catch (e) { S.pub = []; fail(e); }
  }
  if (S.view === 'explore') renderExplore();
}
export function renderExplore() {
  if (!S.pub || !S.builtin) {
    main.innerHTML = '<h1>Explorar</h1><div class="empty"><div class="spin" aria-label="Cargando"></div></div>';
    loadExplore();
    return;
  }
  const q = norm(S.exploreQuery.trim());
  const match = d => !q || norm(d.name).includes(q) || norm(d.description).includes(q) || norm(d.author).includes(q);
  const builtin = S.builtin.filter(match).map(d => `<li><button class="deck" data-builtin="${esc(d.file)}"><span class="dot" style="background:var(--d2)"></span>
    <span class="info"><span class="dname">${esc(d.name)}</span><span class="meta">${d.count} preguntas · incluida en la app</span></span><span class="go">Ver</span></button></li>`).join('');
  const pub = S.pub.filter(match).map(d => `<li><button class="deck" data-pub="${d.id}"><span class="dot" style="background:var(--d4)"></span>
    <span class="info"><span class="dname">${esc(d.name)}</span><span class="meta">${d.count} preguntas · de ${esc(d.author)}${d.owner === S.uid ? ' (tú)' : ''}</span></span><span class="go">Ver</span></button></li>`).join('');
  main.innerHTML = `<div class="section-h"><h1>Explorar</h1><button class="link" data-act="refresh-explore">Actualizar</button></div>
    <div class="toolbar"><input id="exploreSearch" type="search" placeholder="Buscar listas" aria-label="Buscar listas" value="${esc(S.exploreQuery)}"></div>
    <div class="section-h"><h2>Para empezar</h2></div>
    ${builtin ? `<ul class="list">${builtin}</ul>` : '<p class="muted">Nada por aquí.</p>'}
    <div class="section-h"><h2>${api.mode === 'local' ? 'Tus listas compartidas' : 'Compartidas por la comunidad'}</h2></div>
    ${pub ? `<ul class="list">${pub}</ul>` : '<div class="empty"><p class="muted">Todavía nadie ha compartido listas. Abre una de tus listas y pulsa «Compartir».</p></div>'}`;
}
export async function openPublicPreview(id) {
  openSheet('<div class="spin" aria-label="Cargando"></div>');
  try {
    const d = await api.getPublicDeck(id);
    if (!d) { openSheet('<h2>Lista no disponible</h2><p class="muted">Puede que su autor haya dejado de compartirla.</p><button class="primary" data-act="close-sheet">Cerrar</button>'); return; }
    S.preview = { name: d.name, description: d.description, cards: d.cards, types: d.types || [], source: 'compartido:' + d.id, lang: d.options?.lang };
    showPreview(`de ${esc(d.author)}`);
  } catch (e) { closeSheet(); fail(e); }
}
export async function openBuiltinPreview(file) {
  openSheet('<div class="spin" aria-label="Cargando"></div>');
  try {
    S.preview = { ...await readBuiltin(file), source: 'incluido:' + file };
    showPreview('incluida en la app');
  } catch (e) { closeSheet(); fail(e); }
}
function showPreview(byline) {
  const p = S.preview;
  const sample = p.cards.slice(0, 6).map(c => `<li><span>${fmt(c.front)}</span><b>${fmt(c.back)}</b></li>`).join('');
  openSheet(`<h2 class="sheet-hand">${esc(p.name)}</h2><p class="muted small">${p.cards.length} preguntas${p.lang ? ` · ${esc(langLabel(p.lang))}` : ''} · ${byline}</p>
    ${p.description ? `<p>${fmt(p.description)}</p>` : ''}
    <ul class="preview">${sample}</ul>${p.cards.length > 6 ? `<p class="muted small">…y ${p.cards.length - 6} más.</p>` : ''}
    ${(p.source === 'archivo' || p.source === 'pegado') && S.decks.size
      ? `<label for="destDeck">Añadir a</label><select id="destDeck"><option value="">Una lista nueva</option>${[...S.decks.values()].map(d => `<option value="${d.id}" ${S.view === 'deck' && d.id === S.deckId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>`
      : '<p class="muted small">Se copiará a tu cuenta: podrás editarlo y tu progreso será solo tuyo.</p>'}
    ${p.source === 'archivo' || p.source === 'pegado' ? `<div id="newDeckWrap" ${S.decks.size && S.view === 'deck' && S.deckId ? 'hidden' : ''}><label for="newDeckName">Nombre de la lista</label><input id="newDeckName" maxlength="80" value="${esc(p.name)}"></div>` : ''}
    ${p.skipped ? `<p class="muted small">Se han saltado ${p.skipped} filas sin pregunta o sin respuesta.</p>` : ''}
    ${issuesHTML(p.issues)}
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-act="add-preview">Añadir a mis listas</button></div>`);
}
// Problemas del formato por notas: las que se saltan (y por qué) y los avisos
function issueList(items) {
  return `<ul class="issues">${items.map(i => `<li><b>${i.n ? `Nota ${i.n}` : 'Lista'}</b>${i.label && i.n ? ` <span class="muted">(${esc(i.label)})</span>` : ''}: ${esc(i.reason)}</li>`).join('')}</ul>`;
}
function issuesHTML(issues = []) {
  const skipped = issues.filter(i => i.skipped), warns = issues.filter(i => !i.skipped);
  return `${skipped.length ? `<details class="issues-box" open><summary>${skipped.length === 1 ? 'Se salta 1 nota' : `Se saltan ${skipped.length} notas`}</summary>${issueList(skipped)}</details>` : ''}
    ${warns.length ? `<details class="issues-box"><summary>${plural(warns.length, 'aviso', 'avisos')}</summary>${issueList(warns)}</details>` : ''}`;
}
// Archivo o texto pegado ya leído → vista previa. parsed: { kind: 'json', data } o { kind: 'csv', text }
export function previewImport(parsed, { source, baseName = 'Lista importada' }) {
  if (parsed.kind === 'csv') {
    const { cards, skipped } = cardsFromCSV(parsed.text);
    S.preview = { name: baseName.slice(0, 80), description: '', cards, skipped, source };
    return showPreview('desde una tabla');
  }
  if (isNotesDeck(parsed.data)) {
    const d = notesToDeck(parsed.data);
    S.preview = { ...d, source };
    if (!d.cards.length) {
      return openSheet(`<h2>No se ha podido crear ninguna pregunta</h2><p class="muted">Ninguna nota es válida. Esto es lo que falla en cada una:</p>
        ${issueList(d.issues.length ? d.issues : [{ n: 0, reason: 'la lista de notas está vacía' }])}
        <div class="btnrow"><span class="spacer"></span>${source === 'pegado' ? '<button class="ghost" data-act="paste">Volver a pegar</button>' : ''}<button class="primary" data-act="close-sheet">Cerrar</button></div>`);
    }
    return showPreview(`${plural(d.notes, 'nota', 'notas')} · formato por notas`);
  }
  S.preview = { ...parseDeckFile(parsed.data), source };
  showPreview('desde archivo Flaski');
}

/* ---------------- Pegar e instrucciones para IA ---------------- */
export function pasteSheet() {
  openSheet(`<h2 class="sheet-hand">Pegar una lista</h2>
    <p class="muted small">Pega la lista que te ha preparado una IA (ChatGPT, Gemini, Claude…) o unas columnas copiadas de una hoja de cálculo.</p>
    <textarea id="pasteText" class="paste-box" rows="9" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Texto de la lista" placeholder="{ &quot;format&quot;: &quot;flaski-notes&quot;, … }">${esc(S.pasteText || '')}</textarea>
    <p class="error" id="pasteError" role="alert" hidden></p>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-act="paste-preview">Ver vista previa</button></div>
    <div class="ai-help">${icon('lightbulb', { size: 18 })}<div>
      <p><b>¿Quieres que una IA te haga la lista?</b> Copia estas instrucciones, pégalas en la IA junto con lo que quieres estudiar y pega aquí lo que te responda.</p>
      ${AI_GUIDE_BTNS()}</div></div>`);
  loadAiGuide();
}
export const AI_GUIDE_BTNS = () => `<span class="btnrow"><button type="button" class="ghost small-btn" data-act="copy-ai-guide">${icon('copy', { size: 16 })} Copiar instrucciones</button><button type="button" class="ghost small-btn" data-act="download-ai-guide">${icon('download', { size: 16 })} Descargar</button></span>`;
export async function loadAiGuide() {
  if (!S.aiGuide) { try { const r = await fetch('FORMATO-IA.md', { cache: 'no-cache' }); if (r.ok) S.aiGuide = await r.text(); } catch {} }
  return S.aiGuide;
}
export async function copyText(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); return true; } catch { return false; }
}
export async function addPreview(btn) {
  const p = S.preview;
  if (!p) return;
  btn.disabled = true; btn.textContent = 'Añadiendo…';
  try {
    if (p.source === 'pegado') S.pasteText = '';
    const dest = $('#destDeck')?.value;
    const name = $('#newDeckName')?.value.trim();
    if (!dest && name) p.name = name.slice(0, 80);
    const { deck, cards } = await importParsed(p, dest);
    if (dest) {
      toast(`${cards.length} preguntas añadidas`);
      return go('deck', { deckId: dest, cardQuery: '' });
    }
    toast(`«${deck.name}» añadida`);
    go('deck', { deckId: deck.id, cardQuery: '' });
  } catch (e) { btn.disabled = false; btn.textContent = 'Añadir a mis listas'; fail(e); }
}
// Copia a la cuenta una lista ya leída (archivo, pegada o incluida): sus tipos, imágenes y etiquetas.
// Con dest, las preguntas se añaden a esa lista; si no, se crea una nueva. Devuelve { deck, cards }.
export async function importParsed(p, dest = '') {
  const typeMap = await adoptTypes(p.types);
  if (p.images) await importImages(p.images);   // las imágenes que vienen dentro del archivo
  // Etiquetas por nombre (formato por notas): se crean las que falten y se reutilizan las que ya tengas
  let cards = p.cards;
  if (p.tagNames?.length) {
    const ids = new Map();
    for (const name of p.tagNames) { const t = await addTag(name); if (t) ids.set(name.toLocaleLowerCase(), t.id); }
    cards = cards.map(c => ({ ...c, tags: (c.tagNames || []).map(n => ids.get(n.toLocaleLowerCase())).filter(Boolean) }));
  }
  if (dest) {
    const created = await api.importCards(S.uid, dest, cards, typeMap);
    for (const c of created) S.cards.set(c.id, c);
    return { deck: S.decks.get(dest), cards: created };
  }
  const { deck, cards: made } = await api.importDeck(S.uid, { ...p, lang: p.lang || undefined, cards, typeMap });
  S.decks.set(deck.id, { tags: [], ...deck });
  for (const c of made) S.cards.set(c.id, c);
  migrateDeckLangs();   // si el archivo no decía el idioma, se deduce
  return { deck, cards: made };
}
// Lee una de las listas incluidas en la app (decks/)
export async function readBuiltin(file) {
  if (!/^[\w.-]+\.json$/.test(file)) throw new Error('Archivo no válido');
  const raw = await (await fetch('decks/' + file)).json();
  return isNotesDeck(raw) ? notesToDeck(raw) : parseDeckFile(raw);   // también en formato por notas
}
