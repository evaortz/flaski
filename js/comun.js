// Flaski · estado compartido (S) y utilidades comunes de la interfaz (sale de app.js)
import { DAY, startOfDay, dateKey } from './srs.js';
import { loadPrefs, algoFor } from './prefs.js';
import { deckState, shares, allocate, examFloors, nearExamDecks, daysTo, decksUnder, nodesOn, dayKey, newOn, normalNew, minutesOn, stageOn, topicOrder } from './plan.js';
import { backlogPlan, backlogActive, BACKLOG_DAYS } from './atrasos.js';
import { icon } from './icons.js';
import { colorVar, folderColor, tagColor, tagTilt, decksInFolder, drawingOf, drawingSVG, imageOf, iconText } from './org.js';
import { hydrate, stripImages } from './media.js';
import { toHTML, toPlain } from './inline.js';
import { pageTitle, sectionIds, cardsStatus } from './pages.js';

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
// Para buscar y comparar: sin mayúsculas ni tildes ni diéresis (á→a, ü→u, ö→o…); la ñ se queda como ñ
export const fold = s => String(s ?? '').toLocaleLowerCase().replace(/ñ/g, '\u0001').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0001/g, 'ñ');
export const norm = s => fold(plain(s));
export const cardList = () => [...S.cards.values()];
let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false; t.classList.remove('toast-act', 'toast-err'); toastAct = null;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}
// Aviso oscuro con un botón («Deshacer», «Ver») y una barrita que se acaba (6 s)
let toastAct = null;
export function toastAction(msg, label, fn, { ms = 6000, icon: ic = '' } = {}) {
  const t = $('#toast');
  t.innerHTML = `${ic ? icon(ic, { size: 16, cls: 'ta-ic' }) : ''}<span class="ta-msg">${esc(msg)}</span><button type="button" class="ta-btn">${esc(label)}</button><i class="ta-bar" style="animation-duration:${ms}ms"></i>`;
  t.classList.add('toast-act'); t.classList.remove('toast-err'); t.hidden = false;
  toastAct = fn;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; toastAct = null; }, ms);
}
document.addEventListener('click', e => {
  if (!e.target.closest?.('#toast .ta-btn') || !toastAct) return;
  const f = toastAct; toastAct = null; $('#toast').hidden = true; clearTimeout(toastTimer); f();
});
export function errMsg(e) {
  const m = (e && (e.message || e.error_description)) || '';
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Confirma tu correo antes de entrar (revisa tu bandeja de entrada).';
  if (/already registered/i.test(m)) return 'Ya existe una cuenta con ese correo.';
  if (/Password should be/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/rate limit/i.test(m)) return 'Demasiados intentos. Espera unos minutos.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Revisa tu internet.';
  return m || 'Algo ha fallado. Inténtalo de nuevo.';
}
// Errores: el aviso dice qué ha pasado y lleva «Detalles» (qué hacías, el error técnico, la hora, la versión y el
// modo) para poder mandarlo. doing: qué se estaba haciendo; si no se dice, el último botón que se tocó.
const VERSION = 'flaski-v' + (/[?&]v=(\d+)/.exec(import.meta.url)?.[1] || '?');
let lastTap = null;
document.addEventListener('click', e => {
  const b = e.target.closest?.('button, a, [role="button"]');
  if (!b || b.closest('#toast')) return;
  const label = (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  // En una hoja, con su título delante: «Nueva carpeta › Guardar»
  const h = b.closest('#sheet')?.querySelector('h2')?.textContent.trim();
  if (label) lastTap = { label: h && h !== label ? `${h} › ${label}` : label, at: Date.now() };
}, true);
export const isQuota = e => /QuotaExceeded|NS_ERROR_DOM_QUOTA_REACHED/i.test(`${e?.name} ${e?.cause?.name}`) || e?.code === 22 || /quota/i.test(e?.message || '');
// Nada de claves, tokens ni datos de otras personas: fuera JWT, claves de Supabase, correos e ids que no son tuyos
function clean(v) {
  return String(v ?? '').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[clave]').replace(/\bsb_(?:publishable|secret)_[\w-]+/g, '[clave]')
    .replace(/(apikey|authorization|bearer|token|password)(["'=:\s]+)[^\s"'&,;]+/gi, '$1$2[oculto]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[correo]')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, id => (id === S.uid ? id : '[id]')).slice(0, 600);
}
export let lastError = null;
export function errorInfo(e, doing = '') {
  const tap = lastTap && Date.now() - lastTap.at < 60e3 ? lastTap.label : '';
  const tech = [];
  const name = e?.cause?.name && e.cause.name !== 'Error' ? e.cause.name : e?.name && e.name !== 'Error' ? e.name : '';
  if (name) tech.push(['Error', name]);
  for (const k of ['code', 'status', 'message', 'details', 'hint']) if (e?.[k] != null && e[k] !== '') tech.push([k === 'status' ? 'estado' : k, clean(e[k])]);
  if (e?.cause?.message && e.cause.message !== e.message) tech.push(['causa', clean(e.cause.message)]);
  if (!tech.length) tech.push(['Error', e == null ? 'sin mensaje (el navegador no dijo qué falló)' : clean(typeof e === 'string' ? e : JSON.stringify(e) || 'sin datos')]);
  return { doing: clean(doing || tap || 'Sin saber'), tech, when: new Date().toLocaleString('es-ES'), version: VERSION, mode: S.uid === 'local' ? 'Modo local (en este navegador)' : S.uid ? 'Con cuenta' : 'Sin sesión' };
}
export const errorText = i => [`Qué hacías: ${i.doing}`, ...i.tech.map(([k, v]) => `${k}: ${v}`), `Hora: ${i.when}`, `Versión: ${i.version}`, `Modo: ${i.mode}`].join('\n');
export function fail(e, doing = '') {
  console.warn(e);
  lastError = errorInfo(e, doing);
  const quota = isQuota(e);
  const t = $('#toast');
  t.innerHTML = `<span class="ta-msg">${esc(quota ? 'No queda espacio en este navegador. Descarga una copia de tus datos para no perder nada.' : errMsg(e))}</span>
    ${quota ? '<button type="button" class="ta-btn" data-act="backup">Descargar una copia</button>' : ''}<button type="button" class="ta-btn ta-link" data-act="err-details">Detalles</button>`;
  t.classList.add('toast-act', 'toast-err'); t.hidden = false; toastAct = null;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; t.classList.remove('toast-err'); }, quota ? 15000 : 9000);
}
// La hoja «Qué ha pasado» (la abre app.js con openSheet)
export const errorSheetHTML = (i = lastError) => i && `<h2>Qué ha pasado</h2>
  <dl class="err-dl"><dt>Qué hacías</dt><dd>${esc(i.doing)}</dd>${i.tech.map(([k, v]) => `<dt>${esc(k)}</dt><dd><code>${esc(v)}</code></dd>`).join('')}
    <dt>Hora</dt><dd>${esc(i.when)}</dd><dt>Versión</dt><dd>${esc(i.version)}</dd><dt>Modo</dt><dd>${esc(i.mode)}</dd></dl>
  <p class="muted small">No lleva claves ni datos de otras personas. Cópialo y mándalo si quieres que lo miremos.</p>
  <div class="btnrow"><span class="spacer"></span><button type="button" class="ghost" data-act="close-sheet">Cerrar</button><button type="button" class="primary" data-act="err-copy">Copiar</button></div>`;
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
// El dibujo o la imagen propia de una carpeta (o '' si su icono es un emoji o no tiene)
export function folderArt(ic, cls = 'draw-ic', alt = '') {
  const dr = drawingOf(ic), im = imageOf(ic);
  return dr ? drawingSVG(dr, cls, esc(alt)) : im ? `<img class="${cls} own-ic" data-img="${im}" alt="${esc(alt)}">` : '';
}
export function folderIcon(f, big = false) {
  const art = folderArt(f.icon);
  if (art) return `<span class="icon${big ? ' icon-big' : ''}" aria-hidden="true">${art}</span>`;
  return iconText(f.icon) ? `<span class="icon${big ? ' icon-big' : ''}" aria-hidden="true">${esc(f.icon)}</span>`
    : `<span class="ficon${big ? ' icon-big' : ''}" style="color:${folderColor(f.color) || 'var(--muted)'}">${icon('folder', { size: big ? 30 : 20 })}</span>`;
}
// Una etiqueta como pegatina: a mano, con «#», de su color y un poco torcida (big: la del filtro y el editor)
export function tagSticker(t, { big = false } = {}) {
  return `<span class="tag${big ? ' tag-big' : ''}" data-tc="${tagColor(t.color)}" style="--tilt:${tagTilt(t.name)}deg">${esc(t.name)}</span>`;
}
export function tagChips(ids = []) {
  return ids.map(id => S.tags.get(id)).filter(Boolean).map(t => tagSticker(t)).join('');
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
// «Lo que flojea»: los apartados de los apuntes cuyas preguntas te cuestan o toca repasar (primero los que
// te cuestan). Si un título tiene debajo otro que también flojea, sale el de debajo, que es más concreto;
// un apunte sin apartados que flojeen sale entero si sus preguntas flojean. → [{ page, block, status, cards }]
// Filas de «Lo que flojea» que se ven en Hoy (y que repasa su botón)
export const WEAK_SHOWN = 3;
export function weakSections(now = Date.now()) {
  const live = scopeDecks('all'), byPage = new Map();
  for (const c of S.cards.values()) if (c.page_id && live.has(c.deck_id) && S.pages.has(c.page_id)) {
    if (!byPage.has(c.page_id)) byPage.set(c.page_id, []);
    byPage.get(c.page_id).push(c);
  }
  const flojea = list => { const st = cardsStatus(list.map(c => S.progress.get(c.id) || null), now); return st === 'weak' || st === 'due' ? st : null; };
  const out = [];
  for (const [pid, cards] of byPage) {
    const p = S.pages.get(pid), rows = [];
    for (const b of p.blocks || []) {
      if (!['h1', 'h2', 'h3'].includes(b.type)) continue;
      const ids = new Set(sectionIds(p.blocks, b.id)), list = cards.filter(c => ids.has(c.block_id)), status = list.length && flojea(list);
      if (status) rows.push({ page: p, block: b, ids, status, cards: list });
    }
    const keep = rows.filter(r => !rows.some(o => o !== r && r.ids.has(o.block.id)));
    if (keep.length) out.push(...keep);
    else { const status = flojea(cards); if (status) out.push({ page: p, block: null, status, cards }); }
  }
  // Las listas con preguntas sueltas (sin apunte): solo si alguna te cuesta («toca repasar» saldría casi siempre)
  const cuesta = c => cardsStatus([S.progress.get(c.id) || null], now) === 'weak', byDeck = new Map();
  for (const c of S.cards.values()) if (live.has(c.deck_id) && !(c.page_id && S.pages.has(c.page_id)) && cuesta(c)) {
    if (!byDeck.has(c.deck_id)) byDeck.set(c.deck_id, []);
    byDeck.get(c.deck_id).push(c);
  }
  for (const [id, cards] of byDeck) out.push({ deck: S.decks.get(id), status: 'weak', cards });
  // Primero lo que te cuesta; luego lo que más preguntas te cuestan y, a igualdad, lo fallado más recientemente
  const rank = { weak: 0, due: 1 };
  const toca = c => { const p = S.progress.get(c.id); return !!p && p.due <= now; };
  for (const r of out) {
    const hard = r.deck ? r.cards : r.cards.filter(cuesta);
    r.hard = hard.length;
    // Las que flojean de verdad en esa fila (lo que dice su píldora y lo que entra en «Repasar solo lo que flojea»)
    r.flojas = r.status === 'weak' ? hard : r.cards.filter(c => toca(c) && !cuesta(c));
    r.last = Math.max(0, ...hard.map(c => +new Date(S.progress.get(c.id)?.last || 0)));
  }
  return out.sort((a, b) => rank[a.status] - rank[b.status] || b.hard - a.hard || b.last - a.last || b.cards.length - a.cards.length);
}
// Qué tarjetas entran en un ámbito. Además de los de mazos: 'page:<id>' (las de unos apuntes),
// 'page:<id>:<bloque>' (las de un apartado: el título y lo que cuelga de él) y 'weak' (las que flojean
// en las filas de «Lo que flojea» que se ven en Hoy, aunque no toque repasarlas hoy).
export function scopeTest(scope = 'all') {
  if (scope === 'weak') {
    const ids = new Set(weakSections().slice(0, WEAK_SHOWN).flatMap(r => r.flojas.map(c => c.id)));
    return c => ids.has(c.id);
  }
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
  if (scope === 'weak') return 'Lo que flojea';
  if (scope.startsWith('page:')) {
    const [, pid, bid] = scope.split(':'), p = S.pages.get(pid);
    const b = bid && p?.blocks.find(x => x.id === bid);
    return p ? `${pageTitle(p)}${b ? ` › ${plain(b.text).slice(0, 40)}` : ''}` : 'Apuntes';
  }
  if (scope === 'all') return 'Todas las listas';
  if (scope.startsWith('folder:')) return S.folders.get(scope.slice(7))?.name || 'Carpeta';
  if (scope.startsWith('tag:')) return S.tags.get(scope.slice(4))?.name || 'etiqueta';
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
// Nuevas de hoy: las de Ajustes, según los minutos de hoy en tu semana (sin semana, las de siempre)
export const newPerDayToday = () => newOn(S.prefs.plan, dayKey(), S.newPerDay, S.prefs.study.tandaMin);
const newLeft = () => Math.max(0, newPerDayToday() + extraNew() - newSeenToday());
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
// Atrasos (atrasos.js): el reparto de hoy se calcula una vez al día y se guarda en este navegador
let backlogMemo = (() => { try { return JSON.parse(localStorage.getItem('flaski-atrasos') || 'null'); } catch { return null; } })();
function saveBacklog() { try { localStorage.setItem('flaski-atrasos', JSON.stringify(backlogMemo)); } catch {} }
// El reparto de lo atrasado si está en marcha ({ cap, until, … }); null si no
export function backlog() {
  if (S.loading || !S.uid) return null;
  if (!(backlogMemo?.uid === S.uid && backlogMemo.day === dateKey())) {
    const t0 = startOfDay(), now = Date.now(), live = scopeTest('all');
    // Cada lista con el examen más cercano que tenga (de hoy a una semana): lo suyo, hecho antes del examen
    const examOf = new Map();
    for (const [key, n] of Object.entries(planNodes())) {
      const d = daysTo(n?.exam, now);
      if (d == null || d < 0 || d >= BACKLOG_DAYS) continue;
      const ids = key.startsWith('f:') ? (S.folders.has(key.slice(2)) ? decksUnder(key.slice(2), S.decks, S.folders).map(x => x.id) : []) : [key];
      for (const id of ids) if (!(examOf.get(id) <= d)) examOf.set(id, d);
    }
    let late = 0, onTime = 0;
    const byExam = new Map();
    for (const c of S.cards.values()) {
      const p = S.progress.get(c.id);
      if (!p || p.due > now || !live(c) || p.last >= t0) continue;
      if (p.due >= t0) { onTime++; continue; }
      late++;
      const d = examOf.get(c.deck_id);
      if (d != null) byExam.set(d, (byExam.get(d) || 0) + 1);
    }
    const exams = [...byExam].map(([days, n]) => ({ days, late: n }));
    backlogMemo = backlogPlan(backlogMemo, { uid: S.uid, late, onTime, done: reviewsToday(), away: daysAway(), exams, now });
    saveBacklog();
  }
  return backlogActive(backlogMemo) ? backlogMemo : null;
}
// Días desde la última vez que estudiaste (0: hoy; sin registro, por la última respuesta)
export function daysAway() {
  let last = Object.keys(S.log).filter(k => S.log[k] > 0).sort().pop();
  let t = last ? new Date(last + 'T12:00:00').getTime() : 0;
  if (!t) for (const p of S.progress.values()) if (p.last > t) t = p.last;
  return t ? Math.round((startOfDay() - startOfDay(t)) / DAY) : 0;
}
// «Hacerlas todas hoy»: deja de repartir lo atrasado (hasta que acabe este reparto); ese día tampoco entran nuevas
export function backlogOff() { if (backlogMemo) { backlogMemo = { ...backlogMemo, off: true, offDay: dateKey(), cap: undefined }; saveBacklog(); } }
// Sin nuevas hoy: se reparte lo atrasado o has elegido hacerlo todo hoy
export const backlogNoNew = () => !!backlog() || (backlogMemo?.uid === S.uid && backlogMemo.offDay === dateKey());
// Repasos que quedan hoy: el límite de Ajustes y, si se reparte lo atrasado, el tope de hoy
export const reviewsLeft = () => {
  const max = S.prefs.study.maxReviews > 0 ? S.prefs.study.maxReviews : Infinity, b = backlog();
  const cap = Math.min(max, b ? b.cap : Infinity);
  return cap === Infinity ? Infinity : Math.max(0, cap - reviewsToday());
};
// Las listas de los exámenes cercanos: van primero en la tanda
export const nearDecks = () => nearExamDecks(dayNodes(), S.decks, S.folders);
// Las que ya has visto hoy y vuelven (las que fallaste) no gastan del tope de repasos
export const seenToday = p => p.last >= startOfDay();
export const algo = deckId => algoFor(S.prefs, S.decks.get(deckId));
// Aviso cuando el límite diario de repasos deja tarjetas fuera (si no, el recorte pasaría desapercibido)
export function capNote(c) {
  const over = c.dueAll - c.due;
  if (over <= 0 || backlog()) return '';
  return `<p class="muted small">${over} ${over === 1 ? 'repaso más espera' : 'repasos más esperan'}: hoy el límite es de ${S.prefs.study.maxReviews} repasos. <button class="link" data-nav="settings">Cambiar el límite</button></p>`;
}
export function counts(scope = 'all') {
  const inScope = scopeTest(scope);
  const now = Date.now();
  let due = 0, again = 0, fresh = 0, total = 0, mature = 0;
  const freshBy = new Map();
  for (const c of S.cards.values()) {
    if (!inScope(c)) continue;
    total++;
    const p = S.progress.get(c.id);
    if (!p) { fresh++; freshBy.set(c.deck_id, (freshBy.get(c.deck_id) || 0) + 1); } else { if (p.due <= now) { if (seenToday(p)) again++; else due++; } if (p.interval >= 21) mature++; }
  }
  let newToday = 0;
  for (const n of newPlan(scope).values()) newToday += n;
  // dueAll: todas las que tocan; due: las que caben hoy en el límite de repasos (Ajustes → Estudio diario)
  return { due: again + Math.min(due, reviewsLeft()), dueAll: again + due, fresh, total, mature, newToday };
}

/* ===================== plan de estudio ===================== */
// Estado (activo, solo repasos, en pausa), foco y examen de cada mazo y carpeta: ver plan.js
// planNodes: los que guardas (para editarlos); dayNodes: los que mandan hoy (con la etapa vigente y las
// reglas de los exámenes encima, ver nodesOn en plan.js)
export const planNodes = () => S.prefs.plan.nodes;
export const dayNodes = (k = dayKey()) => nodesOn(S.prefs.plan, k);
export const stateOf = d => (d ? deckState(d, S.folders, dayNodes()) : 'active');
// Las listas que hoy no dan nuevas por el orden de temas de la etapa vigente
export const topicBlocked = (fresh = freshByDeck()) => topicOrder(stageOn(S.prefs.plan.stages, dayKey()), S.decks, S.folders, fresh).blocked;
// Minutos de la tanda de hoy: los de tu semana (o el día especial); sin semana o si hoy es libre, los de Ajustes
export const todayMinutes = () => minutesOn(S.prefs.plan, dayKey());
export const tandaMinutes = () => todayMinutes() || S.prefs.study.tandaMin;
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
  const nodes = dayNodes(), blocked = topicBlocked();
  for (const [id, n] of fresh) {
    const d = S.decks.get(id);
    if (!d || blocked.has(id) || deckState(d, S.folders, nodes) !== 'active') continue;
    const own = d.options?.newPerDay;
    const lim = steady ? (own === null || own === undefined || own === '' ? Infinity : Number(own)) : deckNewLeft(id);
    remaining.set(id, n); avail.set(id, Math.min(n, lim));
  }
  const ok = d => (avail.get(d.id) || 0) > 0;
  const sh = shares(S.decks, S.folders, nodes, ok);
  for (const id of avail.keys()) if (!sh.has(id) && avail.get(id)) sh.set(id, 1);   // p. ej. una lista archivada que estudias a propósito
  const floors = new Map();
  for (const [id, f] of examFloors(S.decks, S.folders, nodes, remaining, Date.now(), ok)) floors.set(id, Math.max(0, Math.ceil(f) - (steady ? 0 : newSeenToday(id))));
  let total = steady ? normalNew(S.prefs.plan, S.newPerDay, S.prefs.study.tandaMin) : newLeft();
  // Mientras se reparte lo atrasado no entran nuevas: solo el ritmo de los exámenes y las «10 nuevas más»
  if (!steady && backlogNoNew()) total = Math.min(total, [...floors.values()].reduce((a, n) => a + n, 0) + Math.max(0, extraNew() - newSeenToday()));
  return allocate(total, sh, avail, floors);
}
