// Flaski · lógica de la interfaz
// Estructura: estado (S) → funciones render*() que pintan cada vista → manejadores de eventos.
import * as api from './api.js';
import { toRow } from './rows.js';
import { schedule, fmtWhen, startOfDay, dateKey, DAY, GRADES, ALGO_PRESETS, DEFAULT_ALGO } from './srs.js';
import { DEFAULT_PREFS, loadPrefs, algoFor, applyLook, applySavedLook, ACCENTS, FONTS, CARD_SIZES, ALGO_FIELDS } from './prefs.js';
import { statsView, drawStats } from './stats.js';
import { APP_NAME } from './config.js';
import { cardsFromCSV, cardsToCSV } from './csv.js';
import { heatmap, forecast, maturity, streaks, initChartTips, scrollChartsToEnd } from './charts.js';
import { mountEmojiPicker } from './emoji-picker.js';
import { icon } from './icons.js';
import { BUILTIN_TYPES, MODES, LANGS, CLOZE_RE, RUBY_RE, NEEDS_ANSWER, stripRuby, isCJK, orderTokens, orderJoin, activeTemplates, summarize, missingFor, legacyFields, splitQuick, checkTyped, choiceOptions, blankType, copyType, nextId } from './cardtypes.js';
import { speak, stopSpeaking, ttsAvailable, setBaseRate } from './tts.js';
import { charsOf, canQuiz, startQuiz, startCanvas, animateChars } from './handwriting.js';
import { COLORS, SORTS, colorVar, folderPath, folderTree, decksInFolder, sortDecks, matchesDeck } from './org.js';
import { saveSnapshot, loadSnapshot, deleteSnapshot, rememberUser, lastUser, forgetUser } from './snapshot.js';
import { isRetryable } from './outbox.js';
import { isNotesDeck, notesToDeck, parsePasted } from './notes.js';

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
  lastField: null,
  fromCache: false,            // datos cargados de la copia del navegador (se abrió sin conexión)
  pending: 0,                  // cambios esperando a enviarse
};

