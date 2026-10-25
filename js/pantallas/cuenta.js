// Flaski · acceso, carga de datos, bienvenida y modo sin conexión (sale de app.js)
import * as api from '../api.js';
import { toRow } from '../rows.js';
import { loadPrefs, applyLook, mergeSynced } from '../prefs.js';
import { icon } from '../icons.js';
import { LANGS, summarize, activeTemplates } from '../cardtypes.js';
import { setBaseRate } from '../tts.js';
import { saveSnapshot, loadSnapshot, rememberUser } from '../snapshot.js';
import { isRetryable } from '../outbox.js';
import { openOnboarding } from '../onboarding.js';
import { openFirstRun, TEMAS, fileKind, temaCards } from '../primera-vez.js';
import { DRAWING_SVG } from '../dibujos.js';
import { dayKey, daysBetween } from '../plan.js';
import { migrateLoaded, editPlan2 } from '../plan2-app.js';
import { examIdFor } from '../plan2-migrar.js';
import { maybeResumeSim } from './simulacro.js';
import { temaSource } from '../primera-vez.js';
import { markdownToPage, plainTextToPage, titleFromFile } from '../notesio.js';
import { isEmptyPage } from '../pages.js';
import { suggestCards } from '../suggest.js';
import { openNews, NEWS_VERSION, NEWS_ALWAYS, hasNews } from '../news.js';
import { setRemote as setImageRemote, storeImage, flushUploads } from '../media.js';
import { $, main, S, esc, toast, errMsg, fail, counts, fold, plain } from '../comun.js';
import { splitTrash, purgeExpired } from './papelera.js';
import { nativeLang, langLabel, getType } from './estudio.js';
import { plural } from './mazos.js';
import { openPublicPreview, openBuiltinPreview, pasteSheet } from './explorar.js';
import { newPage, readPdfFile, fileToPages, savePageSoon } from './apuntes.js';
import { suggestFor, makeSuggested, firstPicks, temaFirst, temaPicks, openSuggestions, blockFor } from './sugerencias.js';
import { startSession } from './estudio.js';
import { savePrefsSoon, seg, pushAutoSync } from './perfil.js';
import { cardForm, dedupeTypes, migrateDeckLangs } from './editor.js';
import { loadFriends, inviteSheet } from './amigos.js';
import { go, render } from '../app.js';

/* ===================== sin configurar ===================== */
function renderSetup() {
  main.innerHTML = `<div class="panel"><h2>Falta un paso</h2>
    <p>La app todavía no está conectada a una base de datos. Abre <b>js/config.js</b> y pega la URL y la clave de tu proyecto de Supabase.</p>
    <p class="muted small">Tienes los pasos detallados en el archivo README.md.</p></div>`;
}

/* ===================== cuenta ===================== */
export function renderAuth() {
  const up = S.authMode === 'signup';
  const reset = S.authMode === 'reset';
  main.innerHTML = `
    <div class="panel">
      <h1>${reset ? 'Recuperar contraseña' : up ? 'Crea tu cuenta' : 'Entra en tu cuenta'}</h1>
      <p class="muted">${reset ? 'Te enviaremos un correo para elegir una contraseña nueva.' : 'Cada persona tiene sus propias listas y su propio progreso.'}</p>
      ${reset ? '' : `<div class="seg" role="group" aria-label="Tipo de acceso">
        <button type="button" data-act="auth-mode" data-mode="signin" aria-pressed="${!up}">Entrar</button>
        <button type="button" data-act="auth-mode" data-mode="signup" aria-pressed="${up}">Crear cuenta</button></div>`}
      <form data-form="${reset ? 'reset' : up ? 'signup' : 'signin'}" novalidate>
        ${up ? '<label for="a-name">Tu nombre</label><input id="a-name" autocomplete="nickname" maxlength="40" required>' : ''}
        <label for="a-email">Correo</label>
        <input id="a-email" type="email" autocomplete="email" inputmode="email" required>
        ${reset ? '' : `<label for="a-pass">Contraseña</label>
        <input id="a-pass" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" minlength="6" required>
        ${up ? '<p class="hint">Mínimo 6 caracteres.</p>' : ''}`}
        <p class="error" id="a-error" hidden></p>
        <button class="primary big" type="submit" style="margin-top:12px">${reset ? 'Enviar correo' : up ? 'Crear cuenta' : 'Entrar'}</button>
      </form>
      ${reset ? '<button class="link" data-act="auth-mode" data-mode="signin">Volver</button>'
        : up ? '' : '<button class="link" data-act="auth-mode" data-mode="reset">He olvidado mi contraseña</button>'}
    </div>`;
}
export function renderNewPassword() {
  main.innerHTML = `<div class="panel"><h1>Nueva contraseña</h1>
    <form data-form="newpass"><label for="np">Contraseña nueva</label>
    <input id="np" type="password" autocomplete="new-password" minlength="6" required>
    <p class="error" id="a-error" hidden></p>
    <button class="primary big" type="submit" style="margin-top:12px">Guardar contraseña</button></form></div>`;
}
function authError(msg) { const e = $('#a-error'); if (e) { e.textContent = msg; e.hidden = false; } }

