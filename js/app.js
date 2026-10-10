// Flaski · lógica de la interfaz
// Estructura: estado (S) → funciones render*() que pintan cada vista → manejadores de eventos.
import * as api from './api.js';
import { toRow, progressCols } from './rows.js';
import { schedule, fmtWhen, startOfDay, dateKey, DAY, GRADES, ALGO_PRESETS, DEFAULT_ALGO } from './srs.js';
import { DEFAULT_PREFS, loadPrefs, algoFor, applyLook, applySavedLook, ACCENTS, FONTS, CARD_SIZES, ALGO_FIELDS } from './prefs.js';
import { statsView, drawStats } from './stats.js';
import { APP_NAME } from './config.js';
import { cardsFromCSV, cardsToCSV } from './csv.js';
import { heatmap, forecast, maturity, streaks, initChartTips, scrollChartsToEnd } from './charts.js';
import { mountEmojiPicker } from './emoji-picker.js';
import { icon } from './icons.js';
import { BUILTIN_TYPES, MODES, LANGS, CLOZE_RE, RUBY_RE, NEEDS_ANSWER, stripRuby, isCJK, orderTokens, orderJoin, activeTemplates, summarize, missingFor, legacyFields, splitQuick, checkTyped, choiceOptions, blankType, copyType, nextId, resolveType, typeFit, typeScope, LANG_ROLES, STUDY, baseLang, parsePairs, parseMasks, masksToText, imageIdIn, MAX_MASKS, parseGroups, clozeAnswer, checkNumber } from './cardtypes.js';
import { speak, stopSpeaking, ttsAvailable, setBaseRate } from './tts.js';
import { charsOf, canQuiz, startQuiz, startCanvas, animateChars } from './handwriting.js';
import { COLORS, SORTS, colorVar, folderPath, folderTree, decksInFolder, sortDecks, matchesDeck, descendants } from './org.js';
import { saveSnapshot, loadSnapshot, deleteSnapshot, rememberUser, lastUser, forgetUser } from './snapshot.js';
import { isRetryable } from './outbox.js';
import { isNotesDeck, notesToDeck, parsePasted } from './notes.js';
import { openOnboarding } from './onboarding.js';
import { formatCode, cleanCode, inviteLink, parseInvite, weekDays, WEEK_LETTERS, weekTotal, ranking, initial } from './friends.js';
import { readPdf, pdfToBlocks } from './pdf.js';
import { suggestCards, PRESELECT } from './suggest.js';
import { readApkg, ankiToFlaski, ankiProgress, ankiHistory } from './anki.js';
import { addImage, storeImage, imageType, newImageId, flushUploads, hydrate, imgToken, imageIdsOf, exportImages, importImages, setRemote as setImageRemote, stripImages, IMG_RE } from './media.js';
import { BLOCK_TYPES, BLOCK_MENU, NO_TEXT, olNumbers, newBlock, imageBlock, shortcut, textToBlocks, splitBlock, mergeBlocks, clozeFrom, pageTitle, pageSearchText, parseTable, isTableText, tableToMarkdown, gridFromPaste, TABLE_TEMPLATE, cardsStatus, sectionIds, STATUS, pageToMarkdown, pageSnippet } from './pages.js';

const $ = s => document.querySelector(s);
const main = $('#main');

const S = {
  uid: null, email: '', name: '',
  newPerDay: 15,
  decks: new Map(),      // id → mazo
  folders: new Map(),    // id → carpeta
  tags: new Map(),       // id → etiqueta
  types: new Map(),      // id → tipo de tarjeta personalizado
  cards: new Map(),      // id → tarjeta
  progress: new Map(),   // cardId → srs (ms)
  log: {},               // 'YYYY-MM-DD' → nº de repasos
  events: [],            // cada respuesta (para Estadísticas)
  prefs: loadPrefs(),    // Ajustes
  stats: { period: 30, scope: 'all', mode: '', fcDays: 30 },
  view: 'home', deckId: null, folderId: null, session: null,
  extra: (() => { try { return JSON.parse(localStorage.getItem('flaski-extra') || 'null'); } catch { return null; } })(),   // «10 nuevas más» de hoy
  // Opciones de la vista «Mis mazos» (se recuerdan en este navegador)
  org: { query: '', tagIds: [], sort: 'manual', layout: 'list', archived: false },
  cardQuery: '', exploreQuery: '',
  pub: null, builtin: null,   // cachés de Explorar
  authMode: 'signin', recovery: false, loading: true,
  pendingShare: null,          // id de mazo compartido por enlace
  pendingFriend: '',           // código de un enlace de invitación de amistad
  friends: null,               // amigos: { me, list, requests, cheers, … } (se cargan aparte)
  lastField: null,
  pages: new Map(),            // id → página de apuntes
  pagesMissing: false,         // la tabla de apuntes aún no existe en Supabase
  pageId: null, pageQuery: '', focusBlock: null,
  noteFolder: null,                              // carpeta abierta en «Apuntes»
  noteOrg: { tagIds: [], sort: 'recent' },       // filtros y orden de la lista de apuntes
  fromCache: false,            // datos cargados de la copia del navegador (se abrió sin conexión)
  pending: 0,                  // cambios esperando a enviarse
};

/* ===================== utilidades ===================== */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Formato sencillo: *cursiva*, **negrita**, saltos de línea, furigana 漢字[かんじ] e imágenes ![pie](img:id)
// (las imágenes se cargan después: ver hydrate en media.js)
const imgHTML = (id, alt = '') => `<img class="media" data-img="${id}" alt="${alt}" loading="lazy" decoding="async">`;
function fmt(s) {
  return esc(s).replace(IMG_RE, (_, alt, id) => imgHTML(id, alt)).replace(RUBY_RE, '<ruby>$1<rt>$2</rt></ruby>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/\n/g, '<br>');
}
// Cada vez que se pinta algo con imágenes, se cargan (del navegador o de la nube)
let hydrateQueued = false;
new MutationObserver(() => {
  if (hydrateQueued) return;
  hydrateQueued = true;
  queueMicrotask(() => { hydrateQueued = false; hydrate(document); });
}).observe(document.body, { childList: true, subtree: true });
const plain = s => stripImages(s).replace(/\*/g, '');
const norm = s => plain(s).toLocaleLowerCase();
const cardList = () => [...S.cards.values()];
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}
function errMsg(e) {
  const m = (e && (e.message || e.error_description)) || '';
  if (/Invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Confirma tu email antes de entrar (revisa tu bandeja de entrada).';
  if (/already registered/i.test(m)) return 'Ya existe una cuenta con ese email.';
  if (/Password should be/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/rate limit/i.test(m)) return 'Demasiados intentos. Espera unos minutos.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Revisa tu internet.';
  return m || 'Algo ha fallado. Inténtalo de nuevo.';
}
const fail = e => toast(errMsg(e));
function deckColor(id) {
  const d = S.decks.get(id);
  if (d?.color) return colorVar(d.color);
  const ids = [...S.decks.keys()];
  const i = Math.max(0, ids.indexOf(id));
  return `var(--d${(i % 6) + 1})`;
}
// Icono del mazo: su emoji o, si no tiene, un punto de su color
function deckIcon(d, big = false) {
  return d.icon ? `<span class="icon${big ? ' icon-big' : ''}" aria-hidden="true">${esc(d.icon)}</span>`
    : `<span class="dot${big ? ' dot-big' : ''}" style="background:${deckColor(d.id)}"></span>`;
}
function folderIcon(f, big = false) {
  return f.icon ? `<span class="icon${big ? ' icon-big' : ''}" aria-hidden="true">${esc(f.icon)}</span>`
    : `<span class="ficon${big ? ' icon-big' : ''}" style="color:${f.color ? colorVar(f.color) : 'var(--muted)'}">${icon('folder', { size: big ? 30 : 20 })}</span>`;
}
function tagChips(ids = []) {
  return ids.map(id => S.tags.get(id)).filter(Boolean)
    .map(t => `<span class="tag" style="--tag-bg:var(--tag-${t.color || 'gray'}-bg);--tag-fg:var(--tag-${t.color || 'gray'})">${esc(t.name)}</span>`).join('');
}
// Ámbito de estudio: 'all', un id de mazo, o 'folder:<id>' / 'tag:<id>'
function scopeDecks(scope = 'all') {
  const active = [...S.decks.values()].filter(d => !d.archived);
  if (scope === 'all') return new Set(active.map(d => d.id));
  if (scope.startsWith('folder:')) return new Set(decksInFolder(S.decks, S.folders, scope.slice(7)).filter(d => !d.archived).map(d => d.id));
  if (scope.startsWith('tag:')) { const t = scope.slice(4); return new Set(active.filter(d => (d.tags || []).includes(t)).map(d => d.id)); }
  return new Set([scope]);
}
// Qué tarjetas entran en un ámbito. Además de los de mazos: 'page:<id>' (las de unos apuntes) y
// 'page:<id>:<bloque>' (las de un apartado: el título y lo que cuelga de él).
function scopeTest(scope = 'all') {
  if (scope.startsWith('page:')) {
    const [, pid, bid] = scope.split(':');
    const p = S.pages.get(pid), live = scopeDecks('all');
    const blocks = bid && p ? new Set(sectionIds(p.blocks, bid)) : null;
    return c => c.page_id === pid && (!blocks || blocks.has(c.block_id)) && live.has(c.deck_id);
  }
  const ids = scopeDecks(scope);
  return c => ids.has(c.deck_id);
}
function scopeName(scope = 'all') {
  if (scope.startsWith('page:')) {
    const [, pid, bid] = scope.split(':'), p = S.pages.get(pid);
    const b = bid && p?.blocks.find(x => x.id === bid);
    return p ? `${pageTitle(p)}${b ? ` › ${plain(b.text).slice(0, 40)}` : ''}` : 'Apuntes';
  }
  if (scope === 'all') return 'Todos los mazos';
  if (scope.startsWith('folder:')) return S.folders.get(scope.slice(7))?.name || 'Carpeta';
  if (scope.startsWith('tag:')) return '#' + (S.tags.get(scope.slice(4))?.name || 'etiqueta');
  return S.decks.get(scope)?.name || 'Mazo';
}
const deckName = id => scopeName(id);
function saveOrgPrefs() { try { localStorage.setItem('flaski-org', JSON.stringify({ sort: S.org.sort, layout: S.org.layout })); } catch {} }
function loadOrgPrefs() { try { Object.assign(S.org, JSON.parse(localStorage.getItem('flaski-org') || '{}')); } catch {} }
const shareUrl = id => `${location.origin}${location.pathname}#d-${id}`;

/* ===================== cálculos ===================== */
function newSeenToday(deckId = null) {
  const t0 = startOfDay();
  let n = 0;
  for (const [id, p] of S.progress) if (p.firstSeen >= t0 && (!deckId || S.cards.get(id)?.deck_id === deckId)) n++;
  return n;
}
// «10 nuevas más»: vale solo el día en que se pidió (y para la cuenta que lo pidió) y se guarda en este
// navegador para que sobreviva a recargar. Se suma a la vez al límite global y al de cada mazo: los dos se
// aplican juntos y el global acota el total, así que el efecto real es +10, no +20; sumarlo también al del
// mazo evita que un mazo con su propio límite agotado ignore el botón.
function extraNew() { const x = S.extra; return x && x.day === dateKey(Date.now()) && x.uid === S.uid ? x.n : 0; }
function addExtraNew(n) {
  S.extra = { uid: S.uid, day: dateKey(Date.now()), n: extraNew() + n };
  try { localStorage.setItem('flaski-extra', JSON.stringify(S.extra)); } catch {}
}
const newLeft = () => Math.max(0, S.newPerDay + extraNew() - newSeenToday());
// Límite propio del mazo (Opciones del mazo); Infinity si usa el global
function deckNewLeft(deckId) {
  const n = S.decks.get(deckId)?.options?.newPerDay;
  return n === null || n === undefined || n === '' ? Infinity : Math.max(0, Number(n) + extraNew() - newSeenToday(deckId));
}
// Repasos (no nuevas) hechos hoy y los que quedan según Ajustes
function reviewsToday() {
  const t0 = startOfDay();
  let n = 0;
  for (const p of S.progress.values()) if (p.last >= t0 && p.firstSeen < t0) n++;
  return n;
}
const reviewsLeft = () => (S.prefs.study.maxReviews > 0 ? Math.max(0, S.prefs.study.maxReviews - reviewsToday()) : Infinity);
const algo = deckId => algoFor(S.prefs, S.decks.get(deckId));
// Aviso cuando el límite diario de repasos deja tarjetas fuera (si no, el recorte pasaría desapercibido)
function capNote(c) {
  const over = c.dueAll - c.due;
  if (over <= 0) return '';
  return `<p class="muted small">${over} ${over === 1 ? 'repaso más espera' : 'repasos más esperan'}: hoy el límite es de ${S.prefs.study.maxReviews} repasos. <button class="link" data-nav="settings">Cambiar el límite</button></p>`;
}
function counts(scope = 'all') {
  const inScope = scopeTest(scope);
  const now = Date.now();
  let due = 0, fresh = 0, total = 0, mature = 0;
  const freshBy = new Map();
  for (const c of S.cards.values()) {
    if (!inScope(c)) continue;
    total++;
    const p = S.progress.get(c.id);
    if (!p) { fresh++; freshBy.set(c.deck_id, (freshBy.get(c.deck_id) || 0) + 1); } else { if (p.due <= now) due++; if (p.interval >= 21) mature++; }
  }
  let capped = 0;
  for (const [d, n] of freshBy) capped += Math.min(n, deckNewLeft(d));
  // dueAll: todas las que tocan; due: las que caben hoy en el límite de repasos (Ajustes → Estudio diario)
  return { due: Math.min(due, reviewsLeft()), dueAll: due, fresh, total, mature, newToday: Math.min(capped, newLeft()) };
}

/* ===================== navegación ===================== */
function go(view, extra = {}) {
  Object.assign(S, { view }, extra);
  closeSheet(); closeBlockMenu();
  render();
  window.scrollTo(0, 0);
}
function render() {
  const authed = !!S.uid && !S.recovery;
  $('#nav').hidden = !authed || S.view === 'study';
  document.body.classList.toggle('no-nav', $('#nav').hidden);
  for (const b of document.querySelectorAll('[data-nav]')) {
    const cur = b.dataset.nav === S.view || (b.dataset.nav === 'decks' && S.view === 'deck') || (b.dataset.nav === 'profile' && ['settings', 'friends'].includes(S.view)) || (b.dataset.nav === 'notes' && S.view === 'page');
    if (cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  $('#banner').hidden = !(api.mode === 'local' && S.view === 'home');
  if (S.recovery) return renderNewPassword();
  if (!S.uid) return renderAuth();
  if (S.loading) { main.innerHTML = '<div class="empty"><div class="spin" aria-label="Cargando"></div><p class="muted">Cargando tus tarjetas…</p></div>'; return; }
  ({ home: renderHome, study: renderStudy, decks: renderDecks, deck: renderDeck, explore: renderExplore, notes: renderNotes, page: renderPage, profile: renderProfile, friends: renderFriends, stats: renderStats, settings: renderSettings }[S.view] || renderHome)();
}

/* ===================== sin configurar ===================== */
function renderSetup() {
  main.innerHTML = `<div class="panel"><h2>Falta un paso</h2>
    <p>La app todavía no está conectada a una base de datos. Abre <b>js/config.js</b> y pega la URL y la clave de tu proyecto de Supabase.</p>
    <p class="muted small">Tienes los pasos detallados en el archivo README.md.</p></div>`;
}

/* ===================== cuenta ===================== */
function renderAuth() {
  const up = S.authMode === 'signup';
  const reset = S.authMode === 'reset';
  main.innerHTML = `
    <div class="panel">
      <h1>${reset ? 'Recuperar contraseña' : up ? 'Crea tu cuenta' : 'Entra en tu cuenta'}</h1>
      <p class="muted">${reset ? 'Te enviaremos un email para elegir una contraseña nueva.' : 'Cada persona tiene sus propios mazos y su propio progreso.'}</p>
      ${reset ? '' : `<div class="seg" role="group" aria-label="Tipo de acceso">
        <button type="button" data-act="auth-mode" data-mode="signin" aria-pressed="${!up}">Entrar</button>
        <button type="button" data-act="auth-mode" data-mode="signup" aria-pressed="${up}">Crear cuenta</button></div>`}
      <form data-form="${reset ? 'reset' : up ? 'signup' : 'signin'}" novalidate>
        ${up ? '<label for="a-name">Tu nombre</label><input id="a-name" autocomplete="nickname" maxlength="40" required>' : ''}
        <label for="a-email">Email</label>
        <input id="a-email" type="email" autocomplete="email" inputmode="email" required>
        ${reset ? '' : `<label for="a-pass">Contraseña</label>
        <input id="a-pass" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" minlength="6" required>
        ${up ? '<p class="hint">Mínimo 6 caracteres.</p>' : ''}`}
        <p class="error" id="a-error" hidden></p>
        <button class="primary big" type="submit" style="margin-top:12px">${reset ? 'Enviar email' : up ? 'Crear cuenta' : 'Entrar'}</button>
      </form>
      ${reset ? '<button class="link" data-act="auth-mode" data-mode="signin">Volver</button>'
        : up ? '' : '<button class="link" data-act="auth-mode" data-mode="reset">He olvidado mi contraseña</button>'}
    </div>`;
}
function renderNewPassword() {
  main.innerHTML = `<div class="panel"><h1>Nueva contraseña</h1>
    <form data-form="newpass"><label for="np">Contraseña nueva</label>
    <input id="np" type="password" autocomplete="new-password" minlength="6" required>
    <p class="error" id="a-error" hidden></p>
    <button class="primary big" type="submit" style="margin-top:12px">Guardar contraseña</button></form></div>`;
}
function authError(msg) { const e = $('#a-error'); if (e) { e.textContent = msg; e.hidden = false; } }

async function submitAuth(kind, form) {
  const btn = form.querySelector('[type=submit]');
  const email = $('#a-email')?.value.trim();
  const pass = $('#a-pass')?.value;
  btn.disabled = true;
  try {
    if (kind === 'signin') {
      if (!email || !pass) return authError('Escribe tu email y tu contraseña.');
      await api.auth.signIn(email, pass);
    } else if (kind === 'signup') {
      const name = $('#a-name').value.trim();
      if (!name || !email || !pass) return authError('Rellena todos los campos.');
      if (pass.length < 6) return authError('La contraseña debe tener al menos 6 caracteres.');
      const res = await api.auth.signUp(email, pass, name);
      if (!res.session) {
        main.innerHTML = `<div class="panel"><h2>Revisa tu email</h2><p>Te hemos enviado un enlace a <b>${esc(email)}</b> para confirmar la cuenta. Después vuelve aquí y entra.</p>
          <button class="primary" data-act="auth-mode" data-mode="signin">Ir a entrar</button></div>`;
      }
    } else if (kind === 'reset') {
      if (!email) return authError('Escribe tu email.');
      await api.auth.sendReset(email);
      main.innerHTML = `<div class="panel"><h2>Email enviado</h2><p>Si existe una cuenta con <b>${esc(email)}</b>, te llegará un enlace para elegir una contraseña nueva.</p>
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

async function onSignedIn(session) {
  if (!session || session.user.id === S.uid) return;
  S.uid = session.user.id;
  S.email = session.user.email || '';
  S.loading = true;
  setImageRemote(api.imageStore ? api.imageStore(S.uid) : null);
  render();
  if (api.offline) {
    if (!session.offline) rememberUser(session.user);
    // Primero se envía lo que quedó pendiente, para que lo que se cargue ya lo incluya
    // (sin esperar más de 4 s: si tarda, se carga igual y lo pendiente se aplica encima)
    const first = api.offline.start(S.uid, n => { S.pending = n; netState(); });
    if (navigator.onLine && !session.offline) await Promise.race([first, new Promise(r => setTimeout(r, 4000))]);
    first.then(afterFlush);
  }
  try {
    // Con copia guardada, si no hay red se abre con ella en el acto en vez de esperar a los reintentos
    const snap = api.offline ? await loadSnapshot(S.uid) : null;
    let d;
    try {
      if (session.offline) throw new TypeError('Failed to fetch');
      d = await api.loadAll(S.uid, { retry: !snap });
      S.fromCache = false;
    } catch (e) {
      if (!snap || !isOffline(e)) throw e;
      d = snap; S.fromCache = true;
    }
    applyData(withPending(d));
    S.loading = false;
    netState();
    migrateDeckLangs();
    dedupeTypes();
    if (!S.fromCache) saveSnap();
    loadFriends(true);
    if (S.pendingShare) { const id = S.pendingShare; S.pendingShare = null; S.view = 'explore'; render(); openPublicPreview(id); return; }
    if (S.pendingFriend) { const code = S.pendingFriend; S.pendingFriend = ''; S.view = 'friends'; render(); inviteSheet(code); return; }
    render();
    maybeIntro();
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
}

/* ===================== bienvenida ===================== */
// La presentación sale una vez, a quien entra sin nada todavía. Se recuerda en la cuenta (Ajustes) y en
// este navegador, por si se cierra antes de que se guarde.
const INTRO_KEY = 'flaski-intro-done';
const introDone = () => S.prefs.intro.done || (() => { try { return localStorage.getItem(INTRO_KEY) === '1'; } catch { return false; } })();
function maybeIntro() {
  if (!introDone() && S.decks.size === 0 && S.pages.size === 0 && !S.session && !S.recovery) showIntro();
}
const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};
async function showIntro() {
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
async function introChosen(choice) {
  S.prefs.intro.done = true;
  try { localStorage.setItem(INTRO_KEY, '1'); } catch {}
  savePrefsSoon();
  const kind = choice?.kind;
  if (kind === 'lang') {
    try {
      const d = await api.createDeck({ owner: S.uid, name: langLabel(choice.lang), options: { lang: choice.lang } });
      S.decks.set(d.id, { tags: [], ...d });
      go('deck', { deckId: d.id, cardQuery: '' });
      toast('Mazo creado: añade tu primera tarjeta');
      return cardForm(null, { deckId: d.id });
    } catch (e) { return fail(e); }
  }
  if (kind === 'example') { go('explore'); return openBuiltinPreview(choice.file); }
  if (kind === 'notes') { go('notes', { noteFolder: null }); return newPage(); }
  if (kind === 'ia') { go('decks', { folderId: null }); return pasteSheet(); }
  if (kind === 'explore') return go('explore');
  go('home');
}

/* ===================== sin conexión ===================== */
const isOffline = e => !navigator.onLine || isRetryable(e);
// Aplica encima de los datos cargados los cambios que aún esperan en la cola: ni el servidor ni la
// copia del navegador (que se guarda con retraso) los tienen por fuerza, y la cola nunca se pierde.
function withPending(d) {
  const ops = api.offline?.pendingOps() || [];
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
    else if (op === 'saveSettings') settings = { new_per_day: args[1], prefs: args[2] ?? settings?.prefs };
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
function saveSnapSoon() { if (api.offline) { clearTimeout(snapTimer); snapTimer = setTimeout(saveSnap, 3000); } }
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

function onSignedOut() {
  // Los cambios sin enviar se quedan guardados con la cuenta: se envían la próxima vez que entre
  api.offline?.stop();
  clearTimeout(snapTimer);
  Object.assign(S, { uid: null, email: '', name: '', decks: new Map(), folders: new Map(), tags: new Map(), types: new Map(), cards: new Map(), progress: new Map(), log: {}, events: [], view: 'home', folderId: null, session: null, pub: null, loading: true, authMode: 'signin', fromCache: false, pending: 0, pages: new Map(), pageId: null, friends: null });
  netState();
  render();
}

/* ===================== inicio ===================== */
function renderHome() {
  if (S.decks.size === 0) {
    main.innerHTML = `<div class="panel">
      <h1>Hola${S.name ? ', ' + esc(S.name) : ''}</h1>
      <p>Todavía no tienes mazos. Puedes empezar con uno ya hecho o crear el tuyo.</p>
      <div class="btnrow"><button class="primary" data-nav="explore">Ver mazos para empezar</button><button class="ghost" data-act="new-deck">Crear un mazo</button></div></div>`;
    return;
  }
  const all = counts('all');
  const avail = all.due + all.newToday;
  const homeStats = new Map([...S.decks.values()].map(d => [d.id, counts(d.id)]));
  const decks = sortDecks([...S.decks.values()].filter(d => !d.archived), 'due', homeStats).map(d => {
    const c = homeStats.get(d.id); const n = c.due + c.newToday;
    return `<li><button class="deck" data-start="${d.id}" ${n ? '' : 'disabled'}>${deckIcon(d)}
      <span class="info"><span class="dname">${esc(d.name)}</span><span class="meta">${c.due} por repasar${c.dueAll > c.due ? ` (+${c.dueAll - c.due} tras el límite)` : ''} · ${c.newToday} nuevas · ${c.total} en total</span></span>
      <span class="go">${n ? 'Estudiar' : c.total ? 'Al día' : 'Vacío'}</span></button></li>`;
  }).join('');
  const h = new Date().getHours();
  const hello = h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  const H = S.prefs.home;
  const st = streaks(S.log);
  const hm = heatmap(S.log);
  const mt = maturity(cardList(), S.progress);
  const fcDays = H.forecastDays || 14;
  const upcoming = [...S.progress.values()].filter(p => p.due < startOfDay() + fcDays * DAY).length;
  // Meta diaria (Ajustes → Estudio diario): respuestas de hoy frente a la meta
  const doneToday = S.log[dateKey(Date.now())] || 0;
  const goal = H.goal > 0 ? `<div class="goal" aria-label="Meta diaria"><div class="goal-h"><span>Meta diaria</span><b>${doneToday >= H.goal ? `${icon('check', { size: 14 })} ` : ''}${Math.min(doneToday, H.goal)} / ${H.goal}</b></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${H.goal}" aria-valuenow="${Math.min(doneToday, H.goal)}"><span style="width:${Math.min(100, Math.round((doneToday / H.goal) * 100))}%"></span></div></div>` : '';
  main.innerHTML = `
    <h1>${hello}${S.name ? ', ' + esc(S.name) : ''}</h1>
    <section class="hero" aria-label="Hoy">
      ${avail
        ? `<div class="hero-num">${avail}</div><p class="muted">${avail === 1 ? 'tarjeta' : 'tarjetas'} para hoy · ${all.due} por repasar y ${all.newToday} ${all.newToday === 1 ? 'nueva' : 'nuevas'}</p>
           <button class="primary big" data-start="all">Empezar a estudiar</button>${capNote(all)}`
        : `<div class="hero-num">0</div><p class="muted">${all.dueAll > all.due ? 'Has llegado al límite de repasos de hoy.' : 'Estás al día. Vuelve mañana o aprende alguna nueva.'}</p>${capNote(all)}
           <button class="ghost big" data-act="more">Estudiar 10 nuevas más</button>`}
      ${goal}
    </section>
    ${homeFriendsHTML()}
    ${H.activity ? `<section class="chart-card" aria-labelledby="h-act">
      <div class="chart-h"><h2 id="h-act">Actividad</h2><span>${hm.total.toLocaleString('es-ES')} ${hm.total === 1 ? 'repaso' : 'repasos'} en el último año</span></div>
      <div class="streaks">
        <span class="streak-cur">${icon('fire', { size: 18, cls: 'flame' })}<b>${st.current}</b> ${st.current === 1 ? 'día' : 'días'} de racha</span>
        <span><b>${st.best}</b> mejor racha</span>
        <span><b>${hm.active}</b> ${hm.active === 1 ? 'día' : 'días'} estudiando</span>
      </div>
      ${hm.html}
    </section>` : ''}
    ${H.forecast ? `<section class="chart-card" aria-labelledby="h-fc">
      <div class="chart-h"><h2 id="h-fc">Próximos ${fcDays} días</h2><span>${upcoming} ${upcoming === 1 ? 'repaso' : 'repasos'}</span></div>
      <div class="fc-wrap" id="fcWrap"></div>
    </section>` : ''}
    ${H.maturity ? `<section class="chart-card" aria-labelledby="h-mt">
      <div class="chart-h"><h2 id="h-mt">Tus tarjetas</h2><span>${mt.pct} % consolidadas</span></div>
      ${mt.html}
    </section>` : ''}
    ${H.decks ? `<div class="section-h"><h2>Tus mazos</h2></div>
    <ul class="list">${decks}</ul>` : ''}`;
  drawForecast();
  scrollChartsToEnd(main);
}
function drawForecast() {
  const el = $('#fcWrap');
  if (el) el.innerHTML = forecast(S.progress, Math.max(240, Math.floor(el.clientWidth)), S.prefs.home.forecastDays || 14);
}
let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (S.view === 'home') drawForecast(); if (S.view === 'stats' && statsData) drawStats(main, statsData); }, 150); });

/* ===================== estudio ===================== */
/* ---------- Tipos de tarjeta: utilidades ---------- */
// Icono de un tipo: el emoji que elegiste o, si no hay, su icono Lucide
function typeIcon(t, size = 18) { return t?.icon ? esc(t.icon) : icon(t?.lucide || 'layers', { size }); }
const allTypes = () => [...BUILTIN_TYPES, ...[...S.types.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))];
const getType = id => BUILTIN_TYPES.find(t => t.id === id) || S.types.get(id) || null;
// Idioma que se estudia en un mazo ('' = no es de idiomas) y el tipo con sus idiomas resueltos para él
const deckLang = id => S.decks.get(id)?.options?.lang || '';
const nativeLang = () => S.prefs.study.nativeLang || 'es-ES';
const typeIn = (type, deckId) => resolveType(type, { study: deckLang(deckId), native: nativeLang() });
const langLabel = id => LANGS.find(l => l.id === id)?.label || id;
// Tipo, plantilla y campos de una tarjeta (las antiguas, sin campos, se leen como «Básica»)
function cardModel(c) {
  const hasFields = c.fields && typeof c.fields === 'object' && Object.keys(c.fields).length;
  const type = typeIn((hasFields && getType(c.type_id)) || BUILTIN_TYPES[0], c.deck_id);
  const fields = hasFields && getType(c.type_id) ? c.fields : legacyFields(c);
  const tpl = type.templates.find(t => t.id === c.template) || type.templates[0];
  return { type, tpl, fields };
}
const BRUSH_ICON = icon('brush', { size: 18 });
const SPEAK_ICON = icon('volume-2', { size: 18 });

// Pinta el texto de un campo; en «huecos» oculta o destapa los {{ }}
function clozeHTML(text, reveal) {
  let out = '', last = 0;
  String(text || '').replace(CLOZE_RE, (m, ans, hint, at) => {
    out += fmt(text.slice(last, at));
    out += reveal ? `<span class="blank on">${fmt(ans)}</span>` : `<span class="blank">${hint ? esc(hint) : '…'}</span>`;
    last = at + m.length;
    return m;
  });
  return out + fmt(String(text || '').slice(last));
}

