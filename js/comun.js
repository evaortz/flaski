// Flaski · estado compartido (S) y utilidades comunes de la interfaz (sale de app.js)
import { startOfDay, dateKey } from './srs.js';
import { loadPrefs, algoFor } from './prefs.js';
import { deckState, shares, allocate, examFloors } from './plan.js';
import { icon } from './icons.js';
import { colorVar, decksInFolder } from './org.js';
import { hydrate, stripImages } from './media.js';
import { toHTML, toPlain } from './inline.js';
import { pageTitle, sectionIds } from './pages.js';

export const $ = s => document.querySelector(s);
export const main = $('#main');
// Dónde pinta una pantalla de la Biblioteca: en su sección si se está en ella; si no, en todo #main

export const S = {
  uid: null, email: '', name: '',
  newPerDay: 15,
  decks: new Map(),      // id → lista
  folders: new Map(),    // id → carpeta
  tags: new Map(),       // id → etiqueta
  types: new Map(),      // id → tipo de pregunta personalizado
  cards: new Map(),      // id → pregunta
  progress: new Map(),   // cardId → srs (ms)
  log: {},               // 'YYYY-MM-DD' → nº de repasos
  events: [],            // cada respuesta (para Estadísticas)
  prefs: loadPrefs(),    // Ajustes
  stats: { period: 30, scope: 'all', mode: '', fcDays: 30 },
  view: 'home', deckId: null, folderId: null, session: null,
  extra: (() => { try { return JSON.parse(localStorage.getItem('flaski-extra') || 'null'); } catch { return null; } })(),   // «10 nuevas más» de hoy
  // Opciones de la vista «Mis mazos» (se recuerdan en este navegador)
  org: { query: '', tagIds: [], sort: 'manual', layout: 'grid', archived: false },
  cardQuery: '', exploreQuery: '',
  pub: null, builtin: null,   // cachés de Explorar
  authMode: 'signin', recovery: false, loading: true,
  pendingShare: null,          // id de lista compartida por enlace
  pendingFriend: '',           // código de un enlace de invitación de amistad
  friends: null,               // amigos: { me, list, requests, cheers, … } (se cargan aparte)
  lastField: null,
  pages: new Map(),            // id → página de apuntes
  pagesMissing: false,         // la tabla de apuntes aún no existe en Supabase
  pageId: null, pageQuery: '', focusBlock: null,
  noteFolder: null,                              // carpeta abierta (la misma que folderId en la Biblioteca)
  libKind: 'all',                                // dentro de una carpeta: todo, apuntes, listas o subcarpetas
  noteOrg: { tagIds: [], sort: 'recent' },       // filtros y orden de la lista de apuntes
  fromCache: false,            // datos cargados de la copia del navegador (se abrió sin conexión)
  pending: 0,                  // cambios esperando a enviarse
};