export async function submitAuth(kind, form) {
  const btn = form.querySelector('[type=submit]');
  const email = $('#a-email')?.value.trim();
  const pass = $('#a-pass')?.value;
  btn.disabled = true;
  try {
    if (kind === 'signin') {
      if (!email || !pass) return authError('Escribe tu correo y tu contraseña.');
      await api.auth.signIn(email, pass);
    } else if (kind === 'signup') {
      const name = $('#a-name').value.trim();
      if (!name || !email || !pass) return authError('Rellena todos los campos.');
      if (pass.length < 6) return authError('La contraseña debe tener al menos 6 caracteres.');
      const res = await api.auth.signUp(email, pass, name);
      if (!res.session) {
        main.innerHTML = `<div class="panel"><h2>Revisa tu correo</h2><p>Te hemos enviado un enlace a <b>${esc(email)}</b> para confirmar la cuenta. Después vuelve aquí y entra.</p>
          <button class="primary" data-act="auth-mode" data-mode="signin">Ir a entrar</button></div>`;
      }
    } else if (kind === 'reset') {
      if (!email) return authError('Escribe tu correo.');
      await api.auth.sendReset(email);
      main.innerHTML = `<div class="panel"><h2>Correo enviado</h2><p>Si existe una cuenta con <b>${esc(email)}</b>, te llegará un enlace para elegir una contraseña nueva.</p>
        <button class="primary" data-act="auth-mode" data-mode="signin">Volver</button></div>`;
    } else if (kind === 'newpass') {
      const np = $('#np').value;
      if (np.length < 6) return authError('Mínimo 6 caracteres.');
      await api.auth.updatePassword(np);
      S.recovery = false;
      history.replaceState(null, '', location.pathname);
      toast('Contraseña cambiada');
      render();
      if (!S.uid) onSignedIn(await api.auth.session());
    }
  } catch (e) {
    authError(errMsg(e));
  } finally {
    if (btn.isConnected) btn.disabled = false;
  }
}