// HTML del anverso y de la respuesta. st = estado de la tarjeta en pantalla.
function faceHTML(model, st, { preview = false } = {}) {
  const { type, tpl, fields } = model;
  const fdef = id => type.fields.find(f => f.id === id);
  const val = id => String(fields[id] ?? '');
  const say = id => (fdef(id)?.lang && ttsAvailable() && val(id).trim()
    ? `<button type="button" class="say" ${preview ? 'data-say-input' : 'data-say'}="${id}" aria-label="Escuchar ${esc(fdef(id).name)}" title="Escuchar">${SPEAK_ICON}</button>` : '');
  const block = (id, main) => {
    const v = val(id);
    if (!v.trim()) return '';
    const label = !main && fdef(id) ? `<div class="fld-l">${esc(fdef(id).name)}</div>` : '';
    return `<div class="fld ${main ? 'fld-main' : 'fld-sub'}">${label}<div class="fld-v"><span class="fld-t">${fmt(v)}</span>${say(id)}${strokesBtn(id)}</div></div>`;
  };
  // Botón «orden de trazos» en campos cortos con kanji/hanzi
  const strokesBtn = id => {
    if (preview || !/^(ja|zh)/.test(fdef(id)?.lang || '')) return '';
    const chars = [...stripRuby(val(id))].filter(isCJK);
    return chars.length && chars.length <= 6 ? `<button type="button" class="say" data-strokes="${id}" aria-label="Ver orden de trazos" title="Orden de trazos">${BRUSH_ICON}</button>` : '';
  };

  // Anverso
  let front;
  if (tpl.mode === 'occlusion') front = occlusionHTML(val(tpl.image), val(tpl.answer), tpl.mask, st.revealed) + tpl.front.map(id => block(id, false)).join('');
  else if (tpl.mode === 'match' && !val(tpl.front[0]).trim()) front = `<div class="fld fld-main"><div class="fld-v"><span class="fld-t">Une cada elemento con su pareja</span></div></div>`;
  else if (tpl.mode === 'clozechoice') front = `<div class="fld fld-main fld-cloze"><div class="fld-v"><span class="fld-t">${clozeHTML(val(tpl.answer), st.revealed)}</span>${st.revealed ? say(tpl.answer) : ''}</div></div>`;
  else if (tpl.mode === 'cloze') front = `<div class="fld fld-main fld-cloze"><div class="fld-v"><span class="fld-t">${clozeHTML(val(tpl.front[0]), st.revealed)}</span>${say(tpl.front[0])}</div></div>`;
  else front = tpl.front.map((id, i) => block(id, i === 0)).join('');
  if (tpl.hideRuby && !st.revealed && hasRuby(fields[tpl.front[0]] ?? '')) front = `<div class="ruby-hide" title="Toca un kanji para ver su lectura">${front}</div>`;

  // Interacción antes de destapar
  let ask = '';
  if (tpl.mode === 'listen' && !st.revealed) {
    const has = !!fdef(tpl.answer)?.lang && ttsAvailable();
    ask += `<div class="listen-box">
      <button type="button" class="listen-btn" data-listen="1" ${preview ? 'disabled' : ''} aria-label="Escuchar">${SPEAK_ICON}<span>Escuchar</span></button>
      <button type="button" class="ghost small-btn" data-listen="0.6" ${preview ? 'disabled' : ''}>${icon('snail', { size: 16 })} Más despacio</button></div>
      ${has ? '' : '<p class="hint" style="text-align:center">Este campo no tiene idioma de audio o el dispositivo no tiene voces. Elige un idioma en «Gestionar tipos».</p>'}`;
  }
  if (tpl.mode === 'type' || tpl.mode === 'listen') {
    const lang = fdef(tpl.answer)?.lang || '';
    if (!st.revealed) {
      ask += `<${preview ? 'div' : 'form data-form="typed"'} class="typed" autocomplete="off">
        <input id="typed" ${lang ? `lang="${lang}"` : ''} autocapitalize="off" autocorrect="off" spellcheck="false"  placeholder="${tpl.mode === 'listen' ? 'Escribe lo que oyes' : `Escribe: ${esc(fdef(tpl.answer)?.name || 'la respuesta')}`}" aria-label="Tu respuesta" ${preview ? 'disabled' : ''}>
        <button class="primary" type="${preview ? 'button' : 'submit'}" ${preview ? 'disabled' : ''}>Comprobar</button></${preview ? 'div' : 'form'}>
        ${preview || !charsFor(lang).length ? '' : `<div class="chars chars-study" role="group" aria-label="Letras especiales">${charsFor(lang).map(ch => `<button type="button" data-char="${ch}">${ch}</button>`).join('')}</div>`}`;
    } else if (st.typed) {
      const r = st.typed;
      ask = r.ok ? `<div class="verdict ok">${icon('check', { size: 16 })} Correcto: <b>${esc(r.expected)}</b></div>`
        : `<div class="verdict bad">${r.near ? `<div class="vnear">Casi: ${esc(r.why)}</div>` : ''}<div class="vrow"><span class="vl">Tu respuesta</span><span class="diff">${r.diff.filter(x => x.t !== 'miss').map(x => `<span class="d-${x.t}">${esc(x.c)}</span>`).join('') || '<i>(vacía)</i>'}</span></div>
          <div class="vrow"><span class="vl">Correcta</span><span class="diff">${r.diff.filter(x => x.t !== 'extra').map(x => `<span class="d-${x.t === 'miss' ? 'need' : 'ok'}">${esc(x.c)}</span>`).join('')}</span></div></div>`;
    }
  }
  if ((tpl.mode === 'choice' || tpl.mode === 'clozechoice') && st.choice) {
    const c = st.choice;
    ask = `<div class="choices">${c.opts.map((o, i) => {
      let cls = '';
      if (st.revealed) cls = o === c.correct ? ' right' : i === c.picked ? ' wrong' : ' dim';
      return `<button type="button" class="choice${cls}" data-choice="${i}" ${st.revealed || preview ? 'disabled' : ''}><span class="ckey">${i + 1}</span><span>${fmt(o)}</span></button>`;
    }).join('')}</div>`;
  }

  if (tpl.mode === 'sort') {
    const so = st.sort || sortState(val(tpl.answer));
    const chip = (it, attr, cls = '') => `<button type="button" class="schip${cls}" ${attr} ${preview || st.revealed ? 'disabled' : ''}>${fmt(it.t)}</button>`;
    if (!st.revealed) {
      const pool = so.items.filter(it => so.place[it.i] == null);
      ask = `<div class="sort-pool" aria-label="Por colocar">${pool.length ? pool.map(it => chip(it, `data-sort-pick="${it.i}"`, so.sel === it.i ? ' sel' : '')).join('') : '<span class="hint">Todo colocado</span>'}</div>
        <div class="sort-groups">${so.groups.map((g, k) => `<div class="sort-g${so.sel != null ? ' armed' : ''}" data-sort-group="${k}" role="button" tabindex="0" aria-label="Grupo ${esc(g)}"><div class="sort-gh">${fmt(g)}</div>
          <div class="sort-gi">${so.items.filter(it => so.place[it.i] === k).map(it => chip(it, `data-sort-back="${it.i}"`)).join('')}</div></div>`).join('')}</div>
        ${preview ? '' : `<p class="hint" style="text-align:center">Toca un elemento y luego su grupo</p><div class="btnrow" style="justify-content:center"><button type="button" class="primary" data-act="sort-check" ${pool.length ? 'disabled' : ''}>Comprobar</button></div>`}`;
    } else {
      const bad = so.items.filter(it => so.place[it.i] != null && so.place[it.i] !== it.g).length;
      ask = `${so.checked ? (bad ? `<div class="verdict bad">${plural(bad, 'elemento mal colocado', 'elementos mal colocados')}</div>` : `<div class="verdict ok">${icon('check', { size: 16 })} Todo en su grupo</div>`) : ''}
        <div class="sort-groups">${so.groups.map((g, k) => `<div class="sort-g"><div class="sort-gh">${fmt(g)}</div><div class="sort-gi">${so.items.filter(it => it.g === k).map(it => {
          const put = so.place[it.i], cls = !so.checked ? '' : put === k ? ' ok' : ' bad';
          return `<span class="schip${cls}">${fmt(it.t)}${so.checked && put !== k && put != null ? ` <small>(pusiste ${esc(so.groups[put])})</small>` : ''}</span>`;
        }).join('')}</div></div>`).join('')}</div>`;
    }
  }
  if (tpl.mode === 'number') {
    const unit = String(fields.u || '').trim(), tol = String(fields.t || '').trim();
    if (!st.revealed) {
      ask = `<${preview ? 'div' : 'form data-form="number"'} class="typed" autocomplete="off">
        <span class="num-in"><input id="numIn" inputmode="decimal" placeholder="Tu respuesta" aria-label="Tu respuesta" ${preview ? 'disabled' : ''}>${unit ? `<span class="muted">${esc(unit)}</span>` : ''}</span>
        <button class="primary" type="${preview ? 'button' : 'submit'}" ${preview ? 'disabled' : ''}>Comprobar</button></${preview ? 'div' : 'form'}>`;
    } else {
      const r = st.number, right = `<b>${esc(val(tpl.answer))}${unit ? ' ' + esc(unit) : ''}</b>${tol ? ` <span class="muted">(±${esc(tol)})</span>` : ''}`;
      ask = !r ? `<div class="fld fld-main"><div class="fld-v"><span class="fld-t">${right}</span></div></div>`
        : r.ok ? `<div class="verdict ok">${icon('check', { size: 16 })} Correcto: ${right}${r.diff ? ` · pusiste ${esc(String(r.given))}` : ''}</div>`
        : `<div class="verdict bad">${r.near ? '<div class="vnear">Casi</div>' : ''}<div class="vrow"><span class="vl">Tu respuesta</span><span>${Number.isFinite(r.given) ? esc(String(r.given)) : '<i>(no es un número)</i>'}</span></div><div class="vrow"><span class="vl">Correcta</span><span>${right}</span></div></div>`;
    }
  }
  if (tpl.mode === 'conj') {
    const rows = parsePairs(val(tpl.answer)), lang = fdef(tpl.answer)?.lang || '';
    if (!st.revealed) {
      ask = `<${preview ? 'div' : 'form data-form="conj"'} class="conj" autocomplete="off"><table class="conj-tbl">${rows.map((r, k) => `<tr><th scope="row">${esc(r.a)}</th>
        <td><input class="conj-in" data-conj="${k}" ${lang ? `lang="${lang}"` : ''} autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="${esc(r.a)}" ${preview ? 'disabled' : ''}></td></tr>`).join('')}</table>
        <button class="primary" type="${preview ? 'button' : 'submit'}" ${preview ? 'disabled' : ''}>Comprobar</button></${preview ? 'div' : 'form'}>
        ${preview || !charsFor(lang).length ? '' : `<div class="chars chars-study" role="group" aria-label="Letras especiales">${charsFor(lang).map(ch => `<button type="button" data-char="${ch}">${ch}</button>`).join('')}</div>`}`;
    } else {
      const res = st.conj || [];
      ask = `<table class="conj-tbl conj-res">${rows.map((r, k) => {
        const x = res[k];
        const mine = !x ? '' : x.ok ? '' : `<span class="conj-mine">${esc(x.given || '—')}</span>`;
        return `<tr class="${!x ? '' : x.ok ? 'ok' : x.near ? 'near' : 'bad'}"><th scope="row">${esc(r.a)}</th><td>${mine}<b>${fmt(r.b)}</b>${x && !x.ok && x.why ? ` <small>${esc(x.why)}</small>` : ''}</td></tr>`;
      }).join('')}</table>`;
    }
  }
  if (tpl.mode === 'match') {
    const m = st.match || matchState(val(tpl.answer));
    if (!st.revealed) {
      const btn = (side, p) => {
        const key = `${side}:${p.i}`, done = m.done.includes(p.i);
        const cls = done ? ' ok' : m.sel === key ? ' sel' : m.bad?.includes(key) ? ' bad' : '';
        return `<button type="button" class="mchip${cls}" data-match="${key}" ${done || preview ? 'disabled' : ''} aria-pressed="${m.sel === key}">${fmt(side === 'L' ? p.a : p.b)}</button>`;
      };
      ask = `<div class="match" role="group" aria-label="Emparejar"><div class="match-col">${m.left.map(p => btn('L', p)).join('')}</div><div class="match-col">${m.right.map(p => btn('R', p)).join('')}</div></div>
        ${preview ? '' : `<p class="hint match-hint">${m.wrong ? `${plural(m.wrong, 'fallo', 'fallos')} · ` : ''}Toca uno de cada lado</p>`}`;
    } else {
      const v = m.gaveUp ? '' : m.wrong ? `<div class="verdict bad">${plural(m.wrong, 'fallo', 'fallos')} al emparejar</div>` : `<div class="verdict ok">${icon('check', { size: 16 })} Todo emparejado sin fallos</div>`;
      ask = `${v}<table class="match-sol">${m.pairs.map(p => `<tr><td>${fmt(p.a)}</td><td>${fmt(p.b)}</td></tr>`).join('')}</table>`;
    }
  }
  if (tpl.mode === 'order') {
    const o = st.order || { tokens: orderTokens(val(tpl.answer)).map((t, i) => ({ t, i })), picked: [] };
    const steps = val(tpl.answer).trim().includes('\n');
    const chip = (tok, attr) => `<button type="button" class="ochip${steps ? ' ostep' : ''}" ${attr} ${preview || st.revealed ? 'disabled' : ''}>${esc(tok.t)}</button>`;
    if (!st.revealed) {
      const pool = o.tokens.filter(t => !o.picked.includes(t.i));
      ask = `<div class="ord-answer" aria-label="Tu frase">${o.picked.length ? o.picked.map((i, k) => chip(o.tokens.find(t => t.i === i), `data-ord-remove="${k}"`)).join('') : '<span class="hint">Toca las piezas en orden</span>'}</div>
        <div class="ord-pool">${pool.map(t => chip(t, `data-ord-pick="${t.i}"`)).join('')}</div>
        ${preview ? '' : `<div class="btnrow" style="justify-content:center"><button type="button" class="ghost small-btn" data-act="ord-clear" ${o.picked.length ? '' : 'disabled'}>Empezar de nuevo</button>
          <button type="button" class="primary" data-act="ord-check" ${pool.length ? 'disabled' : ''}>Comprobar</button></div>`}`;
    } else if (o.checked) {
      const mine = o.picked.map(i => o.tokens.find(t => t.i === i).t);
      const right = orderTokens(val(tpl.answer));
      ask = o.ok ? `<div class="verdict ok">${icon('check', { size: 16 })} Correcto: <b>${esc(orderJoin(right, val(tpl.answer)))}</b></div>`
        : `<div class="verdict bad"><div class="vrow"><span class="vl">Tu frase</span><span class="ord-line">${mine.map((t, k) => `<span class="ochip ${t === right[k] ? 'ok' : 'bad'}">${esc(t)}</span>`).join('')}</span></div>
           <div class="vrow"><span class="vl">Correcta</span><span class="ord-line">${right.map(t => `<span class="ochip ok">${esc(t)}</span>`).join('')}</span></div></div>`;
    }
  }
  if (tpl.mode === 'draw') {
    const target = stripRuby(val(tpl.answer)).replace(/\*/g, '').trim();
    if (preview) ask = `<div class="draw-ph">${icon('pencil', { size: 16 })} Aquí escribirás a mano: <b>${esc(target || '…')}</b></div>`;
    else if (!st.revealed) ask = `<div class="draw-area" id="drawArea"></div><div class="draw-ctl" id="drawCtl"></div>`;
    else if (st.drawn?.img) ask = `<div class="draw-compare"><figure><img src="${st.drawn.img}" alt="Tu dibujo"><figcaption>Tu dibujo</figcaption></figure>
        <figure><div class="draw-solution" lang="${esc(fdef(tpl.answer)?.lang || '')}" style="font-size:${Math.max(18, Math.min(96, Math.round(150 / Math.max(1, [...target].length))))}px">${esc(target)}</div><figcaption>Solución</figcaption></figure></div>`;
    else if (st.drawn && !st.drawn.gaveUp) {
      const m = st.drawn.mistakes;
      ask = `<div class="verdict ${m ? 'bad' : 'ok'}" style="text-align:center">${m ? `${m} ${m === 1 ? 'trazo fallado' : 'trazos fallados'}` : `${icon('check', { size: 16 })} Todos los trazos bien`}${st.drawn.peeked ? ' · miraste la animación' : ''}</div>`;
    }
  }

  // Respuesta
  let answer = '';
  if (st.revealed) {
    if (tpl.mode === 'flip') answer = tpl.back.map((id, i) => block(id, i === 0)).join('');
    else if (['cloze', 'choice', 'match', 'occlusion', 'conj', 'sort', 'clozechoice', 'number'].includes(tpl.mode)) answer = tpl.back.map(id => block(id, false)).join('');
    else {
      // type · listen · order · draw: la respuesta principal solo se repite si no la has resuelto ya arriba
      const resolved = tpl.mode === 'order' ? !!st.order?.checked : tpl.mode === 'draw' ? !!st.drawn && !st.drawn.gaveUp && !!st.drawn.img : !!st.typed;
      const rest = tpl.back.filter(x => x !== tpl.answer).map(id => block(id, false)).join('');
      const sayAgain = fdef(tpl.answer)?.lang ? `<div class="fld"><div class="fld-v">${say(tpl.answer)}${strokesBtn(tpl.answer)}</div></div>` : '';
      answer = (resolved ? sayAgain : tpl.mode === 'order' ? `<div class="fld fld-main"><div class="fld-v"><span class="fld-t">${fmt(orderJoin(orderTokens(val(tpl.answer)), val(tpl.answer)))}</span>${say(tpl.answer)}</div></div>` : block(tpl.answer, true)) + rest;
    }
  }
  return { front, ask, answer };
}
/* ---------- Emparejar e imagen tapada ---------- */
const shuffled = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
function matchState(text) {
  const pairs = parsePairs(text).slice(0, 8).map((p, i) => ({ ...p, i }));
  let right = shuffled(pairs);
  for (let k = 0; k < 5 && pairs.length > 1 && right.every((p, i) => p.i === i); k++) right = shuffled(pairs);
  return { pairs, left: shuffled(pairs), right, sel: null, done: [], wrong: 0, bad: null };
}
// Tocar un elemento al emparejar: el primero se marca; el segundo (del otro lado) comprueba la pareja
function pickMatch(key) {
  const st = S.session?.st;
  if (!st?.match || S.session.revealed) return;
  const m = st.match;
  m.bad = null;
  if (!m.sel || m.sel === key || m.sel[0] === key[0]) { m.sel = m.sel === key ? null : key; return renderStudy(); }
  const a = +m.sel.slice(2), b = +key.slice(2);
  if (a === b) m.done.push(a); else { m.wrong++; m.bad = [m.sel, key]; }
  m.sel = null;
  if (m.done.length === m.pairs.length) return reveal();
  renderStudy();
}
// La imagen con sus recuadros: todos tapados; el que se pregunta, resaltado (y destapado al ver la respuesta)
function occlusionHTML(imgText, maskText, cur, revealed, { edit = false } = {}) {
  const id = imageIdIn(imgText);
  if (!id) return edit ? '' : '<div class="fld fld-main"><span class="muted">Falta la imagen</span></div>';
  const masks = parseMasks(maskText);
  return `<div class="occ${edit ? ' occ-edit' : ''}" ${edit ? 'id="occStage"' : ''}>${imgHTML(id)}${masks.map((m, k) => `<${edit ? 'button type="button"' : 'div'} class="occ-m${k === cur ? ' cur' : ''}${k === cur && revealed ? ' open' : ''}" style="left:${m.x}%;top:${m.y}%;width:${m.w}%;height:${m.h}%" ${edit ? `data-occ-del="${k}" title="Quitar este recuadro"` : ''}>${edit ? `<span>${k + 1}</span>` : k === cur && !revealed ? '<span>?</span>' : ''}</${edit ? 'button' : 'div'}>`).join('')}</div>`;
}
// Opciones de «Hueco con opciones»: la buena, las que pusiste y, si faltan, huecos de otras tarjetas del mazo
function clozeChoices(c, model, pool = null) {
  const others = pool || cardList().filter(x => x.deck_id === c?.deck_id && x.id !== c?.id).map(x => { const m = cardModel(x); return m.tpl.mode === 'clozechoice' || m.tpl.mode === 'cloze' ? clozeAnswer(m.fields[m.tpl.mode === 'cloze' ? m.tpl.front[0] : m.tpl.answer]) : ''; }).filter(Boolean);
  const tpl = { ...model.tpl, answer: '__a' };
  return { ...choiceOptions(tpl, { ...model.fields, __a: clozeAnswer(model.fields[model.tpl.answer]) }, others), picked: -1 };
}
function sortState(text) {
  const groups = parseGroups(text).slice(0, 6);
  const items = shuffled(groups.flatMap((g, k) => g.items.map(t => ({ t, g: k }))).slice(0, 18)).map((it, i) => ({ ...it, i }));
  return { groups: groups.map(g => g.name), items, place: {}, sel: null, checked: false };
}
function sortAction(kind, i) {
  const so = S.session?.st?.sort;
  if (!so || S.session.revealed) return;
  if (kind === 'pick') so.sel = so.sel === i ? null : i;
  // Con uno elegido, tocar otro ya colocado es tocar su grupo; si no, ese vuelve a la bandeja
  else if (kind === 'back') { if (so.sel != null && so.sel !== i) so.place[so.sel] = so.place[i]; else delete so.place[i]; so.sel = null; }
  else if (kind === 'group' && so.sel != null) { so.place[so.sel] = i; so.sel = null; }
  renderStudy();
}
/* ---------- Dictado y escritura a mano ---------- */
function playListen(model, rate = 1) {
  const f = model.type.fields.find(x => x.id === model.tpl.answer);
  if (f?.lang) speak(model.fields[model.tpl.answer], f.lang, { rate: rate * 0.95 });
}
async function mountDraw(st, model) {
  const area = $('#drawArea'), ctl = $('#drawCtl');
  if (!area || st.drawMounted === area) return;
  st.drawMounted = area;
  const tpl = model.tpl;
  const lang = model.type.fields.find(f => f.id === tpl.answer)?.lang || '';
  const target = stripRuby(model.fields[tpl.answer] || '').replace(/\*/g, '').trim();
  const chars = charsOf(target);
  const size = Math.max(200, Math.min(300, Math.floor(area.clientWidth || 280)));
  area.innerHTML = '<div class="draw-loading"><div class="spin" aria-label="Cargando"></div></div>';
  const quizable = await canQuiz(chars, lang);
  if (S.session?.st !== st || st.revealed || !area.isConnected) return;
  st.draw && st.draw.stop?.();
  if (quizable) {
    area.innerHTML = `<div class="hw-box" id="hwBox" style="width:${size}px;height:${size}px"></div>`;
    const progress = (i, n) => {
      ctl.innerHTML = `${n > 1 ? `<span class="draw-step">Carácter ${i + 1} de ${n}</span>` : ''}
        <button type="button" class="ghost small-btn" data-act="draw-peek">Ver cómo se escribe</button>`;
    };
    st.draw = startQuiz($('#hwBox'), chars, lang, {
      size, guide: !!tpl.guide, onProgress: progress,
      onDone: r => { st.drawn = { ...r, peeked: !!st.peeked }; reveal(); },
    });
  } else {
    area.innerHTML = `<div class="canvas-wrap" style="width:${size}px;height:${size}px">
      ${tpl.guide ? `<div class="canvas-guide" style="font-size:${Math.round(size * 0.8 / Math.max(1, chars.length))}px">${esc(target)}</div>` : ''}
      <canvas id="drawCanvas" class="canvas-box" aria-label="Zona para dibujar"></canvas></div>`;
    st.draw = startCanvas($('#drawCanvas'), { size });
    ctl.innerHTML = `<button type="button" class="ghost small-btn" data-act="draw-clear">Borrar</button>
      <button type="button" class="primary" data-act="draw-done">Comprobar</button>`;
  }
}
function strokesSheet(text, lang) {
  const chars = [...stripRuby(text)].filter(isCJK).slice(0, 6);
  if (!chars.length) return;
  openSheet(`<h2>Orden de trazos</h2><p class="muted small">${esc(chars.join(''))} · se repite en bucle</p>
    <div class="hw-anim-row" id="hwAnim"><div class="spin" aria-label="Cargando"></div></div>
    <p class="hint">Trazos: Hanzi Writer (David Chanin) con datos de animCJK y Make Me A Hanzi. La primera vez necesita conexión.</p>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button></div>`);
  canQuiz(chars, lang).then(ok => {
    const box = $('#hwAnim');
    if (!box) return;
    if (!ok) { box.innerHTML = '<p class="muted">No hay datos de trazos para estos caracteres (o no hay conexión).</p>'; return; }
    animateChars(box, chars, lang, chars.length > 2 ? 110 : 150);
  });
}

function speakFields(model, ids) {
  const { type, fields } = model;
  for (const id of ids) {
    const f = type.fields.find(x => x.id === id);
    if (S.prefs.study.autoplay && f?.autoplay && f.lang && String(fields[id] || '').trim()) { speak(fields[id], f.lang); return; }
  }
}
function revealIds(tpl) {
  return tpl.mode === 'type' || tpl.mode === 'choice' ? [tpl.answer, ...tpl.back] : tpl.mode === 'cloze' ? tpl.front : tpl.back;
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// Cola de estudio según Ajustes: límites de nuevas (global y por mazo), de repasos, orden y mezcla
function buildSession(scope) {
  const P = S.prefs.study, inScope = scopeTest(scope), now = Date.now();
  const pool = cardList().filter(inScope);
  const due = pool.filter(c => { const p = S.progress.get(c.id); return p && p.due <= now; })
    .sort((a, b) => S.progress.get(a.id).due - S.progress.get(b.id).due).map(c => c.id).slice(0, reviewsLeft());
  let fresh = pool.filter(c => !S.progress.get(c.id)).sort((a, b) => a.position - b.position);
  if (P.newOrder === 'random') shuffle(fresh);
  // Tarjetas hermanas (misma nota): solo una nueva por sesión, para no ver la respuesta en la otra.
  // Los límites se aplican después, para que las hermanas descartadas no gasten hueco.
  const seenNotes = new Set(), perDeck = new Map();
  let left = newLeft();
  fresh = fresh.filter(c => {
    if (left <= 0) return false;
    if (P.burySiblings && c.note_id) { if (seenNotes.has(c.note_id)) return false; seenNotes.add(c.note_id); }
    const used = perDeck.get(c.deck_id) || 0;
    if (used >= deckNewLeft(c.deck_id)) return false;
    perDeck.set(c.deck_id, used + 1); left--; return true;
  }).map(c => c.id);
  if (P.mix === 'reviewsFirst') return [...due, ...fresh];
  if (P.mix === 'newFirst') return [...fresh, ...due];
  const q = []; let i = 0, j = 0;
  while (i < due.length || j < fresh.length) {
    for (let k = 0; k < 3 && i < due.length; k++) q.push(due[i++]);
    if (j < fresh.length) q.push(fresh[j++]);
  }
  return q;
}
function startSession(scope = 'all') {
  const queue = buildSession(scope);
  if (!queue.length) { toast('No hay tarjetas pendientes aquí'); return; }
  S.session = { scope, queue, done: 0, revealed: false, tally: { 1: 0, 2: 0, 3: 0, 4: 0 }, undo: null, st: null };
  go('study');
}
function shuffleTokens(o) {
  const a = o.tokens;
  for (let k = 0; k < 8; k++) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (a.length < 2 || a.some((t, i) => t.i !== i)) break;   // que no salga ya ordenado
  }
}
function cardState(c) {
  const ses = S.session;
  if (ses.st && ses.st.id === c.id) return ses.st;
  const model = cardModel(c);
  const st = { id: c.id, revealed: false, hint: false, typed: null, choice: null, played: false };
  if (model.tpl.mode === 'order') {
    st.order = { tokens: orderTokens(model.fields[model.tpl.answer]).map((t, i) => ({ t, i })), picked: [] };
    shuffleTokens(st.order);
  }
  if (model.tpl.mode === 'match') st.match = matchState(model.fields[model.tpl.answer]);
  if (model.tpl.mode === 'sort') st.sort = sortState(model.fields[model.tpl.answer]);
  if (model.tpl.mode === 'clozechoice') st.choice = clozeChoices(c, model);
  if (model.tpl.mode === 'choice') {
    const pool = cardList().filter(x => x.deck_id === c.deck_id && x.id !== c.id && x.type_id === c.type_id)
      .map(x => { const m = cardModel(x); return m.fields[m.tpl.answer] ?? x.back; });
    if (pool.length < 3) pool.push(...cardList().filter(x => x.deck_id === c.deck_id && x.id !== c.id).map(x => x.back));
    st.choice = { ...choiceOptions(model.tpl, model.fields, pool), picked: -1 };
  }
  ses.st = st;
  ses.shownAt = Date.now();   // para medir el tiempo de cada tarjeta
  return st;
}
function renderStudy() {
  const ses = S.session;
  if (!ses) return go('home');
  const pct = Math.round(100 * ses.done / Math.max(1, ses.done + ses.queue.length));
  const bar = `<div class="studybar"><button class="link" data-act="exit">← Salir</button><span class="where">${esc(scopeName(ses.scope))}</span><span class="left">${ses.queue.length} quedan</span></div><div class="bar"><span style="width:${pct}%"></span></div>`;
  if (!ses.queue.length) {
    const t = ses.tally;
    main.innerHTML = `${bar}<div class="done"><h2>¡Sesión terminada!</h2><p class="muted">Has repasado ${ses.done} tarjetas.</p>${capNote(counts(ses.scope))}
      <div class="tally"><span class="g1">Otra vez ${t[1]}</span><span class="g2">Difícil ${t[2]}</span><span class="g3">Bien ${t[3]}</span><span class="g4">Fácil ${t[4]}</span></div>
      <div class="btnrow" style="justify-content:center"><button class="primary" data-act="exit">${ses.scope.startsWith('page:') ? 'Volver a los apuntes' : 'Volver al inicio'}</button><button class="ghost" data-act="more">10 nuevas más</button></div>
      ${ses.undo ? '<button class="link" data-act="undo">Deshacer la última</button>' : ''}</div>`;
    return;
  }
  const id = ses.queue[0];
  const c = S.cards.get(id);
  if (!c) { ses.queue.shift(); return renderStudy(); }
  const p = S.progress.get(id);
  const st = cardState(c);
  st.revealed = ses.revealed;
  const model = cardModel(c);
  const { front, ask, answer } = faceHTML(model, st);
  const hint = c.hint && !st.revealed
    ? (st.hint ? `<div class="hintbox">${icon('lightbulb', { size: 16 })} ${fmt(c.hint)}</div>` : '<button class="link hint-btn" data-act="show-hint">Ver pista</button>') : '';
  let foot;
  if (ses.revealed) {
    const now = Date.now();
    const d = st.drawn;
    const suggest = st.typed ? (st.typed.ok ? 3 : st.typed.near ? 2 : 1)
      : st.choice && st.choice.picked >= 0 ? (st.choice.opts[st.choice.picked] === st.choice.correct ? 3 : 1)
      : st.order?.checked ? (st.order.ok ? 3 : 1)
      : st.sort?.checked ? (() => { const bad = st.sort.items.filter(it => st.sort.place[it.i] !== it.g).length; return bad === 0 ? 3 : bad === 1 ? 2 : 1; })()
      : st.number ? (st.number.ok ? 3 : st.number.near ? 2 : 1)
      : st.conj ? (st.conj.every(x => x.ok) ? 3 : st.conj.every(x => x.ok || x.near) ? 2 : 1)
      : st.match && !st.match.gaveUp ? (st.match.wrong === 0 ? 3 : st.match.wrong === 1 ? 2 : 1)
      : st.match?.gaveUp ? 1
      : d && !d.img && !d.gaveUp ? (() => { const avg = d.mistakes / Math.max(1, d.n); return avg === 0 && !d.peeked ? 3 : avg <= 2 && !(d.peeked && avg > 0) ? 2 : 1; })()
      : d?.gaveUp ? 1 : 0;
    const P = S.prefs.study, A = algo(c.deck_id);
    const gs = P.buttons === 2 ? GRADES.filter(x => x.g === 1 || x.g === 3) : GRADES;
    foot = `<div class="grades${gs.length === 2 ? ' two' : ''}">${gs.map(({ g, label }) => `<button class="grade g${g}${P.suggest && g === suggest ? ' suggested' : ''}" data-grade="${g}">${label}${P.showIntervals ? `<small>${fmtWhen(schedule(p, g, now, A).due, now)}</small>` : ''}</button>`).join('')}</div>`;
  } else if (NEEDS_ANSWER.includes(model.tpl.mode)) {
    foot = '<button class="ghost big" data-act="reveal">No lo sé, ver respuesta</button>';
  } else {
    foot = '<button class="primary big" data-act="reveal">Mostrar respuesta</button>';
  }
  const tags = (c.tags || []).length ? `<span class="tags">${tagChips(c.tags)}</span>` : '';
  main.innerHTML = `${bar}<article class="card mode-${model.tpl.mode}" aria-live="polite">
      <div class="card-top"><span class="chip">${S.decks.get(c.deck_id) ? deckIcon(S.decks.get(c.deck_id)) : ''}${esc(deckName(c.deck_id))}${p ? '' : ' · nueva'}</span>${tags}</div>
      <div class="front">${front}</div>${hint}${ask}
      ${answer ? `<div class="answer">${answer}</div>` : ''}
    </article>${foot}
    <div class="studyfoot"><span class="keys"${S.prefs.study.shortcuts ? '' : ' hidden'}>${['flip', 'cloze', 'occlusion'].includes(model.tpl.mode) ? 'Espacio: mostrar · ' : ['choice', 'clozechoice'].includes(model.tpl.mode) ? '1-4: elegir · ' : ''}1-4: valorar</span><span class="btnrow">${ses.undo ? '<button class="link" data-act="undo">Deshacer</button>' : ''}${ses.revealed && c.page_id && S.pages.has(c.page_id) ? `<button class="link" data-open-page="${c.page_id}" data-open-block="${esc(c.block_id || '')}">${icon('notebook-text', { size: 15 })} Ver en los apuntes</button>` : ''}<button class="link" data-card="${id}">Editar tarjeta</button></span></div>`;
  if (!st.played) {
    st.played = true;
    if (model.tpl.mode === 'listen') { if (S.prefs.study.autoplay) playListen(model, 1); }
    else speakFields(model, model.tpl.mode === 'cloze' ? [] : model.tpl.front);
  }
  if (!ses.revealed && model.tpl.mode === 'draw') mountDraw(st, model);
  if (ses.revealed && !st.playedBack) { st.playedBack = true; speakFields(model, revealIds(model.tpl)); }
  if (!ses.revealed && model.tpl.mode === 'type' && matchMedia('(hover:hover)').matches) $('#typed')?.focus();
  if (!ses.revealed && model.tpl.mode === 'conj' && matchMedia('(hover:hover)').matches) $('.conj-in')?.focus();
  if (!ses.revealed && model.tpl.mode === 'number' && matchMedia('(hover:hover)').matches) $('#numIn')?.focus();
}
function reveal() {
  const ses = S.session;
  if (!ses || ses.revealed) return;
  const st = ses.st;
  if (st) {
    st.draw?.stop?.();
    const c = S.cards.get(ses.queue[0]);
    if (c && cardModel(c).tpl.mode === 'draw' && !st.drawn) st.drawn = { gaveUp: true };
    if (st.match && st.match.done.length < st.match.pairs.length) st.match.gaveUp = true;
  }
  ses.revealed = true;
  renderStudy();
}
function grade(g) {
  const ses = S.session;
  if (!ses || !ses.revealed || !ses.queue.length) return;
  stopSpeaking();
  const id = ses.queue[0];
  const now = Date.now();
  const prev = S.progress.get(id) || null;
  const card = S.cards.get(id);
  const next = schedule(prev, g, now, algo(card?.deck_id));
  const day = dateKey(now);
  // Registro de cada respuesta, para Estadísticas
  const state = !prev ? 'new' : prev.interval === 0 ? (prev.lapses ? 'relearning' : 'learning') : 'review';
  const ms = Math.min(120e3, Math.max(0, now - (ses.shownAt || now)));
  const ev = { id: api.newId(), user_id: S.uid, card_id: id, deck_id: card?.deck_id || null, ts: new Date(now).toISOString(), grade: g, state, ivl: next.interval, last_ivl: prev?.interval || 0, ease: Math.round(next.ease * 1000) / 1000, ms, t: now };
  S.events.push(ev);
  const { t: _t, ...evRow } = ev;
  api.addEvent(evRow).catch(() => {});
  ses.undo = { id, prev, queue: ses.queue.slice(), done: ses.done, tally: { ...ses.tally }, day, evId: ev.id };
  ses.queue.shift();
  // Solo vuelven a salir en esta sesión las tarjetas en aprendizaje (falladas o «difícil» siendo nuevas)
  if (next.interval === 0 && next.due > now) ses.queue.splice(Math.min(ses.queue.length, g === 1 ? 3 : 6), 0, id);
  else ses.done++;
  ses.tally[g]++;
  ses.revealed = false;
  ses.st = null;
  S.progress.set(id, next);
  S.log[day] = (S.log[day] || 0) + 1;
  api.saveProgress(S.uid, id, next).catch(fail);
  // El servidor suma 1 y devuelve el total del día, que incluye lo estudiado en otros dispositivos
  api.bumpLog(S.uid, day, 1, S.log[day]).then(n => { if (n > (S.log[day] || 0)) S.log[day] = n; }).catch(() => {});
  saveSnapSoon();
  renderStudy();
}
function undo() {
  const ses = S.session;
  if (!ses?.undo) return;
  const u = ses.undo;
  if (u.prev) { S.progress.set(u.id, u.prev); api.saveProgress(S.uid, u.id, u.prev).catch(fail); }
  else { S.progress.delete(u.id); api.clearProgress(S.uid, u.id).catch(fail); }
  S.log[u.day] = Math.max(0, (S.log[u.day] || 0) - 1);
  api.bumpLog(S.uid, u.day, -1, S.log[u.day]).catch(() => {});
  if (u.evId) { S.events = S.events.filter(e => e.id !== u.evId); api.deleteEvent(u.evId).catch(() => {}); }
  Object.assign(ses, { queue: u.queue, done: u.done, tally: u.tally, revealed: true, undo: null, st: null });
  saveSnapSoon();
  renderStudy();
}

/* ===================== mis mazos ===================== */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const LIST_ICON = icon('list', { size: 18 });
const GRID_ICON = icon('layout-grid', { size: 18 });
const MOVE_ICON = icon('folder-input', { size: 20 });
const PIN_ICON = icon('pin', { size: 14, cls: 'pin', label: 'Fijado' });

// Ruta de carpetas: Mis mazos › Idiomas › Turco
function crumbs(folderId, { linkLast = false } = {}) {
  const path = folderId ? folderPath(S.folders, folderId) : [];
  const parts = [`<button class="crumb" data-folder="">Mis mazos</button>`];
  path.forEach((f, i) => {
    const last = i === path.length - 1 && !linkLast;
    parts.push(last ? `<span class="crumb crumb-cur">${esc(f.icon ? f.icon + ' ' : '')}${esc(f.name)}</span>`
      : `<button class="crumb" data-folder="${f.id}">${esc(f.icon ? f.icon + ' ' : '')}${esc(f.name)}</button>`);
  });
  return `<nav class="crumbs" aria-label="Ruta">${parts.join('<span class="sep" aria-hidden="true">/</span>')}</nav>`;
}

