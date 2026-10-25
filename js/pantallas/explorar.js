// Flaski · Explorar, vistas previas e importar (sale de app.js)
import * as api from '../api.js';
import { cardsFromCSV } from '../csv.js';
import { icon } from '../icons.js';
import { isNotesDeck, notesToDeck } from '../notes.js';
import { importImages } from '../media.js';
import { $, main, S, esc, fmt, norm, fold, toast, fail } from '../comun.js';
import { plural, parseDeckFile, download } from './mazos.js';
import { openSheet, closeSheet, addTag, adoptTypes, migrateDeckLangs } from './editor.js';
import { go } from '../app.js';
import { TEMAS, temaSource } from '../primera-vez.js';
import { addTema } from './pruebas.js';
import { readTema } from './cuenta.js';
import { startSession, langLabel } from './estudio.js';

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
// Filtros por objetivo (los que tienen algo) y lo que sale en cada uno
const GOALS = [['all', 'Todo'], ['idiomas', 'Idiomas'], ['oposiciones', 'Oposiciones'], ['carrera', 'Carrera'], ['amigos', 'De tus amigos']];
const GOAL_TITLE = { idiomas: 'Idiomas', oposiciones: 'Oposiciones', carrera: 'Carrera' };
// ¿Ya tienes este tema de ejemplo? Por el origen de su lista («tema:…»); si no lo tiene (listas de antes), por el
// nombre sin acentos ni palabras vacías: «La Constitución · Título Preliminar» = «La Constitución Española · Título Preliminar»
const STOP = new Set(['las', 'los', 'del', 'por', 'que', 'una', 'uno', 'con', 'para', 'como', 'espanola', 'espanol']);
const words = s => fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(w => w.length > 2 && !STOP.has(w));
export function sameName(a, b) {
  const x = words(a), y = words(b);
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 2 && s.every(w => l.includes(w));
}
function ownTema(t) {
  const src = temaSource(t), decks = [...S.decks.values()].filter(d => !d.archived);
  const deck = decks.find(d => d.source === src);
  if (deck) return { deck, page: [...S.pages.values()].find(p => p.deck_id === deck.id) || null };
  const page = [...S.pages.values()].find(p => p.title === t.title || p.title === t.page || sameName(p.title, t.title));
  if (page) return { page, deck: page.deck_id ? S.decks.get(page.deck_id) || null : null };
  const d2 = decks.find(d => sameName(d.name, t.title));
  return d2 ? { deck: d2, page: null } : null;
}
const friendIds = () => new Set((S.friends?.list || []).map(f => f.id));
export function renderExplore() {
  if (!S.pub || !S.builtin) {
    main.innerHTML = '<h1>Explorar</h1><div class="empty"><div class="spin" aria-label="Cargando"></div></div>';
    loadExplore();
    return;
  }
  const q = norm(S.exploreQuery.trim()), local = api.mode === 'local', goal = S.exploreGoal || 'all';
  const match = d => !q || norm(d.name || d.title).includes(q) || norm(d.description || d.text).includes(q) || norm(d.author).includes(q);
  const fr = friendIds();
  const lists = S.builtin.map(d => ({ ...d, goal: d.objetivo || 'idiomas' }));
  const temas = TEMAS.map((t, i) => ({ ...t, i, goal: t.objetivo }));
  // De tus amigos: lo que comparten tus amigos (en el modo local, lo que has compartido tú)
  const friends = local ? S.pub : S.pub.filter(d => fr.has(d.owner) && d.owner !== S.uid);
  const others = local ? [] : S.pub.filter(d => !fr.has(d.owner));
  // Si ya la tienes: «La tienes» en vez de «Ver» y «48 preguntas · tú tienes 56»
  const meta = (d, src, by) => { const own = ownedDeck(src); return `${d.count} preguntas${own ? ` · tú tienes ${ownCount(own)}` : by ? ` · ${by}` : ''}`; };
  const go = src => (ownedDeck(src) ? `<span class="go go-own">La tienes</span>` : '<span class="go">Ver</span>');
  const listRow = d => `<li><button class="deck" data-builtin="${esc(d.file)}"><span class="ex-ic" aria-hidden="true">${esc(d.icono || '')}</span>
    <span class="info"><span class="dname">${esc(d.name)}</span><span class="meta">${meta(d, 'incluido:' + d.file, 'incluida en la app')}</span></span>${go('incluido:' + d.file)}</button></li>`;
  const pubRow = d => `<li><button class="deck" data-pub="${d.id}"><span class="ex-ic" aria-hidden="true">${icon('users', { size: 18 })}</span>
    <span class="info"><span class="dname">${esc(d.name)}</span><span class="meta">${meta(d, 'compartido:' + d.id, `de ${esc(d.author)}${d.owner === S.uid ? ' (tú)' : ''}`)}</span></span>${go('compartido:' + d.id)}</button></li>`;
  const temaRow = t => { const own = ownTema(t); return `<li class="ex-row"><span class="ex-ic" aria-hidden="true">${icon('file-text', { size: 20 })}</span><button class="ex-row-t" data-ex="see-tema" data-i="${t.i}"><b>${esc(t.title)}</b><small>apunte y ${t.count} preguntas</small></button>
    ${own ? `<button class="soft-pill" data-ex="open-tema" data-i="${t.i}">La tienes</button>` : `<button class="soft-pill" data-ex="add-tema" data-i="${t.i}">${icon('plus', { size: 16 })} Añadir</button>`}</li>`; };
  // Buscando: una sola lista con todo lo que encaja
  if (q) {
    const rows = [...temas.filter(match).map(temaRow), ...lists.filter(match).map(listRow), ...[...friends, ...others].filter(match).map(pubRow)];
    main.innerHTML = `${headHTML()}${rows.length ? `<ul class="list ex-results">${rows.join('')}</ul>` : `<div class="empty ex-none"><p class="muted">Ninguna lista con «${esc(S.exploreQuery.trim())}»</p></div>`}`;
    return;
  }
  const show = g => goal === 'all' || goal === g;
  const featured = temas.find(t => t.goal === 'destacado');
  const sec = (g, body) => `<section class="ex-sec ex-${g}" aria-labelledby="ex-h-${g}"><div class="section-h"><h2 id="ex-h-${g}">${GOAL_TITLE[g]}</h2>${goal === 'all' ? `<button class="link" data-ex="goal" data-g="${g}">ver todo</button>` : ''}</div>${body}</section>`;
  const langCards = lists.filter(d => d.goal === 'idiomas').map(d => {
    const own = ownedDeck('incluido:' + d.file);
    return `<li class="ex-card"><button class="ex-card-b" data-builtin="${esc(d.file)}"><span class="ex-card-ic" aria-hidden="true">${esc(d.icono || '')}</span><b>${esc(d.name)}</b><span class="meta">${own ? meta(d, 'incluido:' + d.file) : `${d.count} preg.`}</span>${own ? '<span class="go go-own">La tienes</span>' : ''}</button>
      ${own ? '' : `<button class="ex-add" data-ex="add-builtin" data-file="${esc(d.file)}" aria-label="Añadir ${esc(d.name)}">${icon('plus', { size: 20 })}</button>`}</li>`;
  }).join('');
  const opos = temas.filter(t => t.goal === 'oposiciones').map(temaRow).join('') + lists.filter(d => d.goal === 'oposiciones').map(listRow).join('');
  const career = temas.filter(t => t.goal === 'carrera').map(temaRow).join('') + lists.filter(d => d.goal === 'carrera').map(listRow).join('');
  const friendsBody = friends.length ? `<ul class="list">${friends.map(pubRow).join('')}</ul>`
    : `<div class="empty"><p class="muted">${local ? 'Aún no has compartido ninguna. Abre una lista y pulsa «Compartir».' : 'Tus amigos aún no han compartido ninguna lista.'}</p></div>`;
  const has = { idiomas: !!langCards, oposiciones: !!opos, carrera: !!career, amigos: true };
  main.innerHTML = `${headHTML(has)}
    <div class="ex-grid">
      ${goal === 'all' && featured ? `<div class="ex-hero"><span class="ex-sticker">¡en 5 min!</span><small>tema de ejemplo · para probar Flaski</small><h2>${esc(featured.title)}</h2>
        <p>Un apunte corto sobre la memoria, con ${featured.count} preguntas ya hechas.</p>
        <div class="btnrow">${ownTema(featured) ? `<button class="ex-hero-go" data-ex="open-tema" data-i="${featured.i}">Abrir el tema</button>` : `<button class="ex-hero-go" data-ex="start-tema" data-i="${featured.i}">Añadir y empezar</button>`}<button class="link" data-ex="see-tema" data-i="${featured.i}">Ver el tema</button></div>
        <svg class="ex-curve" viewBox="0 0 160 90" aria-hidden="true"><path d="M4 20 C40 70 90 82 156 84" fill="none" stroke="#FF9F92" stroke-width="5" stroke-linecap="round"/><path d="M4 8 C20 40 30 52 40 50 C50 30 56 18 70 30 C80 48 90 52 100 50 C116 30 130 26 156 30" fill="none" stroke="#8EE3B5" stroke-width="5" stroke-linecap="round"/><circle cx="40" cy="50" r="6" fill="#FFFFFF"/><circle cx="100" cy="50" r="6" fill="#FFFFFF"/></svg></div>` : ''}
      ${show('amigos') ? `<section class="ex-sec ex-amigos" aria-labelledby="ex-h-amigos"><div class="section-h"><h2 id="ex-h-amigos">${local ? 'Tus listas compartidas' : 'De tus amigos'}</h2></div>${friendsBody}
        ${goal === 'all' ? `<button class="ex-import" data-act="import-menu">${icon('download', { size: 22 })}<span><b>¿Ya tienes preguntas en otra app?</b><small>Importa un mazo de Anki o un CSV</small></span></button>` : ''}</section>` : ''}
      ${show('idiomas') && langCards ? sec('idiomas', `<ul class="ex-cards">${langCards}</ul>`) : ''}
      ${show('oposiciones') && opos ? sec('oposiciones', `<ul class="ex-rows">${opos}</ul>`) : ''}
      ${show('carrera') && career ? sec('carrera', `<ul class="ex-rows">${career}</ul>`) : ''}
      ${goal === 'all' && others.length ? `<section class="ex-sec ex-comunidad"><div class="section-h"><h2>De la comunidad</h2></div><ul class="list">${others.map(pubRow).join('')}</ul></section>` : ''}
    </div>`;
}
function headHTML(has = {}) {
  const goal = S.exploreGoal || 'all';
  const chips = GOALS.filter(([g]) => g === 'all' || has[g] || g === goal).map(([g, l]) => `<button type="button" class="ex-chip" data-ex="goal" data-g="${g}" aria-pressed="${goal === g}">${l}</button>`).join('');
  return `<div class="ex-top"><div class="ex-title"><h1>Explorar</h1><span class="ex-note">¿qué te apetece aprender hoy?</span></div>
    <label class="lib-search ex-search">${icon('search', { size: 18 })}<input id="exploreSearch" type="search" placeholder="Buscar listas y temas" aria-label="Buscar listas y temas" value="${esc(S.exploreQuery)}"></label></div>
    ${S.exploreQuery.trim() ? '' : `<div class="ex-chips" role="group" aria-label="Objetivo">${chips}</div>`}`;
}
// Los botones de Explorar (data-ex)
export async function exploreClick(b) {
  const ds = b.dataset;
  switch (ds.ex) {
    case 'goal': S.exploreGoal = ds.g === S.exploreGoal ? 'all' : ds.g; return renderExplore();
    case 'add-builtin': {
      b.disabled = true;
      try { const p = { ...await readBuiltin(ds.file), source: 'incluido:' + ds.file }; const { deck } = await importParsed(p); toast(`«${deck.name}» añadida`); renderExplore(); }
      catch (e) { b.disabled = false; fail(e); }
      return;
    }
    case 'add-tema': case 'start-tema': {
      b.disabled = true;
      const t = TEMAS[Number(ds.i)];
      try {
        const r = await addTema(t);
        const p = r?.page || ownTema(t)?.page;
        closeSheet();
        // «Añadir y empezar»: la tanda de 5 min; «Añadir»: se abre el apunte
        if (ds.ex === 'start-tema' && p?.deck_id) return startSession(p.deck_id, { minutes: 5 });
        if (p && S.pages.has(p.id)) { toast(`«${t.title}» añadido`); return go('page', { pageId: p.id }); }
        toast(`«${t.title}» añadido`); renderExplore();
      } catch (e) { b.disabled = false; fail(e); }
      return;
    }
    case 'open-tema': {
      const o = ownTema(TEMAS[Number(ds.i)]); closeSheet();
      if (o?.page && S.pages.has(o.page.id)) return go('page', { pageId: o.page.id });
      if (o?.deck && S.decks.has(o.deck.id)) return go('deck', { deckId: o.deck.id, cardQuery: '' });
      return toast('No encuentro ese tema en tu Biblioteca');
    }
    case 'see-tema': return temaPreview(Number(ds.i));
  }
}
// «Ver el tema»: el principio del apunte y algunas de sus preguntas
async function temaPreview(i) {
  const t = TEMAS[i];
  openSheet('<div class="spin" aria-label="Cargando"></div>');
  try {
    const [{ blocks }, qs] = await Promise.all([readTema(t), fetch(t.cards, { cache: 'no-cache' }).then(r => r.json())]);
    const text = blocks.filter(b => b.type === 'p').slice(0, 2).map(b => `<p>${fmt(b.text)}</p>`).join('');
    const own = ownTema(t);
    openSheet(`<h2 class="sheet-hand">${esc(t.title)}</h2><p class="muted small">tema de ejemplo · apunte y ${t.count} preguntas</p>${text}
      <ul class="preview">${qs.slice(0, 5).map(x => { const v = holes(x.pregunta, x.respuesta); return `<li><span>${esc(v.q)}</span><b>${esc(v.a)}</b></li>`; }).join('')}</ul>
      <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button>${own ? `<button class="primary" data-ex="open-tema" data-i="${i}">Abrir</button>` : `<button class="primary" data-ex="start-tema" data-i="${i}">Añadir y empezar</button>`}</div>`);
  } catch (e) { closeSheet(); fail(e); }
}
// Una pregunta con huecos, como en la tanda: «[…]» en la pregunta y lo que va en el hueco como respuesta
const HOLE = /\{\{(.+?)(?:::(.+?))?\}\}/g;
export function holes(q, a) {
  const text = String(q ?? ''), fills = [...text.matchAll(HOLE)].map(m => m[1]);
  if (!fills.length) return { q: text, a: String(a ?? '') };
  const rest = String(a ?? '').replace(HOLE, '$1').trim();
  return { q: text.replace(HOLE, '[…]'), a: rest && !fills.includes(rest) && rest !== text.replace(HOLE, '$1') ? rest : fills.join(' · ') };
}
// La lista tuya que salió de una incluida o compartida (source «incluido:…» o «compartido:…»)
export const ownedDeck = src => [...S.decks.values()].find(d => d.source === src && !d.archived) || [...S.decks.values()].find(d => d.source === src);
const ownCount = d => { let n = 0; for (const c of S.cards.values()) if (c.deck_id === d.id) n++; return n; };
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
  // Una fila por nota (con varias plantillas, la primera cara): «die Wohnung · el piso»
  const seen = new Set(), rows = p.cards.filter(c => !c.note_id || (!seen.has(c.note_id) && seen.add(c.note_id)));
  const sample = rows.slice(0, 6).map(c => { const v = holes(c.front, c.back); return `<li><span>${fmt(v.q)}</span><b>${fmt(v.a)}</b></li>`; }).join('');
  openSheet(`<h2 class="sheet-hand">${esc(p.name)}</h2><p class="muted small">${p.cards.length} preguntas${p.lang ? ` · ${esc(langLabel(p.lang))}` : ''} · ${byline}</p>
    ${p.description ? `<p>${fmt(p.description)}</p>` : ''}
    <ul class="preview">${sample}</ul>${rows.length > 6 ? `<p class="muted small">…y ${rows.length - 6} más.</p>` : ''}
    ${(p.source === 'archivo' || p.source === 'pegado') && S.decks.size
      ? `<label for="destDeck">Añadir a</label><select id="destDeck"><option value="">Una lista nueva</option>${[...S.decks.values()].map(d => `<option value="${d.id}" ${S.view === 'deck' && d.id === S.deckId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>`
      : /^(incluido|compartido):/.test(p.source || '') && ownedDeck(p.source) ? '' : '<p class="muted small">Se copiará a tu cuenta: podrás editarlo y tu progreso será solo tuyo.</p>'}
    ${p.source === 'archivo' || p.source === 'pegado' ? `<div id="newDeckWrap" ${S.decks.size && S.view === 'deck' && S.deckId ? 'hidden' : ''}><label for="newDeckName">Nombre de la lista</label><input id="newDeckName" maxlength="80" value="${esc(p.name)}"></div>` : ''}
    ${p.skipped ? `<p class="muted small">Se han saltado ${p.skipped} filas sin pregunta o sin respuesta.</p>` : ''}
    ${issuesHTML(p.issues)}
    ${(() => {
      // Ya la tienes (incluida en la app o compartida): «Ya la tienes · Abrir»
      const own = /^(incluido|compartido):/.test(p.source || '') && ownedDeck(p.source);
      return own ? `<div class="btnrow"><span class="muted">Ya la tienes</span><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button><button class="primary" data-act="open-owned" data-deck="${own.id}">Abrir</button></div>`
        : '<div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-act="add-preview">Añadir a mis listas</button></div>';
    })()}`);
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