export async function onSignedIn(session) {
  if (!session || session.user.id === S.uid) return;
  S.uid = session.user.id;
  S.email = session.user.email || '';
  S.loading = true;
  window.__bootStep = 'empezando';
  setImageRemote(api.imageStore ? api.imageStore(S.uid) : null);
  render();
  // Lo pendiente se envía mientras se cargan los datos, sin esperarlo: lo que había en la cola al
  // empezar (y lo que siga en ella) se aplica encima de lo cargado, así que nada se pierde aunque el
  // servidor aún no lo tenga
  let queued = [];
  if (api.offline) {
    if (!session.offline) rememberUser(session.user);
    const first = api.offline.start(S.uid, n => { S.pending = n; netState(); });
    queued = api.offline.pendingOps();
    first.then(afterFlush);
  }
  try {
    // La copia guardada se lee a la vez que se piden los datos: sin red se abre con ella en el acto
    // en vez de esperar a los reintentos
    const snapP = api.offline ? loadSnapshot(S.uid).catch(() => null) : Promise.resolve(null);
    let d;
    window.__bootStep = 'pidiendo tus datos a Supabase';
    try {
      if (session.offline) throw new TypeError('Failed to fetch');
      try { d = await api.loadAll(S.uid, { retry: false }); }
      catch (e) { if (!isOffline(e) || await snapP) throw e; d = await api.loadAll(S.uid); }
      S.fromCache = false;
    } catch (e) {
      const snap = await snapP;
      if (!snap || !isOffline(e)) throw e;
      d = snap; S.fromCache = true;
    }
    window.__bootStep = 'preparando tus datos';
    applyData(withPending(d, queued));
    window.__bootStep = 'pintando Hoy';
    S.loading = false;
    netState();
    migrateDeckLangs();
    dedupeTypes();
    if (!S.fromCache) dropEmptyPages();
    if (!S.fromCache) purgeExpired();   // lo que lleva más de 30 días en la papelera se borra del todo
    if (!S.fromCache) migrateEntender().then(() => migrateTemas()).then(n => { if (n && ['home', 'page', 'deck'].includes(S.view)) render(); }).catch(() => {});
    // El plan de antes pasa al nuevo (v: 2), con su copia; con la copia de este navegador, solo en memoria
    if (migrateLoaded() && !S.fromCache) savePrefsSoon();
    if (!S.fromCache) saveSnap();
    loadFriends(true);
    restoredNotice();
    if (S.pendingShare) { const id = S.pendingShare; S.pendingShare = null; S.view = 'explore'; render(); openPublicPreview(id); return; }
    if (S.pendingFriend) { const code = S.pendingFriend; S.pendingFriend = ''; S.view = 'friends'; render(); inviteSheet(code); return; }
    render();
    if (!maybeResumeSim()) { maybeIntro(); maybeNews(); }
    pushAutoSync();
  } catch (e) {
    S.loading = false;
    main.innerHTML = `<div class="panel"><h2>No se pudieron cargar tus datos</h2><p>${esc(errMsg(e))}</p><button class="primary" data-act="reload">Reintentar</button></div>`;
  }
}
function applyData(d) {
  S.name = d.profile?.display_name || '';
  S.newPerDay = d.settings?.new_per_day ?? 15;
  S.prefs = loadPrefs(d.settings?.prefs);
  applyLook(S.prefs.look); setBaseRate(S.prefs.study.rate);
  S.events = (d.events || []).map(e => ({ ...e, t: new Date(e.ts).getTime() }));
  S.decks = new Map(d.decks.map(x => [x.id, { tags: [], ...x }]));
  S.folders = new Map((d.folders || []).map(x => [x.id, x]));
  S.tags = new Map((d.tags || []).map(x => [x.id, x]));
  S.types = new Map((d.types || []).map(x => [x.id, x]));
  S.cards = new Map(d.cards.map(x => [x.id, x]));
  S.progress = new Map(d.progress.map(r => [r.card_id, api.fromRow(r)]));
  S.log = Object.fromEntries(d.log.map(r => [r.day, r.count]));
  S.pages = new Map((d.pages || []).map(p => [p.id, { ...p, blocks: Array.isArray(p.blocks) ? p.blocks : [] }]));
  S.pagesMissing = !!d.pagesMissing;
  S.pageTagsMissing = !!d.pageTagsMissing;
  splitTrash();   // lo borrado (deleted_at) va a la papelera
}

// Apuntes vacíos de antes de que se descartaran al salir (sin título, sin nada escrito y sin preguntas): fuera
function dropEmptyPages() {
  const used = new Set([...S.cards.values()].map(c => c.page_id));
  for (const p of [...S.pages.values()]) if (isEmptyPage(p, used.has(p.id))) { S.pages.delete(p.id); api.deletePage(p.id).catch(() => {}); }
}

// Las preguntas de los temas de ejemplo que se cargaron como básicas antes de que existieran «Explícalo» y
// «¿Qué pasaría si…?» pasan a su tipo. Solo las que siguen tal cual (pregunta y respuesta del tema, sin nota ni
// pista): una que ya editaste no se toca. Mantienen su id, así que su progreso sigue igual; si se repite, no cambia nada.
export async function migrateEntender() {
  const maybe = [...S.cards.values()].filter(c => c.type_id === 'basic' && /^(Explica|¿Qué pasaría)/.test(c.fields?.q || ''));
  if (!maybe.length) return 0;
  // (también las listas de antes de los temas que han cambiado)
  const lists = await Promise.all(TEMAS.flatMap(t => [t.cards, ...(t.old || [])]).map(u => fetch(u).then(r => r.json()).catch(() => [])));
  const want = new Map();
  for (const list of lists) for (const [i, nu] of temaCards(list).entries()) if (nu.typeId === 'explain' || nu.typeId === 'whatif') want.set(list[i].pregunta, { ...nu, a: list[i].respuesta });
  let n = 0;
  for (const c of maybe) {
    const nu = want.get(c.fields.q), f = c.fields;
    if (!nu || f.a !== nu.a || (f.n || '') !== '' || (c.hint || '') !== '' || Object.keys(f).some(k => !['q', 'a', 'n'].includes(k))) continue;
    const type = getType(nu.typeId), tpl = type.templates[0], sum = summarize(type, tpl, nu.fields);
    const patch = { type_id: nu.typeId, template: tpl.id, fields: nu.fields, front: sum.front.slice(0, 2000) || '—', back: sum.back.slice(0, 2000) || '—', note: sum.note.slice(0, 2000) };
    Object.assign(c, patch);
    api.updateCard(c.id, patch).catch(() => {});
    n++;
  }
  if (n) saveSnap();
  return n;
}