/* ===================== utilidades ===================== */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Formato sencillo: *cursiva*, **negrita** y saltos de línea
// Formato sencillo: *cursiva*, **negrita**, saltos de línea y furigana 漢字[かんじ]
function fmt(s) {
  return esc(s).replace(RUBY_RE, '<ruby>$1<rt>$2</rt></ruby>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/\n/g, '<br>');
}
const plain = s => String(s ?? '').replace(/\*/g, '');
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
function scopeName(scope = 'all') {
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
  const ids = scopeDecks(scope);
  const now = Date.now();
  let due = 0, fresh = 0, total = 0, mature = 0;
  const freshBy = new Map();
  for (const c of S.cards.values()) {
    if (!ids.has(c.deck_id)) continue;
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
  closeSheet();
  render();
  window.scrollTo(0, 0);
}
function render() {
  const authed = !!S.uid && !S.recovery;
  $('#nav').hidden = !authed || S.view === 'study';
  document.body.classList.toggle('no-nav', $('#nav').hidden);
  for (const b of document.querySelectorAll('[data-nav]')) {
    const cur = b.dataset.nav === S.view || (b.dataset.nav === 'decks' && S.view === 'deck') || (b.dataset.nav === 'profile' && S.view === 'settings');
    if (cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  $('#banner').hidden = !(api.mode === 'local' && S.view === 'home');
  if (S.recovery) return renderNewPassword();
  if (!S.uid) return renderAuth();
  if (S.loading) { main.innerHTML = '<div class="empty"><div class="spin" aria-label="Cargando"></div><p class="muted">Cargando tus tarjetas…</p></div>'; return; }
  ({ home: renderHome, study: renderStudy, decks: renderDecks, deck: renderDeck, explore: renderExplore, profile: renderProfile, stats: renderStats, settings: renderSettings }[S.view] || renderHome)();
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
    if (!S.fromCache) saveSnap();
    if (S.pendingShare) { const id = S.pendingShare; S.pendingShare = null; S.view = 'explore'; render(); openPublicPreview(id); return; }
    render();
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
  for (const { op, args } of ops) {
    if (op === 'saveProgress') prog.set(args[1], toRow(args[0], args[1], args[2]));
    else if (op === 'clearProgress') prog.delete(args[1]);
    else if (op === 'addEvent') evs.set(args[0].id, args[0]);
    else if (op === 'deleteEvent') evs.delete(args[0]);
    // bumpLog(uid, día, +1, total local de ese momento): el total ya incluye la respuesta
    else if (op === 'bumpLog' && args[2] > 0) log.set(args[1], Math.max(log.get(args[1]) || 0, args[3] || 0));
    else if (op === 'saveSettings') settings = { new_per_day: args[1], prefs: args[2] ?? settings?.prefs };
  }
  return {
    ...d, settings, progress: [...prog.values()],
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
    applyData(withPending(d)); S.fromCache = false; netState(); saveSnap(); render();
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
  Object.assign(S, { uid: null, email: '', name: '', decks: new Map(), folders: new Map(), tags: new Map(), types: new Map(), cards: new Map(), progress: new Map(), log: {}, events: [], view: 'home', folderId: null, session: null, pub: null, loading: true, authMode: 'signin', fromCache: false, pending: 0 });
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
// Tipo, plantilla y campos de una tarjeta (las antiguas, sin campos, se leen como «Básica»)
function cardModel(c) {
  const hasFields = c.fields && typeof c.fields === 'object' && Object.keys(c.fields).length;
  const type = (hasFields && getType(c.type_id)) || BUILTIN_TYPES[0];
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
  if (tpl.mode === 'cloze') front = `<div class="fld fld-main fld-cloze"><div class="fld-v"><span class="fld-t">${clozeHTML(val(tpl.front[0]), st.revealed)}</span>${say(tpl.front[0])}</div></div>`;
  else front = tpl.front.map((id, i) => block(id, i === 0)).join('');
  if (tpl.hideRuby && !st.revealed) front = `<div class="ruby-hide">${front}</div>`;

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
        : `<div class="verdict bad"><div class="vrow"><span class="vl">Tu respuesta</span><span class="diff">${r.diff.filter(x => x.t !== 'miss').map(x => `<span class="d-${x.t}">${esc(x.c)}</span>`).join('') || '<i>(vacía)</i>'}</span></div>
          <div class="vrow"><span class="vl">Correcta</span><span class="diff">${r.diff.filter(x => x.t !== 'extra').map(x => `<span class="d-${x.t === 'miss' ? 'need' : 'ok'}">${esc(x.c)}</span>`).join('')}</span></div></div>`;
    }
  }
  if (tpl.mode === 'choice' && st.choice) {
    const c = st.choice;
    ask = `<div class="choices">${c.opts.map((o, i) => {
      let cls = '';
      if (st.revealed) cls = o === c.correct ? ' right' : i === c.picked ? ' wrong' : ' dim';
      return `<button type="button" class="choice${cls}" data-choice="${i}" ${st.revealed || preview ? 'disabled' : ''}><span class="ckey">${i + 1}</span><span>${fmt(o)}</span></button>`;
    }).join('')}</div>`;
  }

  if (tpl.mode === 'order') {
    const o = st.order || { tokens: orderTokens(val(tpl.answer)).map((t, i) => ({ t, i })), picked: [] };
    const chip = (tok, attr) => `<button type="button" class="ochip" ${attr} ${preview || st.revealed ? 'disabled' : ''}>${esc(tok.t)}</button>`;
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
    else if (tpl.mode === 'cloze' || tpl.mode === 'choice') answer = tpl.back.map(id => block(id, false)).join('');
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
  const P = S.prefs.study, ids = scopeDecks(scope), now = Date.now();
  const pool = cardList().filter(c => ids.has(c.deck_id));
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
      <div class="btnrow" style="justify-content:center"><button class="primary" data-act="exit">Volver al inicio</button><button class="ghost" data-act="more">10 nuevas más</button></div>
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
    const suggest = st.typed ? (st.typed.ok ? 3 : 1)
      : st.choice && st.choice.picked >= 0 ? (st.choice.opts[st.choice.picked] === st.choice.correct ? 3 : 1)
      : st.order?.checked ? (st.order.ok ? 3 : 1)
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
    <div class="studyfoot"><span class="keys"${S.prefs.study.shortcuts ? '' : ' hidden'}>${model.tpl.mode === 'flip' || model.tpl.mode === 'cloze' ? 'Espacio: mostrar · ' : model.tpl.mode === 'choice' ? '1-4: elegir · ' : ''}1-4: valorar</span><span class="btnrow">${ses.undo ? '<button class="link" data-act="undo">Deshacer</button>' : ''}<button class="link" data-card="${id}">Editar tarjeta</button></span></div>`;
  if (!st.played) {
    st.played = true;
    if (model.tpl.mode === 'listen') { if (S.prefs.study.autoplay) playListen(model, 1); }
    else speakFields(model, model.tpl.mode === 'cloze' ? [] : model.tpl.front);
  }
  if (!ses.revealed && model.tpl.mode === 'draw') mountDraw(st, model);
  if (ses.revealed && !st.playedBack) { st.playedBack = true; speakFields(model, revealIds(model.tpl)); }
  if (!ses.revealed && model.tpl.mode === 'type' && matchMedia('(hover:hover)').matches) $('#typed')?.focus();
}
function reveal() {
  const ses = S.session;
  if (!ses || ses.revealed) return;
  const st = ses.st;
  if (st) {
    st.draw?.stop?.();
    const c = S.cards.get(ses.queue[0]);
    if (c && cardModel(c).tpl.mode === 'draw' && !st.drawn) st.drawn = { gaveUp: true };
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
    return `<li><button class="deck folder" data-folder="${f.id}">${folderIcon(f)}
      <span class="info"><span class="dname">${esc(f.name)}</span><span class="meta">${plural(inside, 'mazo', 'mazos')} · ${fc.due + fc.newToday} pendientes</span></span>
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
      <div class="btnrow">${tagChips(d.tags)}<span class="chip">${c.total} ${c.total === 1 ? 'tarjeta' : 'tarjetas'}</span><span class="chip">${c.due} por repasar${c.dueAll > c.due ? ` (+${c.dueAll - c.due} tras el límite)` : ''}</span>${d.pinned ? '<span class="chip">Fijado</span>' : ''}${d.archived ? '<span class="chip">Archivado</span>' : ''}${d.is_public ? '<span class="chip">Compartido</span>' : ''}</div></div>
    <div class="btnrow">
      <button class="primary" data-start="${d.id}" ${c.due + c.newToday ? '' : 'disabled'}>Estudiar</button>
      <button class="ghost" data-act="new-card">+ Tarjeta</button>
      <button class="ghost" data-act="quick-add">Crear varias</button>
      <button class="ghost" data-act="share">Compartir</button>
      <button class="ghost" data-act="move-deck">Mover</button>
      <button class="ghost" data-act="edit-deck">Editar</button>
      <button class="ghost" data-stats="${d.id}">${icon('chart-column', { size: 16 })} Estadísticas</button>
    </div>
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
    S.preview = { name: d.name, description: d.description, cards: d.cards, types: d.types || [], source: 'compartido:' + d.id };
    showPreview(`de ${esc(d.author)}`);
  } catch (e) { closeSheet(); fail(e); }
}
async function openBuiltinPreview(file) {
  openSheet('<div class="spin" aria-label="Cargando"></div>');
  try {
    if (!/^[\w.-]+\.json$/.test(file)) throw new Error('Archivo no válido');
    const d = parseDeckFile(await (await fetch('decks/' + file)).json());
    S.preview = { ...d, source: 'incluido:' + file };
    showPreview('incluido en la app');
  } catch (e) { closeSheet(); fail(e); }
}
function showPreview(byline) {
  const p = S.preview;
  const sample = p.cards.slice(0, 6).map(c => `<li><span>${fmt(c.front)}</span><b>${fmt(c.back)}</b></li>`).join('');
  openSheet(`<h2>${esc(p.name)}</h2><p class="muted small">${p.cards.length} tarjetas · ${byline}</p>
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
    const { deck, cards: made } = await api.importDeck(S.uid, { ...p, cards, typeMap });
    S.decks.set(deck.id, { tags: [], ...deck });
    for (const c of made) S.cards.set(c.id, c);
    toast(`«${deck.name}» añadido`);
    go('deck', { deckId: deck.id, cardQuery: '' });
  } catch (e) { btn.disabled = false; btn.textContent = 'Añadir a mis mazos'; fail(e); }
}

/* ===================== perfil ===================== */
function renderProfile() {
  const total = S.cards.size;
  let learned = 0;
  for (const p of S.progress.values()) if (p.interval >= 21) learned++;
  main.innerHTML = `<h1>Perfil</h1>
    <p class="muted">${total} ${total === 1 ? 'tarjeta' : 'tarjetas'} en ${S.decks.size} ${S.decks.size === 1 ? 'mazo' : 'mazos'} · ${S.progress.size} empezadas · ${learned} consolidadas</p>
    <ul class="list linklist">
      <li><button class="row-link" data-nav="settings">${icon('settings', { size: 20 })}<span><b>Ajustes</b><small>Estudio, ritmo de repaso, apariencia, inicio y copias de seguridad</small></span>${icon('chevron-right', { size: 18, cls: 'chev' })}</button></li>
      <li><button class="row-link" data-nav="stats">${icon('chart-column', { size: 20 })}<span><b>Estadísticas</b><small>Gráficos con filtros por periodo, mazo y tipo de tarjeta</small></span>${icon('chevron-right', { size: 18, cls: 'chev' })}</button></li>
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
      ${setRow('Mezcla', 'Cómo se combinan las nuevas con los repasos.', seg('study.mix', [['mixed', 'Mezcladas'], ['reviewsFirst', 'Repasos primero'], ['newFirst', 'Nuevas primero']]))}`, 's-study')}
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
      ${setRow('Lista de mazos', 'Tus mazos con lo que toca hoy en cada uno.', sw('home.decks'))}`, 's-home')}
    ${setSec('brain', 'Ritmo de repaso', `
      <p class="muted small set-intro">Decide cada cuánto vuelven las tarjetas. Si no sabes qué elegir, deja «${esc(ALGO_PRESETS.standard?.label || 'Estándar')}». Cada mazo puede usar otro ritmo en sus opciones.</p>
      <div class="presets" role="group" aria-label="Ritmo de repaso">${presets.map(([k, v]) => `<button type="button" class="preset" data-preset="${k}" aria-pressed="${P.algo.preset === k}"><b>${v.label}</b><small>${v.help}</small></button>`).join('')}</div>
      <div class="algo-pv"><span class="muted small">Si aciertas siempre con «Bien», una tarjeta nueva vuelve a los:</span><b id="algoPv">${algoPreview(A)}</b></div>
      <details class="opts" ${P.algo.preset === 'custom' ? 'open' : ''}><summary>${icon('sliders-horizontal', { size: 16 })} Parámetros avanzados${P.algo.preset === 'custom' ? '' : ' (elige «Personalizado» para editarlos)'}</summary>
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
  if (path.startsWith('algo.')) { const pv = $('#algoPv'); if (pv) pv.textContent = algoPreview(algoFor(S.prefs, null)); }
  if (path === 'home.forecast') $('#row-fcdays')?.classList.toggle('is-off', !S.prefs.home.forecast);
  savePrefsSoon();
}
// Copia v2: lo mismo en los dos modos y con los identificadores originales, para que al restaurar
// se reconozca lo que ya está. En modo local lleva además el volcado completo del navegador.
function backupData() {
  const deckOut = d => ({
    id: d.id, name: d.name, description: d.description || '', source: d.source || '', icon: d.icon || '', color: d.color || '',
    options: d.options || {}, folder_id: d.folder_id || null, pinned: !!d.pinned, archived: !!d.archived, tags: d.tags || [], types: deckTypes(d.id),
    cards: cardList().filter(c => c.deck_id === d.id).sort((a, b) => a.position - b.position)
      .map(c => ({ id: c.id, front: c.front, back: c.back, note: c.note || '', type_id: c.type_id || 'basic', template: c.template || 't1', fields: c.fields || {}, note_id: c.note_id || null, hint: c.hint || '', tags: c.tags || [], position: c.position })),
  });
  return {
    format: 'flaski-backup', version: 2, exported: new Date().toISOString(), mode: api.mode,
    settings: { new_per_day: S.newPerDay, prefs: S.prefs },
    folders: [...S.folders.values()].map(({ id, parent_id, name, icon, color, position }) => ({ id, parent_id: parent_id || null, name, icon: icon || '', color: color || '', position })),
    tags: [...S.tags.values()].map(({ id, name, color }) => ({ id, name, color })),
    decks: [...S.decks.values()].map(deckOut),
    progress: [...S.progress].map(([id, p]) => { const { user_id, ...r } = toRow(S.uid, id, p); return r; }),
    events: S.events.map(({ t, user_id, ...e }) => e),
    log: Object.entries(S.log).map(([day, count]) => ({ day, count })),
    local: api.dumpLocal(),
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
  // Progreso e historial de cada tarjeta de la copia
  const progressBy = new Map((data.progress || []).filter(p => p?.card_id).map(p => [p.card_id, p]));
  const eventsBy = new Map();
  for (const e of data.events || []) if (e?.card_id) (eventsBy.get(e.card_id) || eventsBy.set(e.card_id, []).get(e.card_id)).push(e);

  for (const d of data.decks || []) {
    const name = str(d?.name || 'Mazo', 80);
    try {
      if (await existingId(d.id, id => S.decks.has(id))) { rep.skipped.push(name); continue; }
      const typeMap = await adoptTypes(d.types || []);
      const deck = await createKeepingId(api.createDeck, {
        owner: uid, name, description: str(d.description, 300), source: str(d.source || 'copia', 200), icon: str(d.icon, 16), color: str(d.color, 16),
        options: obj(d.options), folder_id: folderMap.get(d.folder_id) || null, pinned: !!d.pinned, archived: !!d.archived, tags: tagsOf(d.tags),
      }, d.id);
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
          });
        }
        if (rows.length) await api.createCards(rows);
        const prog = [], evs = [];
        for (const [old, id] of cardMap) {
          const p = progressBy.get(old);
          if (p && p.due) prog.push({ user_id: uid, card_id: id, reps: Number(p.reps) || 0, interval: Number(p.interval) || 0, ease: Number(p.ease) || 2.5, lapses: Number(p.lapses) || 0, due: p.due, first_seen: p.first_seen || p.due, last: p.last || p.due });
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
  // Registro diario: el máximo de cada día, para no borrar actividad más reciente que la copia
  try { await api.mergeLog(uid, data.log || []); } catch (e) { rep.failed.push(['Registro diario', errMsg(e)]); }
  return rep;
}
function restoreReport({ restored, skipped, failed }) {
  const sec = (title, items) => items.length ? `<h3>${title}</h3><p class="muted small">${items.map(esc).join(' · ')}</p>` : '';
  openSheet(`<h2>Copia restaurada</h2>
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
function closeSheet() { $('#sheet').hidden = true; $('#sheetBody').innerHTML = ''; $('#sheet').classList.remove('sheet-full'); if (S.edit) S.edit.open = false; }
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

function deckForm(d) {
  const folderDefault = d ? d.folder_id : (S.view === 'decks' ? S.folderId : null);
  openSheet(`<h2>${d ? 'Editar mazo' : 'Nuevo mazo'}</h2>
    <form data-form="deck" data-id="${d ? d.id : ''}">
      <label for="d-name">Nombre</label><input id="d-name" maxlength="80" required value="${esc(d?.name || '')}">
      <label for="d-desc">Descripción (opcional)</label><textarea id="d-desc" rows="2" maxlength="300">${esc(d?.description || '')}</textarea>
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
  const parentDefault = f ? f.parent_id : S.folderId;
  openSheet(`<h2>${f ? 'Editar carpeta' : 'Nueva carpeta'}</h2>
    <form data-form="folder" data-id="${f ? f.id : ''}">
      <label for="fo-name">Nombre</label><input id="fo-name" maxlength="80" required value="${esc(f?.name || '')}">
      <label>Icono</label>${iconPicker(f?.icon)}
      <label>Color de la carpeta</label>${colorPicker(f?.color)}
      <label for="fo-parent">Dentro de</label>${folderSelect('fo-parent', parentDefault || '', f?.id, 'Ninguna (en «Mis mazos»)')}
      <div class="btnrow" style="margin-top:14px">${f ? '<button type="button" class="ghost danger" data-act="ask-delete-folder">Eliminar carpeta</button>' : ''}<span class="spacer"></span>
        <button type="button" class="ghost" data-act="close-sheet">Cancelar</button><button type="submit" class="primary">Guardar</button></div>
      ${f ? '<p class="hint">Al eliminarla, sus mazos y subcarpetas no se borran: pasan a la carpeta de arriba.</p>' : ''}
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
function typeOptions(selected) {
  const own = [...S.types.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const opt = t => `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${esc(t.icon ? t.icon + ' ' : '')}${esc(t.name)}</option>`;
  return `<optgroup label="Incluidos">${BUILTIN_TYPES.map(opt).join('')}</optgroup>${own.length ? `<optgroup label="Tus tipos">${own.map(opt).join('')}</optgroup>` : ''}`;
}
function deckOptions(selected) {
  return sortDecks([...S.decks.values()], 'name', new Map()).map(d => `<option value="${d.id}" ${d.id === selected ? 'selected' : ''}>${esc(d.icon ? d.icon + ' ' : '')}${esc(d.name)}${d.archived ? ' (archivado)' : ''}</option>`).join('');
}
function lastTypeFor(deckId) {
  try { return JSON.parse(localStorage.getItem('flaski-last-type') || '{}')[deckId] || null; } catch { return null; }
}
function rememberType(deckId, typeId) {
  try { const m = JSON.parse(localStorage.getItem('flaski-last-type') || '{}'); m[deckId] = typeId; localStorage.setItem('flaski-last-type', JSON.stringify(m)); } catch {}
}
/* ===================== editor de tarjetas ===================== */
// Qué papel tiene cada campo en las tarjetas que se generan (para orientarte mientras escribes)
function fieldRoles(type, id) {
  const r = new Set();
  for (const t of type.templates) {
    if (t.mode === 'cloze' && t.front[0] === id) r.add('huecos');
    else if (t.front.includes(id)) r.add('anverso');
    if (t.answer === id) r.add(t.mode === 'draw' ? 'a mano' : t.mode === 'listen' ? 'dictado' : t.mode === 'order' ? 'ordenar' : 'respuesta');
    else if (t.back.includes(id)) r.add('reverso');
  }
  return [...r];
}
function requiredField(type, id) {
  return type.templates.some(t => t.front[0] === id || t.answer === id);
}
function fieldPlaceholder(f, type) {
  const roles = fieldRoles(type, f.id);
  if (roles.includes('huecos')) return 'Escribe el texto y marca los huecos con {{ }}';
  if (roles.includes('ordenar')) return 'La frase en orden correcto. Piezas separadas por espacios o «/»';
  return requiredField(type, f.id) ? `Escribe ${f.name.toLowerCase()}…` : 'Opcional';
}
function fieldInputs(type, values) {
  return type.fields.map(f => {
    const roles = fieldRoles(type, f.id);
    const req = requiredField(type, f.id);
    const lang = f.lang ? LANGS.find(l => l.id === f.lang)?.label || f.lang : '';
    const help = f.help || (f.lang?.startsWith('ja') ? 'Furigana: selecciona el kanji y pulsa 振 en la barra, o escribe 漢字[かんじ].' : '');
    return `<div class="ef${req ? ' ef-req' : ''}" data-ef="${f.id}">
      <div class="ef-head">
        <label class="ef-name" for="fld-${f.id}">${esc(f.name)}${req ? '<span class="ef-dot" title="Necesario" aria-label="necesario">•</span>' : ''}</label>
        <span class="ef-badges">${roles.map(r => `<span class="ef-role r-${r.replace(/\s/g, '')}">${r}</span>`).join('')}${lang ? `<span class="ef-lang">${esc(lang)}</span>` : ''}</span>
        ${f.lang && ttsAvailable() ? `<button type="button" class="ef-say" data-say-input="${f.id}" aria-label="Escuchar ${esc(f.name)}" title="Escuchar">${SPEAK_ICON}</button>` : ''}
      </div>
      <textarea id="fld-${f.id}" class="ef-input" data-fld="${f.id}" rows="1" maxlength="2000" ${f.lang ? `lang="${f.lang}"` : ''} placeholder="${esc(fieldPlaceholder(f, type))}">${esc(values[f.id] || '')}</textarea>
      ${help ? `<p class="ef-help">${esc(help)}</p>` : ''}
    </div>`;
  }).join('');
}
function typeChips(selected) {
  const chip = t => `<button type="button" class="tchip-big" role="radio" aria-checked="${t.id === selected}" data-set-type="${t.id}" title="${esc(t.description || '')}">
      <span class="tci">${typeIcon(t, 24)}</span><span>${esc(t.name)}</span></button>`;
  const own = [...S.types.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return `${[...BUILTIN_TYPES, ...own].map(chip).join('')}
    <button type="button" class="tchip-big tchip-add" data-act="manage-types"><span class="tci">${icon('plus', { size: 22 })}</span><span>Tipos…</span></button>`;
}
const TOOLBAR = () => `<div class="ed-tools" role="toolbar" aria-label="Formato">
  <button type="button" data-fmt="bold" title="Negrita (Ctrl+B)" aria-label="Negrita"><b>B</b></button>
  <button type="button" data-fmt="italic" title="Cursiva (Ctrl+I)" aria-label="Cursiva"><i>I</i></button>
  <button type="button" data-fmt="cloze" title="Convertir en hueco {{ }}" aria-label="Hueco">{{&thinsp;}}</button>
  <button type="button" data-fmt="ruby" title="Añadir furigana al kanji seleccionado" aria-label="Furigana" lang="ja">振</button>
  <button type="button" data-fmt="slash" title="Separar piezas con /" aria-label="Separador de piezas">/</button>
  <span class="ed-sep" aria-hidden="true"></span>
  ${CHARS.map(ch => `<button type="button" data-char="${ch}" aria-label="Insertar ${ch}">${ch}</button>`).join('')}
</div>`;

function cardForm(c, { deckId: forcedDeck, prefill = null } = {}) {
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
    const t = getType(lastTypeFor(deckId)) || BUILTIN_TYPES[0];
    model = { type: t, tpl: t.templates[0], fields: {} };
  }
  S.edit = { open: true, dirty: false, cardId: c?.id || null, noteId: c?.note_id || null, siblings: siblings.map(x => x.id), typeId: model.type.id,
    fields: { ...model.fields }, pv: model.tpl.id, pvSide: 'front', hint: prefill?.hint ?? c?.hint ?? '', tags: prefill?.tags ?? c?.tags ?? [] };
  const p = c && S.progress.get(c.id);
  const deck = S.decks.get(deckId);
  openSheet(`<form data-form="card" data-id="${c ? c.id : ''}" class="ed" autocomplete="off">
    <header class="ed-top">
      <button type="button" class="ed-x" data-act="close-sheet" aria-label="Cerrar">${icon('x', { size: 20 })}</button>
      <div class="ed-title"><span>${c ? 'Editar tarjeta' : 'Nueva tarjeta'}</span>
        <label class="ed-deck" title="Mazo">${deck ? deckIcon(deck) : ''}<select id="c-deck" aria-label="Mazo">${deckOptions(deckId)}</select></label></div>
      <button type="submit" class="primary ed-save">Guardar</button>
    </header>
    <div class="ed-discard" id="edDiscard" hidden role="alert"><span>Tienes cambios sin guardar.</span>
      <button type="button" class="ghost small-btn" data-act="discard-edit">Descartar</button><button type="button" class="primary small-btn" data-act="keep-edit">Seguir editando</button></div>
    <div class="ed-body">
      <section class="ed-main">
        <input type="hidden" id="c-type" value="${model.type.id}">
        <div class="ed-types" role="radiogroup" aria-label="Tipo de tarjeta">${typeChips(model.type.id)}</div>
        <p class="ed-typedesc" id="typeDesc">${esc(model.type.description || '')}</p>
        <div id="fieldsBox" class="ed-fields">${fieldInputs(model.type, model.fields)}</div>
        ${TOOLBAR()}
        <div class="ed-props">
          <div class="prop"><span class="prop-k">${icon('lightbulb', { size: 16 })} Pista</span><input id="c-hint" class="prop-v" maxlength="500" value="${esc(S.edit.hint)}" placeholder="Vacío · se puede ver antes de responder"></div>
          <div class="prop prop-tags"><span class="prop-k">${icon('tag', { size: 16 })} Etiquetas</span><div class="prop-v">${tagPicker(S.edit.tags)}</div></div>
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
    <footer class="ed-foot">
      ${c ? `<button type="button" class="ghost danger small-btn" data-act="ask-delete-card">Eliminar</button>
        <button type="button" class="ghost small-btn" data-act="dup-card">Duplicar</button>
        ${p ? '<button type="button" class="ghost small-btn" data-act="reset-card">Reiniciar progreso</button>' : ''}` : ''}
      <span class="spacer"></span>
      ${c ? '' : '<button type="button" class="ghost" data-act="save-card-more">Guardar y otra</button>'}
      <button type="submit" class="primary">Guardar</button>
    </footer>
  </form>`, { full: true });
  document.querySelectorAll('.ef-input').forEach(autoGrow);
  drawPreview();
  const chip = document.querySelector('.tchip-big[aria-checked="true"]');
  if (chip) { const row = chip.parentElement; row.scrollLeft = chip.getBoundingClientRect().left - row.getBoundingClientRect().left - 12; }
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
  S.edit.typeId = nt.id; S.edit.dirty = true;
  $('#c-type').value = nt.id;
  document.querySelectorAll('[data-set-type]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.setType === nt.id)));
  $('#fieldsBox').innerHTML = fieldInputs(nt, S.edit.fields);
  $('#typeDesc').textContent = nt.description || '';
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
  else if (kind === 'ruby') {
    if (!sel || !/^[㐀-鿿豈-﫿々]+$/.test(sel)) return toast('Selecciona primero el kanji (sin kana)');
    t.value = t.value.slice(0, z) + '[]' + t.value.slice(z);
    t.focus(); t.selectionStart = t.selectionEnd = z + 1;
    toast('Escribe la lectura entre los corchetes');
  } else if (kind === 'slash') {
    t.value = t.value.slice(0, a) + ' / ' + t.value.slice(z);
    t.focus(); t.selectionStart = t.selectionEnd = a + 3;
  }
  S.edit.dirty = true;
  autoGrow(t); readEditor(); drawPreview();
}
function readEditor() {
  const e = S.edit;
  document.querySelectorAll('[data-fld]').forEach(t => { e.fields[t.dataset.fld] = t.value; });
  if ($('#c-hint')) e.hint = $('#c-hint').value;
  return e;
}
function drawPreview() {
  const e = S.edit, box = $('#pvBody');
  if (!e || !box) return;
  const type = getType(e.typeId) || BUILTIN_TYPES[0];
  const active = activeTemplates(type, e.fields);
  const tpls = type.templates;
  if (!tpls.some(t => t.id === e.pv)) e.pv = (active[0] || tpls[0]).id;
  const isActive = t => active.some(a => a.id === t.id);
  $('#pvTabs').innerHTML = tpls.length > 1 ? tpls.map(t => `<button type="button" class="pvtab${isActive(t) ? '' : ' off'}" data-pv="${t.id}" aria-pressed="${t.id === e.pv}" title="${isActive(t) ? 'Se creará' : 'Faltan campos para crear esta tarjeta'}">${isActive(t) ? icon('check', { size: 13 }) + ' ' : ''}${esc(t.name)}</button>`).join('') : '';
  $('#pvCount').textContent = active.length ? `${active.length} ${active.length === 1 ? 'tarjeta' : 'tarjetas'}` : 'Faltan campos';
  const tpl = tpls.find(t => t.id === e.pv);
  const model = { type, tpl, fields: e.fields };
  const st = { revealed: e.pvSide === 'back', typed: null, choice: null };
  if (tpl.mode === 'choice') {
    const pool = cardList().filter(x => x.deck_id === $('#c-deck')?.value).map(x => x.back).filter(Boolean);
    while (pool.length < 3) pool.push(`Otra opción ${pool.length + 1}`);
    st.choice = { ...choiceOptions(tpl, e.fields, pool), picked: -1 };
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
  fields.options = { ...(S.decks.get(id)?.options || {}), newPerDay: nv === '' ? null : Math.max(0, Math.min(500, Math.round(Number(nv) || 0))), preset: $('#d-preset').value };
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
    go('decks', { folderId: f.id });
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
  await api.deleteFolder(id);
  S.folders.delete(id);
}
// Guarda una nota: crea, actualiza o borra sus tarjetas según las plantillas que tengan contenido
async function saveNote({ type, fields, deckId, hint = '', tags = [], noteId = null, siblings = [] }) {
  const active = activeTemplates(type, fields);
  if (!active.length) throw new Error(type.templates.some(t => t.mode === 'cloze') ? 'Marca al menos un hueco con {{ }}' : 'Rellena al menos el anverso y la respuesta');
  noteId = noteId || api.newId();
  const existing = siblings.map(id => S.cards.get(id)).filter(Boolean);
  const byTpl = new Map(existing.map(c => [c.template || 't1', c]));
  const base = { deck_id: deckId, type_id: type.id, fields, hint, tags, note_id: noteId };
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
      noteId: e.noteId, siblings: e.siblings,
    });
    rememberType(deckId, type.id);
    if (S.session) S.session.st = null;
    toast(e.cardId ? 'Tarjeta guardada' : out.length > 1 ? `${out.length} tarjetas añadidas` : 'Tarjeta añadida');
    if (more) { S.edit.dirty = false; cardForm(null, { deckId }); if (S.view === 'deck') renderDeck(); setTimeout(() => document.querySelector('[data-fld]')?.focus(), 40); }
    else { S.edit.dirty = false; closeSheet(); render(); }
  } catch (err) { btns.forEach(b => { b.disabled = false; }); fail(err); }
}

/* ---------- Creación rápida: pegar una lista ---------- */
function quickSheet() {
  const deckId = S.deckId;
  const t = getType(lastTypeFor(deckId)) || BUILTIN_TYPES[0];
  openSheet(`<h2>Crear varias tarjetas</h2>
    <p class="muted small">Pega una lista con una tarjeta por línea. Cada columna rellena un campo, en orden.</p>
    <form data-form="quick" class="cardform">
      <div class="two">
        <div><label for="q-type">Tipo de tarjeta</label><select id="q-type">${typeOptions(t.id)}</select></div>
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
  const row = (t, own) => `<li class="typerow"><span class="icon">${typeIcon(t, 20)}</span>
    <span class="info"><span class="dname">${esc(t.name)}</span><span class="meta">${esc(t.description || `${t.fields.length} campos · ${t.templates.length} ${t.templates.length === 1 ? 'tarjeta' : 'tarjetas'} por nota`)}</span></span>
    ${own ? `<button class="ghost small-btn" data-edit-type="${t.id}">Editar</button>` : `<button class="ghost small-btn" data-copy-type="${t.id}">Personalizar</button>`}</li>`;
  const own = [...S.types.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  openSheet(`<h2>Tipos de tarjeta</h2>
    <p class="muted small">Un tipo define qué campos rellenas y qué tarjetas se crean con ellos. Personaliza uno incluido o crea el tuyo desde cero.</p>
    ${own.length ? `<h3 class="sub-h">Tus tipos</h3><ul class="typelist">${own.map(t => row(t, true)).join('')}</ul>` : ''}
    <h3 class="sub-h">Incluidos</h3><ul class="typelist">${BUILTIN_TYPES.map(t => row(t, false)).join('')}</ul>
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
      <p class="hint">Lo que rellenarás en cada nota. Si eliges un idioma, el campo tendrá botón de audio.</p>
      <ol class="tfields">${t.fields.map((f, i) => `<li data-fi="${i}">
        <input class="tf-name" value="${esc(f.name)}" maxlength="40" aria-label="Nombre del campo ${i + 1}">
        <select class="tf-lang" aria-label="Idioma del audio">${LANGS.map(l => `<option value="${l.id}" ${l.id === f.lang ? 'selected' : ''}>${l.label}</option>`).join('')}</select>
        <label class="tf-auto" title="Reproducir solo al aparecer"><input type="checkbox" class="tf-autoplay" ${f.autoplay ? 'checked' : ''} ${f.lang ? '' : 'disabled'}>Auto</label>
        <span class="tf-btns"><button type="button" class="iconbtn" data-fmove="${i}:-1" aria-label="Subir" ${i ? '' : 'disabled'}>${icon('arrow-up', { size: 15 })}</button><button type="button" class="iconbtn" data-fmove="${i}:1" aria-label="Bajar" ${i < t.fields.length - 1 ? '' : 'disabled'}>${icon('arrow-down', { size: 15 })}</button><button type="button" class="iconbtn danger" data-fdel="${i}" aria-label="Quitar campo" ${t.fields.length > 1 ? '' : 'disabled'}>${icon('x', { size: 15 })}</button></span>
      </li>`).join('')}</ol>
      <button type="button" class="ghost small-btn" data-act="add-field">+ Campo</button>

      <h3 class="sub-h">2 · Tarjetas que se crean</h3>
      <p class="hint">Cada una genera una tarjeta por nota. Por ejemplo, una de «turco → español» y otra de «español → turco».</p>
      <div class="ttpls">${t.templates.map((tpl, i) => `<fieldset class="ttpl" data-ti="${i}">
        <div class="two"><div><label>Nombre</label><input class="tt-name" value="${esc(tpl.name)}" maxlength="60"></div>
          <div><label>Cómo se estudia</label><select class="tt-mode">${MODES.map(m => `<option value="${m.id}" ${m.id === tpl.mode ? 'selected' : ''}>${m.label}</option>`).join('')}</select></div></div>
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
async function adoptTypes(types = []) {
  const map = new Map();
  for (const t of types || []) {
    if (!t || !Array.isArray(t.fields) || !Array.isArray(t.templates) || BUILTIN_TYPES.some(b => b.id === t.id)) continue;
    const same = [...S.types.values()].find(x => x.name === t.name && JSON.stringify(x.fields) === JSON.stringify(t.fields) && JSON.stringify(x.templates) === JSON.stringify(t.templates));
    if (same) { map.set(t.id, same.id); continue; }
    const created = await api.createType({ owner: S.uid, name: String(t.name || 'Tipo').slice(0, 60), icon: String(t.icon || '').slice(0, 16), description: String(t.description || '').slice(0, 300), fields: t.fields, templates: t.templates });
    S.types.set(created.id, created);
    map.set(t.id, created.id);
  }
  return map;
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
  return { name: String(data.name || 'Mazo importado').slice(0, 80), description: String(data.description || '').slice(0, 300), cards, types: Array.isArray(data.types) ? data.types : [] };
}
async function importFile(file) {
  try {
    const text = await file.text();
    const baseName = file.name.replace(/\.(flaski\.json|kartlar\.json|json|csv|tsv|txt)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Mazo importado';
    // .csv y .tsv siempre como CSV; lo demás puede ser JSON (también entre ```json, como lo dan las IAs)
    const parsed = /\.(csv|tsv)$/i.test(file.name) ? { kind: 'csv', text } : parsePasted(text);
    previewImport(parsed, { source: 'archivo', baseName });
  } catch (e) { toast(e.message || 'No se pudo leer el archivo'); }
}
function download(text, filename, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function exportDeck(kind) {
  const d = S.decks.get(S.deckId);
  const cards = cardList().filter(c => c.deck_id === d.id).sort((a, b) => a.position - b.position)
    .map(c => ({ front: c.front, back: c.back, note: c.note || '' }));
  const slug = d.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'mazo';
  if (kind === 'csv') return download(cardsToCSV(cards), slug + '.csv', 'text/csv;charset=utf-8');
  const full = cardList().filter(c => c.deck_id === d.id).sort((a, b) => a.position - b.position)
    .map(c => ({ front: c.front, back: c.back, note: c.note || '', type_id: c.type_id || 'basic', template: c.template || 't1', fields: c.fields || {}, note_id: c.note_id || null, hint: c.hint || '' }));
  const data = { format: 'flaski-deck', version: 2, name: d.name, description: d.description || '', types: deckTypes(d.id), cards: full };
  download(JSON.stringify(data, null, 2), slug + '.flaski.json', 'application/json');
}

/* ===================== eventos ===================== */
document.addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b) {
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
  if (ds.sayInput) { const t = getType(S.edit?.typeId); speak($('#fld-' + ds.sayInput).value, t?.fields.find(f => f.id === ds.sayInput)?.lang); return; }
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
      S.org.tagIds = S.org.tagIds.filter(x => x !== id);
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
      download(JSON.stringify(backupData(), null, 1), `flaski-copia-${day}.json`, 'application/json');
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
    case 'exit': S.session = null; return go('home');
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
      const parent = S.folders.get(S.folderId)?.parent_id || null;
      try { await deleteFolder(S.folderId); toast('Carpeta eliminada'); return go('decks', { folderId: parent && S.folders.has(parent) ? parent : null }); }
      catch (err) { b.disabled = false; return fail(err); }
    }
    case 'manage-tags': return tagsSheet();
    case 'quick-add': return quickSheet();
    case 'manage-types': S.typeEdit = null; return typesSheet();
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
      deleteSnapshot(uid); forgetUser();
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
  if (kind === 'folder') return saveFolderForm(form);
  if (kind === 'quick') return saveQuick(form);
  if (kind === 'type') return saveTypeEditor();
  if (kind === 'typed') {
    const st = S.session?.st; const c = S.cards.get(S.session?.queue[0]);
    if (!st || !c) return;
    const m = cardModel(c);
    st.typed = checkTyped($('#typed').value, m.fields[m.tpl.answer]);
    return reveal();
  }
  if (kind === 'newtag') {
    try { const t = await addTag($('#nt-name').value, $('#nt-color').value); if (t) tagsSheet(); } catch (err) { fail(err); }
    return;
  }
  if (kind === 'card') return saveCardForm(form, false);
  if (kind === 'profile') return saveProfileForm(form);
  if (kind === 'changepass') {
    const v = $('#cp').value;
    if (v.length < 6) return toast('Mínimo 6 caracteres');
    try { await api.auth.updatePassword(v); toast('Contraseña cambiada'); closeSheet(); } catch (err) { fail(err); }
  }
});

document.addEventListener('input', e => {
  if (e.target.type === 'range' && e.target.dataset?.pref) { setPref(e.target.dataset.pref, Number(e.target.value)); return prefChanged(e.target.dataset.pref); }
  if (e.target.id === 'cardSearch') {
    S.cardQuery = e.target.value;
    const pos = e.target.selectionStart;
    renderDeck();
    const f = $('#cardSearch'); f.focus(); f.setSelectionRange(pos, pos);
  } else if (e.target.dataset?.fld) {
    S.edit.dirty = true; autoGrow(e.target); readEditor(); drawPreview();
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
document.addEventListener('change', e => {
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
  if (e.target.id === 'deckSort') { S.org.sort = e.target.value; saveOrgPrefs(); renderDecks(); }
  if (e.target.id === 'c-deck') {
    const d = S.decks.get(e.target.value);
    const ic = e.target.closest('.ed-deck')?.querySelector('.icon, .dot');
    if (ic && d) ic.outerHTML = deckIcon(d);
    if (S.edit) S.edit.dirty = true;
    drawPreview();
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
$('#importFile').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; });

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'f-newtag') { e.preventDefault(); document.querySelector('[data-act="add-tag-inline"]')?.click(); return; }
  if (!$('#sheet').hidden) {
    if (e.key === 'Escape') requestClose();
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'i') && e.target.matches('.ef-input')) { e.preventDefault(); applyFormat(e.key === 'b' ? 'bold' : 'italic'); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { const f = document.querySelector('#sheetBody form[data-form]'); if (f) { e.preventDefault(); f.requestSubmit(); } }
    return;
  }
  if (S.view !== 'study' || !S.session || e.target.matches('input,textarea,select')) return;
  const ses = S.session; const c = S.cards.get(ses.queue[0]); const mode = c ? cardModel(c).tpl.mode : 'flip';
  if ((e.key === ' ' || e.key === 'Enter') && !ses.revealed && ses.queue.length && (mode === 'flip' || mode === 'cloze')) { e.preventDefault(); reveal(); }
  else if (!ses.revealed && mode === 'choice' && /^[1-4]$/.test(e.key)) { e.preventDefault(); document.querySelector(`[data-choice="${+e.key - 1}"]`)?.click(); }
  else if (ses.revealed && /^[1-4]$/.test(e.key)) { e.preventDefault(); grade(Number(e.key)); }
});

/* ===================== arranque ===================== */
(async function boot() {
  document.title = APP_NAME;
  applySavedLook();
  initChartTips();
  loadOrgPrefs();
  $('#appName').textContent = APP_NAME;
  const m = location.hash.match(/^#d-([0-9a-f-]{36})$/i);
  if (m) S.pendingShare = m[1];
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