function renderDecks() {
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

  const folderRows = folders.map(f => {
    const fc = counts('folder:' + f.id);
    const inside = decksInFolder(S.decks, S.folders, f.id).filter(d => !d.archived).length;
    const sub = descendants(S.folders, f.id), np = [...S.pages.values()].filter(p => sub.has(p.folder_id)).length;
    return `<li><button class="deck folder" data-folder="${f.id}">${folderIcon(f)}
      <span class="info"><span class="dname">${esc(f.name)}</span><span class="meta">${plural(inside, 'mazo', 'mazos')} · ${fc.due + fc.newToday} pendientes${np ? ` · ${plural(np, 'apunte', 'apuntes')}` : ''}</span></span>
      <span class="go">›</span></button></li>`;
  }).join('');

  const where = d => {
    if (!filtering || !deckFolder(d)) return '';
    return folderPath(S.folders, d.folder_id).map(f => f.name).join(' / ') + ' · ';
  };
  const deckRows = decks.map(d => {
    const c = stats.get(d.id);
    const pend = c.due + c.newToday;
    const pct = c.total ? Math.round((c.mature / c.total) * 100) : 0;
    if (o.layout === 'grid') {
      return `<li class="has-more" draggable="true" data-drag-deck="${d.id}"><button class="row-more tile-more" data-move="${d.id}" aria-label="Mover «${esc(d.name)}» a otra carpeta">${MOVE_ICON}</button><button class="tile" data-open="${d.id}">
        <span class="tile-top">${deckIcon(d, true)}${d.pinned ? PIN_ICON : ''}</span>
        <span class="dname">${esc(d.name)}</span>
        <span class="tags">${tagChips(d.tags)}</span>
        <span class="meta">${where(d)}${plural(c.total, 'tarjeta', 'tarjetas')}${pend ? ` · <b>${pend}</b> hoy` : ''}</span>
        <span class="mini" aria-label="${pct} % consolidadas"><span style="width:${pct}%"></span></span>
      </button></li>`;
    }
    return `<li class="has-more" draggable="true" data-drag-deck="${d.id}"><button class="deck" data-open="${d.id}">${deckIcon(d)}
      <span class="info"><span class="dname">${esc(d.name)}${d.pinned ? PIN_ICON : ''}</span>
        ${d.tags?.length ? `<span class="tags">${tagChips(d.tags)}</span>` : ''}
        <span class="meta">${where(d)}${plural(c.total, 'tarjeta', 'tarjetas')}${pend ? ` · ${pend} para hoy` : ''}${d.is_public ? ' · compartido' : ''}${d.archived ? ' · archivado' : ''}</span></span>
      </button><button class="row-more" data-move="${d.id}" aria-label="Mover «${esc(d.name)}» a otra carpeta" title="Mover a otra carpeta">${MOVE_ICON}</button></li>`;
  }).join('');

  const tagFilter = [...S.tags.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(t =>
    `<button class="fchip" data-tagfilter="${t.id}" aria-pressed="${o.tagIds.includes(t.id)}"><span class="tdot" style="background:var(--tag-${t.color || 'gray'}-bg);border-color:var(--tag-${t.color || 'gray'})"></span>${esc(t.name)}</button>`).join('');

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

  main.innerHTML = `
    ${folder && !filtering ? crumbs(folder.id) : ''}
    <div class="section-h"><h1>${title}</h1>${folder && !filtering ? '<button class="ghost small-btn" data-act="edit-folder">Editar carpeta</button>' : ''}</div>
    <div class="btnrow">
      ${studyBtn}
      <button class="${studyBtn ? 'ghost' : 'primary'}" data-act="new-deck">+ Mazo</button>
      ${folder && !filtering ? '<button class="ghost" data-act="add-decks-here">+ Añadir mazos aquí</button>' : ''}
      <button class="ghost" data-act="new-folder">+ Carpeta</button>
      <button class="ghost" data-act="import">Importar</button>
      <button class="ghost" data-act="paste">Pegar</button>
    </div>
    ${S.folders.size && !filtering ? '<p class="hint dnd-hint">Consejo: en el ordenador puedes arrastrar un mazo encima de una carpeta.</p>' : ''}
    <div class="toolbar">
      <input id="deckSearch" type="search" placeholder="Buscar en todos los mazos" aria-label="Buscar mazos" value="${esc(o.query)}">
      <select id="deckSort" aria-label="Ordenar">${SORTS.map(x => `<option value="${x.id}" ${x.id === o.sort ? 'selected' : ''}>${x.label}</option>`).join('')}</select>
      <div class="seg-icons" role="group" aria-label="Vista">
        <button data-layout="list" aria-pressed="${o.layout === 'list'}" aria-label="Lista">${LIST_ICON}</button>
        <button data-layout="grid" aria-pressed="${o.layout === 'grid'}" aria-label="Cuadrícula">${GRID_ICON}</button>
      </div>
    </div>
    <div class="filters">
      ${tagFilter}
      <button class="fchip" data-act="toggle-archived" aria-pressed="${o.archived}">Archivados</button>
      <button class="fchip fchip-ghost" data-act="manage-tags">${S.tags.size ? 'Gestionar etiquetas' : '+ Etiqueta'}</button>
      ${filtering ? '<button class="link" data-act="clear-filters">Quitar filtros</button>' : ''}
    </div>
    ${folderRows ? `<ul class="list">${folderRows}</ul>` : ''}
    ${deckRows ? `<ul class="${o.layout === 'grid' ? 'grid' : 'list'}">${deckRows}</ul>` : folderRows ? '' : `<div class="empty"><p class="muted">${empty}</p></div>`}`;
}
function statusChip(id) {
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
function renderDeck() {
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
function renderExplore() {
  if (!S.pub || !S.builtin) {
    main.innerHTML = '<h1>Explorar</h1><div class="empty"><div class="spin" aria-label="Cargando"></div></div>';
    loadExplore();
    return;
  }
  const q = norm(S.exploreQuery.trim());
  const match = d => !q || norm(d.name).includes(q) || norm(d.description).includes(q) || norm(d.author).includes(q);
  const builtin = S.builtin.filter(match).map(d => `<li><button class="deck" data-builtin="${esc(d.file)}"><span class="dot" style="background:var(--d2)"></span>
    <span class="info"><span class="dname">${esc(d.name)}</span><span class="meta">${d.count} tarjetas · incluido en la app</span></span><span class="go">Ver</span></button></li>`).join('');
  const pub = S.pub.filter(match).map(d => `<li><button class="deck" data-pub="${d.id}"><span class="dot" style="background:var(--d4)"></span>
    <span class="info"><span class="dname">${esc(d.name)}</span><span class="meta">${d.count} tarjetas · de ${esc(d.author)}${d.owner === S.uid ? ' (tú)' : ''}</span></span><span class="go">Ver</span></button></li>`).join('');
  main.innerHTML = `<div class="section-h"><h1>Explorar</h1><button class="link" data-act="refresh-explore">Actualizar</button></div>
    <div class="toolbar"><input id="exploreSearch" type="search" placeholder="Buscar mazos" aria-label="Buscar mazos" value="${esc(S.exploreQuery)}"></div>
    <div class="section-h"><h2>Para empezar</h2></div>
    ${builtin ? `<ul class="list">${builtin}</ul>` : '<p class="muted">Nada por aquí.</p>'}
    <div class="section-h"><h2>${api.mode === 'local' ? 'Tus mazos compartidos' : 'Compartidos por la comunidad'}</h2></div>
    ${pub ? `<ul class="list">${pub}</ul>` : '<div class="empty"><p class="muted">Todavía nadie ha compartido mazos. Abre uno de tus mazos y pulsa «Compartir».</p></div>'}`;
}
async function openPublicPreview(id) {
  openSheet('<div class="spin" aria-label="Cargando"></div>');
  try {
    const d = await api.getPublicDeck(id);
    if (!d) { openSheet('<h2>Mazo no disponible</h2><p class="muted">Puede que su autor haya dejado de compartirlo.</p><button class="primary" data-act="close-sheet">Cerrar</button>'); return; }
    S.preview = { name: d.name, description: d.description, cards: d.cards, types: d.types || [], source: 'compartido:' + d.id, lang: d.options?.lang };
    showPreview(`de ${esc(d.author)}`);
  } catch (e) { closeSheet(); fail(e); }
}
async function openBuiltinPreview(file) {
  openSheet('<div class="spin" aria-label="Cargando"></div>');
  try {
    if (!/^[\w.-]+\.json$/.test(file)) throw new Error('Archivo no válido');
    const raw = await (await fetch('decks/' + file)).json();
    const d = isNotesDeck(raw) ? notesToDeck(raw) : parseDeckFile(raw);   // también en formato por notas
    S.preview = { ...d, source: 'incluido:' + file };
    showPreview('incluido en la app');
  } catch (e) { closeSheet(); fail(e); }
}
function showPreview(byline) {
  const p = S.preview;
  const sample = p.cards.slice(0, 6).map(c => `<li><span>${fmt(c.front)}</span><b>${fmt(c.back)}</b></li>`).join('');
  openSheet(`<h2>${esc(p.name)}</h2><p class="muted small">${p.cards.length} tarjetas${p.lang ? ` · ${esc(langLabel(p.lang))}` : ''} · ${byline}</p>
    ${p.description ? `<p>${fmt(p.description)}</p>` : ''}
    <ul class="preview">${sample}</ul>${p.cards.length > 6 ? `<p class="muted small">…y ${p.cards.length - 6} más.</p>` : ''}
    ${(p.source === 'archivo' || p.source === 'pegado') && S.decks.size
      ? `<label for="destDeck">Añadir a</label><select id="destDeck"><option value="">Un mazo nuevo: «${esc(p.name)}»</option>${[...S.decks.values()].map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select>`
      : '<p class="muted small">Se copiará a tu cuenta: podrás editarlo y tu progreso será solo tuyo.</p>'}
    ${p.skipped ? `<p class="muted small">Se han saltado ${p.skipped} filas sin pregunta o sin respuesta.</p>` : ''}
    ${issuesHTML(p.issues)}
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-act="add-preview">Añadir a mis mazos</button></div>`);
}
// Problemas del formato por notas: las que se saltan (y por qué) y los avisos
function issueList(items) {
  return `<ul class="issues">${items.map(i => `<li><b>${i.n ? `Nota ${i.n}` : 'Mazo'}</b>${i.label && i.n ? ` <span class="muted">(${esc(i.label)})</span>` : ''}: ${esc(i.reason)}</li>`).join('')}</ul>`;
}
function issuesHTML(issues = []) {
  const skipped = issues.filter(i => i.skipped), warns = issues.filter(i => !i.skipped);
  return `${skipped.length ? `<details class="issues-box" open><summary>${skipped.length === 1 ? 'Se salta 1 nota' : `Se saltan ${skipped.length} notas`}</summary>${issueList(skipped)}</details>` : ''}
    ${warns.length ? `<details class="issues-box"><summary>${plural(warns.length, 'aviso', 'avisos')}</summary>${issueList(warns)}</details>` : ''}`;
}
// Archivo o texto pegado ya leído → vista previa. parsed: { kind: 'json', data } o { kind: 'csv', text }
function previewImport(parsed, { source, baseName = 'Mazo importado' }) {
  if (parsed.kind === 'csv') {
    const { cards, skipped } = cardsFromCSV(parsed.text);
    S.preview = { name: baseName.slice(0, 80), description: '', cards, skipped, source };
    return showPreview('desde CSV');
  }
  if (isNotesDeck(parsed.data)) {
    const d = notesToDeck(parsed.data);
    S.preview = { ...d, source };
    if (!d.cards.length) {
      return openSheet(`<h2>No se ha podido crear ninguna tarjeta</h2><p class="muted">Ninguna nota es válida. Esto es lo que falla en cada una:</p>
        ${issueList(d.issues.length ? d.issues : [{ n: 0, reason: 'la lista de notas está vacía' }])}
        <div class="btnrow"><span class="spacer"></span>${source === 'pegado' ? '<button class="ghost" data-act="paste">Volver a pegar</button>' : ''}<button class="primary" data-act="close-sheet">Cerrar</button></div>`);
    }
    return showPreview(`${plural(d.notes, 'nota', 'notas')} · formato por notas`);
  }
  S.preview = { ...parseDeckFile(parsed.data), source };
  showPreview('desde archivo Flaski');
}

/* ---------------- Pegar e instrucciones para IA ---------------- */
function pasteSheet() {
  openSheet(`<h2>Pegar un mazo</h2>
    <p class="muted small">Pega el mazo que te ha preparado una IA (ChatGPT, Gemini, Claude…) o unas columnas copiadas de una hoja de cálculo.</p>
    <textarea id="pasteText" class="paste-box" rows="9" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Texto del mazo" placeholder="{ &quot;format&quot;: &quot;flaski-notes&quot;, … }">${esc(S.pasteText || '')}</textarea>
    <p class="error" id="pasteError" role="alert" hidden></p>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-act="paste-preview">Ver vista previa</button></div>
    <div class="ai-help">${icon('lightbulb', { size: 18 })}<div>
      <p><b>¿Quieres que una IA te haga el mazo?</b> Copia estas instrucciones, pégalas en la IA junto con lo que quieres estudiar y pega aquí lo que te responda.</p>
      ${AI_GUIDE_BTNS()}</div></div>`);
  loadAiGuide();
}
const AI_GUIDE_BTNS = () => `<span class="btnrow"><button type="button" class="ghost small-btn" data-act="copy-ai-guide">${icon('copy', { size: 16 })} Copiar instrucciones</button><button type="button" class="ghost small-btn" data-act="download-ai-guide">${icon('download', { size: 16 })} Descargar</button></span>`;
async function loadAiGuide() {
  if (!S.aiGuide) { try { const r = await fetch('FORMATO-IA.md', { cache: 'no-cache' }); if (r.ok) S.aiGuide = await r.text(); } catch {} }
  return S.aiGuide;
}
async function copyText(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); return true; } catch { return false; }
}
async function addPreview(btn) {
  const p = S.preview;
  if (!p) return;
  btn.disabled = true; btn.textContent = 'Añadiendo…';
  try {
    const typeMap = await adoptTypes(p.types);
    if (p.images) await importImages(p.images);   // las imágenes que vienen dentro del archivo
    // Etiquetas por nombre (formato por notas): se crean las que falten y se reutilizan las que ya tengas
    let cards = p.cards;
    if (p.tagNames?.length) {
      const ids = new Map();
      for (const name of p.tagNames) { const t = await addTag(name); if (t) ids.set(name.toLocaleLowerCase(), t.id); }
      cards = cards.map(c => ({ ...c, tags: (c.tagNames || []).map(n => ids.get(n.toLocaleLowerCase())).filter(Boolean) }));
    }
    if (p.source === 'pegado') S.pasteText = '';
    const dest = $('#destDeck')?.value;
    if (dest) {
      const created = await api.importCards(S.uid, dest, cards, typeMap);
      for (const c of created) S.cards.set(c.id, c);
      toast(`${created.length} tarjetas añadidas`);
      return go('deck', { deckId: dest, cardQuery: '' });
    }
    const { deck, cards: made } = await api.importDeck(S.uid, { ...p, lang: p.lang || undefined, cards, typeMap });
    S.decks.set(deck.id, { tags: [], ...deck });
    for (const c of made) S.cards.set(c.id, c);
    migrateDeckLangs();   // si el archivo no decía el idioma, se deduce
    toast(`«${deck.name}» añadido`);
    go('deck', { deckId: deck.id, cardQuery: '' });
  } catch (e) { btn.disabled = false; btn.textContent = 'Añadir a mis mazos'; fail(e); }
}

/* ===================== apuntes ===================== */
// Tarjetas vinculadas a cada bloque de una página: block_id → [tarjetas]
function pageCards(pageId) {
  const m = new Map();
  for (const c of S.cards.values()) if (c.page_id === pageId) { const k = c.block_id || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(c); }
  return m;
}
const shortDate = iso => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '');
// Fila para guardar. Las etiquetas solo si la base de datos ya tiene esa columna (si no, se perdería el guardado)
const pageRow = p => ({ id: p.id, owner: S.uid, title: p.title || '', icon: p.icon || '', deck_id: p.deck_id || null, folder_id: p.folder_id || null, blocks: p.blocks,
  ...(S.pageTagsMissing ? {} : { tags: p.tags || [] }) });
const pageTimers = new Map();
// Guarda una página poco después del último cambio (se escribe mucho seguido)
function savePageSoon(p, wait = 700) {
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

// Ruta de los apuntes: Apuntes / Idiomas / Turco (/ título del apunte, si se está dentro de uno)
function noteCrumbs(folderId, current = null) {
  const path = folderId && S.folders.has(folderId) ? folderPath(S.folders, folderId) : [];
  const btn = (id, label) => `<button class="crumb" data-nfolder="${id}">${label}</button>`;
  const parts = [btn('', 'Apuntes'), ...path.map((f, i) => (i === path.length - 1 && !current
    ? `<span class="crumb crumb-cur">${esc(f.icon ? f.icon + ' ' : '')}${esc(f.name)}</span>`
    : btn(f.id, `${esc(f.icon ? f.icon + ' ' : '')}${esc(f.name)}`)))];
  if (current) parts.push(`<span class="crumb crumb-cur">${esc(current)}</span>`);
  return `<nav class="crumbs" aria-label="Ruta">${parts.join('<span class="sep" aria-hidden="true">/</span>')}</nav>`;
}
const pageFolder = p => (p.folder_id && S.folders.has(p.folder_id) ? p.folder_id : null);
const NOTE_SORTS = [['recent', 'Editados recientemente'], ['name', 'Nombre'], ['created', 'Creados recientemente']];
function renderNotes() {
  if (S.noteFolder && !S.folders.has(S.noteFolder)) S.noteFolder = null;
  const folder = S.noteFolder ? S.folders.get(S.noteFolder) : null;
  const o = S.noteOrg, q = norm(S.pageQuery.trim());
  const filtering = !!(q || o.tagIds.length);
  const here = folder?.id || null;
  const pages = [...S.pages.values()]
    .filter(p => (filtering ? (!q || norm(pageSearchText(p)).includes(q)) && o.tagIds.every(t => (p.tags || []).includes(t)) : pageFolder(p) === here))
    .sort(o.sort === 'name' ? (a, b) => pageTitle(a).localeCompare(pageTitle(b), 'es')
      : o.sort === 'created' ? (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))
      : (a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const folders = filtering ? [] : [...S.folders.values()].filter(f => (f.parent_id && S.folders.has(f.parent_id) ? f.parent_id : null) === here)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const folderRows = folders.map(f => {
    const inside = descendants(S.folders, f.id);
    const np = [...S.pages.values()].filter(p => inside.has(pageFolder(p))).length;
    const nd = [...S.decks.values()].filter(d => !d.archived && inside.has(d.folder_id)).length;
    return `<li><button class="deck folder" data-nfolder="${f.id}">${folderIcon(f)}
      <span class="info"><span class="dname">${esc(f.name)}</span><span class="meta">${np ? plural(np, 'apunte', 'apuntes') : 'Sin apuntes'}${nd ? ` · ${plural(nd, 'mazo', 'mazos')}` : ''}</span></span>
      <span class="go">›</span></button></li>`;
  }).join('');
  const pageRows = pages.map(p => {
    const cards = cardList().filter(c => c.page_id === p.id), st = statusOf(cards), snip = pageSnippet(p);
    const where = filtering && pageFolder(p) ? `${folderPath(S.folders, p.folder_id).map(f => esc(f.name)).join(' / ')} · ` : '';
    return `<li><button class="deck note-row" data-page="${p.id}"><span class="icon">${p.icon ? esc(p.icon) : icon('file-text', { size: 20 })}</span>
      <span class="info"><span class="dname">${esc(pageTitle(p))}</span>
        ${snip ? `<span class="snip">${esc(snip)}</span>` : ''}
        <span class="meta">${(p.tags || []).length ? `<span class="tags">${tagChips(p.tags)}</span>` : ''}${where}${cards.length ? `<span class="st-chip st-${st}"><i aria-hidden="true"></i>${plural(cards.length, 'tarjeta', 'tarjetas')}</span> · ` : ''}Editado ${shortDate(p.updated_at)}</span></span></button></li>`;
  }).join('');
  const tagFilter = [...S.tags.values()].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(t =>
    `<button class="fchip" data-ntag="${t.id}" aria-pressed="${o.tagIds.includes(t.id)}"><span class="tdot" style="background:var(--tag-${t.color || 'gray'}-bg);border-color:var(--tag-${t.color || 'gray'})"></span>${esc(t.name)}</button>`).join('');
  const title = filtering ? 'Resultados' : folder ? `${folder.icon ? esc(folder.icon) + ' ' : ''}${esc(folder.name)}` : 'Apuntes';
  const empty = filtering ? '<p class="muted">Ningún apunte coincide con la búsqueda o las etiquetas.</p>'
    : folder ? '<p class="muted">Esta carpeta no tiene apuntes todavía.</p>'
    : `<div class="empty-ill">${icon('file-text', { size: 28 })}</div><h2>Tus apuntes, unidos a tus tarjetas</h2>
       <p class="muted">Escribe o pega tus apuntes. Selecciona cualquier parte para convertirla en una tarjeta: quedará unida a ese fragmento, verás qué partes dominas y podrás repasar un tema entero de una vez.</p>
       <div class="btnrow" style="justify-content:center"><button class="primary" data-act="new-page">Nuevo apunte</button><button class="ghost" data-act="paste-page">Pegar apuntes</button></div>`;
  main.innerHTML = `${folder && !filtering ? noteCrumbs(folder.id) : ''}
    <div class="section-h"><h1>${title}</h1>${folder && !filtering ? '<button class="ghost small-btn" data-act="edit-nfolder">Editar carpeta</button>' : ''}</div>
    ${S.pagesMissing ? '<div class="panel"><p><b>Falta un paso en Supabase.</b> Para guardar apuntes en la nube, vuelve a ejecutar <code>supabase/schema.sql</code> en el SQL Editor y recarga la app.</p></div>' : ''}
    ${S.pages.size || S.folders.size ? `<div class="btnrow"><button class="primary" data-act="new-page">${icon('plus', { size: 16 })} Nuevo apunte</button><button class="ghost" data-act="new-folder" title="Nueva carpeta">${icon('folder', { size: 16 })} Carpeta</button><button class="ghost" data-act="paste-page" title="Pegar apuntes de otra aplicación">${icon('copy', { size: 16 })} Pegar</button></div>
    <div class="toolbar"><input id="pageSearch" type="search" placeholder="Buscar en todos los apuntes" aria-label="Buscar en los apuntes" value="${esc(S.pageQuery)}">
      <select id="noteSort" aria-label="Ordenar">${NOTE_SORTS.map(([v, l]) => `<option value="${v}" ${v === o.sort ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${tagFilter ? `<div class="filters">${tagFilter}${filtering ? '<button class="link" data-act="clear-nfilters">Quitar filtros</button>' : ''}</div>` : ''}` : ''}
    ${folderRows ? `<ul class="list">${folderRows}</ul>` : ''}
    ${pageRows ? `<ul class="list notes-list">${pageRows}</ul>` : folderRows ? '' : `<div class="empty notes-empty">${empty}</div>`}`;
}

const BLOCK_PH = 'Escribe algo… («# » título, «- » lista)';
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
const PH = { p: BLOCK_PH, h1: 'Título', h2: 'Subtítulo', h3: 'Título pequeño', li: 'Lista', ol: 'Lista numerada', todo: 'Por hacer',
  quote: 'Cita', callout: 'Escribe algo que quieras destacar', code: 'Código', table: BLOCK_PH, img: 'Pie de foto (opcional)' };
const CALLOUT_ICONS = ['💡', '⚠️', '📌', '✅', '❗', '📝', '🔑', '🧠'];
const delBtn = (id, what) => `<button type="button" class="iconbtn nb-del" data-del-block="${id}" aria-label="Quitar ${what}" title="Quitar ${what}">${icon('trash-2', { size: 15 })}</button>`;
function blockHTML(b, cards = []) {
  // Imagen: la imagen y debajo su pie (que se edita como un bloque de texto)
  if (b.type === 'img') {
    return `<figure class="nb nb-img" data-block="${b.id}">${imgHTML(b.src, esc(b.text))}${delBtn(b.id, 'la imagen')}
      <figcaption class="nb-text" data-edit-block="${b.id}">${b.text.trim() ? fmt(b.text) : `<span class="nb-ph">${PH.img}</span>`}</figcaption></figure>`;
  }
  if (b.type === 'hr') return `<div class="nb nb-hr" data-block="${b.id}"><hr>${delBtn(b.id, 'el separador')}</div>`;
  const n = cards.length, st = statusOf(cards);
  const body = !b.text.trim() ? `<span class="nb-ph">${PH[b.type] || BLOCK_PH}</span>` : b.type === 'table' ? tableHTML(b.text)
    : b.type === 'code' ? `<pre class="nb-code">${esc(b.text)}</pre>` : fmt(b.text);
  // Lo que va delante del texto: el número, la casilla o el icono del destacado
  const lead = b.type === 'ol' ? `<span class="nb-num" aria-hidden="true">${olNumbers(curPage()?.blocks || []).get(b.id) || 1}.</span>`
    : b.type === 'todo' ? `<button type="button" class="nb-check" role="checkbox" aria-checked="${!!b.checked}" aria-label="Hecho" data-todo="${b.id}">${icon('check', { size: 13 })}</button>`
    : b.type === 'callout' ? `<button type="button" class="nb-icon" data-callout-icon="${b.id}" aria-label="Cambiar el icono" title="Cambiar el icono">${esc(b.icon || '💡')}</button>` : '';
  // En los títulos: estudiar el apartado entero (el título y lo que cuelga de él)
  let sec = '';
  const p = curPage();
  if (p && ['h1', 'h2', 'h3'].includes(b.type)) {
    const ids = new Set(sectionIds(p.blocks, b.id));
    const secCards = cardList().filter(c => c.page_id === p.id && ids.has(c.block_id));
    if (secCards.length) {
      const pend = pendingIn(`page:${p.id}:${b.id}`), sst = statusOf(secCards);
      sec = `<button type="button" class="nb-sec st-${sst}" data-study-section="${b.id}" ${pend ? '' : 'disabled'} title="${esc(statusLabel(sst))} · ${plural(secCards.length, 'tarjeta', 'tarjetas')} en este apartado">${pend ? `Estudiar ${pend}` : esc(statusLabel(sst))}</button>`;
    }
  }
  return `<div class="nb nb-${b.type}${b.type === 'todo' && b.checked ? ' is-done' : ''}" data-block="${b.id}">${lead}<div class="nb-text" data-edit-block="${b.id}">${body}</div>${sec}
    ${n ? `<button type="button" class="nb-cards st-${st}" data-block-cards="${b.id}" title="${esc(statusLabel(st))} · ${plural(n, 'tarjeta sale', 'tarjetas salen')} de esta parte" aria-label="${plural(n, 'tarjeta', 'tarjetas')} de esta parte: ${esc(statusLabel(st).toLowerCase())}">${n}</button>` : ''}</div>`;
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
function renderPage() {
  const p = S.pages.get(S.pageId);
  if (!p) return go('notes');
  if (!p.blocks.length) p.blocks.push(newBlock());
  const cards = pageCards(p.id);
  const total = [...cards.values()].reduce((s, l) => s + l.length, 0);
  const prop = (ic, label, value, forId = '') => `<div class="prop"><${forId ? `label for="${forId}"` : 'span'} class="prop-k">${icon(ic, { size: 16 })} ${label}</${forId ? 'label' : 'span'}><div class="prop-v">${value}</div></div>`;
  main.innerHTML = `<div class="pg-top">${noteCrumbs(pageFolder(p), pageTitle(p))}<span class="spacer"></span>
      <span id="pgSaved" class="pg-saved" aria-live="polite"></span>
      ${S.session ? '<button class="primary small-btn" data-act="back-study">Volver al estudio</button>' : ''}
      <button type="button" class="ghost small-btn pg-suggest" data-act="suggest-cards" title="Propone tarjetas a partir de este apunte">${icon('sparkles', { size: 15 })} <span>Sugerir tarjetas</span></button>
      <button type="button" class="iconbtn" data-act="notes-help" aria-label="Formato y atajos" title="Formato y atajos">${icon('circle-help', { size: 18 })}</button>
      <button type="button" class="iconbtn" data-act="page-menu" aria-label="Más opciones" title="Más opciones">${icon('ellipsis', { size: 18 })}</button></div>
    <div class="pg-head">
      ${p.icon ? `<button type="button" class="pg-icon" data-act="page-icon" aria-label="Cambiar el icono">${esc(p.icon)}</button>`
        : `<button type="button" class="pg-addicon" data-act="page-icon">${icon('smile-plus', { size: 16 })} Añadir icono</button>`}
      <input id="pgTitle" class="pg-title" maxlength="120" placeholder="Sin título" aria-label="Título" value="${esc(p.title || '')}">
    </div>
    <div class="pg-props">
      ${prop('layers', 'Mazo', `<select id="pgDeck" class="prop-select" aria-label="Mazo donde van las tarjetas de este apunte"><option value="">Sin mazo</option>${deckOptions(p.deck_id)}</select>`)}
      ${prop('folder', 'Carpeta', folderSelect('pgFolder', pageFolder(p) || '', null, 'Sin carpeta').replace('<select ', '<select class="prop-select" aria-label="Carpeta" '))}
      ${prop('tag', 'Etiquetas', `${tagChips(p.tags || [])}<button type="button" class="link prop-add" data-act="page-tags">${(p.tags || []).length ? 'Editar' : 'Añadir'}</button>`)}
      ${total ? '' : prop('notebook-text', 'Tarjetas', '<span class="muted">Ninguna todavía · selecciona un texto para crear una o </span><button type="button" class="link" data-act="suggest-cards">pide sugerencias</button>')}
    </div>
    ${pageStatusHTML(p, cards)}
    <div class="pg-blocks" id="pgBlocks">${p.blocks.map(b => blockHTML(b, cards.get(b.id))).join('')}</div>
    <div class="pg-adds"><button type="button" class="pg-add" data-act="block-menu" aria-haspopup="listbox">${icon('plus', { size: 15 })} Bloque</button><span class="muted small pg-slash">o escribe <kbd>/</kbd> en una línea vacía</span></div>
    <div id="selBar" class="selbar" role="toolbar" aria-label="Con el texto seleccionado" hidden>
      <button type="button" class="primary small-btn" data-act="sel-card">${icon('plus', { size: 15 })} Crear tarjeta</button>
      <button type="button" class="ghost small-btn" data-act="sel-cloze">${icon('puzzle', { size: 15 })} Convertir en hueco</button></div>`;
  if (S.focusBlock) {
    const el = document.querySelector(`[data-block="${S.focusBlock}"]`);
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); }
    S.focusBlock = null;
  }
}
const curPage = () => S.pages.get(S.pageId);
// Quitar del DOM el bloque que tiene el foco dispara «focusout» a mitad del cambio: mientras se
// repinta, ese aviso se ignora (lo escrito ya se ha guardado antes).
let repainting = false;
function repaint(fn) { repainting = true; try { fn(); } finally { repainting = false; } }
// Vuelve a pintar los bloques y deja editando uno (con el cursor en «caret»)
function redrawBlocks(editId, caret) {
  const p = curPage(), cards = pageCards(p.id);
  repaint(() => { $('#pgBlocks').innerHTML = p.blocks.map(b => blockHTML(b, cards.get(b.id))).join(''); });
  if (editId) editBlock(editId, caret);
}
// Un bloque pasa a editarse: su texto se cambia por un cuadro de texto
function editBlock(id, caret = null) {
  if (NO_TEXT.includes(curPage()?.blocks.find(x => x.id === id)?.type)) return;
  const open = document.querySelector('[data-block-input]');
  if (open) commitBlockEl(open);
  const openTbl = document.querySelector('[data-table-ed]');
  if (openTbl && openTbl.dataset.tableEd !== id) commitTable(openTbl.dataset.tableEd);
  if (curPage()?.blocks.find(x => x.id === id)?.type === 'table') return openTbl?.dataset.tableEd === id ? null : editTable(id, typeof caret === 'object' ? caret : null);
  return editBlockRaw(id, caret);
}
function editBlockRaw(id, caret = null) {
  const b = curPage()?.blocks.find(x => x.id === id);
  const el = document.querySelector(`[data-block="${id}"] .nb-text`);
  if (!b || !el) return;
  const ph = b.type === 'p' ? BLOCK_PH + ' · / para más' : PH[b.type] || BLOCK_PH;
  el.outerHTML = `<textarea class="nb-input" data-block-input="${id}" rows="1" placeholder="${ph}" aria-label="${b.type === 'img' ? 'Pie de foto' : 'Bloque'}" ${b.type === 'code' ? 'spellcheck="false"' : ''}>${esc(b.text)}</textarea>`;
  const t = document.querySelector(`[data-block-input="${id}"]`);
  autoGrow(t); t.focus();
  const pos = caret == null ? t.value.length : caret;
  t.setSelectionRange(pos, pos);
}
// Guarda lo escrito en un bloque y lo vuelve a mostrar con formato
function commitBlockEl(t) {
  const p = curPage(), b = p?.blocks.find(x => x.id === t.dataset.blockInput);
  if (!b) return;
  // Un párrafo que en realidad es una tabla en Markdown pasa a ser tabla
  if (b.type === 'p' && isTableText(t.value)) { b.type = 'table'; savePageSoon(p); }
  if (b.text !== t.value) { b.text = t.value; savePageSoon(p); }
  const wrap = t.closest('.nb');
  if (wrap) repaint(() => { wrap.outerHTML = blockHTML(b, pageCards(p.id).get(b.id)); });
  renumber();
}
function renumber() {
  const nums = olNumbers(curPage()?.blocks || []);
  document.querySelectorAll('#pgBlocks .nb-ol').forEach(el => { const x = el.querySelector('.nb-num'); if (x) x.textContent = (nums.get(el.dataset.block) || 1) + '.'; });
}
// Cambia el tipo de un bloque (atajo o menú /) y lo deja editando
function retypeBlock(b, type, text = '', extra = {}) {
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
function moveCards(fromBlock, toBlock) {
  for (const c of cardList()) if (c.page_id === S.pageId && c.block_id === fromBlock) {
    c.block_id = toBlock;
    api.updateCard(c.id, { block_id: toBlock }).catch(() => {});
  }
}
// Teclas dentro de un bloque: Enter parte, Retroceso al principio junta, flechas saltan de bloque
function blockKey(e) {
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
    if (['li', 'ol', 'todo'].includes(b.type) && !b.text.trim()) { b.type = 'p'; savePageSoon(p); return redrawBlocks(b.id, 0); }   // Enter en un punto vacío: fin de la lista
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
  // Las flechas se saltan los separadores
  const near = (dir) => { for (let j = i + dir; j >= 0 && j < p.blocks.length; j += dir) if (!NO_TEXT.includes(p.blocks[j].type)) return p.blocks[j]; return null; };
  if (e.key === 'ArrowUp' && collapsed && at === 0 && near(-1)) { e.preventDefault(); return editBlock(near(-1).id); }
  if (e.key === 'ArrowDown' && collapsed && at === t.value.length && near(1)) { e.preventDefault(); return editBlock(near(1).id, 0); }
  if (e.key === 'Escape') { e.preventDefault(); t.blur(); }
}
// Lo seleccionado en la página (para crear una tarjeta): { blockId, text, at }
function readPageSelection() {
  const a = document.activeElement;
  if (a?.matches?.('[data-block-input]')) {
    return a.selectionEnd > a.selectionStart ? { blockId: a.dataset.blockInput, text: a.value.slice(a.selectionStart, a.selectionEnd), at: a.selectionStart } : null;
  }
  const sel = getSelection(), txt = sel?.toString() || '';
  const node = sel?.anchorNode;
  const nb = node && (node.nodeType === 1 ? node : node.parentElement)?.closest?.('#pgBlocks .nb');
  return txt.trim() && nb ? { blockId: nb.dataset.block, text: txt, at: -1 } : null;
}
document.addEventListener('selectionchange', () => {
  if (S.view !== 'page') return;
  S.pageSel = readPageSelection();
  const bar = $('#selBar');
  if (bar) bar.hidden = !S.pageSel;
});
// Que pulsar la barra no quite la selección ni cierre el bloque que se está editando
document.addEventListener('pointerdown', e => { if (e.target.closest?.('#selBar, .tbl-tools')) e.preventDefault(); });
// Al salir de la cuadrícula (a otra parte de la página), la tabla se guarda y se ve con formato
document.addEventListener('focusout', e => {
  const ed = e.target.closest?.('[data-table-ed]');
  if (!ed || repainting) return;
  setTimeout(() => { if (ed.isConnected && !ed.contains(document.activeElement)) commitTable(ed.dataset.tableEd); }, 0);
});
document.addEventListener('focusin', e => { if (e.target.matches?.('.tc')) { S.tblFocus = { r: e.target.dataset.r, c: +e.target.dataset.c }; const a = $('#tblAlign'); if (a) a.title = `Alinear la columna donde estás (ahora: ${{ '': 'izquierda', left: 'izquierda', center: 'centrada', right: 'derecha' }[tblAlign.get(e.target.closest('[data-table-ed]').dataset.tableEd)?.[S.tblFocus.c] || '']})`; } });
document.addEventListener('focusout', e => { if (!repainting && e.target.matches?.('[data-block-input]') && e.target.isConnected) commitBlockEl(e.target); });
document.addEventListener('paste', e => {
  const t = e.target;
  if (t.matches?.('.tc')) return tablePaste(e);
  // Una imagen pegada: en un campo del editor, dentro del campo; en unos apuntes, como bloque nuevo
  const img = imageFile(e.clipboardData);
  if (img && document.querySelector('.ef-occ') && !t.matches?.('.ef-input')) { e.preventDefault(); return occSetImage(img); }
  if (img && t.matches?.('.ef-input')) { e.preventDefault(); return imageIntoField(t, img); }
  if (img && S.view === 'page' && !t.closest?.('.sheet')) { e.preventDefault(); return addImageBlock(img, t.dataset?.blockInput); }
  if (!t.matches?.('[data-block-input]')) return;
  const text = e.clipboardData?.getData('text/plain') || '';
  if (!text.includes('\n')) return;
  // Varias líneas pegadas: se convierten en bloques (títulos, listas y párrafos)
  const blocks = textToBlocks(text);
  if (!blocks.length) return;
  e.preventDefault();
  const p = curPage(), i = p.blocks.findIndex(x => x.id === t.dataset.blockInput), b = p.blocks[i];
  const before = t.value.slice(0, t.selectionStart), after = t.value.slice(t.selectionEnd);
  let insert = blocks;
  if (!before.trim() && b.type === 'p') { Object.assign(b, { type: blocks[0].type, text: blocks[0].text }); insert = blocks.slice(1); }
  else b.text = before;
  p.blocks.splice(i + 1, 0, ...insert);
  const last = insert.length ? insert[insert.length - 1] : b;
  const caret = last.text.length;
  last.text += after;
  savePageSoon(p);
  redrawBlocks(last.id, caret);
});
/* ---------- Editor de tablas: una cuadrícula en la que se escribe en cada celda ---------- */
// Por debajo se guarda en Markdown (b.text); «Editar como texto» sigue disponible para quien lo prefiera.
const TBL_EMPTY = () => ({ head: ['', ''], align: ['', ''], rows: [['', ''], ['', '']] });
function tableModel(b) {
  const t = parseTable(b.text);
  if (t) return t;
  return String(b.text || '').trim() ? null : TBL_EMPTY();
}
function tableEditorHTML(b, t) {
  const n = t.head.length;
  const al = i => (t.align[i] ? ` style="text-align:${t.align[i]}"` : '');
  const cell = (v, r, c) => `<input class="tc" data-r="${r}" data-c="${c}" value="${esc(v)}" aria-label="${r === 'h' ? `Cabecera, columna ${c + 1}` : `Fila ${+r + 1}, columna ${c + 1}`}"${al(c)} spellcheck="true">`;
  const alignIcon = { '': 'Izquierda', left: 'Izquierda', center: 'Centrada', right: 'Derecha' };
  return `<div class="tbl-ed" data-table-ed="${b.id}">
    <div class="tbl-tools" role="toolbar" aria-label="Tabla">
      <button type="button" data-tbl="row-add" title="Añadir una fila debajo de la actual">${icon('plus', { size: 14 })} Fila</button>
      <button type="button" data-tbl="col-add" title="Añadir una columna a la derecha de la actual">${icon('plus', { size: 14 })} Columna</button>
      <span class="tbl-sep" aria-hidden="true"></span>
      <button type="button" data-tbl="row-del" title="Quitar la fila donde estás">Quitar fila</button>
      <button type="button" data-tbl="col-del" title="Quitar la columna donde estás">Quitar columna</button>
      <button type="button" data-tbl="align" id="tblAlign" title="Alinear la columna donde estás (ahora: ${alignIcon[t.align[S.tblFocus?.c ?? 0] || ''].toLowerCase()})">Alinear</button>
      <span class="spacer"></span>
      <button type="button" data-tbl="raw" title="Escribir la tabla como texto (Markdown)">Como texto</button>
      <button type="button" data-tbl="delete" class="danger" title="Quitar la tabla">${icon('trash-2', { size: 14 })}</button>
      <button type="button" data-tbl="done" class="tbl-done">Listo</button>
    </div>
    <div class="nb-tablewrap"><table class="nb-tbl tbl-grid"><thead><tr>${t.head.map((v, c) => `<th>${cell(v, 'h', c)}</th>`).join('')}</tr></thead>
      <tbody>${t.rows.map((r, ri) => `<tr>${Array.from({ length: n }, (_, c) => `<td>${cell(r[c] ?? '', ri, c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="hint tbl-hint">Tab: celda siguiente · Enter: fila de abajo · Puedes pegar celdas copiadas de Excel o Google Sheets</p>
  </div>`;
}
const tableEd = id => document.querySelector(`[data-table-ed="${id}"]`);
// La cuadrícula tal como está en pantalla → { head, align, rows }
function readGrid(ed, align) {
  const head = [], rows = [];
  ed.querySelectorAll('.tc').forEach(inp => {
    const r = inp.dataset.r, c = +inp.dataset.c;
    if (r === 'h') head[c] = inp.value; else { (rows[+r] ||= [])[c] = inp.value; }
  });
  return { head, align: head.map((_, i) => align?.[i] || ''), rows };
}
let tblAlign = new Map();   // alineación de cada tabla mientras se edita
function editTable(id, focus = null) {
  const p = curPage(), b = p?.blocks.find(x => x.id === id);
  const el = document.querySelector(`[data-block="${id}"] .nb-text`);
  if (!b || !el) return;
  const t = tableModel(b);
  if (!t) return editBlockRaw(id);   // texto que aún no es una tabla: como texto
  tblAlign.set(id, t.align);
  S.tblFocus = focus || S.tblFocus || { r: 'h', c: 0 };
  el.outerHTML = tableEditorHTML(b, t);
  tblFocusCell(id, S.tblFocus);
}
function tblFocusCell(id, { r, c }) {
  const ed = tableEd(id);
  const inp = ed?.querySelector(`.tc[data-r="${r}"][data-c="${c}"]`) || ed?.querySelector('.tc');
  if (inp) { inp.focus(); inp.setSelectionRange?.(inp.value.length, inp.value.length); }
}
function saveGrid(id) {
  const p = curPage(), b = p?.blocks.find(x => x.id === id), ed = tableEd(id);
  if (!b || !ed) return null;
  const t = readGrid(ed, tblAlign.get(id));
  const md = tableToMarkdown(t);
  if (md !== b.text) { b.text = md; savePageSoon(p); }
  return t;
}
// Cambiar la forma de la tabla (filas, columnas, alineación) y volver a pintarla
function reshapeTable(id, fn) {
  const t = saveGrid(id);
  if (!t) return;
  const f = { ...(S.tblFocus || { r: 'h', c: 0 }) };
  fn(t, f);
  tblAlign.set(id, t.align);
  const p = curPage(), b = p.blocks.find(x => x.id === id);
  b.text = tableToMarkdown(t); savePageSoon(p);
  repaint(() => { tableEd(id).outerHTML = tableEditorHTML(b, t); });
  S.tblFocus = f;
  tblFocusCell(id, f);
}
function tableAction(id, act) {
  const n = () => readGrid(tableEd(id)).head.length;
  if (act === 'row-add') return reshapeTable(id, (t, f) => { const at = f.r === 'h' ? 0 : +f.r + 1; t.rows.splice(at, 0, Array(t.head.length).fill('')); f.r = at; });
  if (act === 'col-add') return reshapeTable(id, (t, f) => { const at = f.c + 1; t.head.splice(at, 0, ''); t.align.splice(at, 0, ''); t.rows.forEach(r => r.splice(at, 0, '')); f.c = at; });
  if (act === 'row-del') return reshapeTable(id, (t, f) => {
    if (f.r === 'h') { if (!t.rows.length) return toast('La tabla necesita al menos la cabecera'); t.head = t.rows.shift(); f.r = 'h'; return; }
    t.rows.splice(+f.r, 1); f.r = t.rows.length ? Math.min(+f.r, t.rows.length - 1) : 'h';
  });
  if (act === 'col-del') {
    if (n() <= 1) return toast('La tabla necesita al menos una columna');
    return reshapeTable(id, (t, f) => { t.head.splice(f.c, 1); t.align.splice(f.c, 1); t.rows.forEach(r => r.splice(f.c, 1)); f.c = Math.min(f.c, t.head.length - 1); });
  }
  if (act === 'align') return reshapeTable(id, (t, f) => { const order = ['', 'center', 'right']; t.align[f.c] = order[(order.indexOf(t.align[f.c] === 'left' ? '' : t.align[f.c] || '') + 1) % 3]; });
  if (act === 'raw') { commitTable(id); return editBlockRaw(id); }
  if (act === 'done') return commitTable(id);
  if (act === 'delete') {
    const p = curPage(), i = p.blocks.findIndex(x => x.id === id);
    if (i < 0) return;
    const next = p.blocks[i + 1] || p.blocks[i - 1];
    if (next) moveCards(id, next.id);
    p.blocks.splice(i, 1);
    if (!p.blocks.length) p.blocks.push(newBlock());
    savePageSoon(p);
    redrawBlocks();
    return toast('Tabla quitada');
  }
}
// Terminar de editar: se guarda y se ve la tabla con formato
function commitTable(id, redraw = true) {
  saveGrid(id);
  tblAlign.delete(id);
  const p = curPage(), b = p?.blocks.find(x => x.id === id), ed = tableEd(id);
  if (!b || !ed) return;
  if (redraw) repaint(() => { ed.closest('.nb').outerHTML = blockHTML(b, pageCards(p.id).get(b.id)); });
}
// Teclas dentro de una celda
function tableKey(e) {
  const inp = e.target, ed = inp.closest('[data-table-ed]'), id = ed.dataset.tableEd;
  const r = inp.dataset.r, c = +inp.dataset.c, t = readGrid(ed), n = t.head.length, last = t.rows.length - 1;
  const go = (rr, cc) => { S.tblFocus = { r: rr, c: cc }; tblFocusCell(id, S.tblFocus); };
  const ri = r === 'h' ? -1 : +r;
  if (e.key === 'Tab') {
    e.preventDefault();
    if (e.shiftKey) { if (c > 0) return go(r, c - 1); if (ri >= 0) return go(ri === 0 ? 'h' : ri - 1, n - 1); return; }
    if (c < n - 1) return go(r, c + 1);
    if (ri < last) return go(ri + 1, 0);
    S.tblFocus = { r: ri, c };
    return reshapeTable(id, (tt, f) => { tt.rows.push(Array(n).fill('')); f.r = tt.rows.length - 1; f.c = 0; });
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    // Salir de la tabla y seguir escribiendo debajo
    e.preventDefault();
    commitTable(id);
    const p = curPage(), i = p.blocks.findIndex(x => x.id === id), nb = newBlock();
    p.blocks.splice(i + 1, 0, nb); savePageSoon(p);
    return redrawBlocks(nb.id, 0);
  }
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    if (ri < last) return go(ri + 1, c);
    S.tblFocus = { r: ri, c };
    return reshapeTable(id, (tt, f) => { tt.rows.push(Array(n).fill('')); f.r = tt.rows.length - 1; });
  }
  if (e.key === 'ArrowDown' && ri < last) { e.preventDefault(); return go(ri + 1, c); }
  if (e.key === 'ArrowUp' && ri >= 0) { e.preventDefault(); return go(ri === 0 ? 'h' : ri - 1, c); }
  if (e.key === 'Escape') { e.preventDefault(); return commitTable(id); }
}
// Pegar celdas de una hoja de cálculo: rellenan desde la celda actual y amplían la tabla si hace falta
function tablePaste(e) {
  const inp = e.target, ed = inp.closest('[data-table-ed]'), id = ed.dataset.tableEd;
  const text = e.clipboardData?.getData('text/plain') || '';
  if (isTableText(text)) {
    e.preventDefault();
    const t = parseTable(text);
    S.tblFocus = { r: 'h', c: 0 };
    return reshapeTable(id, tt => Object.assign(tt, t));
  }
  const grid = gridFromPaste(text);
  if (!grid) return;
  e.preventDefault();
  const r0 = inp.dataset.r === 'h' ? -1 : +inp.dataset.r, c0 = +inp.dataset.c;
  S.tblFocus = { r: inp.dataset.r, c: c0 };
  reshapeTable(id, (t, f) => {
    const width = Math.max(t.head.length, c0 + Math.max(...grid.map(g => g.length)));
    while (t.head.length < width) { t.head.push(''); t.align.push(''); }
    t.rows.forEach(r => { while (r.length < width) r.push(''); });
    grid.forEach((g, k) => {
      const ri = r0 + k;
      const row = ri < 0 ? t.head : (t.rows[ri] ||= Array(width).fill(''));
      g.forEach((v, j) => { row[c0 + j] = v; });
    });
    for (let i = 0; i < t.rows.length; i++) t.rows[i] ||= Array(width).fill('');
    const lastR = r0 + grid.length - 1;
    f.r = lastR < 0 ? 'h' : lastR; f.c = c0 + grid.at(-1).length - 1;
  });
}

/* ---------- Menú de bloques (/ o «+ Bloque») ---------- */
const GLYPH = { p: 'Aa', h1: 'H1', h2: 'H2', h3: 'H3', li: '•', ol: '1.', todo: '☐', quote: '❝', callout: '💡', code: '{ }', table: '▦', hr: '—' };
const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function blockMenuItems() {
  const q = fold(S.blockMenu?.q);
  return BLOCK_MENU.filter(it => !q || fold(it.label + ' ' + it.keys).includes(q));
}
// mode: 'slash' (cambia el bloque donde se escribe «/») · 'append' (añade uno al final)
function openBlockMenu({ mode, blockId = null, q = '', anchor }) {
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
function closeBlockMenu() { S.blockMenu = null; const el = $('#blockMenu'); if (el) el.hidden = true; }
// Elegir un tipo en el menú
function chooseBlockType(type) {
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
async function addImageBlock(file, afterId = null) {
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
function removeImageBlock(id) {
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
function newPage({ title = '', blocks = null } = {}) {
  if (S.pagesMissing) return toast('Primero ejecuta supabase/schema.sql en Supabase (lo explica la pantalla de Apuntes)');
  const deckId = S.view === 'deck' ? S.deckId : null;
  // Se crea en la carpeta que estás viendo (en «Apuntes» o en «Mis mazos»)
  const folderId = S.view === 'notes' ? S.noteFolder : S.view === 'deck' ? S.decks.get(S.deckId)?.folder_id || null : null;
  const p = { id: api.newId(), owner: S.uid, title, icon: '', deck_id: deckId, folder_id: folderId, tags: [], blocks: blocks?.length ? blocks : [newBlock()] };
  S.pages.set(p.id, p);
  savePageSoon(p, 0);
  go('page', { pageId: p.id });
  if (title || blocks?.length) return;
  setTimeout(() => $('#pgTitle')?.focus(), 30);
}
// Un PDF → un apunte: títulos, párrafos y listas; las páginas escaneadas, como imágenes
async function importPdf(file) {
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
function pastePageSheet() {
  openSheet(`<h2>Pegar apuntes</h2>
    <p class="muted small">Pega tus apuntes (de Word, Notion, Google Docs…). Las líneas con «# » serán títulos y las que empiezan por «- », listas.</p>
    <textarea id="pagePaste" class="paste-box" rows="10" aria-label="Apuntes"></textarea>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-act="paste-page-ok">Crear apunte</button></div>`);
}
// Crear una tarjeta (o un hueco) con lo seleccionado en los apuntes, ya vinculada a su bloque
function cardFromSelection(kind) {
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
// Formato y atajos de los apuntes: todo lo que se puede escribir y hacer, con ejemplos
function notesHelpSheet() {
  const row = (code, what) => `<tr><td><code>${esc(code)}</code></td><td>${what}</td></tr>`;
  const key = (k, what) => `<tr><td><kbd>${k}</kbd></td><td>${what}</td></tr>`;
  const table = (rows, head = ['Escribe', 'Para']) => `<table class="help-tbl"><thead><tr><th>${head[0]}</th><th>${head[1]}</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  openSheet(`<h2>Formato y atajos</h2>
    <p class="muted small">Toca cualquier parte para escribir en ella; al salir se ve con formato. Se guarda solo.</p>
    <h3 class="sub-h">Bloques (al principio de una línea)</h3>
    <p class="hint">Escribe <code>/</code> en una línea vacía (o pulsa «+ Bloque») para elegir entre todos los tipos: también destacados, imágenes y separadores.</p>
    ${table([row('# ', 'Título'), row('## ', 'Subtítulo'), row('### ', 'Título pequeño'), row('- ', 'Punto de una lista (también <code>* </code>)'), row('1. ', 'Lista numerada'),
      row('[] ', 'Casilla (<code>[x] </code> ya marcada)'), row('> ', 'Cita'), row('```', 'Código'), row('---', 'Separador'), row('| A | B |', 'Tabla (abajo cómo)')])}
    <h3 class="sub-h">Formato dentro del texto</h3>
    ${table([row('**negrita**', '<b>negrita</b>'), row('*cursiva*', '<i>cursiva</i>'), row('漢字[かんじ]', 'Furigana sobre el kanji: <ruby>漢字<rt>かんじ</rt></ruby>')])}
    <h3 class="sub-h">Tablas</h3>
    <pre class="help-pre">| Caso     | Sufijo | Ejemplo |
| :------- | :----: | ------: |
| Locativo |  -de   |    evde |</pre>
    <p class="hint">Lo más fácil: «+ Bloque» → Tabla, y escribe en cada celda (Tab pasa a la siguiente; puedes pegar celdas de Excel o Google Sheets). Si prefieres escribirla como texto, usa «Editar como texto»: la segunda línea separa la cabecera; <code>:---</code> alinea a la izquierda, <code>:---:</code> al centro y <code>---:</code> a la derecha.</p>
    <h3 class="sub-h">Teclas</h3>
    ${table([
      key('Enter', 'Bloque nuevo (en una tabla, fila nueva; en un código, salto de línea; en un punto vacío, termina la lista)'),
      key('Mayús + Enter', 'Salto de línea dentro del mismo bloque'),
      key('Retroceso', 'Al principio de un bloque: lo junta con el anterior (en un título o lista, lo vuelve párrafo)'),
      key('↑ ↓', 'Al principio o al final de un bloque: pasa al anterior o al siguiente'),
      key('Esc', 'Deja de editar'),
      key('Ctrl + Enter', 'En una tabla o un código: sale de él y crea un bloque debajo'),
    ], ['Tecla', 'Hace'])}
    <h3 class="sub-h">Tarjetas desde los apuntes</h3>
    <ul class="help-list">
      <li>Selecciona un trozo de texto y pulsa <b>Crear tarjeta</b> (lo seleccionado será la respuesta) o <b>Hueco</b> (el bloque entero con eso oculto: <code>Ev{{de}}yim</code>).</li>
      <li>La tarjeta queda unida a esa parte. Al estudiarla, <b>Ver en los apuntes</b> te trae aquí.</li>
      <li>Arriba eliges el <b>mazo</b> donde van las tarjetas de este apunte.</li>
      <li>El número a la derecha de cada parte es cuántas tarjetas salen de ella; tócalo para verlas.</li>
    </ul>
    <h3 class="sub-h">Cómo llevas cada parte</h3>
    <ul class="help-list help-st">${STATUS.map(s => `<li><span class="st-chip st-${s.id}"><i aria-hidden="true"></i>${s.label}</span> ${{ ok: 'las has repasado y no toca todavía', due: 'toca repasar alguna', weak: 'has fallado alguna hace poco o muchas veces', new: 'hay alguna que aún no has estudiado' }[s.id]}</li>`).join('')}</ul>
    <p class="hint">En cada título, <b>Estudiar</b> repasa solo ese apartado (el título y lo que hay debajo). Arriba, <b>Estudiar este apunte</b> los repasa todos.</p>
    <h3 class="sub-h">Pegar</h3>
    <p class="hint">Si pegas varias líneas, se convierten en bloques: títulos, listas, tablas y párrafos. En «Apuntes» → <b>Pegar apuntes</b> puedes traer unos apuntes enteros de Word, Notion o Google Docs.</p>
    <div class="btnrow"><span class="spacer"></span><button class="primary" data-act="close-sheet">Entendido</button></div>`);
}
function blockCardsSheet(blockId) {
  const list = cardList().filter(c => c.page_id === S.pageId && c.block_id === blockId);
  openSheet(`<h2>Tarjetas de esta parte</h2>
    <ul class="list">${list.map(c => `<li><button class="row" data-card="${c.id}"><span class="f">${fmt(c.front)}</span>${statusChip(c.id)}<span class="b">${fmt(c.back)}</span></button></li>`).join('')}</ul>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button></div>`);
}

/* ===================== perfil ===================== */
function renderProfile() {
  const total = S.cards.size;
  let learned = 0;
  for (const p of S.progress.values()) if (p.interval >= 21) learned++;
  main.innerHTML = `<h1>Perfil</h1>
    <p class="muted">${total} ${total === 1 ? 'tarjeta' : 'tarjetas'} en ${S.decks.size} ${S.decks.size === 1 ? 'mazo' : 'mazos'} · ${S.progress.size} empezadas · ${learned} consolidadas</p>
    <ul class="list linklist">
      <li><button class="row-link" data-nav="friends">${icon('users', { size: 20 })}<span><b>Amigos</b><small>Invita a tus amigos y mira cómo van sus rachas</small></span><span class="fr-badge" id="frBadge" ${incoming().length ? '' : 'hidden'}>${incoming().length}</span>${icon('chevron-right', { size: 18, cls: 'chev' })}</button></li>
      <li><button class="row-link" data-nav="settings">${icon('settings', { size: 20 })}<span><b>Ajustes</b><small>Estudio, ritmo de repaso, apariencia, inicio y copias de seguridad</small></span>${icon('chevron-right', { size: 18, cls: 'chev' })}</button></li>
      <li><button class="row-link" data-nav="stats">${icon('chart-column', { size: 20 })}<span><b>Estadísticas</b><small>Gráficos con filtros por periodo, mazo y tipo de tarjeta</small></span>${icon('chevron-right', { size: 18, cls: 'chev' })}</button></li>
      <li><button class="row-link" data-act="intro">${icon('circle-help', { size: 20 })}<span><b>Ver la presentación</b><small>Qué puedes hacer con Flaski, en un minuto</small></span>${icon('chevron-right', { size: 18, cls: 'chev' })}</button></li>
    </ul>
    <div class="panel"><form data-form="profile">
      <label for="p-name" style="margin-top:0">Tu nombre (lo ven quienes usan tus mazos compartidos)</label>
      <input id="p-name" maxlength="40" value="${esc(S.name)}">
      <button class="primary" type="submit" style="margin-top:12px">Guardar nombre</button></form></div>
    ${api.mode === 'local'
      ? `<div class="panel"><p class="small muted">Estás en <b>modo local</b>: no hay cuenta y todo se guarda en este navegador.</p>
          <div class="btnrow"><button class="ghost danger" data-act="ask-reset-local">Borrar datos locales</button></div></div>`
      : `<div class="panel"><p class="small muted">Has entrado como <b>${esc(S.email)}</b></p>
          <div class="btnrow"><button class="ghost" data-act="change-pass">Cambiar contraseña</button><button class="ghost danger" data-act="signout">Cerrar sesión</button></div></div>`}
    <p class="muted small">Escritura de kanji y hanzi con <a href="https://hanziwriter.org" target="_blank" rel="noopener">Hanzi Writer</a> de David Chanin (MIT), con datos de trazos de animCJK y Make Me A Hanzi (licencias Arphic y LGPL). Iconos de <a href="https://lucide.dev" target="_blank" rel="noopener">Lucide</a> (ISC) y <a href="https://github.com/microsoft/fluentui-emoji" target="_blank" rel="noopener">Fluent Emoji</a> de Microsoft (MIT). Detalles en la carpeta <i>licenses</i>.</p>
    <p class="muted small">Flaski es software libre. Consejo: en el iPhone, abre la app en Safari y pulsa Compartir → «Añadir a pantalla de inicio».</p>`;
}

/* ===================== estadísticas ===================== */
function statsScopeOptions(sel) {
  const o = (v, label) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${esc(label)}</option>`;
  const folders = [...S.folders.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const decks = [...S.decks.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const tags = [...S.tags.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return o('all', 'Todos los mazos')
    + (folders.length ? `<optgroup label="Carpetas">${folders.map(f => o('folder:' + f.id, f.name)).join('')}</optgroup>` : '')
    + `<optgroup label="Mazos">${decks.map(d => o(d.id, d.name + (d.archived ? ' (archivado)' : ''))).join('')}</optgroup>`
    + (tags.length ? `<optgroup label="Etiquetas">${tags.map(t => o('tag:' + t.id, '#' + t.name)).join('')}</optgroup>` : '');
}
let statsData = null;
function renderStats() {
  const f = S.stats;
  if (f.scope !== 'all' && !f.scope.includes(':') && !S.decks.has(f.scope)) f.scope = 'all';
  // En Estadísticas «Todos» incluye también los mazos archivados
  const deckSet = f.scope === 'all' ? new Set(S.decks.keys())
    : f.scope.includes(':') ? scopeDecks(f.scope) : new Set([f.scope]);
  const ctx = {
    events: S.events, cards: S.cards, progress: S.progress, decks: S.decks, log: S.log, deckSet,
    modeOf: c => cardModel(c).tpl.mode, modes: MODES,
    scopeOptions: statsScopeOptions, scopeName,
    deckName: id => S.decks.get(id)?.name || 'Mazo', deckLabel: id => (S.decks.get(id) ? deckIcon(S.decks.get(id)) : ''),
    cardFront: c => fmt(c.front), icon,
  };
  const { html, data } = statsView(ctx, f);
  statsData = data;
  main.innerHTML = html;
  drawStats(main, data, { animate: true });
  scrollChartsToEnd(main);
}

/* ===================== ajustes ===================== */
const getPref = path => path.split('.').reduce((o, k) => o?.[k], S.prefs);
function setPref(path, v) {
  const ks = path.split('.'); let o = S.prefs;
  for (const k of ks.slice(0, -1)) o = o[k];
  o[ks.at(-1)] = v;
}
let prefsTimer, savedTimer;
// Aviso flotante «Guardando… / Guardado»: se ve aunque se haya bajado por la página
function savedBadge(state) {
  const s = $('#setSaved'); if (!s) return;
  clearTimeout(savedTimer);
  s.hidden = state === 'hide';
  s.innerHTML = state === 'saving' ? 'Guardando…' : `${icon('check', { size: 14 })} Guardado`;
  if (state === 'done') savedTimer = setTimeout(() => { s.hidden = true; }, 1600);
}
function savePrefsSoon() {
  clearTimeout(prefsTimer);
  savedBadge('saving');
  prefsTimer = setTimeout(savePrefsNow, 350);
}
function savePrefsNow() {
  clearTimeout(prefsTimer); prefsTimer = null;
  api.saveSettings(S.uid, S.newPerDay, S.prefs).then(() => savedBadge('done')).catch(e => { savedBadge('hide'); fail(e); });
}
// Si la app se cierra o pasa a segundo plano con un cambio aún sin guardar, se guarda ya
function flushPrefs() { if (prefsTimer) savePrefsNow(); }
addEventListener('pagehide', flushPrefs);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushPrefs(); });
// Controles reutilizables (todos guardan solos al cambiar)
const seg = (path, opts, cur = getPref(path)) => `<div class="seg" role="group" data-seg="${path}">${opts.map(([v, l]) =>
  `<button type="button" class="seg-b" data-v="${esc(v)}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join('')}</div>`;
const sw = (path, cur = getPref(path)) => `<label class="switch"><input type="checkbox" role="switch" data-pref="${path}" ${cur ? 'checked' : ''}><span class="slider" aria-hidden="true"></span></label>`;
const numIn = (path, { min = 0, max = 9999, step = 1, unit = '', cur = getPref(path), id = '' } = {}) =>
  `<span class="num"><input type="number" ${id ? `id="${id}"` : ''} data-pref="${path}" data-num min="${min}" max="${max}" step="${step}" inputmode="decimal" value="${cur}">${unit ? `<span>${unit}</span>` : ''}</span>`;
// Fila: título + frase de ayuda a la izquierda, control a la derecha (debajo si no cabe).
// El título da nombre accesible al control y la ayuda lo describe.
let rowSeq = 0;
const setRow = (label, hint, control, { id = '', off = false } = {}) => {
  const n = ++rowSeq;
  const ctl = control.replace(/<(input|div class="seg"|div class="swatches")/, m => `${m} aria-labelledby="sl-${n}" aria-describedby="sh-${n}"`);
  return `<div class="set-row${off ? ' is-off' : ''}"${id ? ` id="${id}"` : ''}><div class="set-l"><b id="sl-${n}">${label}</b><small id="sh-${n}">${hint}</small></div><div class="set-c">${ctl}</div></div>`;
};
const setSec = (ic, title, body, id = '') => `<section class="set-sec"${id ? ` id="${id}"` : ''}><h2>${icon(ic, { size: 18 })} ${title}</h2><div class="set-body">${body}</div></section>`;
const SET_SECTIONS = [['s-look', 'Apariencia'], ['s-study', 'Estudio'], ['s-session', 'Sesión'], ['s-voice', 'Voz'], ['s-home', 'Inicio'], ['s-algo', 'Ritmo'], ['s-data', 'Datos']];

// Simulación: intervalos de una tarjeta que aciertas siempre con «Bien»
function algoPreview(A) {
  let p = null, t = Date.now(); const out = [];
  for (let i = 0; i < 7; i++) { p = schedule(p, 3, t, A); out.push(p.interval); t = p.due; }
  const f = d => d < 1 ? 'hoy' : d < 31 ? `${d} d` : d < 365 ? `${Math.round(d / 30)} mes` : `${(d / 365).toFixed(1).replace('.', ',')} años`;
  return out.map(f).join(' → ');
}
// Orden: primero lo que más se cambia (apariencia, estudio diario); al final lo avanzado (ritmo) y los datos
function renderSettings() {
  loadAiGuide();   // para que «Copiar instrucciones» copie al instante (Safari lo exige)
  const P = S.prefs, A = algoFor(P, null);
  const presets = [...Object.entries(ALGO_PRESETS), ['custom', { label: 'Personalizado', help: 'Ajusta cada parámetro a mano.' }]];
  const accents = ACCENTS.map(a => `<button type="button" class="swatch" data-accent="${a.id}" aria-pressed="${P.look.accent === a.id}" aria-label="${a.label}" title="${a.label}"></button>`).join('');
  rowSeq = 0; tocLock = null;
  main.innerHTML = `<div class="set-head"><h1>Ajustes</h1></div>
    <span class="saved" id="setSaved" role="status" aria-live="polite" hidden></span>
    <nav class="set-toc" aria-label="Secciones de ajustes">${SET_SECTIONS.map(([id, l]) => `<a href="#${id}" data-toc="${id}">${l}</a>`).join('')}</nav>
    ${setSec('palette', 'Apariencia', `
      ${setRow('Tema', 'Automático sigue el modo claro u oscuro de tu dispositivo.', seg('look.theme', [['system', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']]))}
      ${setRow('Color de acento', 'Botones principales, enlaces y gráficos.', `<div class="swatches" role="group">${accents}</div>`)}
      ${setRow('Tamaño del texto', 'Tamaño de las tarjetas al estudiar.', seg('look.cardSize', CARD_SIZES.map(s => [s.id, s.label])))}
      ${setRow('Letra de las tarjetas', 'Tipo de letra de las tarjetas al estudiar.', seg('look.font', FONTS.map(f => [f.id, `<span class="ff-${f.id}" title="${f.label}">${f.short || f.label}</span>`])))}
      ${setRow('Alineación', 'Cómo se coloca el texto dentro de la tarjeta.', seg('look.cardAlign', [['center', 'Centrada'], ['left', 'A la izquierda']]))}
      ${setRow('Densidad', 'Compacta reduce márgenes y la altura de las filas.', seg('look.density', [['comfy', 'Cómoda'], ['compact', 'Compacta']]))}
      <div class="look-pv" aria-label="Vista previa de una tarjeta"><article class="card"><div class="front"><div class="fld fld-main"><div class="fld-v"><span class="fld-t">Merhaba</span></div></div></div>
        <div class="answer"><div class="fld fld-main"><div class="fld-v"><span class="fld-t">Hola</span></div></div><div class="fld fld-sub"><div class="fld-v"><span class="fld-t">Saludo informal en turco</span></div></div></div></article></div>`, 's-look')}
    ${setSec('gauge', 'Estudio diario', `
      ${setRow('Tarjetas nuevas al día', 'Entre 10 y 20 va bien. Cada mazo puede tener su propio límite.', `<span class="num"><input type="number" id="set-new" data-num min="0" max="500" inputmode="numeric" value="${S.newPerDay}"></span>`)}
      ${setRow('Repasos máximos al día', '0 = sin límite. Si un día se acumulan, el resto queda para mañana.', numIn('study.maxReviews', { max: 9999 }))}
      ${setRow('Meta diaria', 'Respuestas al día. Aparece como barra de progreso en Inicio. 0 = sin meta.', numIn('home.goal', { max: 2000 }))}
      ${setRow('Orden de las nuevas', 'En qué orden salen las tarjetas que aún no has estudiado.', seg('study.newOrder', [['order', 'Como en el mazo'], ['random', 'Al azar']]))}
      ${setRow('Mezcla', 'Cómo se combinan las nuevas con los repasos.', seg('study.mix', [['mixed', 'Mezcladas'], ['reviewsFirst', 'Repasos primero'], ['newFirst', 'Nuevas primero']]))}
      ${setRow('Tu idioma', 'En los mazos de idiomas, el de las traducciones: se leen en voz alta y se corrigen en este idioma.', `<select data-pref="study.nativeLang" aria-label="Tu idioma">${LANGS.filter(l => l.id).map(l => `<option value="${l.id}" ${l.id === nativeLang() ? 'selected' : ''}>${l.label}</option>`).join('')}</select>`)}`, 's-study')}
    ${setSec('layers', 'Durante la sesión', `
      ${setRow('Botones de respuesta', 'Con 2 solo eliges entre «Otra vez» y «Bien».', seg('study.buttons', [[4, '4 botones'], [2, '2 botones']]))}
      ${setRow('Mostrar intervalos', 'El «3 d» debajo de cada botón: cuándo volverá la tarjeta.', sw('study.showIntervals'))}
      ${setRow('Resaltar la nota sugerida', 'En tarjetas de escribir, elegir, ordenar y dibujar.', sw('study.suggest'))}
      ${setRow('Una nueva por nota', 'Si una nota genera varias tarjetas (p. ej. ida y vuelta), solo sale una nueva por sesión.', sw('study.burySiblings'))}
      ${setRow('Ayuda de atajos de teclado', 'Muestra debajo de la tarjeta qué teclas puedes usar.', sw('study.shortcuts'))}`, 's-session')}
    ${setSec('volume-2', 'Voz', `
      ${setRow('Audio automático', 'Lee los campos marcados con audio al mostrar la tarjeta.', sw('study.autoplay'))}
      ${setRow('Velocidad de la voz', 'Para la lectura en voz alta. Pulsa «Probar» para oírla.', `<span class="range"><input type="range" data-pref="study.rate" data-num min="0.5" max="1.5" step="0.05" value="${P.study.rate}"><output id="rateOut">${Math.round(P.study.rate * 100)} %</output><button type="button" class="ghost small-btn" data-act="test-voice">Probar</button></span>`)}`, 's-voice')}
    ${setSec('house', 'Inicio', `
      ${setRow('Calendario de actividad', 'Los días que has estudiado y tus rachas.', sw('home.activity'))}
      ${setRow('Previsión', 'Gráfico con los repasos de los próximos días.', sw('home.forecast'))}
      ${setRow('Días de previsión', 'Cuántos días abarca el gráfico de previsión.', seg('home.forecastDays', [[7, '7'], [14, '14'], [30, '30']]), { id: 'row-fcdays', off: !P.home.forecast })}
      ${setRow('Estado de las tarjetas', 'Barra con nuevas, aprendiendo, jóvenes y consolidadas.', sw('home.maturity'))}
      ${setRow('Lista de mazos', 'Tus mazos con lo que toca hoy en cada uno.', sw('home.decks'))}
      ${api.social ? setRow('Amigos', 'La clasificación de la semana con tus amigos y sus ánimos.', sw('home.friends')) : ''}`, 's-home')}
    ${setSec('brain', 'Ritmo de repaso', `
      <p class="muted small set-intro">Decide cada cuánto vuelven las tarjetas. Si no sabes qué elegir, deja «${esc(ALGO_PRESETS.standard?.label || 'Estándar')}». Cada mazo puede usar otro ritmo en sus opciones.</p>
      <div class="presets" role="group" aria-label="Ritmo de repaso">${presets.map(([k, v]) => `<button type="button" class="preset" data-preset="${k}" aria-pressed="${P.algo.preset === k}"><b>${v.label}</b><small>${v.help}</small></button>`).join('')}</div>
      ${P.algo.preset === 'fsrs' ? `<div class="set-row"><div class="set-l"><b id="retL">Retención deseada</b><small>Con qué probabilidad quieres recordar cada tarjeta cuando vuelva. Más alta, más repasos. Entre 85 % y 92 % va bien.</small></div>
        <div class="set-c"><span class="range"><input type="range" data-pref="algo.retention" data-num min="0.8" max="0.97" step="0.01" value="${P.algo.retention}" aria-labelledby="retL"><output id="retOut">${Math.round(P.algo.retention * 100)} %</output></span></div></div>` : ''}
      <div class="algo-pv"><span class="muted small">Si aciertas siempre con «Bien», una tarjeta nueva vuelve a los:</span><b id="algoPv">${algoPreview(A)}</b></div>
      <details class="opts" ${P.algo.preset === 'custom' ? 'open' : ''} ${P.algo.preset === 'fsrs' ? 'hidden' : ''}><summary>${icon('sliders-horizontal', { size: 16 })} Parámetros avanzados${P.algo.preset === 'custom' ? '' : ' (elige «Personalizado» para editarlos)'}</summary>
        <div class="algo-grid">${ALGO_FIELDS.map(x => `<label class="af"><span>${x.label}</span>${numIn('algo.custom.' + x.k, { min: x.min, max: x.max, step: x.step, unit: x.unit, cur: P.algo.preset === 'custom' ? P.algo.custom[x.k] : A[x.k] }).replace('<input', P.algo.preset === 'custom' ? '<input' : '<input disabled')}</label>`).join('')}</div>
        <div class="btnrow"><button type="button" class="ghost small-btn" data-act="algo-reset" ${P.algo.preset === 'custom' ? '' : 'disabled'}>Volver a los valores estándar</button></div>
      </details>`, 's-algo')}
    ${setSec('database', 'Datos', `
      ${setRow('Mazos hechos con IA', 'Instrucciones para que ChatGPT, Gemini o Claude te preparen un mazo. Lo que te respondan se pega en «Mis mazos» → «Pegar».', AI_GUIDE_BTNS())}
      ${setRow('Copia de seguridad', 'Descarga todos tus mazos, tarjetas, progreso y ajustes en un archivo.', `<button type="button" class="ghost" data-act="backup">${icon('download', { size: 16 })} Descargar</button>`)}
      ${setRow('Restaurar copia', api.mode === 'local' ? 'Una copia de este navegador lo sustituye todo; una de una cuenta añade los mazos que falten.' : 'Añade los mazos que no tengas, con su progreso. Los que ya están no se tocan.', `<button type="button" class="ghost" data-act="restore">${icon('upload', { size: 16 })} Elegir archivo</button>`)}
      ${setRow('Reiniciar el progreso', 'Todas las tarjetas vuelven a ser nuevas. Los mazos no se tocan.', `<button type="button" class="ghost danger" data-act="ask-reset-progress">${icon('rotate-ccw', { size: 16 })} Reiniciar</button>`)}
      ${setRow('Ajustes por defecto', 'Vuelve a la configuración original (no toca tus datos).', `<button type="button" class="ghost" data-act="ask-reset-prefs">Restablecer</button>`)}`, 's-data')}`;
  markToc();
}
// Pestañas de Ajustes: marca la sección visible bajo la barra fija.
// Al pulsar una pestaña se queda marcada (aunque la sección no pueda subir del todo, como las últimas)
// hasta que la persona desplace la página por su cuenta.
let tocLock = null;
function markToc() {
  const strip = $('.set-toc'), links = document.querySelectorAll('.set-toc a');
  if (!strip || !links.length) return;
  let cur = tocLock;
  if (!cur) {
    const top = strip.getBoundingClientRect().bottom + 24;
    const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
    cur = SET_SECTIONS[0][0];
    for (const [id] of SET_SECTIONS) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top <= top) cur = id; }
    if (atEnd) cur = SET_SECTIONS.at(-1)[0];
  }
  let act = null;
  links.forEach(a => { const on = a.dataset.toc === cur; a.setAttribute('aria-current', String(on)); if (on) act = a; });
  // En el móvil la tira se desplaza en horizontal: la pestaña activa siempre a la vista
  if (act && strip.scrollWidth > strip.clientWidth) {
    const l = act.offsetLeft - 16, r = act.offsetLeft + act.offsetWidth + 16 - strip.clientWidth;
    if (strip.scrollLeft > l) strip.scrollLeft = l; else if (strip.scrollLeft < r) strip.scrollLeft = r;
  }
}
let tocRaf = 0;
window.addEventListener('scroll', () => { if (S.view === 'settings' && !tocRaf) tocRaf = requestAnimationFrame(() => { tocRaf = 0; markToc(); }); }, { passive: true });
for (const ev of ['wheel', 'touchstart', 'keydown']) addEventListener(ev, e => { if (tocLock && !e.target.closest?.('.set-toc')) tocLock = null; }, { passive: true });
document.addEventListener('click', e => {
  const a = e.target.closest?.('.set-toc a');
  const sec = a && document.getElementById(a.dataset.toc);
  if (!sec) return;
  e.preventDefault();   // sin «#seccion» en la dirección ni en el historial
  tocLock = a.dataset.toc; markToc();
  sec.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
// Aplica un cambio de ajustes y repinta lo necesario
function prefChanged(path) {
  if (path.startsWith('look.')) applyLook(S.prefs.look);
  if (path === 'study.rate') { setBaseRate(S.prefs.study.rate); const o = $('#rateOut'); if (o) o.textContent = Math.round(S.prefs.study.rate * 100) + ' %'; }
  if (path.startsWith('algo.')) { const pv = $('#algoPv'); if (pv) pv.textContent = algoPreview(algoFor(S.prefs, null)); const ro = $('#retOut'); if (ro) ro.textContent = Math.round(S.prefs.algo.retention * 100) + ' %'; }
  if (path === 'home.forecast') $('#row-fcdays')?.classList.toggle('is-off', !S.prefs.home.forecast);
  savePrefsSoon();
}
// Copia v2: lo mismo en los dos modos y con los identificadores originales, para que al restaurar
// se reconozca lo que ya está. En modo local lleva además el volcado completo del navegador.
async function backupData() {
  const deckOut = d => ({
    id: d.id, name: d.name, description: d.description || '', source: d.source || '', icon: d.icon || '', color: d.color || '',
    options: d.options || {}, folder_id: d.folder_id || null, pinned: !!d.pinned, archived: !!d.archived, tags: d.tags || [], types: deckTypes(d.id),
    cards: cardList().filter(c => c.deck_id === d.id).sort((a, b) => a.position - b.position)
      .map(c => ({ id: c.id, front: c.front, back: c.back, note: c.note || '', type_id: c.type_id || 'basic', template: c.template || 't1', fields: c.fields || {}, note_id: c.note_id || null, hint: c.hint || '', tags: c.tags || [], position: c.position, page_id: c.page_id || null, block_id: c.block_id || null })),
  });
  return {
    format: 'flaski-backup', version: 2, exported: new Date().toISOString(), mode: api.mode,
    settings: { new_per_day: S.newPerDay, prefs: S.prefs },
    folders: [...S.folders.values()].map(({ id, parent_id, name, icon, color, position }) => ({ id, parent_id: parent_id || null, name, icon: icon || '', color: color || '', position })),
    tags: [...S.tags.values()].map(({ id, name, color }) => ({ id, name, color })),
    decks: [...S.decks.values()].map(deckOut),
    pages: [...S.pages.values()].map(p => { const { owner, ...r } = pageRow(p); return { ...r, updated_at: p.updated_at || null }; }),
    progress: [...S.progress].map(([id, p]) => { const { user_id, ...r } = toRow(S.uid, id, p); return r; }),
    events: S.events.map(({ t, user_id, ...e }) => e),
    log: Object.entries(S.log).map(([day, count]) => ({ day, count })),
    local: api.dumpLocal(),
    images: await exportImages(imageIdsOf({ cards: cardList(), pages: [...S.pages.values()] })),
  };
}

// Identificador estable para lo que no puede conservar el suyo (en la nube los ids son únicos entre
// todas las cuentas): hash de cuenta + id original con forma de UUID. Restaurar la misma copia otra vez
// da el mismo id, así que se reconoce y no se duplica.
async function derivedId(id) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${S.uid}:${id}`))).slice(0, 16);
  h[6] = (h[6] & 0x0f) | 0x80; h[8] = (h[8] & 0x3f) | 0x80;   // versión 8 (propia) y variante RFC 9562
  const x = [...h].map(n => n.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
const isDuplicate = e => e?.code === '23505' || /duplicate key/i.test(e?.message || '');
// ¿Está ya en la cuenta? Con su id original o con el derivado de una restauración anterior
async function existingId(id, has) {
  if (!id) return null;
  if (has(id)) return id;
  const d = await derivedId(id);
  return has(d) ? d : null;
}
// Crea con el id original; si está ocupado por otra cuenta, con el derivado
async function createKeepingId(create, fields, id) {
  if (!id) return create(fields);
  try { return await create({ ...fields, id }); } catch (e) { if (!isDuplicate(e)) throw e; }
  return create({ ...fields, id: await derivedId(id) });
}
const str = (v, n) => String(v ?? '').slice(0, n);
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// Restaura una copia sin borrar nada: lo que ya está (mismo id) se salta; un mazo que falla se deshace
// entero y no impide restaurar los demás. Devuelve el resumen para mostrarlo.
async function restoreInto(data) {
  const uid = S.uid, rep = { restored: [], skipped: [], failed: [] };
  // Carpetas, los padres antes que los hijos
  const folderMap = new Map();
  let pending = (data.folders || []).filter(f => f?.id && f.name);
  for (let pass = 0; pending.length && pass < 20; pass++) {
    const later = [];
    for (const f of pending) {
      if (f.parent_id && !folderMap.has(f.parent_id) && pending.some(x => x.id === f.parent_id) && pass < 19) { later.push(f); continue; }
      try {
        const have = await existingId(f.id, id => S.folders.has(id));
        if (have) { folderMap.set(f.id, have); continue; }
        const nf = await createKeepingId(api.createFolder, { owner: uid, name: str(f.name, 80), icon: str(f.icon, 16), color: str(f.color, 16), position: Number(f.position) || Date.now() / 1000, parent_id: folderMap.get(f.parent_id) || null }, f.id);
        S.folders.set(nf.id, nf); folderMap.set(f.id, nf.id);
      } catch (e) { rep.failed.push([`Carpeta «${str(f.name, 80)}»`, errMsg(e)]); }
    }
    pending = later;
  }
  // Etiquetas
  const tagMap = new Map();
  for (const t of data.tags || []) {
    if (!t?.id || !t.name) continue;
    try {
      const have = await existingId(t.id, id => S.tags.has(id));
      if (have) { tagMap.set(t.id, have); continue; }
      const nt = await createKeepingId(api.createTag, { owner: uid, name: str(t.name, 40), color: str(t.color || 'gray', 16) }, t.id);
      S.tags.set(nt.id, nt); tagMap.set(t.id, nt.id);
    } catch (e) { rep.failed.push([`Etiqueta «${str(t.name, 40)}»`, errMsg(e)]); }
  }
  const tagsOf = ids => (Array.isArray(ids) ? ids : []).map(id => tagMap.get(id)).filter(Boolean);
  // Apuntes: antes que los mazos, para que las tarjetas se vuelvan a vincular a ellos. El mazo de cada
  // apunte se pone al final, cuando ya se sabe qué id tiene cada mazo en esta cuenta.
  const pageMap = new Map(), pageDeck = new Map();
  rep.pages = { restored: 0, skipped: 0 };
  for (const pg of data.pages || []) {
    if (!pg?.id || !Array.isArray(pg.blocks)) continue;
    try {
      const have = await existingId(pg.id, id => S.pages.has(id));
      if (have) { pageMap.set(pg.id, have); rep.pages.skipped++; continue; }
      const blocks = pg.blocks.filter(b => b && b.id && typeof b.text === 'string').map(b => ({ id: str(b.id, 40), type: BLOCK_TYPES.includes(b.type) ? b.type : 'p', text: str(b.text, 20000), ...(b.type === 'img' ? { src: str(b.src, 64) } : {}),
        ...(b.type === 'todo' ? { checked: !!b.checked } : {}), ...(b.type === 'callout' ? { icon: str(b.icon || '💡', 16) } : {}) }));
      const np = await createKeepingId(api.createPage, { owner: uid, title: str(pg.title, 120), icon: str(pg.icon, 16), deck_id: null, folder_id: folderMap.get(pg.folder_id) || null, blocks,
        ...(S.pageTagsMissing ? {} : { tags: tagsOf(pg.tags) }) }, pg.id);
      S.pages.set(np.id, { ...np, blocks: np.blocks || blocks });
      pageMap.set(pg.id, np.id);
      if (pg.deck_id) pageDeck.set(np.id, pg.deck_id);
      rep.pages.restored++;
    } catch (e) { rep.failed.push([`Apunte «${str(pg.title || 'sin título', 120)}»`, errMsg(e)]); }
  }
  const deckMap = new Map();
  // Progreso e historial de cada tarjeta de la copia
  const progressBy = new Map((data.progress || []).filter(p => p?.card_id).map(p => [p.card_id, p]));
  const eventsBy = new Map();
  for (const e of data.events || []) if (e?.card_id) (eventsBy.get(e.card_id) || eventsBy.set(e.card_id, []).get(e.card_id)).push(e);

  for (const d of data.decks || []) {
    const name = str(d?.name || 'Mazo', 80);
    try {
      const haveDeck = await existingId(d.id, id => S.decks.has(id));
      if (haveDeck) { deckMap.set(d.id, haveDeck); rep.skipped.push(name); continue; }
      const typeMap = await adoptTypes(d.types || []);
      const deck = await createKeepingId(api.createDeck, {
        owner: uid, name, description: str(d.description, 300), source: str(d.source || 'copia', 200), icon: str(d.icon, 16), color: str(d.color, 16),
        options: obj(d.options), folder_id: folderMap.get(d.folder_id) || null, pinned: !!d.pinned, archived: !!d.archived, tags: tagsOf(d.tags),
      }, d.id);
      if (d.id) deckMap.set(d.id, deck.id);
      try {
        // Si el mazo conservó su id, sus tarjetas también (salvo alguna que ya exista en la cuenta)
        const keep = !!d.id && deck.id === d.id;
        const idFor = async (id, taken = () => false) => (!id ? api.newId() : keep && !taken(id) ? id : derivedId(id));
        const base = Date.now() / 1000, notes = new Map(), cardMap = new Map(), rows = [];
        for (const [i, c] of (d.cards || []).entries()) {
          const id = await idFor(c.id, x => S.cards.has(x));
          if (c.id) cardMap.set(c.id, id);
          let note = c.note_id ? notes.get(c.note_id) : null;
          if (!note) { note = c.note_id || api.newId(); if (c.note_id) notes.set(c.note_id, note); }
          rows.push({
            id, deck_id: deck.id, owner: uid,
            front: str(c.front, 2000) || '—', back: str(c.back, 2000) || '—', note: str(c.note, 2000),
            position: Number(c.position) || base + i / 1000, note_id: note,
            type_id: typeMap.get(c.type_id) || c.type_id || 'basic', template: c.template || 't1', fields: obj(c.fields), hint: str(c.hint, 500), tags: tagsOf(c.tags),
            ...(pageMap.has(c.page_id) ? { page_id: pageMap.get(c.page_id), block_id: str(c.block_id, 40) || null } : {}),
          });
        }
        if (rows.length) await api.createCards(rows);
        const prog = [], evs = [];
        for (const [old, id] of cardMap) {
          const p = progressBy.get(old);
          if (p && p.due) prog.push({ user_id: uid, card_id: id, reps: Number(p.reps) || 0, interval: Number(p.interval) || 0, ease: Number(p.ease) || 2.5, lapses: Number(p.lapses) || 0, due: p.due, first_seen: p.first_seen || p.due, last: p.last || p.due, ...(p.stability > 0 && progressCols.extra ? { stability: Number(p.stability), difficulty: Number(p.difficulty) } : {}) });
          for (const e of eventsBy.get(old) || []) {
            if (!(e.grade >= 1 && e.grade <= 4) || !e.ts) continue;
            evs.push({ id: await idFor(e.id), user_id: uid, card_id: id, deck_id: deck.id, ts: e.ts, grade: e.grade, state: e.state || 'review', ivl: Number(e.ivl) || 0, last_ivl: Number(e.last_ivl) || 0, ease: Number(e.ease) || 2.5, ms: Number(e.ms) || 0 });
          }
        }
        if (prog.length) await api.saveProgressMany(prog);
        if (evs.length) await api.addEvents(evs);
      } catch (e) { await api.deleteDeck(deck.id).catch(() => {}); throw e; }   // sin mazos a medias
      rep.restored.push(name);
    } catch (e) { rep.failed.push([name, errMsg(e)]); }
  }
  // El mazo de cada apunte restaurado
  for (const [pid, oldDeck] of pageDeck) {
    const p = S.pages.get(pid), deckId = deckMap.get(oldDeck);
    if (p && deckId) { p.deck_id = deckId; api.savePage(pageRow(p)).catch(() => {}); }
  }
  // Registro diario: el máximo de cada día, para no borrar actividad más reciente que la copia
  try { await api.mergeLog(uid, data.log || []); } catch (e) { rep.failed.push(['Registro diario', errMsg(e)]); }
  return rep;
}
function restoreReport({ restored, skipped, failed, pages }) {
  const sec = (title, items) => items.length ? `<h3>${title}</h3><p class="muted small">${items.map(esc).join(' · ')}</p>` : '';
  const pg = pages && (pages.restored || pages.skipped)
    ? `<p class="muted small">Apuntes: ${pages.restored ? plural(pages.restored, 'restaurado', 'restaurados') : ''}${pages.restored && pages.skipped ? ' · ' : ''}${pages.skipped ? `${pages.skipped} ya ${pages.skipped === 1 ? 'estaba' : 'estaban'}` : ''}</p>` : '';
  openSheet(`<h2>Copia restaurada</h2>${pg}
    ${sec(`${restored.length} ${restored.length === 1 ? 'mazo restaurado' : 'mazos restaurados'}, con su progreso`, restored)}
    ${sec(`${skipped.length} ${skipped.length === 1 ? 'mazo ya estaba' : 'mazos ya estaban'} en tu cuenta (no se han tocado)`, skipped)}
    ${failed.length ? `<h3>${failed.length === 1 ? 'Un elemento no se pudo restaurar' : `${failed.length} elementos no se pudieron restaurar`}</h3><ul class="list">${failed.map(([n, m]) => `<li class="small"><b>${esc(n)}</b>: ${esc(m)}</li>`).join('')}</ul>` : ''}
    ${!restored.length && !skipped.length && !failed.length ? '<p class="muted">La copia no tenía mazos.</p>' : ''}
    <div class="btnrow"><span class="spacer"></span><button class="primary" data-act="close-sheet">Entendido</button></div>`);
}
async function restoreBackup(file) {
  let data;
  try { data = JSON.parse((await file.text()).replace(/^﻿/, '')); } catch { return toast('El archivo no es una copia válida'); }
  if (data?.format !== 'flaski-backup') return toast('Ese archivo no es una copia de seguridad de Flaski');
  try {
    await importImages(data.images);
    // Copia de este mismo modo local: sustituye todo lo del navegador, como siempre
    if (api.mode === 'local' && data.local) {
      await api.restoreLocal(data.local);
      toast('Copia restaurada'); setTimeout(() => location.reload(), 600); return;
    }
    toast('Restaurando…');
    const rep = await restoreInto(data);
    if (data.settings?.prefs) { S.prefs = loadPrefs(data.settings.prefs); applyLook(S.prefs.look); await api.saveSettings(S.uid, S.newPerDay, S.prefs); }
    S.uid = null; await onSignedIn(await api.auth.session());
    restoreReport(rep);
  } catch (e) { fail(e); }
}

/* ===================== hojas (editores) ===================== */
function openSheet(html, { full = false } = {}) {
  $('#sheetBody').innerHTML = html;
  $('#sheet').classList.toggle('sheet-full', full);
  $('#sheet').hidden = false;
  const f = $('#sheetBody').querySelector('input,textarea');
  if (f && matchMedia('(hover:hover)').matches) setTimeout(() => f.focus(), 30);
}
function closeSheet() {
  const backToSug = S.edit?.open && S.edit.sugIndex != null && S.sug;
  closeSheetOnly();
  if (backToSug) { S.edit = null; drawSuggestions(); }
}
function closeSheetOnly() { $('#sheet').hidden = true; $('#sheetBody').innerHTML = ''; $('#sheet').classList.remove('sheet-full'); if (S.edit) S.edit.open = false; }
// Cerrar pidiendo confirmación si hay cambios sin guardar en el editor de tarjetas
function requestClose() {
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
function charsFor(lang) {
  if (!lang) return CHARS;
  return CHARS_BY_LANG[lang.split('-')[0]] || [];
}

function iconPicker(current) {
  return `<input type="hidden" id="f-icon" value="${esc(current || '')}">
    <div class="iconfield">
      <button type="button" class="icon-current" data-act="toggle-emoji" aria-expanded="false" aria-label="Elegir icono">${current ? esc(current) : `<span class="muted">${icon('smile-plus', { size: 22 })}</span>`}</button>
      <div class="iconfield-txt"><button type="button" class="link" data-act="toggle-emoji">${current ? 'Cambiar icono' : 'Elegir un emoji'}</button>
        ${current ? '<button type="button" class="link" data-act="clear-icon">Quitar</button>' : ''}</div>
    </div>
    <div class="emoji-panel" id="emojiPanel" hidden></div>`;
}
function setIcon(e) {
  $('#f-icon').value = e;
  $('.icon-current').innerHTML = e ? esc(e) : `<span class="muted">${icon('smile-plus', { size: 22 })}</span>`;
  $('.iconfield-txt').innerHTML = `<button type="button" class="link" data-act="toggle-emoji">${e ? 'Cambiar icono' : 'Elegir un emoji'}</button>${e ? '<button type="button" class="link" data-act="clear-icon">Quitar</button>' : ''}`;
  const panel = $('#emojiPanel'); panel.hidden = true; $('.icon-current').setAttribute('aria-expanded', 'false');
}
function colorPicker(current) {
  return `<div class="colors" role="radiogroup" aria-label="Color">${COLORS.map(c => `<label class="cpick" title="${c.label}">
    <input type="radio" name="f-color" value="${c.id}" ${c.id === (current || '') ? 'checked' : ''}><span style="background:${c.id ? colorVar(c.id) : 'transparent'}" class="${c.id ? '' : 'none'}"></span><span class="sr">${c.label}</span></label>`).join('')}</div>`;
}
function folderSelect(id, selected, exclude = null, rootLabel = 'Ninguna (en «Mis mazos»)') {
  return `<select id="${id}"><option value="">${rootLabel}</option>${folderTree(S.folders, exclude).map(f =>
    `<option value="${f.id}" ${f.id === selected ? 'selected' : ''}>${'   '.repeat(f.depth)}${esc(f.icon ? f.icon + ' ' : '')}${esc(f.name)}</option>`).join('')}</select>`;
}
function tagPicker(selected = []) {
  const tags = [...S.tags.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return `<div class="tagpick" id="tagPick">${tags.map(t => `<label class="tagopt"><input type="checkbox" name="f-tag" value="${t.id}" ${selected.includes(t.id) ? 'checked' : ''}>
      <span class="tag" style="--tag-bg:var(--tag-${t.color || 'gray'}-bg);--tag-fg:var(--tag-${t.color || 'gray'})">${esc(t.name)}</span></label>`).join('')}
    <span class="newtag"><input id="f-newtag" maxlength="40" placeholder="Nueva etiqueta" aria-label="Nueva etiqueta"><button type="button" class="ghost small-btn" data-act="add-tag-inline">Añadir</button></span></div>`;
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
        <p class="hint">Se usa para el audio, para corregir lo que escribes y para proponerte los tipos de tarjeta que encajan.</p></div>`;
}
function deckForm(d) {
  const folderDefault = d ? d.folder_id : (S.view === 'decks' ? S.folderId : null);
  openSheet(`<h2>${d ? 'Editar mazo' : 'Nuevo mazo'}</h2>
    <form data-form="deck" data-id="${d ? d.id : ''}">
      <label for="d-name">Nombre</label><input id="d-name" maxlength="80" required value="${esc(d?.name || '')}">
      <label for="d-desc">Descripción (opcional)</label><textarea id="d-desc" rows="2" maxlength="300">${esc(d?.description || '')}</textarea>
      ${studyPicker(d)}
      <label>Icono</label>${iconPicker(d?.icon)}
      <label>Color</label>${colorPicker(d?.color)}
      <label for="d-folder">Carpeta</label>${folderSelect('d-folder', folderDefault || '')}
      <label>Etiquetas</label>${tagPicker(d?.tags || [])}
      <label class="check"><input type="checkbox" id="d-pinned" ${d?.pinned ? 'checked' : ''}><span><b>Fijar arriba</b><br><span class="hint">Aparece el primero en su carpeta y en Inicio.</span></span></label>
      ${d ? `<label class="check"><input type="checkbox" id="d-archived" ${d.archived ? 'checked' : ''}><span><b>Archivar</b><br><span class="hint">Se oculta y no entra en las sesiones de estudio. Lo encuentras en el filtro «Archivados».</span></span></label>` : ''}
      <details class="opts" ${d?.options?.preset || (d?.options?.newPerDay ?? '') !== '' ? 'open' : ''}><summary>${icon('sliders-horizontal', { size: 16 })} Opciones de estudio de este mazo</summary>
        <p class="hint">Déjalo vacío para usar lo que tengas en Ajustes.</p>
        <div class="field"><label for="d-new">Nuevas por día en este mazo</label><input id="d-new" type="number" min="0" max="500" inputmode="numeric" placeholder="Global (${S.newPerDay})" value="${esc(d?.options?.newPerDay ?? '')}"></div>
        <div class="field"><label for="d-preset">Ritmo de repaso</label><select id="d-preset"><option value="">Global (${esc(S.prefs.algo.preset === 'custom' ? 'Personalizado' : ALGO_PRESETS[S.prefs.algo.preset]?.label || 'Estándar')})</option>
          ${Object.entries(ALGO_PRESETS).map(([k, v]) => `<option value="${k}" ${d?.options?.preset === k ? 'selected' : ''}>${v.label}</option>`).join('')}
          <option value="custom" ${d?.options?.preset === 'custom' ? 'selected' : ''}>Personalizado (el de Ajustes)</option></select></div>
        ${d ? '<div class="btnrow"><button type="button" class="ghost small-btn danger" data-act="ask-reset-deck">Reiniciar el progreso de este mazo</button></div>' : ''}
      </details>
      <label class="check"><input type="checkbox" id="d-public" ${d?.is_public ? 'checked' : ''}><span><b>Compartir con la comunidad</b><br><span class="hint">Cualquier usuario podrá verlo en Explorar y copiarlo. Tus cambios posteriores no se aplican a sus copias.</span></span></label>
      <div class="btnrow" style="margin-top:14px">${d ? '<button type="button" class="ghost danger" data-act="ask-delete-deck">Eliminar mazo</button>' : ''}<span class="spacer"></span>
        <button type="button" class="ghost" data-act="close-sheet">Cancelar</button><button type="submit" class="primary">Guardar</button></div>
    </form>`);
}
function folderForm(f) {
  const parentDefault = f ? f.parent_id : S.view === 'notes' ? S.noteFolder : S.folderId;
  openSheet(`<h2>${f ? 'Editar carpeta' : 'Nueva carpeta'}</h2>
    <form data-form="folder" data-id="${f ? f.id : ''}">
      <label for="fo-name">Nombre</label><input id="fo-name" maxlength="80" required value="${esc(f?.name || '')}">
      <label>Icono</label>${iconPicker(f?.icon)}
      <label>Color de la carpeta</label>${colorPicker(f?.color)}
      <label for="fo-parent">Dentro de</label>${folderSelect('fo-parent', parentDefault || '', f?.id, 'Ninguna (en la raíz)')}
      ${f ? '' : '<p class="hint">Las carpetas son comunes a mazos y apuntes: un tema puede tener los dos.</p>'}
      <div class="btnrow" style="margin-top:14px">${f ? '<button type="button" class="ghost danger" data-act="ask-delete-folder">Eliminar carpeta</button>' : ''}<span class="spacer"></span>
        <button type="button" class="ghost" data-act="close-sheet">Cancelar</button><button type="submit" class="primary">Guardar</button></div>
      ${f ? '<p class="hint">Al eliminarla, sus mazos, apuntes y subcarpetas no se borran: pasan a la carpeta de arriba.</p>' : ''}
    </form>`);
}
function tagsSheet() {
  const tags = [...S.tags.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const colorOpts = sel => COLORS.filter(c => c.id).map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.label}</option>`).join('');
  openSheet(`<h2>Etiquetas</h2>
    <p class="muted small">Sirven para agrupar mazos de distintas carpetas (por ejemplo, <i>examen</i> o <i>verbos</i>) y estudiarlos juntos.</p>
    <ul class="taglist">${tags.map(t => `<li data-tag-row="${t.id}">
      <span class="tag" style="--tag-bg:var(--tag-${t.color}-bg);--tag-fg:var(--tag-${t.color})">${esc(t.name)}</span>
      <input class="t-name" value="${esc(t.name)}" maxlength="40" aria-label="Nombre de la etiqueta">
      <select class="t-color" aria-label="Color">${colorOpts(t.color)}</select>
      <button class="ghost small-btn danger" data-del-tag="${t.id}" aria-label="Eliminar etiqueta">Eliminar</button></li>`).join('') || '<li class="muted small">Aún no tienes etiquetas.</li>'}</ul>
    <form data-form="newtag" class="newtag-row"><input id="nt-name" maxlength="40" placeholder="Nombre de la etiqueta nueva" aria-label="Nueva etiqueta">
      <select id="nt-color" aria-label="Color">${colorOpts('blue')}</select><button class="ghost" type="submit">Añadir</button></form>
    <div class="btnrow"><span class="spacer"></span><button class="primary" data-act="save-tags">Hecho</button></div>`);
}
// Desplegable de tipos («Crear varias»): los que encajan con el mazo primero, el resto aparte
function typeOptions(selected, deckId) {
  const study = deckLang(deckId);
  const own = [...S.types.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const opt = t => `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${esc(t.icon ? t.icon + ' ' : '')}${esc(t.name)}</option>`;
  const fits = BUILTIN_TYPES.filter(t => typeFit(t, study) && (!typeHidden(t) || t.id === selected));
  const rest = BUILTIN_TYPES.filter(t => !fits.includes(t));
  const group = (label, list) => (list.length ? `<optgroup label="${label}">${list.map(opt).join('')}</optgroup>` : '');
  return group(study ? `Para ${langLabel(study).toLowerCase()}` : 'Para este mazo', fits) + group('Tus tipos', own) + group('Otros', rest);
}
function deckOptions(selected) {
  return sortDecks([...S.decks.values()], 'name', new Map()).map(d => `<option value="${d.id}" ${d.id === selected ? 'selected' : ''}>${esc(d.icon ? d.icon + ' ' : '')}${esc(d.name)}${d.archived ? ' (archivado)' : ''}</option>`).join('');
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
// Barra del editor: el tipo actual (abre el selector) y los que más usas en este mazo
function typeBar(sel, deckId) {
  const cur = getType(sel) || BUILTIN_TYPES[0];
  const quick = [...new Set([...recentTypes(deckId), ...suggestedTypes(deckId)])].filter(id => id !== cur.id)
    .map(getType).filter(t => t && !typeHidden(t) && (typeFit(t, deckLang(deckId)) || !t.builtin)).slice(0, 3);
  return `<button type="button" class="ed-typesel" data-act="pick-type" aria-haspopup="dialog" title="Cambiar el tipo de tarjeta">
      <span class="tci">${typeIcon(cur, 18)}</span><span class="ed-typename">${esc(cur.name)}</span>${icon('chevron-down', { size: 16 })}</button>
    ${quick.length ? `<span class="ed-quick" aria-label="Tipos que usas en este mazo">${quick.map(t => `<button type="button" class="tq" data-set-type="${t.id}" title="${esc(t.description || '')}">${typeIcon(t, 16)}<span>${esc(t.name)}</span></button>`).join('')}</span>` : ''}`;
}
// Selector de tipos (dentro del editor): agrupados según el idioma del mazo, con buscador
function drawTypePicker() {
  const box = $('#typePicker');
  if (!box || !S.edit) return;
  const deckId = edDeck(), study = deckLang(deckId);
  const { q = '', all = false } = S.edit.pick || {};
  const nq = norm(q.trim());
  const match = t => !nq || norm(`${t.name} ${t.description || ''}`).includes(nq);
  const shown = t => (nq || all || !typeHidden(t)) && (nq || all || typeFit(t, study) || !t.builtin);
  const builtins = BUILTIN_TYPES.filter(match), own = [...S.types.values()].filter(match).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const groups = [
    study && [`Para ${langLabel(study).toLowerCase()}`, builtins.filter(t => typeFit(t, study) === 'own')],
    study && ['Para idiomas', builtins.filter(t => typeFit(t, study) === 'lang')],
    ['Para cualquier tema', builtins.filter(t => typeFit(t, study) === 'general')],
    ['Tus tipos', own],
  ].filter(Boolean).map(([h, list]) => [h, list.filter(shown)]);
  const listed = new Set(groups.flatMap(g => g[1]).map(t => t.id));
  if (all || nq) groups.push(['Otros', [...builtins, ...own].filter(t => !listed.has(t.id))]);
  const item = t => {
    const n = t.templates.length;
    return `<li><button type="button" class="tp-item" data-pick-type="${t.id}" aria-pressed="${t.id === S.edit.typeId}">
      <span class="tci">${typeIcon(t, 22)}</span><span class="tp-txt"><b>${esc(t.name)}</b><small>${esc(t.description || '')}${n > 1 && !/(dos|\d) tarjetas/i.test(t.description || '') ? ` · Crea ${n} tarjetas` : ''}</small></span></button></li>`;
  };
  const body = groups.filter(g => g[1].length).map(([h, list]) => `<h3 class="tp-h">${esc(h)}</h3><ul class="tp-list">${list.map(item).join('')}</ul>`).join('');
  box.querySelector('.tp-body').innerHTML = body || '<p class="muted">Ningún tipo coincide con la búsqueda.</p>';
  box.querySelector('.tp-note').textContent = study ? `Mazo de ${langLabel(study).toLowerCase()}: se muestran los tipos que encajan.` : 'Este mazo no es de idiomas: se muestran los tipos generales.';
  box.querySelector('[data-act="types-all"]').textContent = all ? 'Ver solo los de este mazo' : 'Ver todos los tipos';
}
function openTypePicker(open = true) {
  if (!S.edit) return;
  S.edit.pick = open ? { q: '', all: false } : null;
  $('#typePicker').hidden = !open;
  document.querySelector('form.ed')?.classList.toggle('picking', open);
  if (open) { $('#typeSearch').value = ''; drawTypePicker(); if (matchMedia('(hover:hover)').matches) $('#typeSearch').focus(); }
}
// Mazo elegido en el editor de tarjetas
const edDeck = () => $('#c-deck')?.value || S.edit?.deckId || null;
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
  return requiredField(type, f.id) ? `Escribe ${f.name.toLowerCase()}…` : 'Opcional';
}
function fieldInputs(type, values) {
  const occ = type.templates.find(t => t.mode === 'occlusion');
  return type.fields.map(f => {
    // Imagen tapada: la imagen y sus recuadros se editan juntos, dibujando encima
    if (occ && f.id === occ.answer) return '';
    if (occ && f.id === occ.image) return occEditorHTML(values[occ.image], values[occ.answer]);
    const roles = fieldRoles(type, f.id);
    const req = requiredField(type, f.id);
    const lang = f.lang ? LANGS.find(l => l.id === f.lang)?.label || f.lang : '';
    const cjk = /^(ja|zh)/.test(f.lang || '');
    const help = f.help || (f.lang?.startsWith('ja') ? 'Furigana: escribe el kanji y pulsa 振 en la barra (o escribe 漢字[かんじ]).' : '');
    return `<div class="ef${req ? ' ef-req' : ''}" data-ef="${f.id}">
      <div class="ef-head">
        <label class="ef-name" for="fld-${f.id}">${esc(f.name)}${req ? '<span class="ef-dot" title="Necesario" aria-label="necesario">•</span>' : ''}</label>
        <span class="ef-badges">${roles.map(r => `<span class="ef-role r-${r.replace(/\s/g, '')}">${r}</span>`).join('')}${lang ? `<span class="ef-lang">${esc(lang)}</span>` : ''}</span>
        ${f.lang && ttsAvailable() ? `<button type="button" class="ef-say" data-say-input="${f.id}" aria-label="Escuchar ${esc(f.name)}" title="Escuchar">${SPEAK_ICON}</button>` : ''}
      </div>
      <textarea id="fld-${f.id}" class="ef-input" data-fld="${f.id}" rows="1" maxlength="2000" ${f.lang ? `lang="${f.lang}"` : ''} placeholder="${esc(fieldPlaceholder(f, type))}">${esc(values[f.id] || '')}</textarea>
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
function cardForm(c, { deckId: forcedDeck, prefill = null, source = null, sugIndex = null } = {}) {
  const sessionDeck = S.session && S.decks.has(S.session.scope) ? S.session.scope : null;
  const deckId = c?.deck_id || forcedDeck || (S.view === 'deck' && S.deckId) || sessionDeck || [...S.decks.values()].find(d => !d.archived)?.id || [...S.decks.keys()][0];
  if (!deckId) { toast('Crea primero un mazo'); return deckForm(null); }
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
  S.edit = { open: true, dirty: !!source && sugIndex == null, deckId, source, sugIndex, cardId: c?.id || null, noteId: c?.note_id || null, siblings: siblings.map(x => x.id), typeId: model.type.id,
    fields: { ...model.fields }, pv: model.tpl.id, pvSide: 'front', hint: prefill?.hint ?? c?.hint ?? '', tags: prefill?.tags ?? c?.tags ?? [] };
  const p = c && S.progress.get(c.id);
  const deck = S.decks.get(deckId);
  openSheet(`<form data-form="card" data-id="${c ? c.id : ''}" class="ed" autocomplete="off">
    <header class="ed-top">
      <button type="button" class="ed-x" data-act="close-sheet" aria-label="Cerrar">${icon('x', { size: 20 })}</button>
      <div class="ed-title"><span>${c ? 'Editar tarjeta' : sugIndex != null ? 'Editar sugerencia' : 'Nueva tarjeta'}</span>
        <label class="ed-deck" title="Mazo">${deck ? deckIcon(deck) : ''}<select id="c-deck" aria-label="Mazo">${deckOptions(deckId)}</select></label></div>
      <button type="submit" class="primary ed-save">Guardar</button>
    </header>
    <div class="ed-discard" id="edDiscard" hidden role="alert"><span>Tienes cambios sin guardar.</span>
      <button type="button" class="ghost small-btn" data-act="discard-edit">Descartar</button><button type="button" class="primary small-btn" data-act="keep-edit">Seguir editando</button></div>
    <div class="ed-body">
      <section class="ed-main">
        <input type="hidden" id="c-type" value="${model.type.id}">
        <div class="ed-typebar" id="typeBar">${typeBar(model.type.id, deckId)}</div>
        <p class="ed-typedesc" id="typeDesc">${esc(model.type.description || '')}</p>
        <div id="fieldsBox" class="ed-fields">${fieldInputs(typeIn(model.type, deckId), model.fields)}</div>
        <div id="toolsBox">${TOOLBAR(deckId)}</div>
        <div class="ed-props">
          <div class="prop"><span class="prop-k">${icon('lightbulb', { size: 16 })} Pista</span><input id="c-hint" class="prop-v" maxlength="500" value="${esc(S.edit.hint)}" placeholder="Vacío · se puede ver antes de responder"></div>
          <div class="prop prop-tags"><span class="prop-k">${icon('tag', { size: 16 })} Etiquetas</span><div class="prop-v">${tagPicker(S.edit.tags)}</div></div>
          ${linkProp(source || (c?.page_id ? { page_id: c.page_id, block_id: c.block_id } : null))}
        </div>
        ${siblings.length > 1 ? `<p class="ed-note">Esta nota genera ${siblings.length} tarjetas. Los cambios se aplican a todas.</p>` : ''}
      </section>
      <aside class="ed-side" aria-label="Vista previa">
        <div class="pv-h"><span>Vista previa</span><span class="pv-count" id="pvCount"></span></div>
        <div class="pv-tabs" id="pvTabs"></div>
        <div id="pvBody"></div>
        <p class="ed-kbd">Toca la tarjeta para darle la vuelta · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> guarda</p>
      </aside>
    </div>
    <div class="ed-picker" id="typePicker" role="dialog" aria-label="Elegir tipo de tarjeta" hidden>
      <div class="tp-top"><button type="button" class="iconbtn" data-act="close-picker" aria-label="Volver">${icon('x', { size: 18 })}</button>
        <input id="typeSearch" type="search" placeholder="Buscar tipo de tarjeta" aria-label="Buscar tipo de tarjeta" autocomplete="off"></div>
      <p class="hint tp-note"></p>
      <div class="tp-body"></div>
      <div class="btnrow tp-foot"><button type="button" class="link" data-act="types-all"></button><span class="spacer"></span><button type="button" class="ghost small-btn" data-act="manage-types">Gestionar tipos…</button></div>
    </div>
    <footer class="ed-foot">
      ${c ? `<button type="button" class="ghost danger small-btn" data-act="ask-delete-card">Eliminar</button>
        <button type="button" class="ghost small-btn" data-act="dup-card">Duplicar</button>
        ${p ? '<button type="button" class="ghost small-btn" data-act="reset-card">Reiniciar progreso</button>' : ''}` : ''}
      <span class="spacer"></span>
      ${c || sugIndex != null ? '' : '<button type="button" class="ghost" data-act="save-card-more">Guardar y otra</button>'}
      <button type="submit" class="primary">Guardar</button>
    </footer>
  </form>`, { full: true });
  document.querySelectorAll('.ef-input').forEach(autoGrow);
  drawPreview();
  if (matchMedia('(hover:hover)').matches) setTimeout(() => document.querySelector('.ef-input')?.focus(), 40);
}
function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.min(320, t.scrollHeight + 2) + 'px'; }
function setEditorType(id) {
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
function redrawEditorFields() {
  const deckId = edDeck(), t = getType(S.edit.typeId) || BUILTIN_TYPES[0];
  $('#typeBar').innerHTML = typeBar(t.id, deckId);
  $('#fieldsBox').innerHTML = fieldInputs(typeIn(t, deckId), S.edit.fields);
  $('#toolsBox').innerHTML = TOOLBAR(deckId);
  $('#typeDesc').textContent = t.description || '';
  document.querySelectorAll('.ef-input').forEach(autoGrow);
  drawPreview();
}
// Formato sobre el campo activo
function applyFormat(kind) {
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
function pickImage() {
  return new Promise(ok => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
    inp.addEventListener('change', () => ok(inp.files?.[0] || null));
    inp.addEventListener('cancel', () => ok(null));
    inp.click();
  });
}
// Guarda la imagen y devuelve su id (o null si no se ha podido)
async function saveImage(file) {
  try { return await addImage(file); } catch (e) { toast(e.message || 'No se ha podido añadir la imagen'); return null; }
}
// Mete una imagen en un campo del editor, donde está el cursor (en su propia línea)
async function imageIntoField(t, file) {
  const id = await saveImage(file);
  if (!id || !t.isConnected) return;
  const a = t.selectionStart, z = t.selectionEnd, before = t.value.slice(0, a), after = t.value.slice(z);
  const tok = (before && !before.endsWith('\n') ? '\n' : '') + imgToken(id) + (after && !after.startsWith('\n') ? '\n' : '');
  t.value = before + tok + after;
  t.focus(); t.selectionStart = t.selectionEnd = a + tok.length;
  S.edit.dirty = true;
  autoGrow(t); readEditor(); drawPreview();
}
const imageFile = dt => [...(dt?.files || [])].find(f => /^image\//.test(f.type)) || null;
/* ---------- Furigana en el editor ---------- */
const KANJI = /[㐀-䶿一-鿿豈-﫿々〆ヶ]/;
const hasRuby = s => new RegExp(RUBY_RE.source).test(String(s || ''));
// Vista previa con la furigana bajo un campo (solo cuando la lleva)
function rubyLine(t) {
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
function rubyApply(remove = false) {
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
function rubyClose() {
  S.rubyEdit = null;
  const box = $('#rubyPop');
  if (box) { box.hidden = true; box.innerHTML = ''; }
}
// Editor de «Tapar partes de una imagen»: la imagen, y encima los recuadros (se dibujan arrastrando)
function occEditorHTML(imgText, maskText) {
  const has = !!imageIdIn(imgText), n = parseMasks(maskText).length;
  return `<div class="ef ef-req ef-occ" data-ef="img"><div class="ef-head"><span class="ef-name">Imagen y recuadros<span class="ef-dot" aria-label="necesario">•</span></span>
      <span class="ef-badges">${has ? `<span class="ef-role">${plural(n, 'recuadro', 'recuadros')} · ${plural(n, 'tarjeta', 'tarjetas')}</span>` : ''}</span></div>
    <textarea data-fld="img" hidden>${esc(imgText || '')}</textarea><textarea data-fld="m" hidden>${esc(maskText || '')}</textarea>
    <div id="occEd">${has ? `${occlusionHTML(imgText, maskText, -1, false, { edit: true })}
      <p class="ef-help">Arrastra sobre la imagen para tapar una parte: cada recuadro será una tarjeta. Toca un recuadro para quitarlo.</p>
      <div class="btnrow"><button type="button" class="ghost small-btn" data-act="occ-pick">${icon('image', { size: 15 })} Cambiar imagen</button>${n ? '<button type="button" class="ghost small-btn" data-act="occ-clear">Quitar los recuadros</button>' : ''}</div>`
      : `<button type="button" class="occ-empty" data-act="occ-pick">${icon('image', { size: 22 })}<b>Elegir imagen</b><small>Un mapa, un esquema, un diagrama… (también puedes pegarla)</small></button>`}</div></div>`;
}
function occFields() { return { img: document.querySelector('[data-fld="img"]'), m: document.querySelector('[data-fld="m"]') }; }
function occRedraw() {
  const { img, m } = occFields();
  const box = document.querySelector('.ef-occ');
  if (!img || !box) return;
  box.outerHTML = occEditorHTML(img.value, m.value);
  S.edit.dirty = true;
  readEditor(); drawPreview();
}
async function occSetImage(file) {
  const id = await saveImage(file);
  const { img } = occFields();
  if (!id || !img) return;
  img.value = imgToken(id);
  occRedraw();
}
function occDelete(k) {
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
function readEditor() {
  const e = S.edit;
  document.querySelectorAll('[data-fld]').forEach(t => { e.fields[t.dataset.fld] = t.value; });
  if ($('#c-hint')) e.hint = $('#c-hint').value;
  return e;
}
function drawPreview() {
  const e = S.edit, box = $('#pvBody');
  if (!e || !box) return;
  const type = typeIn(getType(e.typeId) || BUILTIN_TYPES[0], edDeck());
  const active = activeTemplates(type, e.fields);
  const tpls = type.templates;
  if (!tpls.some(t => t.id === e.pv)) e.pv = (active[0] || tpls[0]).id;
  const isActive = t => active.some(a => a.id === t.id);
  $('#pvTabs').innerHTML = tpls.length > 1 ? tpls.map(t => `<button type="button" class="pvtab${isActive(t) ? '' : ' off'}" data-pv="${t.id}" aria-pressed="${t.id === e.pv}" title="${isActive(t) ? 'Se creará' : 'Faltan campos para crear esta tarjeta'}">${isActive(t) ? icon('check', { size: 13 }) + ' ' : ''}${esc(t.name)}</button>`).join('') : '';
  $('#pvCount').textContent = active.length ? `${active.length} ${active.length === 1 ? 'tarjeta' : 'tarjetas'}` : 'Faltan campos';
  const tpl = tpls.find(t => t.id === e.pv);
  const model = { type, tpl, fields: e.fields };
  const st = { revealed: e.pvSide === 'back', typed: null, choice: null };
  if (tpl.mode === 'choice' || tpl.mode === 'clozechoice') {
    const pool = cardList().filter(x => x.deck_id === $('#c-deck')?.value).map(x => x.back).filter(Boolean);
    while (pool.length < 3) pool.push(`Otra opción ${pool.length + 1}`);
    st.choice = tpl.mode === 'clozechoice' ? clozeChoices(null, model, pool) : { ...choiceOptions(tpl, e.fields, pool), picked: -1 };
  }
  const f = faceHTML(model, st, { preview: true });
  const modeLabel = MODES.find(m => m.id === tpl.mode)?.label || '';
  box.innerHTML = `<div class="pv-card mode-${tpl.mode}" title="Toca para darle la vuelta">
      <span class="pv-side">${e.pvSide === 'front' ? 'Anverso' : 'Reverso'} · ${esc(modeLabel)}</span>
      <div class="front">${f.front || '<span class="muted">Rellena los campos…</span>'}</div>${f.ask}${f.answer ? `<div class="answer">${f.answer}</div>` : ''}
      <button type="button" class="pv-flip-hint" data-act="pv-flip" aria-label="Dar la vuelta">${icon('rotate-cw', { size: 16 })}</button>
    </div>
    ${!isActive(tpl) ? `<p class="hint pv-miss">Esta tarjeta no se creará hasta que rellenes ${esc(missingFor(type, tpl, e.fields))}.</p>` : ''}`;
}
function confirmSheet(text, act, label) {
  openSheet(`<h2>${text}</h2><p class="muted">No se puede deshacer.</p>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="danger solid primary" data-act="${act}">${label}</button></div>`);
}
function shareSheet() {
  const d = S.decks.get(S.deckId);
  const url = shareUrl(d.id);
  openSheet(`<h2>Compartir «${esc(d.name)}»</h2>
    ${d.is_public
      ? `<p>Envía este enlace a tus amigos. Al abrirlo con su cuenta podrán copiarse el mazo.</p>
         <input id="shareUrl" readonly value="${esc(url)}" aria-label="Enlace para compartir">
         <div class="btnrow"><button class="primary" data-act="copy-link">Copiar enlace</button><button class="ghost" data-act="toggle-public">Dejar de compartir</button></div>`
      : `<p>Ahora mismo este mazo es privado. Si lo compartes, cualquier usuario podrá verlo en Explorar y copiarlo.</p>
         <button class="primary" data-act="toggle-public">Compartir con la comunidad</button>`}
    <hr style="border:0;border-top:1px solid var(--line);width:100%">
    <p class="small muted">También puedes descargarlo y mandarlo por WhatsApp o email. Se importa desde «Mis mazos».</p>
    <div class="btnrow"><button class="ghost" data-act="export-csv">Descargar CSV</button><button class="ghost" data-act="export-deck">Descargar copia Flaski</button></div>
    <p class="hint">El CSV se abre con Excel, Google Sheets o Anki. La copia Flaski (.json) conserva también la descripción del mazo.</p>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button></div>`);
}

/* ===================== guardar ===================== */
const readIcon = () => ($('#f-icon')?.value || '').slice(0, 16);
const readColor = () => document.querySelector('input[name="f-color"]:checked')?.value || '';
async function saveDeckForm(form) {
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
  if (!fields.name) return toast('Ponle un nombre al mazo');
  const btn = form.querySelector('[type=submit]'); btn.disabled = true;
  try {
    const d = id ? await api.updateDeck(id, fields) : await api.createDeck({ ...fields, owner: S.uid });
    S.decks.set(d.id, { tags: [], ...d });
    S.pub = null;
    toast(id ? 'Mazo guardado' : 'Mazo creado');
    go('deck', { deckId: d.id, cardQuery: '' });
  } catch (e) { btn.disabled = false; fail(e); }
}
async function saveFolderForm(form) {
  const id = form.dataset.id;
  const fields = { name: $('#fo-name').value.trim(), icon: readIcon(), color: readColor(), parent_id: $('#fo-parent').value || null };
  if (!fields.name) return toast('Ponle un nombre a la carpeta');
  const btn = form.querySelector('[type=submit]'); btn.disabled = true;
  try {
    const f = id ? await api.updateFolder(id, fields) : await api.createFolder({ ...fields, owner: S.uid });
    S.folders.set(f.id, f);
    toast(id ? 'Carpeta guardada' : 'Carpeta creada');
    if (S.view === 'notes') go('notes', { noteFolder: f.id }); else go('decks', { folderId: f.id });
  } catch (e) { btn.disabled = false; fail(e); }
}
async function addTag(name, color = 'gray') {
  name = name.trim().slice(0, 40);
  if (!name) return null;
  const existing = [...S.tags.values()].find(t => t.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (existing) return existing;
  const t = await api.createTag({ name, color, owner: S.uid });
  S.tags.set(t.id, t);
  return t;
}
async function saveTagsSheet() {
  const rows = document.querySelectorAll('[data-tag-row]');
  try {
    for (const r of rows) {
      const t = S.tags.get(r.dataset.tagRow);
      const name = r.querySelector('.t-name').value.trim().slice(0, 40), color = r.querySelector('.t-color').value;
      if (t && name && (name !== t.name || color !== t.color)) S.tags.set(t.id, await api.updateTag(t.id, { name, color }));
    }
    closeSheet(); render();
  } catch (e) { fail(e); }
}
function moveSheet(ids) {
  const decks = ids.map(id => S.decks.get(id)).filter(Boolean);
  if (!decks.length) return;
  const cur = decks.length === 1 ? (decks[0].folder_id || '') : null;
  const tree = folderTree(S.folders);
  const row = (id, label, depth, icon) => `<li><button class="moverow" data-move-to="${id}" ${id === cur ? 'aria-current="true"' : ''} style="padding-left:${10 + depth * 18}px">
    ${icon}<span>${label}</span>${id === cur ? '<span class="muted small">aquí está</span>' : ''}</button></li>`;
  openSheet(`<h2>Mover ${decks.length === 1 ? `«${esc(decks[0].name)}»` : `${decks.length} mazos`}</h2>
    <p class="muted small">Toca la carpeta de destino.</p>
    <ul class="movelist" data-moving='${esc(JSON.stringify(ids))}'>
      ${row('', 'Mis mazos (sin carpeta)', 0, `<span class="icon">${icon('house', { size: 18 })}</span>`)}
      ${tree.map(f => row(f.id, esc(f.name), f.depth + 1, folderIcon(S.folders.get(f.id)))).join('')}
    </ul>
    <div class="btnrow"><button class="ghost" data-act="new-folder">+ Carpeta nueva</button><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button></div>`);
}
function addDecksSheet() {
  const here = S.folderId;
  const others = sortDecks([...S.decks.values()].filter(d => (d.folder_id || null) !== here && !d.archived), 'name', new Map());
  if (!others.length) return toast('No hay más mazos para traer aquí');
  const where = d => (d.folder_id && S.folders.has(d.folder_id) ? folderPath(S.folders, d.folder_id).map(f => f.name).join(' / ') : 'Mis mazos');
  openSheet(`<h2>Añadir mazos a «${esc(S.folders.get(here)?.name || '')}»</h2>
    <p class="muted small">Marca los mazos que quieres mover a esta carpeta.</p>
    <ul class="picklist">${others.map(d => `<li><label class="pickrow"><input type="checkbox" name="pick-deck" value="${d.id}">${deckIcon(d)}
      <span class="info"><span class="dname">${esc(d.name)}</span><span class="meta">${esc(where(d))}</span></span></label></li>`).join('')}</ul>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-act="confirm-add-decks">Mover aquí</button></div>`);
}
async function moveDecks(ids, folderId) {
  try {
    for (const id of ids) S.decks.set(id, { tags: [], ...await api.updateDeck(id, { folder_id: folderId }) });
    const name = folderId ? S.folders.get(folderId)?.name : 'Mis mazos';
    toast(ids.length === 1 ? `Movido a «${name}»` : `${ids.length} mazos movidos a «${name}»`);
    closeSheet(); render();
  } catch (e) { fail(e); }
}

async function deleteFolder(id) {
  const f = S.folders.get(id);
  if (!f) return;
  const parent = f.parent_id && S.folders.has(f.parent_id) ? f.parent_id : null;
  // Primero subimos su contenido un nivel, para no perder nada
  for (const d of [...S.decks.values()].filter(d => d.folder_id === id)) S.decks.set(d.id, { tags: [], ...await api.updateDeck(d.id, { folder_id: parent }) });
  for (const sub of [...S.folders.values()].filter(x => x.parent_id === id)) S.folders.set(sub.id, await api.updateFolder(sub.id, { parent_id: parent }));
  for (const p of [...S.pages.values()].filter(x => x.folder_id === id)) { p.folder_id = parent; savePageSoon(p, 0); }
  await api.deleteFolder(id);
  S.folders.delete(id);
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
async function saveCardForm(form, more) {
  const e = readEditor();
  const type = getType(S.edit.typeId) || BUILTIN_TYPES[0];
  const deckId = $('#c-deck').value;
  if (!deckId) return toast('Crea primero un mazo');
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
    toast(e.cardId ? 'Tarjeta guardada' : out.length > 1 ? `${out.length} tarjetas añadidas` : 'Tarjeta añadida');
    if (more) { S.edit.dirty = false; cardForm(null, { deckId }); if (S.view === 'deck') renderDeck(); setTimeout(() => document.querySelector('[data-fld]')?.focus(), 40); }
    else { S.edit.dirty = false; closeSheet(); render(); }
  } catch (err) { btns.forEach(b => { b.disabled = false; }); fail(err); }
}

/* ---------- Creación rápida: pegar una lista ---------- */
function quickSheet() {
  const deckId = S.deckId;
  const t = defaultTypeFor(deckId);
  openSheet(`<h2>Crear varias tarjetas</h2>
    <p class="muted small">Pega una lista con una tarjeta por línea. Cada columna rellena un campo, en orden.</p>
    <form data-form="quick" class="cardform">
      <div class="two">
        <div><label for="q-type">Tipo de tarjeta</label><select id="q-type">${typeOptions(t.id, deckId)}</select></div>
        <div><label for="q-sep">Separador</label><select id="q-sep">
          <option value="auto">Detectar solo</option><option value="\t">Tabulador (copiado de Excel)</option><option value=" - ">Guion ( - )</option>
          <option value=";">Punto y coma (;)</option><option value=",">Coma (,)</option><option value=" = ">Igual ( = )</option><option value="|">Barra (|)</option></select></div>
      </div>
      <label for="q-deck">Mazo</label><select id="q-deck">${deckOptions(deckId)}</select>
      <p class="hint" id="qMap"></p>
      <textarea id="q-text" rows="8" placeholder="ev - casa&#10;kitap - libro&#10;su - agua"></textarea>
      <div id="qPrev"></div>
      <div class="btnrow" style="margin-top:8px"><span class="spacer"></span><button type="button" class="ghost" data-act="close-sheet">Cancelar</button><button type="submit" class="primary" id="qGo" disabled>Crear tarjetas</button></div>
    </form>`);
  drawQuick();
}
function quickRows() {
  const type = getType($('#q-type').value) || BUILTIN_TYPES[0];
  const sep = $('#q-sep').value;
  const lines = $('#q-text').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const notes = lines.map(l => {
    const cols = splitQuick(l, sep);
    const fields = {};
    type.fields.forEach((f, i) => { fields[f.id] = i === type.fields.length - 1 && cols.length > type.fields.length ? cols.slice(i).join(' ') : (cols[i] || ''); });
    return fields;
  });
  return { type, notes, valid: notes.filter(f => activeTemplates(type, f).length) };
}
function drawQuick() {
  const { type, notes, valid } = quickRows();
  $('#qMap').innerHTML = type.fields.map((f, i) => `Columna ${i + 1} → <b>${esc(f.name)}</b>`).join(' · ');
  const cards = valid.reduce((n, f) => n + activeTemplates(type, f).length, 0);
  $('#qPrev').innerHTML = notes.length ? `<div class="qtable-wrap"><table class="qtable"><thead><tr>${type.fields.map(f => `<th>${esc(f.name)}</th>`).join('')}</tr></thead>
    <tbody>${notes.slice(0, 5).map(f => `<tr class="${activeTemplates(type, f).length ? '' : 'bad'}">${type.fields.map(x => `<td>${esc(f[x.id] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="hint">${notes.length > 5 ? `…y ${notes.length - 5} líneas más. ` : ''}Se crearán <b>${cards}</b> ${cards === 1 ? 'tarjeta' : 'tarjetas'}${notes.length - valid.length ? ` (${notes.length - valid.length} líneas incompletas se saltarán)` : ''}.</p>` : '';
  $('#qGo').disabled = !valid.length;
  $('#qGo').textContent = cards ? `Crear ${cards} ${cards === 1 ? 'tarjeta' : 'tarjetas'}` : 'Crear tarjetas';
}
async function saveQuick(form) {
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
    toast(`${created.length} tarjetas creadas`);
    go('deck', { deckId, cardQuery: '' });
  } catch (e) { btn.disabled = false; drawQuick(); fail(e); }
}

/* ---------- Tipos de tarjeta: gestor y editor ---------- */
function typeUsage(id) { return cardList().filter(c => c.type_id === id).length; }
function typesSheet() {
  const scopeText = t => { const s = typeScope(t); return s === 'general' ? 'Cualquier tema' : s === 'lang' ? 'Idiomas' : s.map(b => LANGS.find(l => l.id.split('-')[0] === b)?.label || b).join(', '); };
  const row = (t, own) => `<li class="typerow${typeHidden(t) ? ' is-hidden' : ''}"><span class="icon">${typeIcon(t, 20)}</span>
    <span class="info"><span class="dname">${esc(t.name)}</span><span class="meta">${esc(scopeText(t))} · ${esc(t.description || `${t.fields.length} campos · ${t.templates.length} ${t.templates.length === 1 ? 'tarjeta' : 'tarjetas'} por nota`)}</span></span>
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
  openSheet(`<h2>Tipos de tarjeta</h2>
    <p class="muted small">Un tipo define qué campos rellenas y qué tarjetas se crean con ellos. En el editor solo salen los que sirven para el mazo (los de japonés, en mazos de japonés). Los que ocultes no saldrán en el editor (siguen en «Ver todos los tipos»).</p>
    ${[...groups].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([, g]) => `<h3 class="sub-h">${esc(g.title)}</h3><ul class="typelist">${g.rows.join('')}</ul>`).join('')}
    <div class="btnrow"><button class="primary" data-act="new-type">+ Tipo nuevo</button><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button></div>`);
}
function typeEditor(t) {
  S.typeEdit = JSON.parse(JSON.stringify(t));
  drawTypeEditor();
}
function drawTypeEditor() {
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
      <p class="hint">Lo que rellenarás en cada nota. Si eliges un idioma, el campo tendrá botón de audio. «Idioma del mazo» y «Tu idioma» se adaptan a cada mazo: el mismo tipo sirve para turco, alemán o japonés.</p>
      <ol class="tfields">${t.fields.map((f, i) => `<li data-fi="${i}">
        <input class="tf-name" value="${esc(f.name)}" maxlength="40" aria-label="Nombre del campo ${i + 1}">
        <select class="tf-lang" aria-label="Idioma del audio"><option value="" ${!f.lang ? 'selected' : ''}>Sin audio</option>
          <optgroup label="Según el mazo">${LANG_ROLES.map(l => `<option value="${l.id}" ${l.id === f.lang ? 'selected' : ''}>${l.label}</option>`).join('')}</optgroup>
          <optgroup label="Siempre el mismo">${LANGS.filter(l => l.id).map(l => `<option value="${l.id}" ${l.id === f.lang ? 'selected' : ''}>${l.label}</option>`).join('')}</optgroup></select>
        <label class="tf-auto" title="Reproducir solo al aparecer"><input type="checkbox" class="tf-autoplay" ${f.autoplay ? 'checked' : ''} ${f.lang ? '' : 'disabled'}>Auto</label>
        <span class="tf-btns"><button type="button" class="iconbtn" data-fmove="${i}:-1" aria-label="Subir" ${i ? '' : 'disabled'}>${icon('arrow-up', { size: 15 })}</button><button type="button" class="iconbtn" data-fmove="${i}:1" aria-label="Bajar" ${i < t.fields.length - 1 ? '' : 'disabled'}>${icon('arrow-down', { size: 15 })}</button><button type="button" class="iconbtn danger" data-fdel="${i}" aria-label="Quitar campo" ${t.fields.length > 1 ? '' : 'disabled'}>${icon('x', { size: 15 })}</button></span>
      </li>`).join('')}</ol>
      <button type="button" class="ghost small-btn" data-act="add-field">+ Campo</button>

      <h3 class="sub-h">2 · Tarjetas que se crean</h3>
      <p class="hint">Cada una genera una tarjeta por nota. Por ejemplo, una de «turco → español» y otra de «español → turco».</p>
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
        ${tpl.mode === 'choice' ? `<label>Respuestas incorrectas (opcional)</label><select class="tt-wrong"><option value="">Coger de otras tarjetas del mazo</option>${fieldOpts(tpl.wrong)}</select>` : ''}
        <label>${tpl.mode === 'flip' ? 'Se ve detrás' : 'Se ve también al responder'}</label><div class="fchecks">${checks(tpl, 'back')}</div>
        <div class="btnrow"><span class="spacer"></span><button type="button" class="ghost small-btn danger" data-tdel="${i}" ${t.templates.length > 1 ? '' : 'disabled'}>Quitar esta tarjeta</button></div>
      </fieldset>`).join('')}</div>
      <button type="button" class="ghost small-btn" data-act="add-template">+ Tarjeta</button>

      <h3 class="sub-h">Vista previa</h3>${pv || '<p class="hint">Elige qué campos se ven delante.</p>'}
      <div class="btnrow" style="margin-top:10px">${t.id ? '<button type="button" class="ghost danger" data-act="delete-type">Eliminar tipo</button>' : ''}<span class="spacer"></span>
        <button type="button" class="ghost" data-act="manage-types">Volver</button><button type="submit" class="primary">Guardar tipo</button></div>
    </form>`);
}
// Lee el formulario del editor de tipos y lo vuelca en S.typeEdit
function readTypeEditor() {
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
async function saveTypeEditor() {
  const t = readTypeEditor();
  t.name = t.name.trim();
  if (!t.name) return toast('Ponle un nombre al tipo');
  t.fields.forEach((f, i) => { f.name = f.name.trim() || `Campo ${i + 1}`; });
  for (const tpl of t.templates) {
    tpl.name = tpl.name.trim() || 'Tarjeta';
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
function deckTypes(deckId) {
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
async function adoptTypes(types = []) {
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
async function dedupeTypes() {
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
function migrateDeckLangs() {
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

async function saveProfileForm(form) {
  const name = $('#p-name').value.trim().slice(0, 40);
  const btn = form.querySelector('[type=submit]'); btn.disabled = true;
  try {
    if (name !== S.name) { await api.saveProfile(S.uid, name); S.name = name; S.pub = null; }
    toast('Guardado');
    renderProfile();
  } catch (e) { btn.disabled = false; fail(e); }
}

/* ===================== archivos ===================== */
// Formato de archivo de mazo (ver README):
// { "format": "flaski-deck", "version": 1, "name": "...", "description": "...", "cards": [ { "front", "back", "note" } ] }
function parseDeckFile(data) {
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
async function importFile(file) {
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
async function addAnki(btn) {
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
function download(text, filename, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function exportDeck(kind) {
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

/* ===================== eventos ===================== */
document.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) {
    // Furigana oculta: tocar un kanji deja ver su lectura (solo esa, y se vuelve a ocultar con otro toque)
    // Tocar una sugerencia (no su casilla ni «Editar») la marca o la quita
    const sg = e.target.closest('[data-sort-group]');
    if (sg) return sortAction('group', +sg.dataset.sortGroup);
    const rb = e.target.closest('.ruby-hide ruby');
    if (rb) { rb.classList.toggle('peek'); return; }
    // Tocar un bloque de los apuntes lo pone en edición (salvo que se esté seleccionando texto)
    const eb = e.target.closest('[data-edit-block]');
    const td = e.target.closest?.('.nb-tbl td, .nb-tbl th');
    if (eb && td && !getSelection()?.toString().trim()) return editBlock(eb.dataset.editBlock, { r: td.tagName === 'TH' ? 'h' : td.parentElement.rowIndex - 1, c: td.cellIndex });
    if (eb && !getSelection()?.toString().trim()) return editBlock(eb.dataset.editBlock);
    if (e.target.id === 'sheet') requestClose();
    else if (e.target.closest('.pv-card') && S.edit) { S.edit.pvSide = S.edit.pvSide === 'front' ? 'back' : 'front'; drawPreview(); }
    return;
  }
  const ds = b.dataset;
  if (ds.nav) { if (S.view === 'study') S.session = null; return go(ds.nav, ds.nav === 'deck' ? {} : { cardQuery: '' }); }
  if (ds.start) return startSession(ds.start);
  if (ds.stats) { S.stats.scope = ds.stats; return go('stats'); }
  if (ds.stp !== undefined) { S.stats.period = Number(ds.stp); const y = scrollY; renderStats(); scrollTo(0, y); return; }
  if (ds.stfc) { S.stats.fcDays = Number(ds.stfc); const y = scrollY; renderStats(); scrollTo(0, y); return; }
  if (ds.v !== undefined && b.parentElement?.dataset.seg) {
    const path = b.parentElement.dataset.seg;
    const v = typeof getPref(path) === 'number' ? Number(ds.v) : ds.v;
    setPref(path, v);
    b.parentElement.querySelectorAll('.seg-b').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    return prefChanged(path);
  }
  if (ds.accent) { S.prefs.look.accent = ds.accent; document.querySelectorAll('.swatch').forEach(x => x.setAttribute('aria-pressed', String(x === b))); return prefChanged('look.accent'); }
  if (ds.preset) {
    if (ds.preset === 'custom' && S.prefs.algo.preset !== 'custom') S.prefs.algo.custom = { ...algoFor(S.prefs, null) };
    S.prefs.algo.preset = ds.preset; prefChanged('algo.preset');
    const y = scrollY; renderSettings(); scrollTo(0, y); return;
  }
  if (ds.grade) return grade(Number(ds.grade));
  if (ds.open) return go('deck', { deckId: ds.open, cardQuery: '' });
  if (ds.move) return moveSheet([ds.move]);
  if (ds.say) { const c = S.cards.get(S.session?.queue[0]); if (c) { const m = cardModel(c); speak(m.fields[ds.say], m.type.fields.find(f => f.id === ds.say)?.lang); } return; }
  if (ds.sayInput) { const t = typeIn(getType(S.edit?.typeId), edDeck()); speak($('#fld-' + ds.sayInput).value, t?.fields.find(f => f.id === ds.sayInput)?.lang); return; }
  if (ds.match) return pickMatch(ds.match);
  if (ds.sortPick !== undefined) return sortAction('pick', +ds.sortPick);
  if (ds.sortBack !== undefined) return sortAction('back', +ds.sortBack);
  if (ds.occDel !== undefined) return occDelete(+ds.occDel);
  if (ds.choice !== undefined) { const st = S.session?.st; if (st?.choice && !S.session.revealed) { st.choice.picked = +ds.choice; reveal(); } return; }
  if (ds.listen) { const c = S.cards.get(S.session?.queue[0]); if (c) playListen(cardModel(c), +ds.listen); return; }
  if (ds.strokes) {
    const c = S.cards.get(S.session?.queue[0]);
    if (c) { const m = cardModel(c); strokesSheet(m.fields[ds.strokes], m.type.fields.find(f => f.id === ds.strokes)?.lang || ''); }
    return;
  }
  if (ds.ordPick !== undefined || ds.ordRemove !== undefined) {
    const st = S.session?.st; const c = S.cards.get(S.session?.queue[0]);
    if (!st || !c) return;
    if (!st.order) { const m = cardModel(c); st.order = { tokens: orderTokens(m.fields[m.tpl.answer]).map((t, i) => ({ t, i })), picked: [] }; shuffleTokens(st.order); }
    if (ds.ordPick !== undefined) st.order.picked.push(+ds.ordPick);
    else st.order.picked.splice(+ds.ordRemove, 1);
    return renderStudy();
  }
  if (ds.setType) return setEditorType(ds.setType);
  if (ds.pickType) { openTypePicker(false); return setEditorType(ds.pickType); }
  if (ds.page) return go('page', { pageId: ds.page });
  if (ds.nfolder !== undefined) { S.pageQuery = ''; S.noteOrg.tagIds = []; return go('notes', { noteFolder: ds.nfolder || null }); }
  if (ds.ntag) {
    const t = ds.ntag, list = S.noteOrg.tagIds;
    S.noteOrg.tagIds = list.includes(t) ? list.filter(x => x !== t) : [...list, t];
    return renderNotes();
  }
  if (ds.studySection) return startSession(`page:${S.pageId}:${ds.studySection}`);
  if (ds.blockCards) return blockCardsSheet(ds.blockCards);
  if (ds.delBlock) return removeImageBlock(ds.delBlock);
  if (ds.tbl) return tableAction(b.closest('[data-table-ed]').dataset.tableEd, ds.tbl);
  if (ds.sugOpen !== undefined) return openSugEditor(+ds.sugOpen);
  if (ds.sugType) {
    const g = S.sug, all = [...new Set(g.list.map(x => x.typeId))];
    if (!g.types) g.types = new Set(all);
    g.types.has(ds.sugType) ? g.types.delete(ds.sugType) : g.types.add(ds.sugType);
    if (!g.types.size || g.types.size === all.length) g.types = null;
    return redrawSuggestions();
  }
  if (ds.sugGroup) {
    readSugEdit();
    const g = S.sug, items = g.list.filter(x => (!g.types || g.types.has(x.typeId)) && (ds.sugGroup === 'rec') === (x.score >= PRESELECT));
    const all = items.every(x => x.selected);
    items.forEach(x => { x.selected = !all; });
    return redrawSuggestions();
  }
  if (ds.blockType) return chooseBlockType(ds.blockType);
  if (ds.todo || ds.calloutIcon) {
    const p = curPage(), blk = p?.blocks.find(x => x.id === (ds.todo || ds.calloutIcon));
    if (!blk) return;
    if (ds.todo) blk.checked = !blk.checked;
    else blk.icon = CALLOUT_ICONS[(CALLOUT_ICONS.indexOf(blk.icon || '💡') + 1) % CALLOUT_ICONS.length];
    savePageSoon(p);
    const wrap = document.querySelector(`[data-block="${blk.id}"]`);
    if (wrap && !wrap.querySelector('[data-block-input]')) repaint(() => { wrap.outerHTML = blockHTML(blk, pageCards(p.id).get(blk.id)); });
    else if (wrap) { const lead = wrap.querySelector('.nb-check, .nb-icon'); wrap.classList.toggle('is-done', !!blk.checked); if (ds.todo) lead.setAttribute('aria-checked', String(!!blk.checked)); else lead.textContent = blk.icon; }
    return;
  }
  if (ds.friendMenu) return friendMenu(ds.friendMenu);
  if (ds.frAccept) return friendAction(() => api.social.respond(ds.frAccept, true), '¡Ya sois amigos!');
  if (ds.frReject) return friendAction(() => api.social.respond(ds.frReject, false));
  if (ds.frCancel) return friendAction(() => api.social.remove(ds.frCancel), 'Petición cancelada');
  if (ds.frRemove) { closeSheet(); return friendAction(() => api.social.remove(ds.frRemove), 'Ya no sois amigos'); }
  if (ds.frBlock) { closeSheet(); return friendAction(() => api.social.block(ds.frBlock), 'Bloqueado'); }
  if (ds.frUnblock) return friendAction(() => api.social.unblock(ds.frUnblock), 'Desbloqueado');
  if (ds.cheer) {
    const p = S.friends?.list.find(x => x.id === ds.cheer);
    e.target.closest('button').disabled = true;
    try { await api.social.cheer(ds.cheer); } catch (err) { e.target.closest('button').disabled = false; return fail(err); }
    markCheered(ds.cheer);
    toast(`Le has mandado ánimos a ${p?.name || 'tu amigo'} 👏`);
    if (S.view === 'friends') renderFriends();
    return;
  }
  if (ds.openPage) return go('page', { pageId: ds.openPage, focusBlock: ds.openBlock || null });
  if (ds.hideType) {
    const h = S.prefs.types.hidden;
    S.prefs.types.hidden = h.includes(ds.hideType) ? h.filter(x => x !== ds.hideType) : [...h, ds.hideType];
    savePrefsSoon();
    const y = $('#sheetBody').scrollTop; typesSheet(); $('#sheetBody').scrollTop = y;
    return;
  }
  if (ds.kind) {
    b.parentElement.querySelectorAll('[data-kind]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('#d-lang-row').hidden = ds.kind !== 'lang';
    return;
  }
  if (ds.fmt) return applyFormat(ds.fmt);
  if (ds.pv) { S.edit.pv = ds.pv; S.edit.pvSide = 'front'; return drawPreview(); }
  if (ds.pvside) { S.edit.pvSide = ds.pvside; return drawPreview(); }
  if (ds.editType) return typeEditor(S.types.get(ds.editType));
  if (ds.copyType) return typeEditor(copyType(getType(ds.copyType)));
  if (ds.fmove) {
    const t = readTypeEditor(); const [i, d] = ds.fmove.split(':').map(Number);
    [t.fields[i], t.fields[i + d]] = [t.fields[i + d], t.fields[i]]; return drawTypeEditor();
  }
  if (ds.fdel) {
    const t = readTypeEditor(); const f = t.fields[+ds.fdel];
    t.fields.splice(+ds.fdel, 1);
    for (const tpl of t.templates) {
      tpl.front = tpl.front.filter(x => x !== f.id); tpl.back = tpl.back.filter(x => x !== f.id);
      if (tpl.answer === f.id) tpl.answer = t.fields[0]?.id; if (tpl.wrong === f.id) tpl.wrong = '';
      if (tpl.mode === 'cloze' && !tpl.front.length) tpl.front = [t.fields[0].id];
    }
    return drawTypeEditor();
  }
  if (ds.tdel) { const t = readTypeEditor(); t.templates.splice(+ds.tdel, 1); return drawTypeEditor(); }
  if (ds.moveTo !== undefined) { b.disabled = true; return moveDecks(JSON.parse(b.closest('[data-moving]').dataset.moving), ds.moveTo || null); }
  if (ds.folder !== undefined) { Object.assign(S.org, { query: '', tagIds: [], archived: false }); return go('decks', { folderId: ds.folder || null }); }
  if (ds.layout) { S.org.layout = ds.layout; saveOrgPrefs(); return renderDecks(); }
  if (ds.tagfilter) {
    const t = ds.tagfilter, list = S.org.tagIds;
    S.org.tagIds = list.includes(t) ? list.filter(x => x !== t) : [...list, t];
    return renderDecks();
  }
  if (ds.delTag) {
    try {
      const id = ds.delTag;
      await api.deleteTag(id);
      S.tags.delete(id);
      for (const d of [...S.decks.values()]) if ((d.tags || []).includes(id)) {
        const tags = d.tags.filter(x => x !== id);
        S.decks.set(d.id, { ...d, tags });
        if (api.mode === 'cloud') await api.updateDeck(d.id, { tags });
      }
      for (const p of S.pages.values()) if ((p.tags || []).includes(id)) { p.tags = p.tags.filter(x => x !== id); savePageSoon(p, 0); }
      S.org.tagIds = S.org.tagIds.filter(x => x !== id);
      S.noteOrg.tagIds = S.noteOrg.tagIds.filter(x => x !== id);
      return tagsSheet();
    } catch (err) { return fail(err); }
  }
  if (ds.card) return cardForm(S.cards.get(ds.card));
  if (ds.pub) return openPublicPreview(ds.pub);
  if (ds.builtin) return openBuiltinPreview(ds.builtin);
  if (ds.char) {
    const f = (S.lastField?.isConnected && S.lastField) || $('#typed') || document.querySelector('[data-fld]');
    if (!f) return;
    const s = f.selectionStart ?? f.value.length, en = f.selectionEnd ?? s;
    f.value = f.value.slice(0, s) + ds.char + f.value.slice(en);
    f.focus(); f.selectionStart = f.selectionEnd = s + ds.char.length;
    if (f.dataset.fld) { S.edit.dirty = true; autoGrow(f); readEditor(); drawPreview(); }
    return;
  }
  switch (ds.act) {
    case 'auth-mode': S.authMode = ds.mode; return renderAuth();
    case 'reload': S.uid = null; return onSignedIn(await api.auth.session());
    case 'reveal': return reveal();
    case 'show-hint': {
      // Sin volver a pintar la tarjeta, para no borrar lo que estés dibujando
      const c = S.cards.get(S.session?.queue[0]);
      if (S.session?.st && c) { S.session.st.hint = true; b.outerHTML = `<div class="hintbox">${icon('lightbulb', { size: 16 })} ${fmt(c.hint)}</div>`; }
      return;
    }
    case 'ord-clear': if (S.session?.st?.order) { S.session.st.order.picked = []; renderStudy(); } return;
    case 'ord-check': {
      const st = S.session?.st; const c = S.cards.get(S.session?.queue[0]);
      if (!st?.order || !c) return;
      const m = cardModel(c);
      const mine = st.order.picked.map(i => st.order.tokens.find(t => t.i === i).t).join('\u0000');
      st.order.ok = mine === orderTokens(m.fields[m.tpl.answer]).join('\u0000');
      st.order.checked = true;
      return reveal();
    }
    case 'draw-peek': { const st = S.session?.st; if (st?.draw?.peek) { st.peeked = true; st.draw.peek(); } return; }
    case 'draw-clear': S.session?.st?.draw?.clear?.(); return;
    case 'draw-done': {
      const st = S.session?.st;
      if (!st?.draw?.image) return;
      if (st.draw.isEmpty()) return toast('Dibuja primero tu respuesta');
      st.drawn = { img: st.draw.image() };
      return reveal();
    }
    case 'undo': return undo();
    case 'test-voice': return speak('Merhaba, nasılsın? こんにちは。', 'tr-TR');
    case 'algo-reset': { S.prefs.algo.custom = { ...DEFAULT_ALGO }; prefChanged('algo.custom'); const y = scrollY; renderSettings(); scrollTo(0, y); return; }
    case 'backup': {
      const day = dateKey();
      download(JSON.stringify(await backupData(), null, 1), `flaski-copia-${day}.json`, 'application/json');
      return toast('Copia descargada');
    }
    case 'restore': return $('#backupFile').click();
    case 'ask-reset-progress': return confirmSheet('¿Reiniciar el progreso de todas las tarjetas?', 'reset-progress', 'Reiniciar todo');
    case 'reset-progress': {
      try { await api.clearManyProgress(S.uid, null); S.progress = new Map(); closeSheet(); toast('Progreso reiniciado'); } catch (err) { fail(err); }
      return;
    }
    case 'ask-reset-deck': return confirmSheet('¿Reiniciar el progreso de este mazo?', 'reset-deck', 'Reiniciar mazo');
    case 'reset-deck': {
      const ids = cardList().filter(c => c.deck_id === S.deckId).map(c => c.id);
      try { await api.clearManyProgress(S.uid, ids); ids.forEach(id => S.progress.delete(id)); closeSheet(); toast('Progreso del mazo reiniciado'); renderDeck(); } catch (err) { fail(err); }
      return;
    }
    case 'ask-reset-prefs': return confirmSheet('¿Restablecer todos los ajustes?', 'reset-prefs', 'Restablecer');
    case 'reset-prefs': { S.prefs = loadPrefs(); applyLook(S.prefs.look); setBaseRate(1); savePrefsSoon(); closeSheet(); toast('Ajustes restablecidos'); return renderSettings(); }
    case 'exit': {
      // Al salir de una sesión empezada en unos apuntes se vuelve a ellos
      const pid = S.session?.scope?.startsWith('page:') ? S.session.scope.split(':')[1] : null;
      S.session = null;
      return pid && S.pages.has(pid) ? go('page', { pageId: pid }) : go('home');
    }
    case 'more': { addExtraNew(10); return startSession(S.session?.scope || 'all'); }
    case 'close-sheet': return requestClose();
    case 'discard-edit': S.edit.dirty = false; return closeSheet();
    case 'keep-edit': $('#edDiscard').hidden = true; return;
    case 'pv-flip': S.edit.pvSide = S.edit.pvSide === 'front' ? 'back' : 'front'; return drawPreview();
    case 'dup-card': {
      readEditor();
      const pre = { typeId: S.edit.typeId, fields: { ...S.edit.fields }, hint: S.edit.hint, tags: [...document.querySelectorAll('input[name="f-tag"]:checked')].map(i => i.value) };
      const deckId = $('#c-deck').value;
      S.edit.dirty = false;
      cardForm(null, { deckId, prefill: pre });
      S.edit.dirty = true;
      return toast('Copia lista: cambia lo que quieras y guarda');
    }
    case 'new-deck': return deckForm(null);
    case 'new-folder': return folderForm(null);
    case 'toggle-emoji': {
      const panel = $('#emojiPanel');
      panel.hidden = !panel.hidden;
      $('.icon-current').setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden && !panel.dataset.ready) { panel.dataset.ready = '1'; mountEmojiPicker(panel, setIcon); }
      return;
    }
    case 'clear-icon': return setIcon('');
    case 'move-deck': return moveSheet([S.deckId]);
    case 'add-decks-here': return addDecksSheet();
    case 'confirm-add-decks': {
      const ids = [...document.querySelectorAll('input[name="pick-deck"]:checked')].map(i => i.value);
      if (!ids.length) return toast('Elige al menos un mazo');
      b.disabled = true;
      return moveDecks(ids, S.folderId);
    }
    case 'edit-folder': return folderForm(S.folders.get(S.folderId));
    case 'ask-delete-folder': return confirmSheet('¿Eliminar esta carpeta?', 'delete-folder', 'Eliminar carpeta');
    case 'delete-folder': {
      b.disabled = true;
      const inNotes = S.view === 'notes', fid = inNotes ? S.noteFolder : S.folderId;
      const parent = S.folders.get(fid)?.parent_id || null;
      const up = parent && S.folders.has(parent) ? parent : null;
      try { await deleteFolder(fid); toast('Carpeta eliminada'); return inNotes ? go('notes', { noteFolder: up }) : go('decks', { folderId: up }); }
      catch (err) { b.disabled = false; return fail(err); }
    }
    case 'manage-tags': return tagsSheet();
    case 'quick-add': return quickSheet();
    case 'manage-types': S.typeEdit = null; return typesSheet();
    case 'new-page': return newPage();
    case 'paste-page': return pastePageSheet();
    case 'import-pdf': closeSheet(); return $('#pdfFile').click();
    case 'paste-page-ok': {
      const blocks = textToBlocks($('#pagePaste').value);
      if (!blocks.length) return toast('No has pegado nada');
      const title = blocks[0].type === 'h1' ? blocks.shift().text : '';
      return newPage({ title, blocks });
    }
    case 'block-menu': {
      if (S.blockMenu?.mode === 'append') return closeBlockMenu();
      return openBlockMenu({ mode: 'append', anchor: e.target.closest('button') });
    }
    case 'add-block': case 'add-table': {
      const p = curPage();
      const nb = ds.act === 'add-table' ? newBlock('table', TABLE_TEMPLATE) : newBlock();
      // Si el último bloque está vacío, se aprovecha
      const last = p.blocks[p.blocks.length - 1];
      if (last && !last.text.trim() && last.type === 'p') Object.assign(last, { type: nb.type, text: nb.text }); else p.blocks.push(nb);
      const target = p.blocks[p.blocks.length - 1];
      savePageSoon(p);
      return redrawBlocks(target.id, ds.act === 'add-table' ? 2 : 0);
    }
    case 'add-image': { const f = await pickImage(); return f && addImageBlock(f); }
    case 'ask-delete-page': return confirmSheet('¿Eliminar estos apuntes?', 'delete-page', 'Eliminar');
    case 'delete-page': {
      const id = S.pageId;
      try { await api.deletePage(id); } catch (err) { return fail(err); }
      S.pages.delete(id);
      for (const c of S.cards.values()) if (c.page_id === id) { c.page_id = null; c.block_id = null; }
      toast('Apunte eliminado. Sus tarjetas se conservan.');
      return go('notes');
    }
    case 'back-study': return go('study');
    case 'clear-nfilters': S.pageQuery = ''; S.noteOrg.tagIds = []; return renderNotes();
    case 'edit-nfolder': return folderForm(S.folders.get(S.noteFolder));
    case 'page-tags': {
      if (S.pageTagsMissing) return openSheet('<h2>Etiquetas en los apuntes</h2><p>Para usar etiquetas en los apuntes, vuelve a ejecutar <code>supabase/schema.sql</code> en el SQL Editor de Supabase y recarga la app.</p><div class="btnrow"><span class="spacer"></span><button class="primary" data-act="close-sheet">Entendido</button></div>');
      return openSheet(`<h2>Etiquetas del apunte</h2><p class="muted small">Las mismas que usas en los mazos: sirven para filtrar en «Apuntes».</p>
        ${tagPicker(curPage()?.tags || [])}
        <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-act="save-page-tags">Guardar</button></div>`);
    }
    case 'save-page-tags': {
      const p = curPage();
      p.tags = [...document.querySelectorAll('input[name="f-tag"]:checked')].map(i => i.value);
      savePageSoon(p); closeSheet(); return renderPage();
    }
    case 'page-icon': return openSheet(`<h2>Icono del apunte</h2>${iconPicker(curPage()?.icon)}
      <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-act="save-page-icon">Guardar</button></div>`);
    case 'save-page-icon': { const p = curPage(); p.icon = readIcon(); savePageSoon(p); closeSheet(); return renderPage(); }
    case 'page-menu': return openSheet(`<h2>${esc(pageTitle(curPage()))}</h2>
      <ul class="list linklist">
        <li><button class="row-link" data-act="suggest-cards">${icon('sparkles', { size: 20 })}<span><b>Sugerir tarjetas</b><small>Propone tarjetas a partir de las definiciones, negritas, tablas y listas</small></span></button></li>
        <li><button class="row-link" data-act="import-pdf">${icon('file-text', { size: 20 })}<span><b>Importar PDF</b><small>${curPage().blocks.some(b => b.text.trim() || b.type === 'img' || b.type === 'hr') ? 'Su contenido se añade al final de este apunte' : 'Lo convierte en este apunte: títulos, párrafos, listas y tablas'}</small></span></button></li>
        <li><button class="row-link" data-act="page-md">${icon('download', { size: 20 })}<span><b>Descargar como Markdown</b><small>Para guardarlo o abrirlo en otra aplicación</small></span></button></li>
        <li><button class="row-link" data-act="page-copy-md">${icon('copy', { size: 20 })}<span><b>Copiar como texto</b><small>Con títulos, listas y tablas en Markdown</small></span></button></li>
        <li><button class="row-link danger" data-act="ask-delete-page">${icon('trash-2', { size: 20 })}<span><b>Eliminar apunte</b><small>Sus tarjetas no se borran: solo dejan de estar unidas a él</small></span></button></li>
      </ul>
      <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Cerrar</button></div>`);
    case 'page-md': {
      const p = curPage();
      const slug = pageTitle(p).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'apunte';
      closeSheet();
      return download(pageToMarkdown(p), slug + '.md', 'text/markdown;charset=utf-8');
    }
    case 'page-copy-md': { const ok = await copyText(pageToMarkdown(curPage()), 'Apunte copiado'); if (!ok) toast('No se ha podido copiar'); return closeSheet(); }
    case 'notes-help': return notesHelpSheet();
    case 'intro': return showIntro();
    case 'ruby-ok': return rubyApply();
    case 'ruby-del': return rubyApply(true);
    case 'sel-card': return cardFromSelection('card');
    case 'sel-cloze': return cardFromSelection('cloze');
    case 'pick-type': return openTypePicker(true);
    case 'close-picker': return openTypePicker(false);
    case 'types-all': S.edit.pick.all = !S.edit.pick.all; return drawTypePicker();
    case 'new-type': return typeEditor(blankType());
    case 'add-field': { const t = readTypeEditor(); const id = nextId('f', t.fields); t.fields.push({ id, name: `Campo ${t.fields.length + 1}`, lang: '', autoplay: false, help: '' }); return drawTypeEditor(); }
    case 'add-template': { const t = readTypeEditor(); t.templates.push({ id: nextId('t', t.templates), name: `Tarjeta ${t.templates.length + 1}`, mode: 'flip', front: [t.fields[0].id], back: t.fields.slice(1).map(f => f.id) }); return drawTypeEditor(); }
    case 'delete-type': {
      const t = S.typeEdit; const n = typeUsage(t.id);
      if (n) return toast(`No se puede eliminar: lo usan ${n} tarjetas. Cámbialas de tipo primero.`);
      try { await api.deleteType(t.id); S.types.delete(t.id); toast('Tipo eliminado'); return typesSheet(); } catch (err) { return fail(err); }
    }
    case 'make-cloze': {
      const ta = $('#' + ds.target); const a = ta.selectionStart, z = ta.selectionEnd;
      if (a === z) return toast('Selecciona primero la parte que quieres ocultar');
      ta.value = ta.value.slice(0, a) + '{{' + ta.value.slice(a, z) + '}}' + ta.value.slice(z);
      ta.focus(); ta.selectionStart = ta.selectionEnd = z + 4; readEditor(); return drawPreview();
    }
    case 'save-tags': return saveTagsSheet();
    case 'toggle-archived': S.org.archived = !S.org.archived; return renderDecks();
    case 'clear-filters': Object.assign(S.org, { query: '', tagIds: [], archived: false }); return renderDecks();
    case 'add-tag-inline': {
      const input = $('#f-newtag');
      try {
        const t = await addTag(input.value);
        if (!t) return;
        const checked = [...document.querySelectorAll('input[name="f-tag"]:checked')].map(i => i.value);
        if (!checked.includes(t.id)) checked.push(t.id);
        $('#tagPick').outerHTML = tagPicker(checked);
        $('#f-newtag')?.focus();
      } catch (err) { fail(err); }
      return;
    }
    case 'edit-deck': return deckForm(S.decks.get(S.deckId));
    case 'new-card': return cardForm(null);
    case 'share': return shareSheet();
    case 'import': return $('#importFile').click();
    case 'add-anki': return addAnki(e.target.closest('button'));
    case 'suggest-cards': closeSheet(); return openSuggestions();
    case 'sug-create': return createSuggested(e.target.closest('button'));
    case 'sug-more': { S.sug.showMore = !S.sug.showMore; return redrawSuggestions(); }
    case 'sort-check': { const so = S.session?.st?.sort; if (so) { so.checked = true; reveal(); } return; }
    case 'occ-pick': { const f = await pickImage(); return f && occSetImage(f); }
    case 'occ-clear': { const { m } = occFields(); if (m) { m.value = ''; occRedraw(); } return; }
    case 'friends-reload': S.friends = null; return renderFriends();
    case 'fr-copy-code': return copyText(S.friends?.me?.code ? formatCode(S.friends.me.code) : '', 'Código copiado');
    case 'fr-share': {
      const url = ds.link;
      if (navigator.share) { try { await navigator.share({ title: 'Flaski', text: 'Estudia conmigo en Flaski: así vemos nuestras rachas.', url }); return; } catch (err) { if (err?.name === 'AbortError') return; } }
      return (await copyText(url, 'Enlace copiado')) || toast(url);
    }
    case 'fr-accept-invite': closeSheet(); return addFriend(ds.code);
    case 'cheers-seen': {
      const ids = (S.friends?.cheers || []).map(c => c.id);
      S.friends.cheers = [];
      friendsChanged();
      return api.social.seen(ids).catch(() => {});
    }
    case 'paste': return pasteSheet();
    case 'paste-preview': {
      S.pasteText = $('#pasteText').value;
      try { previewImport(parsePasted(S.pasteText), { source: 'pegado', baseName: 'Mazo pegado' }); }
      catch (err) { const el = $('#pasteError'); el.textContent = err.message || 'No se ha podido leer lo pegado.'; el.hidden = false; }
      return;
    }
    case 'copy-ai-guide': {
      // Se copia sin esperar a nada si ya está cargado: Safari solo deja copiar justo tras el toque
      const text = S.aiGuide || await loadAiGuide();
      if (!text) return toast('No se han podido cargar las instrucciones. Prueba con «Descargar».');
      if (!await copyText(text, 'Instrucciones copiadas: pégalas en tu IA')) toast('No se ha podido copiar. Prueba con «Descargar».');
      return;
    }
    case 'download-ai-guide': {
      const text = await loadAiGuide();
      if (!text) return toast('No se han podido cargar las instrucciones. Revisa la conexión.');
      return download(text, 'FORMATO-IA.md', 'text/markdown;charset=utf-8');
    }
    case 'export-deck': return exportDeck('json');
    case 'export-csv': return exportDeck('csv');
    case 'refresh-explore': S.pub = null; S.builtin = null; return renderExplore();
    case 'add-preview': return addPreview(b);
    case 'save-card-more': return saveCardForm(b.closest('form'), true);
    case 'copy-link': {
      const input = $('#shareUrl');
      try { await navigator.clipboard.writeText(input.value); toast('Enlace copiado'); }
      catch { input.select(); toast('Selecciona el enlace y cópialo'); }
      return;
    }
    case 'toggle-public': {
      const d = S.decks.get(S.deckId);
      b.disabled = true;
      try { const nd = await api.updateDeck(d.id, { is_public: !d.is_public, types: deckTypes(d.id) }); S.decks.set(nd.id, { tags: [], ...nd }); S.pub = null; shareSheet(); renderDeck(); }
      catch (err) { b.disabled = false; fail(err); }
      return;
    }
    case 'ask-delete-deck': return confirmSheet('¿Eliminar este mazo y todas sus tarjetas?', 'delete-deck', 'Eliminar mazo');
    case 'delete-deck': {
      b.disabled = true;
      const folderOfDeleted = S.decks.get(S.deckId)?.folder_id || null;
      try {
        await api.deleteDeck(S.deckId);
        for (const c of cardList()) if (c.deck_id === S.deckId) { S.cards.delete(c.id); S.progress.delete(c.id); }
        S.decks.delete(S.deckId); S.pub = null;
        toast('Mazo eliminado'); return go('decks', { folderId: folderOfDeleted });
      } catch (err) { b.disabled = false; return fail(err); }
    }
    case 'ask-delete-card': {
      const ids = S.edit?.siblings?.length ? S.edit.siblings : [b.closest('form').dataset.id];
      S.deleting = ids;
      return confirmSheet(ids.length > 1 ? `¿Eliminar esta nota y sus ${ids.length} tarjetas?` : '¿Eliminar esta tarjeta?', 'delete-card', 'Eliminar');
    }
    case 'delete-card': {
      const ids = S.deleting || []; b.disabled = true;
      try {
        for (const id of ids) { await api.deleteCard(id); S.cards.delete(id); S.progress.delete(id); }
        if (S.session) { S.session.queue = S.session.queue.filter(x => !ids.includes(x)); S.session.st = null; S.session.revealed = false; }
        toast(ids.length > 1 ? 'Tarjetas eliminadas' : 'Tarjeta eliminada'); closeSheet(); return render();
      } catch (err) { b.disabled = false; return fail(err); }
    }
    case 'reset-card': {
      const id = b.closest('form').dataset.id;
      try { await api.clearProgress(S.uid, id); S.progress.delete(id); toast('Progreso reiniciado'); closeSheet(); return render(); }
      catch (err) { return fail(err); }
    }
    case 'change-pass':
      return openSheet(`<h2>Cambiar contraseña</h2><form data-form="changepass"><label for="cp">Contraseña nueva</label><input id="cp" type="password" autocomplete="new-password" minlength="6" required>
        <div class="btnrow" style="margin-top:14px"><span class="spacer"></span><button type="button" class="ghost" data-act="close-sheet">Cancelar</button><button type="submit" class="primary">Guardar</button></div></form>`);
    case 'ask-reset-local': return confirmSheet('¿Borrar todos los mazos y el progreso de este navegador?', 'reset-local', 'Borrar todo');
    case 'reset-local': {
      api.resetLocal();
      closeSheet(); toast('Datos locales borrados');
      S.uid = null;
      return onSignedIn(await api.auth.session());
    }
    case 'signout': {
      const uid = S.uid;
      try { await api.auth.signOut(); } catch (err) { return fail(err); }
      // La copia para abrir sin conexión no se queda en el dispositivo al cerrar sesión
      deleteSnapshot(uid); forgetUser(); setImageRemote(null);
      return;
    }
  }
});

document.addEventListener('submit', async e => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const kind = form.dataset.form;
  if (['signin', 'signup', 'reset', 'newpass'].includes(kind)) return submitAuth(kind, form);
  if (kind === 'deck') return saveDeckForm(form);
  if (kind === 'number') {
    const st = S.session?.st, c = S.cards.get(S.session?.queue[0]);
    if (!st || !c) return;
    const m = cardModel(c);
    st.number = checkNumber($('#numIn').value, m.fields[m.tpl.answer], m.fields.t);
    return reveal();
  }
  if (kind === 'conj') {
    const st = S.session?.st, c = S.cards.get(S.session?.queue[0]);
    if (!st || !c) return;
    const m = cardModel(c), lang = m.type.fields.find(f => f.id === m.tpl.answer)?.lang || '';
    const rows = parsePairs(m.fields[m.tpl.answer]);
    st.conj = rows.map((r, k) => { const given = form.querySelector(`[data-conj="${k}"]`)?.value || ''; return { given, ...checkTyped(given, r.b, lang) }; });
    return reveal();
  }
  if (kind === 'add-friend') return addFriend($('#frCode').value);
  if (kind === 'folder') return saveFolderForm(form);
  if (kind === 'quick') return saveQuick(form);
  if (kind === 'type') return saveTypeEditor();
  if (kind === 'typed') {
    const st = S.session?.st; const c = S.cards.get(S.session?.queue[0]);
    if (!st || !c) return;
    const m = cardModel(c);
    st.typed = checkTyped($('#typed').value, m.fields[m.tpl.answer], m.type.fields.find(f => f.id === m.tpl.answer)?.lang);
    return reveal();
  }
  if (kind === 'newtag') {
    try { const t = await addTag($('#nt-name').value, $('#nt-color').value); if (t) tagsSheet(); } catch (err) { fail(err); }
    return;
  }
  if (kind === 'card') return S.edit?.sugIndex != null ? saveSugEditor() : saveCardForm(form, false);
  if (kind === 'profile') return saveProfileForm(form);
  if (kind === 'changepass') {
    const v = $('#cp').value;
    if (v.length < 6) return toast('Mínimo 6 caracteres');
    try { await api.auth.updatePassword(v); toast('Contraseña cambiada'); closeSheet(); } catch (err) { fail(err); }
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'typeSearch' && S.edit?.pick) { S.edit.pick.q = e.target.value; return drawTypePicker(); }
  if (e.target.matches?.('.tc')) return saveGrid(e.target.closest('[data-table-ed]').dataset.tableEd);
  if (e.target.matches?.('[data-block-input]')) {
    const t = e.target, b = curPage()?.blocks.find(x => x.id === t.dataset.blockInput);
    // «# », «- », «1. », «[] », «> »… al principio de un párrafo cambian el tipo de bloque
    const sc = b && b.type === 'p' && shortcut(t.value);
    if (sc) return retypeBlock(b, sc.type, sc.text, sc.type === 'todo' ? { checked: sc.checked } : {});
    // «/» en un bloque vacío abre el menú de bloques; lo que se escribe detrás lo filtra
    const m = b && !['code', 'table', 'img'].includes(b.type) && /^\/([^\s/]*)$/.exec(t.value);
    if (m) openBlockMenu({ mode: 'slash', blockId: b.id, q: m[1], anchor: t });
    else if (S.blockMenu?.mode === 'slash') closeBlockMenu();
    autoGrow(t);
    return;
  }
  if (e.target.id === 'pgTitle') {
    const p = curPage();
    if (p) { p.title = e.target.value; savePageSoon(p); const cur = document.querySelector('.pg-top .crumbs .crumb-cur:last-child'); if (cur) cur.textContent = pageTitle(p); }
    return;
  }
  if (e.target.id === 'pageSearch') {
    S.pageQuery = e.target.value;
    const pos = e.target.selectionStart;
    renderNotes();
    const s = $('#pageSearch'); if (s) { s.focus(); s.setSelectionRange(pos, pos); }
    return;
  }
  if (e.target.type === 'range' && e.target.dataset?.pref) { setPref(e.target.dataset.pref, Number(e.target.value)); return prefChanged(e.target.dataset.pref); }
  if (e.target.id === 'cardSearch') {
    S.cardQuery = e.target.value;
    const pos = e.target.selectionStart;
    renderDeck();
    const f = $('#cardSearch'); f.focus(); f.setSelectionRange(pos, pos);
  } else if (e.target.dataset?.fld) {
    S.edit.dirty = true; autoGrow(e.target); readEditor(); drawPreview(); rubyLine(e.target);
  } else if (e.target.id === 'rpIn') {
    const rt = $('#rpRt'); if (rt) rt.textContent = e.target.value;
  } else if (e.target.id === 'c-hint') {
    S.edit.dirty = true; readEditor();
  } else if (e.target.id === 'q-text') {
    drawQuick();
  } else if (e.target.id === 'deckSearch') {
    S.org.query = e.target.value;
    const pos = e.target.selectionStart;
    renderDecks();
    const f = $('#deckSearch'); f.focus(); f.setSelectionRange(pos, pos);
  } else if (e.target.id === 'exploreSearch') {
    S.exploreQuery = e.target.value;
    const pos = e.target.selectionStart;
    renderExplore();
    const f = $('#exploreSearch'); f.focus(); f.setSelectionRange(pos, pos);
  }
});
document.addEventListener('change', async e => {
  if (e.target.matches?.('[data-sug]')) {
    const sgi = S.sug?.list[+e.target.dataset.sug];
    if (sgi) { sgi.selected = e.target.checked; e.target.closest('.sug')?.classList.toggle('on', sgi.selected); }
    const sel = S.sug.list.filter(x => x.selected), n = sel.reduce((k, x) => k + (x.cards || 1), 0), btn = document.querySelector('[data-act="sug-create"]');
    if (btn) { btn.disabled = !n; btn.textContent = n ? `Crear ${plural(n, 'tarjeta', 'tarjetas')}` : 'Marca alguna'; }
    const cnt = $('#sugCount'); if (cnt) cnt.textContent = plural(sel.length, 'marcada', 'marcadas');
    const gh = e.target.closest('.sug-group')?.querySelector('[data-sug-group]');
    if (gh) { const items = S.sug.list.filter(x => (!S.sug.types || S.sug.types.has(x.typeId)) && (gh.dataset.sugGroup === 'rec') === (x.score >= PRESELECT)); gh.textContent = items.every(x => x.selected) ? 'Quitar todas' : 'Marcar todas'; }
    return;
  }
  if (e.target.id === 'sugDeck') {
    // Otro mazo puede cambiar los tipos (los de idiomas) y lo que ya está como tarjeta
    S.sug.deckId = e.target.value;
    S.sug.list = suggestFor(S.pages.get(S.sug.pageId), S.sug.deckId === 'new' ? '' : S.sug.deckId);
    return drawSuggestions();
  }
  if (e.target.id === 'frShare') {
    const on = e.target.checked;
    try { await api.social.setShare(on); S.friends.me.share = on; toast(on ? 'Tus amigos ven tu actividad' : 'Tu actividad ya no se comparte'); }
    catch (err) { e.target.checked = !on; fail(err); }
    return;
  }
  if (e.target.id === 'st-scope' || e.target.id === 'st-mode') {
    S.stats[e.target.id === 'st-scope' ? 'scope' : 'mode'] = e.target.value;
    const y = scrollY; renderStats(); scrollTo(0, y); return;
  }
  if (e.target.id === 'set-new') {
    const n = Math.max(0, Math.min(500, parseInt(e.target.value, 10) || 0));
    e.target.value = n; S.newPerDay = n; return savePrefsSoon();
  }
  if (e.target.dataset?.pref) {
    const el = e.target, path = el.dataset.pref;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.num !== undefined) {
      v = Number(v); if (!Number.isFinite(v)) v = Number(el.min) || 0;
      v = Math.max(Number(el.min), Math.min(Number(el.max), v)); el.value = v;
    }
    setPref(path, v); return prefChanged(path);
  }
  if (e.target.name === 'f-tag' && S.edit?.open) S.edit.dirty = true;
  if (e.target.id === 'pgDeck') { const p = curPage(); if (p) { p.deck_id = e.target.value || null; savePageSoon(p); } }
  if (e.target.id === 'pgFolder') {
    const p = curPage();
    if (p) { p.folder_id = e.target.value || null; savePageSoon(p); $('.pg-top .crumbs').outerHTML = noteCrumbs(pageFolder(p), pageTitle(p)); }
  }
  if (e.target.id === 'noteSort') { S.noteOrg.sort = e.target.value; renderNotes(); }
  if (e.target.id === 'deckSort') { S.org.sort = e.target.value; saveOrgPrefs(); renderDecks(); }
  if (e.target.id === 'c-deck') {
    const d = S.decks.get(e.target.value);
    const ic = e.target.closest('.ed-deck')?.querySelector('.icon, .dot');
    if (ic && d) ic.outerHTML = deckIcon(d);
    if (S.edit) { S.edit.dirty = true; readEditor(); redrawEditorFields(); }
  }
  if (['q-type', 'q-sep'].includes(e.target.id)) drawQuick();
  if (e.target.closest?.('.typeform') && (e.target.matches('select, input[type=checkbox]'))) { readTypeEditor(); const y = $('#sheetBody').scrollTop; drawTypeEditor(); $('#sheetBody').scrollTop = y; }
});
// Arrastrar y soltar (ordenador): un mazo encima de una carpeta o de la ruta
let dragDeck = null;
document.addEventListener('dragstart', e => {
  const li = e.target.closest?.('[data-drag-deck]');
  if (!li) return;
  dragDeck = li.dataset.dragDeck;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragDeck);
  li.classList.add('dragging');
});
document.addEventListener('dragend', () => { dragDeck = null; document.querySelectorAll('.dragging,.drop-ok').forEach(x => x.classList.remove('dragging', 'drop-ok')); });
document.addEventListener('dragover', e => {
  const t = dragDeck && e.target.closest?.('[data-folder]');
  document.querySelectorAll('.drop-ok').forEach(x => { if (x !== t) x.classList.remove('drop-ok'); });
  if (t) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; t.classList.add('drop-ok'); }
});
document.addEventListener('drop', e => {
  const t = dragDeck && e.target.closest?.('[data-folder]');
  if (!t) return;
  e.preventDefault();
  const id = dragDeck; dragDeck = null;
  moveDecks([id], t.dataset.folder || null);
});
document.addEventListener('focusin', e => { if (e.target.matches('[data-fld], #typed, #c-hint')) S.lastField = e.target; });
document.addEventListener('mousedown', e => { if (e.target.closest('[data-char], [data-fmt]')) e.preventDefault(); });
$('#backupFile').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) restoreBackup(f); e.target.value = ''; });
$('#pdfFile').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) importPdf(f); e.target.value = ''; });
$('#importFile').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; });

document.addEventListener('keydown', e => {
  if (e.target.matches?.('[data-block-input]')) return blockKey(e);
  if (e.target.matches?.('.tc')) return tableKey(e);
  if (e.key === 'Enter' && e.target.id === 'f-newtag') { e.preventDefault(); document.querySelector('[data-act="add-tag-inline"]')?.click(); return; }
  if (!$('#sheet').hidden) {
    // Escape o Enter en el buscador de tipos: cerrar el selector o elegir el primero
    if (S.edit?.pick && e.key === 'Escape') { e.preventDefault(); return openTypePicker(false); }
    if (e.target.id === 'rpIn' && (e.key === 'Enter' || e.key === 'Escape')) {
      e.preventDefault();
      if (e.key === 'Enter') return rubyApply();
      const t = S.rubyEdit?.t; rubyClose(); t?.focus(); return;
    }
    if (S.edit?.pick && e.key === 'Enter' && e.target.id === 'typeSearch') { e.preventDefault(); document.querySelector('[data-pick-type]')?.click(); return; }
    if (e.key === 'Escape') requestClose();
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'i') && e.target.matches('.ef-input')) { e.preventDefault(); applyFormat(e.key === 'b' ? 'bold' : 'italic'); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { const f = document.querySelector('#sheetBody form[data-form]'); if (f) { e.preventDefault(); f.requestSubmit(); } }
    return;
  }
  if (S.view !== 'study' || !S.session || e.target.matches('input,textarea,select')) return;
  const ses = S.session; const c = S.cards.get(ses.queue[0]); const mode = c ? cardModel(c).tpl.mode : 'flip';
  if ((e.key === ' ' || e.key === 'Enter') && !ses.revealed && ses.queue.length && ['flip', 'cloze', 'occlusion'].includes(mode)) { e.preventDefault(); reveal(); }
  else if (!ses.revealed && (mode === 'choice' || mode === 'clozechoice') && /^[1-4]$/.test(e.key)) { e.preventDefault(); document.querySelector(`[data-choice="${+e.key - 1}"]`)?.click(); }
  else if (ses.revealed && /^[1-4]$/.test(e.key)) { e.preventDefault(); grade(Number(e.key)); }
});

/* ===================== sugerir tarjetas ===================== */
// Lo que ya hay como tarjeta (para no proponerlo otra vez): las de este apunte y las del mazo elegido
function suggestFor(p, deckId) {
  const existing = cardList().filter(c => c.page_id === p.id || (deckId && c.deck_id === deckId));
  return suggestCards(p, { lang: deckId ? deckLang(deckId) : '', native: nativeLang(), existing });
}
function openSuggestions() {
  const p = curPage();
  if (!p) return;
  const open = document.querySelector('[data-block-input]');
  if (open) commitBlockEl(open);
  const deckId = p.deck_id && S.decks.has(p.deck_id) ? p.deck_id : '';
  S.sug = { pageId: p.id, deckId: deckId || (S.decks.size ? [...S.decks.values()].find(d => !d.archived)?.id || '' : 'new'), list: [], types: null, showMore: null, scroll: 0 };
  S.sug.list = suggestFor(p, S.sug.deckId === 'new' ? '' : S.sug.deckId);
  drawSuggestions();
}
function drawSuggestions() {
  const g = S.sug, p = S.pages.get(g?.pageId);
  if (!g || !p) return;
  const list = g.list;
  const picked = list.filter(x => x.selected);
  const nCards = picked.reduce((n, x) => n + (x.cards || 1), 0);
  // Filtro por tipo de tarjeta
  const typeIds = [...new Set(list.map(x => x.typeId))];
  const visible = list.filter(x => !g.types || g.types.has(x.typeId));
  const rec = visible.filter(x => x.score >= PRESELECT), more = visible.filter(x => x.score < PRESELECT);
  if (g.showMore == null) g.showMore = rec.length < 5;
  const deckSel = `<select id="sugDeck" aria-label="Mazo donde se crean">${[...S.decks.values()].filter(d => !d.archived).map(d => `<option value="${d.id}" ${d.id === g.deckId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
    <option value="new" ${g.deckId === 'new' ? 'selected' : ''}>+ Mazo nuevo: «${esc(pageTitle(p).slice(0, 60))}»</option></select>`;
  // Cada sugerencia, como una fila de la lista de un mazo (con su casilla para crearla o no)
  const row = x => {
    const i = list.indexOf(x), t = getType(x.typeId);
    const where = x.section && x.section !== pageTitle(p) ? x.section.split(' › ').at(-1) : '';
    return `<li class="sug${x.selected ? ' on' : ''}"><label class="sug-check" title="${x.selected ? 'Se creará' : 'No se creará'}"><input type="checkbox" data-sug="${i}" ${x.selected ? 'checked' : ''} aria-label="Crear esta tarjeta"></label>
      <button class="row" data-sug-open="${i}" title="Ver y editar"><span class="f">${fmt(x.front)}</span><span class="b">${fmt(x.back)}</span>
        <span class="rmeta"><span class="tchip">${typeIcon(t, 13)} ${esc(t?.name || '')}</span>${x.cards > 1 ? `<span class="muted small">· ${x.cards} tarjetas</span>` : ''}${where ? `<span class="muted small">· ${esc(where)}</span>` : ''}</span></button></li>`;
  };
  const group = (title, items, key) => items.length ? `<div class="sug-group">
    <div class="sug-gh"><h3>${title} <span class="muted">· ${items.length}</span></h3>
      <button type="button" class="link small" data-sug-group="${key}">${items.every(x => x.selected) ? 'Quitar todas' : 'Marcar todas'}</button></div>
    <ul class="list sug-list">${items.map(row).join('')}</ul></div>` : '';
  const body = !list.length
    ? `<div class="sug-empty"><p><b>No he encontrado nada claro que convertir en tarjetas.</b></p>
        <p class="muted">Las sugerencias salen de cómo están escritos los apuntes. Prueba a:</p>
        <ul class="muted"><li>escribir definiciones así: <code>Mitosis: división de una célula…</code></li><li>poner en <b>negrita</b> lo importante</li>
        <li>usar tablas y listas con un título encima («Fases de…», «Las causas son:»)</li></ul>
        <p class="muted">También puedes seleccionar cualquier texto del apunte y pulsar «Crear tarjeta».</p></div>`
    : `<div class="sug-filters" role="group" aria-label="Filtrar por tipo de tarjeta">${typeIds.map(id => { const t = getType(id); return `<button type="button" class="chip-btn" data-sug-type="${id}" aria-pressed="${!g.types || g.types.has(id)}">${typeIcon(t, 14)} ${esc(t?.name || id)} <span>${list.filter(x => x.typeId === id).length}</span></button>`; }).join('')}</div>
       ${group('Recomendadas', rec, 'rec')}
       ${more.length ? (g.showMore ? group('Otras posibles', more, 'more') + (rec.length >= 5 ? '<button type="button" class="link sug-toggle" data-act="sug-more">Ocultar las otras posibles</button>' : '')
         : `<button type="button" class="ghost sug-toggle" data-act="sug-more">Ver ${plural(more.length, 'otra posible', 'otras posibles')}</button>`) : ''}
       ${!visible.length ? '<p class="muted">Ninguna sugerencia de estos tipos.</p>' : ''}`;
  openSheet(`<div class="sug-wrap">
    <header class="ed-top"><button type="button" class="ed-x" data-act="close-sheet" aria-label="Cerrar">${icon('x', { size: 20 })}</button>
      <div class="ed-title"><span>Tarjetas sugeridas</span><small class="muted">${esc(pageTitle(p))}</small></div><span></span></header>
    <div class="sug-main" id="sugMain">
      ${list.length ? `<p class="sug-intro">He encontrado <b>${plural(list.length, 'posible tarjeta', 'posibles tarjetas')}</b> en tus apuntes. Las recomendadas ya están marcadas. Toca una para verla y editarla.</p>
      <div class="sug-deck"><label for="sugDeck">Crear en</label>${deckSel}</div>` : ''}
      ${body}
    </div>
    ${list.length ? `<footer class="ed-foot"><span class="muted small" id="sugCount">${plural(picked.length, 'marcada', 'marcadas')}</span><span class="spacer"></span>
      <button type="button" class="primary" data-act="sug-create" ${nCards ? '' : 'disabled'}>${nCards ? `Crear ${plural(nCards, 'tarjeta', 'tarjetas')}` : 'Marca alguna'}</button></footer>` : ''}
  </div>`, { full: true });
  if (g.scroll) { const m = $('#sugMain'); if (m) m.scrollTop = g.scroll; g.scroll = 0; }
}
const sugScroll = () => { const m = $('#sugMain'); if (m && S.sug) S.sug.scroll = m.scrollTop; };
function redrawSuggestions() { sugScroll(); drawSuggestions(); }
// Editar una sugerencia: el mismo editor que «+ Tarjeta», relleno con su tipo y sus campos
function openSugEditor(i) {
  const g = S.sug, x = g?.list[i];
  if (!x) return;
  sugScroll();
  const deckId = g.deckId !== 'new' && S.decks.has(g.deckId) ? g.deckId : [...S.decks.keys()][0];
  cardForm(null, { deckId, prefill: { typeId: x.typeId, fields: { ...x.fields }, hint: x.hint || '' }, source: { page_id: g.pageId, block_id: x.blockId }, sugIndex: i });
}
function saveSugEditor() {
  const e = readEditor(), g = S.sug, x = g?.list[e.sugIndex];
  if (!x) return;
  const type = getType(e.typeId) || BUILTIN_TYPES[0];
  const fields = {};
  for (const f of type.fields) fields[f.id] = String(e.fields[f.id] || '').trim();
  const active = activeTemplates(typeIn(type, $('#c-deck')?.value), fields);
  if (!active.length) return toast(`Falta ${missingFor(type, type.templates[0], fields)}`);
  const sum = summarize(type, active[0], fields);
  Object.assign(x, { typeId: type.id, fields, front: sum.front, back: sum.back, cards: active.length, selected: true, hint: (e.hint || '').trim() });
  e.dirty = false;
  closeSheet();
  toast('Sugerencia guardada');
}
function readSugEdit() {}
async function createSuggested(btn) {
  const g = S.sug, p = S.pages.get(g?.pageId);
  if (!g || !p) return;
  readSugEdit();
  const picked = g.list.filter(s => s.selected);
  if (!picked.length) return;
  btn.disabled = true; btn.textContent = 'Creando…';
  try {
    let deckId = g.deckId;
    if (deckId === 'new') {
      const deck = await api.createDeck({ owner: S.uid, name: pageTitle(p).slice(0, 80) || 'Apuntes', description: '', source: 'apuntes', folder_id: p.folder_id || null });
      S.decks.set(deck.id, { tags: [], ...deck });
      deckId = deck.id;
    }
    const base = Date.now() / 1000, rows = [];
    for (const [i, s] of picked.entries()) {
      const type = typeIn(getType(s.typeId), deckId);
      const note = api.newId();
      for (const t of activeTemplates(type, s.fields)) {
        const sum = summarize(type, t, s.fields);
        rows.push({ deck_id: deckId, owner: S.uid, front: sum.front.slice(0, 2000) || '—', back: sum.back.slice(0, 2000) || '—', note: sum.note.slice(0, 2000),
          position: base + i / 1000 + rows.length / 1e6, note_id: note, type_id: s.typeId, template: t.id, fields: s.fields, hint: s.hint || '', tags: [], page_id: p.id, block_id: s.blockId });
      }
    }
    const made = await api.createCards(rows);
    for (const c of made) S.cards.set(c.id, c);
    if (!p.deck_id) { p.deck_id = deckId; savePageSoon(p, 0); }
    migrateDeckLangs();
    S.sug = null;
    closeSheet();
    toast(`${plural(made.length, 'tarjeta creada', 'tarjetas creadas')} en «${S.decks.get(deckId)?.name || 'el mazo'}»`);
    if (S.view === 'page') renderPage();
  } catch (e) { btn.disabled = false; btn.textContent = 'Crear'; fail(e); }
}

/* ===================== amigos ===================== */
// Se cargan aparte de lo demás (no retrasan la app) y se refrescan como mucho una vez por minuto
const FR = () => S.friends || (S.friends = { me: null, list: [], requests: [], cheers: [], loaded: false, missing: false, error: '', at: 0 });
async function loadFriends(force = false) {
  if (!api.social || !S.uid || S.fromCache) return;
  const f = FR();
  if (!force && f.at && Date.now() - f.at < 60e3) return;
  f.at = Date.now();
  try {
    const [me, list, requests, cheers] = await Promise.all([api.social.me(), api.social.summary(dateKey()), api.social.requests(), api.social.cheers()]);
    Object.assign(f, { me, list: list || [], requests: requests || [], cheers: cheers || [], missing: false, error: '' });
  } catch (e) {
    if (api.social.isMissingFn(e)) f.missing = true; else f.error = errMsg(e);
  }
  f.loaded = true;
  friendsChanged();
}
// Repinta lo que muestra amigos (la pantalla de amigos, la tarjeta de Inicio y el aviso en Perfil)
function friendsChanged() {
  if (S.view === 'friends') return renderFriends();
  const el = $('#homeFriends');
  if (el && S.view === 'home') el.outerHTML = homeFriendsHTML();
  const badge = $('#frBadge');
  if (badge) { const n = incoming().length; badge.textContent = n; badge.hidden = !n; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadFriends(); });
const incoming = () => (S.friends?.requests || []).filter(r => r.dir === 'in');
const myWeek = () => weekDays().map(k => S.log[k] || 0);
// Ánimos ya mandados hoy (para no ofrecer otro al mismo amigo)
function cheeredToday() {
  try { const c = JSON.parse(localStorage.getItem('flaski-cheered') || 'null'); return c?.day === dateKey() ? new Set(c.ids) : new Set(); } catch { return new Set(); }
}
function markCheered(id) {
  const ids = cheeredToday(); ids.add(id);
  try { localStorage.setItem('flaski-cheered', JSON.stringify({ day: dateKey(), ids: [...ids] })); } catch {}
}
const avatar = (name, me = false) => `<span class="fr-av${me ? ' me' : ''}" aria-hidden="true">${esc(initial(name))}</span>`;
const langNames = langs => (langs || []).map(b => LANGS.find(l => baseLang(l.id) === b)?.label.split(' (')[0] || b);

// Barras de la semana (lunes a domingo); hoy, marcado
function weekBars(week) {
  const max = Math.max(1, ...week.map(n => Number(n) || 0)), today = (new Date().getDay() + 6) % 7;
  return `<div class="fr-week" aria-label="Repasos de esta semana">${week.map((n, i) => `<span class="fr-day${i === today ? ' today' : ''}${n ? ' on' : ''}" title="${WEEK_LETTERS[i]}: ${plural(n || 0, 'repaso', 'repasos')}">
    <i style="height:${n ? Math.max(12, Math.round((n / max) * 100)) : 0}%"></i><small>${WEEK_LETTERS[i]}</small></span>`).join('')}</div>`;
}

// Tarjeta de Inicio: ánimos recibidos y la clasificación de la semana
function homeFriendsHTML() {
  const f = S.friends;
  if (!api.social || !f?.loaded || f.missing || !S.prefs.home.friends) return '<div id="homeFriends"></div>';
  const cheers = f.cheers.length ? (() => {
    const names = [...new Set(f.cheers.map(c => c.name || 'Alguien'))];
    const who = names.length > 2 ? `${names.slice(0, 2).join(', ')} y ${names.length - 2} más` : names.join(' y ');
    return `<div class="cheer-banner" role="status"><span class="cheer-emo" aria-hidden="true">👏</span><span><b>${esc(who)}</b> ${names.length > 1 ? 'te animan' : 'te anima'} a seguir estudiando</span><button class="ghost small-btn" data-act="cheers-seen">Gracias</button></div>`;
  })() : '';
  const shared = f.list.filter(x => x.shared);
  if (!f.list.length) {
    return `<div id="homeFriends">${cheers}<section class="chart-card fr-home-empty"><div class="chart-h"><h2>Estudia con amigos</h2></div>
      <p class="muted small">Invita a alguien y veréis vuestras rachas y quién repasa más cada semana.</p>
      <button class="ghost small-btn" data-nav="friends">${icon('users', { size: 16 })} Invitar a un amigo</button></section></div>`;
  }
  const me = { id: S.uid, name: S.name || 'Tú', week: myWeek(), streak: streaks(S.log).current, me: true, shared: true };
  const rows = ranking(me, shared).map(p => `<li class="${p.me ? 'me' : ''}"><span class="rk-pos">${p.pos}</span>${avatar(p.name, p.me)}
    <span class="rk-name">${p.me ? 'Tú' : esc(p.name)}</span>
    <span class="rk-streak" title="Racha">${icon('fire', { size: 14 })}${p.streak || 0}</span>
    <span class="rk-total"><b>${p.total}</b> <small>${p.total === 1 ? 'repaso' : 'repasos'}</small></span></li>`).join('');
  return `<div id="homeFriends">${cheers}<section class="chart-card" aria-labelledby="h-rank">
    <div class="chart-h"><h2 id="h-rank">Esta semana</h2><button class="link small" data-nav="friends">Amigos</button></div>
    <ol class="rank">${rows}</ol>
    <p class="muted small rk-foot">Se reinicia cada lunes.</p></section></div>`;
}

function renderFriends() {
  const head = `<nav class="crumbs" aria-label="Ruta"><button class="crumb" data-nav="profile">Perfil</button><span class="sep" aria-hidden="true">/</span><span class="crumb crumb-cur">Amigos</span></nav><h1>Amigos</h1>`;
  if (!api.social) {
    main.innerHTML = `${head}<div class="panel"><p>Para tener amigos necesitas una cuenta.</p>
      <p class="muted small">Ahora estás en modo local: tus datos están solo en este navegador. Conecta la app a Supabase (ver README) para crear cuentas.</p></div>`;
    return;
  }
  const f = FR();
  if (!f.loaded && S.fromCache) { main.innerHTML = `${head}<div class="panel"><p>Sin conexión. Tus amigos aparecerán cuando vuelva la red.</p></div>`; return; }
  if (!f.loaded) { loadFriends(true); main.innerHTML = `${head}<div class="empty"><div class="spin" aria-label="Cargando"></div></div>`; return; }
  if (f.missing) {
    main.innerHTML = `${head}<div class="panel"><h2>Falta un paso</h2><p>Para usar amigos, ejecuta otra vez <b>supabase/schema.sql</b> en Supabase (SQL Editor → New query → Run).</p>
      <button class="ghost" data-act="friends-reload">Ya lo he hecho</button></div>`;
    return;
  }
  if (!f.me) {
    main.innerHTML = `${head}<div class="panel"><p>${esc(f.error || 'No se han podido cargar tus amigos.')}</p><button class="ghost" data-act="friends-reload">Reintentar</button></div>`;
    return;
  }
  const cheered = cheeredToday();
  const inc = incoming(), out = f.requests.filter(r => r.dir === 'out'), blocked = f.requests.filter(r => r.dir === 'blocked');
  const card = p => {
    const total = weekTotal(p.week);
    const langs = langNames(p.langs);
    return `<li class="fr-card">
      <div class="fr-top">${avatar(p.name)}<div class="fr-who"><b>${esc(p.name || 'Sin nombre')}</b>
        ${p.shared ? `<span class="fr-meta"><span class="fr-streak">${icon('fire', { size: 14 })} ${plural(p.streak, 'día', 'días')}</span>
          <span class="${p.today ? 'fr-today' : 'muted'}">${p.today ? `${icon('check', { size: 13 })} Hoy, ${plural(p.today, 'repaso', 'repasos')}` : 'Hoy aún no ha estudiado'}</span></span>`
          : '<span class="fr-meta muted">No comparte su actividad</span>'}</div>
        <button type="button" class="iconbtn" data-friend-menu="${p.id}" aria-label="Opciones de ${esc(p.name)}" title="Opciones">${icon('ellipsis', { size: 18 })}</button></div>
      ${p.shared ? `${weekBars(p.week)}<div class="fr-foot"><span class="muted small">${plural(total, 'repaso', 'repasos')} esta semana${langs.length ? ` · ${esc(langs.join(', '))}` : ''}</span>
        <button type="button" class="ghost small-btn" data-cheer="${p.id}" ${cheered.has(p.id) ? 'disabled' : ''}>${cheered.has(p.id) ? 'Ánimo enviado' : '👏 Animar'}</button></div>` : ''}
    </li>`;
  };
  const link = inviteLink(f.me.code);
  main.innerHTML = `${head}
    <section class="panel fr-invite">
      <h2>Invita a tus amigos</h2>
      <p class="muted small">Pásales tu enlace o tu código. Cuando lo acepten, veréis vuestras rachas y los repasos de la semana; nunca vuestros mazos ni apuntes.</p>
      <div class="fr-code"><span class="muted small">Tu código</span><b id="frMyCode">${esc(formatCode(f.me.code))}</b></div>
      <div class="btnrow"><button class="primary" data-act="fr-share" data-link="${esc(link)}">${icon('share', { size: 16 })} Compartir enlace</button>
        <button class="ghost" data-act="fr-copy-code">${icon('copy', { size: 16 })} Copiar código</button></div>
      <form data-form="add-friend" class="fr-add" autocomplete="off"><label for="frCode">Añadir con el código de un amigo</label>
        <div class="fr-addrow"><input id="frCode" placeholder="XXXX-XXXX" maxlength="12" autocapitalize="characters" spellcheck="false"><button class="ghost" type="submit">Añadir</button></div></form>
    </section>
    ${inc.length ? `<div class="section-h"><h2>Peticiones</h2></div><ul class="list fr-reqs">${inc.map(r => `<li class="fr-req">${avatar(r.name)}<span><b>${esc(r.name || 'Alguien')}</b> <span class="muted small">quiere ser tu amigo</span></span>
      <span class="btnrow"><button class="primary small-btn" data-fr-accept="${r.id}">Aceptar</button><button class="ghost small-btn" data-fr-reject="${r.id}">Rechazar</button></span></li>`).join('')}</ul>` : ''}
    <div class="section-h"><h2>Tus amigos${f.list.length ? ` · ${f.list.length}` : ''}</h2></div>
    ${f.list.length ? `<ul class="fr-list">${[...f.list].sort((a, b) => weekTotal(b.week) - weekTotal(a.week)).map(card).join('')}</ul>`
      : '<p class="muted">Aún no tienes amigos en Flaski. Comparte tu enlace para empezar.</p>'}
    ${out.length ? `<div class="section-h"><h2>Enviadas</h2></div><ul class="list fr-reqs">${out.map(r => `<li class="fr-req">${avatar(r.name)}<span><b>${esc(r.name || 'Alguien')}</b> <span class="muted small">pendiente</span></span>
      <span class="btnrow"><button class="ghost small-btn" data-fr-cancel="${r.other}">Cancelar</button></span></li>`).join('')}</ul>` : ''}
    <section class="panel fr-privacy"><h2>Privacidad</h2>
      <div class="set-row"><div class="set-l"><b id="frShareL">Compartir mi actividad</b><small>Tus amigos ven tu racha, tus repasos de la semana y los idiomas que estudias.</small></div>
        <div class="set-c"><label class="switch"><input type="checkbox" role="switch" id="frShare" aria-labelledby="frShareL" ${f.me.share ? 'checked' : ''}><span class="slider" aria-hidden="true"></span></label></div></div>
      ${blocked.length ? `<p class="small" style="margin-bottom:4px"><b>Bloqueados</b></p><ul class="list fr-reqs">${blocked.map(r => `<li class="fr-req">${avatar(r.name)}<span>${esc(r.name || 'Alguien')}</span>
        <span class="btnrow"><button class="ghost small-btn" data-fr-unblock="${r.other}">Desbloquear</button></span></li>`).join('')}</ul>` : ''}
    </section>`;
  loadFriends();
}
// Acciones de amigos: cada una llama a Supabase y vuelve a cargar la lista
async function friendAction(fn, ok) {
  try { await fn(); if (ok) toast(ok); } catch (e) { return fail(e); }
  await loadFriends(true);
}
const ADD_MSG = {
  sent: 'Petición enviada. Cuando la acepte, aparecerá en tu lista.', accepted: '¡Ya sois amigos!', already: 'Ya sois amigos',
  pending: 'Ya le habías enviado una petición', self: 'Ese es tu propio código', not_found: 'No hay nadie con ese código', blocked: 'No se puede añadir a esa persona',
};
async function addFriend(raw) {
  const code = cleanCode(raw);
  if (!code) return toast('El código tiene 8 letras o números, como ABCD-1234');
  try { const r = await api.social.request(code); toast(ADD_MSG[r] || 'Hecho'); } catch (e) { return fail(e); }
  const inp = $('#frCode'); if (inp) inp.value = '';
  await loadFriends(true);
}
function friendMenu(id) {
  const p = S.friends?.list.find(x => x.id === id);
  if (!p) return;
  openSheet(`<h2>${esc(p.name || 'Amigo')}</h2>
    <p class="muted small">Amigos desde el ${new Date(p.since).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
    <div class="btnrow" style="flex-direction:column;align-items:stretch">
      <button class="ghost" data-fr-remove="${p.id}">Quitar de amigos</button>
      <button class="ghost danger" data-fr-block="${p.id}">Bloquear</button>
      <button class="primary" data-act="close-sheet">Cerrar</button></div>
    <p class="muted small">Si lo bloqueas, deja de ver tu actividad y no puede volver a pedirte amistad.</p>`);
}
// Al abrir un enlace de invitación
function inviteSheet(code) {
  if (!api.social) return toast('Para añadir amigos necesitas una cuenta');
  openSheet(`<h2>Te han invitado a Flaski</h2>
    <p>Alguien quiere estudiar contigo. Si aceptas, os aparecerá la racha y los repasos de la semana del otro.</p>
    <p class="muted small">Código de la invitación: <b>${esc(formatCode(code))}</b></p>
    <div class="btnrow"><span class="spacer"></span><button class="ghost" data-act="close-sheet">Ahora no</button><button class="primary" data-act="fr-accept-invite" data-code="${esc(code)}">Aceptar la invitación</button></div>`);
}

/* ===================== arranque ===================== */
(async function boot() {
  document.title = APP_NAME;
  applySavedLook();
  initChartTips();
  loadOrgPrefs();
  $('#appName').textContent = APP_NAME;
  const m = location.hash.match(/^#d-([0-9a-f-]{36})$/i);
  if (m) S.pendingShare = m[1];
  const inv = parseInvite(location.hash);
  if (inv) { S.pendingFriend = inv; history.replaceState(null, '', location.pathname + location.search); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  if (api.mode === 'local') {
    const b = $('#banner');
    b.innerHTML = icon('lightbulb', { size: 18 }) + '<span><b>Modo local.</b> Tus datos se guardan solo en este navegador. Para tener cuentas y compartir con amigos, rellena <code>js/config.js</code> (ver README).</span>';
    return onSignedIn(await api.auth.session());
  }
  api.auth.onChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { S.recovery = true; render(); if (session) onSignedIn(session); return; }
    if (session) return onSignedIn(session);
    // Sin conexión la sesión puede no poder renovarse: eso no es cerrar sesión
    if (event !== 'SIGNED_OUT' && (S.fromCache || !navigator.onLine)) return;
    if (event === 'SIGNED_OUT' || S.uid) onSignedOut();
    else render();
  });
  let session = null, netErr = false;
  try { session = await api.auth.session(); }
  catch (e) { if (!isOffline(e)) { render(); return fail(e); } netErr = true; }
  // Sin conexión: se entra con la última cuenta usada aquí, si tiene copia guardada
  if (!session && (netErr || !navigator.onLine)) {
    const u = lastUser();
    if (u && await loadSnapshot(u.id)) session = { user: u, offline: true };
  }
  if (session) await onSignedIn(session); else render();
})();