// Los temas de ejemplo cuyas preguntas han cambiado (ahora «Por qué se te olvidan las cosas» tiene una de cada
// tipo): en la lista de quien ya lo tenía, las del tema de antes que siguen tal cual y ya no están se quitan, las
// nuevas se añaden (unidas a su apartado) y las que tienen el mismo texto se quedan con su progreso (si cambian
// de tipo o de campos, se actualizan sin cambiar su id). Lo que hayas añadido o editado tú no se toca.
// Si se repite, no cambia nada.
const noteKey = f => fold(String(f?.q ?? f?.x ?? f?.s ?? f?.t ?? f?.h ?? f?.a ?? '').replace(/\{\{|\}\}/g, ''));
// Un apunte tal como se creó (sin los id de los bloques), para saber si lo has tocado
const blockSig = b => [b.type, String(b.text || '').replace(/\s+/g, ' ').trim(), b.src || '', b.indent || 0, !!b.checked, b.icon || ''];
const sameBlocks = (a, b) => a.length === b.length && a.every((x, i) => JSON.stringify(blockSig(x)) === JSON.stringify(blockSig(b[i])));
// El apunte de un tema que no has tocado desde que lo añadiste (igual que el de alguna versión de antes) pasa al de
// ahora; cada pregunta sigue unida a su apartado (el mismo texto o, si no, el mismo título por encima). Si lo has
// editado, se queda como está. Devuelve si lo ha cambiado.
async function renewTemaPage(t, p, want) {
  const olds = await Promise.all((t.oldPages || []).map(u => fetch(u, { cache: 'no-cache' }).then(r => r.ok ? r.text() : null).catch(() => null)));
  if (!olds.some(md => md && sameBlocks(p.blocks, markdownToPage(md, u0(t)).blocks))) return false;
  const { blocks } = await readTema(t);
  await storeTemaImages(blocks);
  const before = p.blocks, headOf = (list, i) => { for (let k = i; k >= 0; k--) if (/^h[1-3]$/.test(list[k].type)) return list[k]; return null; };
  const key = b => (b ? JSON.stringify(blockSig(b).slice(0, 2)) : '');
  const relink = c => {
    const x = want.find(w => noteKey(w.fields) === noteKey(c.fields));
    if (x) return blockFor({ blocks }, x.block || x.answer);
    const i = before.findIndex(b => b.id === c.block_id);
    if (i < 0) return c.block_id;
    const same = blocks.find(b => key(b) === key(before[i]));
    const head = headOf(before, i), sameHead = head && blocks.find(b => key(b) === key(head));
    return (same || sameHead)?.id || blockFor({ blocks }, plain(c.back || c.front || ''));
  };
  for (const c of [...S.cards.values()].filter(c => c.page_id === p.id || c.deck_id === p.deck_id)) {
    const id = relink(c);
    if (id && id !== c.block_id) { c.block_id = id; api.updateCard(c.id, { block_id: id }).catch(() => {}); }
  }
  p.blocks = blocks;
  savePageSoon(p, 0);
  return true;
}
const u0 = t => t.file;
export async function migrateTemas() {
  let n = 0;
  for (const t of TEMAS.filter(t => t.old)) {
    const src = temaSource(t), decks = [...S.decks.values()].filter(d => d.source === src);
    if (!decks.length) continue;
    // (las preguntas de cualquiera de sus versiones de antes)
    const [now, ...befores] = await Promise.all([t.cards, ...t.old].map(u => fetch(u, { cache: 'no-cache' }).then(r => r.json()).catch(() => null)));
    if (!now || !befores.some(Boolean)) continue;
    const oldKeys = new Set(befores.filter(Boolean).flatMap(b => temaCards(b).map(x => noteKey(x.fields))));
    for (const d of decks) {
      const pg = [...S.pages.values()].find(p => p.deck_id === d.id);
      if (pg && await renewTemaPage(t, pg, temaCards(now))) n++;
      const notes = new Map();
      for (const c of [...S.cards.values()].filter(c => c.deck_id === d.id)) (notes.get(c.note_id || c.id) || notes.set(c.note_id || c.id, []).get(c.note_id || c.id)).push(c);
      const byKey = new Map([...notes.values()].map(cs => [noteKey(cs[0].fields), cs]));
      const want = temaCards(now), wantKeys = new Set(want.map(x => noteKey(x.fields)));
      // Las del tema de antes que ya no están (y siguen tal cual): fuera
      for (const [k, cs] of byKey) {
        if (wantKeys.has(k) || !oldKeys.has(k)) continue;
        for (const c of cs) { S.cards.delete(c.id); S.progress.delete(c.id); api.deleteCard(c.id).catch(() => {}); n++; }
      }
      // Las que siguen: el mismo id (y su progreso), con su tipo y sus campos de ahora
      for (const x of want) {
        const cs = byKey.get(noteKey(x.fields));
        if (!cs || cs.length !== 1 || (cs[0].type_id === x.typeId && JSON.stringify(cs[0].fields) === JSON.stringify(x.fields))) continue;
        const type = getType(x.typeId), tpls = activeTemplates(type, x.fields);
        if (tpls.length !== 1) continue;
        const c = cs[0], sum = summarize(type, tpls[0], x.fields);
        const patch = { type_id: x.typeId, template: tpls[0].id, fields: x.fields, front: sum.front.slice(0, 2000) || '—', back: sum.back.slice(0, 2000) || '—', note: sum.note.slice(0, 2000) };
        Object.assign(c, patch); api.updateCard(c.id, patch).catch(() => {}); n++;
      }
      // Las nuevas
      const p = [...S.pages.values()].find(p => p.deck_id === d.id);
      const add = now.filter((x, i) => !byKey.has(noteKey(want[i].fields)));
      if (p && add.length) { await makeSuggested(p, await temaPicks(p, add), d.id, src); n += add.length; }
    }
  }
  if (n) saveSnap();
  return n;
}