/* ===================== utilidades ===================== */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Formato: **negrita**, *cursiva*, <u>subrayado</u>, colores… (ver inline.js), saltos de línea, furigana
// 漢字[かんじ] e imágenes ![pie](img:id) (las imágenes se cargan después: ver hydrate en media.js)
export const imgHTML = (id, alt = '') => `<img class="media" data-img="${id}" alt="${alt}" loading="lazy" decoding="async">`;
export const fmt = s => toHTML(s);
// Cada vez que se pinta algo con imágenes, se cargan (del navegador o de la nube)
let hydrateQueued = false;
new MutationObserver(() => {
  if (hydrateQueued) return;
  hydrateQueued = true;
  queueMicrotask(() => { hydrateQueued = false; hydrate(document); });
}).observe(document.body, { childList: true, subtree: true });
export const plain = s => toPlain(stripImages(s));
export const norm = s => plain(s).toLocaleLowerCase();
export const cardList = () => [...S.cards.values()];
let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}
export function errMsg(e) {
  const m = (e && (e.message || e.error_description)) || '';
  if (/Invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Confirma tu email antes de entrar (revisa tu bandeja de entrada).';
  if (/already registered/i.test(m)) return 'Ya existe una cuenta con ese email.';
  if (/Password should be/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/rate limit/i.test(m)) return 'Demasiados intentos. Espera unos minutos.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Revisa tu internet.';
  return m || 'Algo ha fallado. Inténtalo de nuevo.';
}
export const fail = e => toast(errMsg(e));
function deckColor(id) {
  const d = S.decks.get(id);
  if (d?.color) return colorVar(d.color);
  const ids = [...S.decks.keys()];
  const i = Math.max(0, ids.indexOf(id));
  return `var(--d${(i % 6) + 1})`;
}
// Icono del mazo: su emoji o, si no tiene, un punto de su color
export function deckIcon(d, big = false) {
  return d.icon ? `<span class="icon${big ? ' icon-big' : ''}" aria-hidden="true">${esc(d.icon)}</span>`
    : `<span class="dot${big ? ' dot-big' : ''}" style="background:${deckColor(d.id)}"></span>`;
}
export function folderIcon(f, big = false) {
  return f.icon ? `<span class="icon${big ? ' icon-big' : ''}" aria-hidden="true">${esc(f.icon)}</span>`
    : `<span class="ficon${big ? ' icon-big' : ''}" style="color:${f.color ? colorVar(f.color) : 'var(--muted)'}">${icon('folder', { size: big ? 30 : 20 })}</span>`;
}
export function tagChips(ids = []) {
  return ids.map(id => S.tags.get(id)).filter(Boolean)
    .map(t => `<span class="tag" style="--tag-bg:var(--tag-${t.color || 'gray'}-bg);--tag-fg:var(--tag-${t.color || 'gray'})">${esc(t.name)}</span>`).join('');
}
// Ámbito de estudio: 'all', un id de mazo, o 'folder:<id>' / 'tag:<id>'
// Lo que está en pausa (Plan de estudio) no entra, salvo si estudias ese mazo en concreto
export function scopeDecks(scope = 'all') {
  const live = d => !d.archived && stateOf(d) !== 'paused';
  const active = [...S.decks.values()].filter(live);
  if (scope === 'all') return new Set(active.map(d => d.id));
  if (scope.startsWith('folder:')) return new Set(decksInFolder(S.decks, S.folders, scope.slice(7)).filter(live).map(d => d.id));
  if (scope.startsWith('tag:')) { const t = scope.slice(4); return new Set(active.filter(d => (d.tags || []).includes(t)).map(d => d.id)); }
  return new Set([scope]);
}
// Qué tarjetas entran en un ámbito. Además de los de mazos: 'page:<id>' (las de unos apuntes) y
// 'page:<id>:<bloque>' (las de un apartado: el título y lo que cuelga de él).
export function scopeTest(scope = 'all') {
  if (scope.startsWith('page:')) {
    const [, pid, bid] = scope.split(':');
    const p = S.pages.get(pid), live = scopeDecks('all');
    const blocks = bid && p ? new Set(sectionIds(p.blocks, bid)) : null;
    return c => c.page_id === pid && (!blocks || blocks.has(c.block_id)) && live.has(c.deck_id);
  }
  const ids = scopeDecks(scope);
  return c => ids.has(c.deck_id);
}
export function scopeName(scope = 'all') {
  if (scope.startsWith('page:')) {
    const [, pid, bid] = scope.split(':'), p = S.pages.get(pid);
    const b = bid && p?.blocks.find(x => x.id === bid);
    return p ? `${pageTitle(p)}${b ? ` › ${plain(b.text).slice(0, 40)}` : ''}` : 'Apuntes';
  }
  if (scope === 'all') return 'Todas las listas';
  if (scope.startsWith('folder:')) return S.folders.get(scope.slice(7))?.name || 'Carpeta';
  if (scope.startsWith('tag:')) return '#' + (S.tags.get(scope.slice(4))?.name || 'etiqueta');
  return S.decks.get(scope)?.name || 'Lista';
}
export const deckName = id => scopeName(id);
export function saveOrgPrefs() { try { localStorage.setItem('flaski-org', JSON.stringify({ sort: S.org.sort, layout: S.org.layout })); } catch {} }
export function loadOrgPrefs() { try { Object.assign(S.org, JSON.parse(localStorage.getItem('flaski-org') || '{}')); } catch {} }
export const shareUrl = id => `${location.origin}${location.pathname}#d-${id}`;

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
export function addExtraNew(n) {
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
export const reviewsLeft = () => (S.prefs.study.maxReviews > 0 ? Math.max(0, S.prefs.study.maxReviews - reviewsToday()) : Infinity);
export const algo = deckId => algoFor(S.prefs, S.decks.get(deckId));
// Aviso cuando el límite diario de repasos deja tarjetas fuera (si no, el recorte pasaría desapercibido)
export function capNote(c) {
  const over = c.dueAll - c.due;
  if (over <= 0) return '';
  return `<p class="muted small">${over} ${over === 1 ? 'repaso más espera' : 'repasos más esperan'}: hoy el límite es de ${S.prefs.study.maxReviews} repasos. <button class="link" data-nav="settings">Cambiar el límite</button></p>`;
}
export function counts(scope = 'all') {
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
  let newToday = 0;
  for (const n of newPlan(scope).values()) newToday += n;
  // dueAll: todas las que tocan; due: las que caben hoy en el límite de repasos (Ajustes → Estudio diario)
  return { due: Math.min(due, reviewsLeft()), dueAll: due, fresh, total, mature, newToday };
}

/* ===================== plan de estudio ===================== */
// Estado (activo, solo repasos, en pausa), foco y examen de cada mazo y carpeta: ver plan.js
export const planNodes = () => S.prefs.plan.nodes;
export const stateOf = d => (d ? deckState(d, S.folders, planNodes()) : 'active');
const STATE_META = { reviews: ' · solo repasos', paused: ' · en pausa' };
export const planMeta = d => STATE_META[stateOf(d)] || '';
// Nuevas que le quedan a cada mazo (las que aún no has visto)
export function freshByDeck(test = () => true) {
  const m = new Map();
  for (const c of S.cards.values()) if (!S.progress.has(c.id) && test(c)) m.set(c.deck_id, (m.get(c.deck_id) || 0) + 1);
  return m;
}
// Reparto de las nuevas en un ámbito: Map mazo → cuántas. Hoy (lo que queda de hoy) o un día cualquiera
// (steady: para enseñar «≈ 6 nuevas al día» en el plan). Solo de los mazos activos, según el foco, y
// primero el ritmo que piden los exámenes.
export function newPlan(scope = 'all', { steady = false } = {}) {
  const inScope = scopeTest(scope), fresh = freshByDeck(inScope), avail = new Map(), remaining = new Map();
  for (const [id, n] of fresh) {
    const d = S.decks.get(id);
    if (!d || stateOf(d) !== 'active') continue;
    const own = d.options?.newPerDay;
    const lim = steady ? (own === null || own === undefined || own === '' ? Infinity : Number(own)) : deckNewLeft(id);
    remaining.set(id, n); avail.set(id, Math.min(n, lim));
  }
  const ok = d => (avail.get(d.id) || 0) > 0;
  const sh = shares(S.decks, S.folders, planNodes(), ok);
  for (const id of avail.keys()) if (!sh.has(id) && avail.get(id)) sh.set(id, 1);   // p. ej. una lista archivada que estudias a propósito
  const floors = new Map();
  for (const [id, f] of examFloors(S.decks, S.folders, planNodes(), remaining, Date.now(), ok)) floors.set(id, Math.max(0, Math.ceil(f) - (steady ? 0 : newSeenToday(id))));
  return allocate(steady ? S.newPerDay : newLeft(), sh, avail, floors);
}