/* ===================== bienvenida ===================== */
// La presentación sale una vez, a quien entra sin nada todavía. Se recuerda en la cuenta (Ajustes) y en
// este navegador, por si se cierra antes de que se guarde.
const INTRO_KEY = 'flaski-intro-done';
const introDone = () => S.prefs.intro.done || (() => { try { return localStorage.getItem(INTRO_KEY) === '1'; } catch { return false; } })();
function maybeIntro() {
  if (!introDone() && S.decks.size === 0 && S.pages.size === 0 && !S.session && !S.recovery) showFirstRun();
}
const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};
// Novedades de la versión: al entrar, a quien aún no las ha visto (no a quien acaba de llegar: a ese, la bienvenida)
const NEWS_KEY = 'flaski-news-seen';
function maybeNews() {
  let seen = '';
  try { seen = localStorage.getItem(NEWS_KEY) || ''; } catch { /* sin almacenamiento */ }
  const newcomer = !introDone() && S.decks.size === 0 && S.pages.size === 0;
  if (!hasNews() || newcomer || S.noNews || S.session || S.recovery || document.querySelector('.ob') || seen === 'never' || (!NEWS_ALWAYS && seen === NEWS_VERSION)) return;
  showNews();
}
export function showNews() {
  if (!hasNews()) return;
  openNews({ dark: isDark, onClose: () => { try { if (localStorage.getItem(NEWS_KEY) !== 'never') localStorage.setItem(NEWS_KEY, NEWS_VERSION); } catch { /* sin almacenamiento */ } } });
}
export async function showIntro() {
  if (document.querySelector('.ob')) return;
  let examples = S.builtin;
  if (!examples) { try { examples = S.builtin = await (await fetch('decks/index.json', { cache: 'no-cache' })).json(); } catch { examples = []; } }
  const counts = new Map();
  for (const d of S.decks.values()) { const l = d.options?.lang; if (l) counts.set(l, (counts.get(l) || 0) + 1); }
  const common = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  openOnboarding({
    name: S.name,
    langs: LANGS.filter(l => l.id && l.id !== nativeLang()),
    examples,
    defaultLang: common || (nativeLang().startsWith('en') ? 'es-ES' : 'en-GB'),
    dark: isDark,
    onFinish: introChosen,
  });
}
function introSeen() {
  S.prefs.intro.done = true;
  try { localStorage.setItem(INTRO_KEY, '1'); } catch {}
  savePrefsSoon();
}
async function introChosen(choice) {
  introSeen();
  const kind = choice?.kind;
  if (kind === 'lang') {
    try {
      const d = await api.createDeck({ owner: S.uid, name: langLabel(choice.lang), options: { lang: choice.lang } });
      S.decks.set(d.id, { tags: [], ...d });
      go('deck', { deckId: d.id, cardQuery: '' });
      toast('Lista creada: añade tu primera pregunta');
      return cardForm(null, { deckId: d.id });
    } catch (e) { return fail(e); }
  }
  if (kind === 'example') { go('explore'); return openBuiltinPreview(choice.file); }
  if (kind === 'notes') { go('notes', { noteFolder: null }); return newPage(); }
  if (kind === 'ia') { go('decks', { folderId: null }); return pasteSheet(); }
  if (kind === 'explore') return go('explore');
  go('home');
}

// Tras restaurar una copia y recargar: «Copia restaurada: N cosas añadidas» (o «ya lo tenías todo»)
function restoredNotice() {
  let before = null;
  try { before = sessionStorage.getItem('flaski-restored'); sessionStorage.removeItem('flaski-restored'); } catch { return; }
  if (before == null) return;
  const n = S.decks.size + S.cards.size + S.pages.size + S.folders.size - Number(before);
  setTimeout(() => toast(n > 0 ? `Copia restaurada: ${n === 1 ? '1 cosa añadida' : `${n} cosas añadidas`}` : 'Copia restaurada: ya lo tenías todo'), 300);
}
/* ===================== primera vez ===================== */
// Un tema de ejemplo como apunte (también para los datos de ejemplo de ?local)
// Las imágenes que cita el apunte de un tema (img:<id>, en temas/<id>.svg), guardadas antes de crear y pintar el
// apunte para que salgan ya cargadas
export async function storeTemaImages(blocks) {
  const ids = new Set((blocks || []).flatMap(b => [b.type === 'img' ? b.src : '', ...[...String(b.text || '').matchAll(/img:([\w-]+)/g)].map(m => m[1])]).filter(Boolean));
  let n = 0;
  for (const id of ids) {
    const r = await fetch(`temas/${id}.svg`, { cache: 'no-cache' }).catch(() => null);
    if (!r?.ok) continue;
    await storeImage(id, new Uint8Array(await r.arrayBuffer()), 'image/svg+xml');
    n++;
  }
  if (n) flushUploads();
}
export async function readTema(t) {
  const md = await (await fetch(t.file, { cache: 'no-cache' })).text();
  return { ...markdownToPage(md, t.file), name: t.title, kind: 'example', cards: t.cards, count: t.count, leer: !!t.leer };
}
// Apartados de un apunte (los títulos de más arriba), cuántas preguntas salen y con cuántas se empieza
function analyzePage(page) {
  const top = ['h1', 'h2', 'h3'].find(h => page.blocks.some(b => b.type === h));
  const list = suggestCards({ id: 'nuevo', ...page }, { native: nativeLang() });
  return { sections: top ? page.blocks.filter(b => b.type === top).map(b => b.text.replace(/[*_]/g, '').trim()).filter(Boolean) : [], total: list.length, first: firstPicks(list).length };
}
export function showFirstRun() {
  if (document.querySelector('.ob')) return;
  const drawings = Object.fromEntries(Object.entries(DRAWING_SVG).map(([k, v]) => [k, v.replace('<svg', '<svg class="dw"')]));
  openFirstRun({
    langs: LANGS.filter(l => l.id && l.id !== nativeLang()),
    examples: () => S.builtin || [],
    defaultLang: nativeLang().startsWith('en') ? 'es-ES' : 'en-GB',
    drawings,
    async readFile(file, say) {
      const kind = fileKind(file.name);
      if (kind === 'pdf') {
        const { r, blocks, title } = await readPdfFile(file, say);
        return { title: title || titleFromFile(file.name), blocks, name: file.name, kind, pages: r.pages.length };
      }
      const [p] = await fileToPages(file);
      return { ...p, title: p?.title || titleFromFile(file.name), name: file.name, kind };
    },
    readText(text) { const p = plainTextToPage(text); return { ...p, title: p.title || 'Mis apuntes', name: p.title || 'Texto pegado', kind: 'txt' }; },
    readExample: readTema,
    analyze: analyzePage,
    onFinish: firstRunChosen,
  });
  // Las listas de ejemplo de cada idioma: si ya están al elegir el idioma, salen (y si llegan luego, al cambiarlo)
  if (!S.builtin) fetch('decks/index.json', { cache: 'no-cache' }).then(r => r.json()).then(x => { S.builtin = x; document.querySelector('.fr #frLang')?.dispatchEvent(new Event('change', { bubbles: true })); }).catch(() => {});
}
async function firstRunChosen(choice) {
  const kind = choice?.kind;
  if (kind === 'anki') document.querySelector('#importFile')?.click();   // antes de esperar a nada: el navegador solo abre el selector justo tras el toque
  introSeen();
  if (!kind) return go('home');
  if (kind === 'lang' || kind === 'example') return introChosen(choice);
  try {
    // La carpeta de la oposición o del examen, con su fecha en el Plan de estudio (el día 1 de ese mes)
    let folderId = null;
    if (choice.folder) {
      const f = await api.createFolder({ name: choice.folder.name, owner: S.uid, color: '', icon: choice.folder.icon || '', parent_id: null });
      S.folders.set(f.id, f);
      folderId = f.id;
      if (choice.folder.exam) {
        const date = choice.folder.exam + '-01', id = examIdFor('f:' + f.id);
        editPlan2().exams.push({ id, name: f.name, scope: { folders: [f.id], decks: [], pages: [] }, date, approx: true, order: [], mode: 'seq', shares: {}, fixed: {}, known: [], exclude: [], boost: {}, lastWeek: daysBetween(dayKey(), date) > 21, retention: 0.9, retentionLast: 0.95, after: 'pause', updated_at: Date.now() });
        savePrefsSoon();
      }
    }
    if (kind === 'anki') return go('decks', { folderId });
    if (kind === 'ia') { go('decks', { folderId }); return pasteSheet(); }
    const { title, blocks } = choice.page;
    if (choice.page.cards) await storeTemaImages(blocks);
    const p = { id: api.newId(), owner: S.uid, title: title || '', icon: '', deck_id: null, folder_id: folderId, tags: [], blocks };
    S.pages.set(p.id, p);
    savePageSoon(p, 0);
    const tema = choice.page.cards;
    const temaSrc = tema ? temaSource({ cards: tema }) : 'apuntes';
    // Un tema de ejemplo se abre por el apunte, arriba del todo, con todas sus preguntas ya creadas: desde ahí
    // se estudia con su botón «Estudiar»
    if (tema && kind === 'open') {
      const list = await (await fetch(tema, { cache: 'no-cache' })).json();
      await makeSuggested(p, await temaPicks(p, list), 'new', temaSrc);
      go('page', { pageId: p.id });
      return scrollTo(0, 0);
    }
    const picks = tema ? await temaFirst(p, tema) : firstPicks(suggestFor(p, ''));
    if (tema && kind === 'review' && picks.length) {
      const { deckId } = await makeSuggested(p, picks, 'new', temaSrc);
      return go('deck', { deckId, cardQuery: '' });
    }
    if (kind === 'tanda' && picks.length) {
      await makeSuggested(p, picks, 'new', temaSrc);
      return startSession('page:' + p.id, { firstRun: true });
    }
    go('page', { pageId: p.id });
    if (kind === 'review' && picks.length) {
      openSuggestions(null, { select: new Set(picks.map(x => x.id)) });
    }
  } catch (e) { fail(e); }
}

/* ===================== sin conexión ===================== */
export const isOffline = e => !navigator.onLine || isRetryable(e);
// Aplica encima de los datos cargados los cambios que aún esperan en la cola: ni el servidor ni la
// copia del navegador (que se guarda con retraso) los tienen por fuerza, y la cola nunca se pierde.
// before: la cola tal como estaba al empezar a cargar (lo que se envió mientras tanto puede no venir en
// lo cargado); se aplica primero y luego la de ahora, que es más reciente.
function withPending(d, before = []) {
  const ops = [...before, ...(api.offline?.pendingOps() || [])];
  if (!ops.length) return d;
  const prog = new Map(d.progress.map(r => [r.card_id, r]));
  const evs = new Map((d.events || []).map(e => [e.id, e]));
  const log = new Map(d.log.map(r => [r.day, r.count]));
  let settings = d.settings;
  const pages = new Map((d.pages || []).map(p => [p.id, p]));
  for (const { op, args } of ops) {
    if (op === 'savePage') pages.set(args[0].id, args[0]);
    if (op === 'saveProgress') prog.set(args[1], toRow(args[0], args[1], args[2]));
    else if (op === 'clearProgress') prog.delete(args[1]);
    else if (op === 'addEvent') evs.set(args[0].id, args[0]);
    else if (op === 'deleteEvent') evs.delete(args[0]);
    // bumpLog(uid, día, +1, total local de ese momento): el total ya incluye la respuesta
    else if (op === 'bumpLog' && args[2] > 0) log.set(args[1], Math.max(log.get(args[1]) || 0, args[3] || 0));
    else if (op === 'saveSettings') settings = { new_per_day: args[1], prefs: args[2] ? mergeSynced(settings?.prefs, args[2]) : settings?.prefs };
  }
  return {
    ...d, settings, progress: [...prog.values()], pages: [...pages.values()],
    events: [...evs.values()].sort((a, b) => String(a.ts).localeCompare(String(b.ts))),
    log: [...log].map(([day, count]) => ({ day, count })),
  };
}
// Copia de lo que hay en pantalla (incluidos los cambios aún sin enviar), para abrir sin conexión
function snapshotData() {
  return {
    profile: { display_name: S.name }, settings: { new_per_day: S.newPerDay, prefs: S.prefs },
    decks: [...S.decks.values()], cards: [...S.cards.values()], folders: [...S.folders.values()],
    tags: [...S.tags.values()], types: [...S.types.values()],
    progress: [...S.progress].map(([id, p]) => toRow(S.uid, id, p)),
    log: Object.entries(S.log).map(([day, count]) => ({ day, count })),
    events: S.events.map(({ t, ...e }) => e),
    pages: [...S.pages.values()],
  };
}
let snapTimer;
function saveSnap() {
  clearTimeout(snapTimer); snapTimer = null;
  if (api.offline && S.uid && !S.loading) saveSnapshot(S.uid, snapshotData());
}
export function saveSnapSoon() { if (api.offline) { clearTimeout(snapTimer); snapTimer = setTimeout(saveSnap, 3000); } }
// Aviso en la cabecera: sin conexión y/o cambios por enviar
function netState() {
  const el = $('#net');
  if (!el) return;
  const off = !navigator.onLine || S.fromCache;
  const n = S.pending;
  el.hidden = !S.uid || (!off && !n);
  el.innerHTML = off
    ? `${icon('wifi-off', { size: 14 })}<span>Sin conexión${n ? ` · ${plural(n, 'cambio', 'cambios')} por enviar` : ''}</span>`
    : `${icon('refresh-cw', { size: 14 })}<span>${plural(n, 'cambio', 'cambios')} por enviar</span>`;
  el.title = off ? 'Puedes seguir estudiando: lo que hagas se guarda aquí y se envía al volver la conexión.' : 'Se enviarán en cuanto el servidor responda.';
}
// Con todo enviado y conexión de nuevo, si la app se abrió con la copia, se cargan los datos frescos
async function afterFlush(ok) {
  if (!ok || !S.fromCache || !navigator.onLine || !S.uid || S.view === 'study' || S.edit?.open) return;
  try {
    // Sin una sesión válida, Supabase devolvería listas vacías: mejor seguir con la copia
    const s = await api.auth.session();
    if (s?.user?.id !== S.uid) return;
    const d = await api.loadAll(S.uid);
    applyData(withPending(d)); migrateDeckLangs(); S.fromCache = false; netState(); saveSnap(); render();
  } catch {}
}
function retrySync() { if (api.offline && S.uid) api.offline.flush().then(afterFlush); }
addEventListener('online', () => { netState(); retrySync(); });
addEventListener('offline', netState);
setInterval(() => { if (S.pending || S.fromCache) retrySync(); }, 30e3);
addEventListener('pagehide', saveSnap);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveSnap(); else retrySync(); });

export function onSignedOut() {
  // Los cambios sin enviar se quedan guardados con la cuenta: se envían la próxima vez que entre
  api.offline?.stop();
  clearTimeout(snapTimer);
  Object.assign(S, { uid: null, email: '', name: '', decks: new Map(), folders: new Map(), tags: new Map(), types: new Map(), cards: new Map(), progress: new Map(), log: {}, events: [], view: 'home', folderId: null, session: null, pub: null, loading: true, authMode: 'signin', fromCache: false, pending: 0, pages: new Map(), pageId: null, friends: null });
  netState();
  render();
}
