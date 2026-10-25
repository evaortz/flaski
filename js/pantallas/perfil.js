// Flaski · perfil, estadísticas, plan de estudio y ajustes (sale de app.js)
import { digest } from '../sha256.js';
import * as api from '../api.js';
import { toRow, progressCols } from '../rows.js';
import { schedule, ALGO_PRESETS } from '../srs.js';
import { loadPrefs, algoFor, applyLook, ACCENTS, FONTS, CARD_SIZES, ALGO_FIELDS } from '../prefs.js';
import { statsView, drawStats } from '../stats.js';
import { pushBlocker, BLOCKER_TEXT, syncPush } from '../push.js';
import { PG_PERIODS, streaks, scrollChartsToEnd } from '../charts.js';
import { icon } from '../icons.js';
import { MODES, LANGS } from '../cardtypes.js';
import { setBaseRate } from '../tts.js';
import { imageIdsOf, exportImages, importImages } from '../media.js';
import { BLOCK_TYPES } from '../pages.js';
import { canVibrate, canAudio } from '../feel.js';
import { $, main, S, esc, fmt, fold, cardList, toast, errMsg, fail, deckIcon, scopeDecks, scopeName, deckName, algo } from '../comun.js';
import { onSignedIn } from './cuenta.js';
import { drawHeatmap, drawProgress } from './inicio.js';
import { nativeLang, cardModel, grade } from './estudio.js';
import { plural, download } from './mazos.js';
import { AI_GUIDE_BTNS, loadAiGuide } from './explorar.js';
import { pageRow } from './apuntes.js';
import { openSheet, closeSheet, deckTypes, adoptTypes, deckOptionName } from './editor.js';
import { forecastNow } from '../plan2-app.js';
import { dayKey } from '../plan.js';
import { NEWS_VERSION } from '../news.js';
import { friendsBadge, loadFriends } from './amigos.js';
import { trashSummary } from './papelera.js';

/* ===================== perfil ===================== */
// Cabecera (nombre con lápiz, racha y comodín, 4 cifras), «Tu estudio», «Flaski», la cuenta y, al final,
// «Créditos y licencias» en una hoja. En el ordenador: la persona y la cuenta a la izquierda, las filas a la derecha.
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const newsMonth = () => { const [y, m] = NEWS_VERSION.split('-').map(Number); return `${MONTHS[m - 1]} de ${y}`; };
// «vas bien» / «no llegas» del plan (solo si hay algún examen por delante)
function planBadge() {
  try {
    const exams = forecastNow().exams.filter(e => e.date && e.date >= dayKey());
    if (!exams.length) return '';
    return exams.some(e => e.verdict === 'no') ? '<span class="pr-tag late">no llegas</span>' : '<span class="pr-tag ok">vas bien</span>';
  } catch { return ''; }
}
function friendsLine() {
  const names = (S.friends?.list || []).map(p => p.name || 'Sin nombre');
  if (!api.social) return 'Con una cuenta, estudiad juntos y animaos';
  if (!names.length) return 'Invita a alguien y animaos';
  return names.length <= 2 ? names.join(' y ') : `${names.slice(0, 2).join(', ')} y ${names.length - 2} más`;
}
export function renderProfile() {
  const total = S.cards.size;
  let learned = 0;
  for (const p of S.progress.values()) if (p.interval >= 21) learned++;
  const st = streaks(S.log), who = S.name || (api.mode === 'local' ? 'Tú' : (S.email || '').split('@')[0]);
  const num = (n, l) => `<div class="pf-num"><b>${n}</b><span>${l}</span></div>`;
  const row = (attr, ic, t, sub, extra = '') => `<li><button class="pr-row" ${attr}>${icon(ic, { size: 22 })}<span class="pr-t"><b>${t}</b><small>${sub}</small></span>${extra}${icon('chevron-right', { size: 18, cls: 'chev' })}</button></li>`;
  const comodin = st.current && st.freeze.available ? ' · 1 comodín' : '';
  main.innerHTML = `<h1>Perfil</h1>
    <div class="pr-grid">
    <div class="pr-me">
      <div class="pf-head"><span class="pf-av" aria-hidden="true">${esc((who || '?').trim().charAt(0).toUpperCase())}</span>
        <div class="pf-who"><span class="pr-name"><b>${esc(who)}</b><button type="button" class="iconbtn pr-edit" data-act="edit-name" aria-label="Cambiar tu nombre" title="Cambiar tu nombre">${icon('pencil', { size: 18 })}</button></span>
        <span>${icon(st.current ? 'racha' : 'racha-apagada', { size: 16, cls: 'flame' })} ${plural(st.current, 'día', 'días')} de racha${comodin}</span></div></div>
      <div class="pf-nums">${num(total, total === 1 ? 'pregunta' : 'preguntas')}${num(S.decks.size, S.decks.size === 1 ? 'lista' : 'listas')}${num(S.progress.size, 'empezadas')}${num(learned, 'consolidadas')}</div>
      <button type="button" class="link pr-stats" data-nav="stats">Ver tus estadísticas ${icon('chevron-right', { size: 14 })}</button>
    </div>
    <div class="pr-links">
      <h2 class="pr-cap">Tu estudio</h2>
      <ul class="pr-list">
        ${row('data-nav="plan"', 'calendar', 'Plan de estudio', 'Tu semana, tus etapas y tus exámenes', planBadge())}
        ${row('data-nav="stats"', 'chart-column', 'Estadísticas', 'Repasos, intervalos, horas del día y más')}
        ${row('data-nav="friends"', 'users', 'Amigos', esc(friendsLine()), `<span id="frBadge">${friendsBadge()}</span>`)}
      </ul>
      <h2 class="pr-cap">Flaski</h2>
      <ul class="pr-list">
        ${row('data-nav="settings"', 'settings', 'Ajustes', 'Apariencia, tanda, avisos, voz, ritmo de repaso y copias')}
        ${row('data-act="news"', 'sugerencia', 'Novedades', `Lo nuevo de ${newsMonth()}`)}
        ${row('data-act="intro"', 'circle-help', 'Ver la presentación', 'Qué puedes hacer con Flaski, en un minuto')}
      </ul>
    </div>
    <div class="pr-acc">
      <h2 class="pr-h">Cuenta</h2>
      ${api.mode === 'local'
        ? `<p class="small muted">Estás en <b>modo local</b>: no hay cuenta y todo se guarda en este navegador.</p>
          <div class="btnrow"><button class="pr-danger" data-act="ask-reset-local">Borrar datos locales</button></div>`
        : `<p class="small">Has entrado como <b>${esc(S.email)}</b></p>
          <div class="btnrow"><button class="pill-tint" data-act="change-pass">Cambiar contraseña</button><button class="pr-danger" data-act="signout">Cerrar sesión</button></div>`}
      <div class="pr-foot"><button type="button" class="link" data-act="credits">Créditos y licencias</button><span>Flaski · software libre</span></div>
    </div></div>`;
  loadFriends();
}
export function nameSheet() {
  openSheet(`<h2 class="sheet-hand">Tu nombre</h2><form data-form="profile" class="pr-nameform"><p class="muted small">Lo ven tus amigos y quienes usan tus listas compartidas.</p>
    <input id="p-name" maxlength="40" value="${esc(S.name)}" aria-label="Tu nombre" autocomplete="name">
    <div class="btnrow"><span class="spacer"></span><button type="button" class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" type="submit">Guardar</button></div></form>`);
  setTimeout(() => $('#p-name')?.select(), 50);
}
export function creditsSheet() {
  openSheet(`<h2 class="sheet-hand">Créditos y licencias</h2>
    <p class="small">Escritura de kanji y hanzi con <a href="https://hanziwriter.org" target="_blank" rel="noopener">Hanzi Writer</a> de David Chanin (MIT), con datos de trazos de animCJK y Make Me A Hanzi (licencias Arphic y LGPL). Iconos de <a href="https://lucide.dev" target="_blank" rel="noopener">Lucide</a> (ISC) y <a href="https://github.com/microsoft/fluentui-emoji" target="_blank" rel="noopener">Fluent Emoji</a> de Microsoft (MIT). Detalles en la carpeta <i>licenses</i>.</p>
    <p class="small">Flaski es software libre. <span class="hand-inline">Consejo:</span> en el iPhone, abre la app en Safari y pulsa Compartir → «Añadir a pantalla de inicio».</p>
    <div class="btnrow"><span class="spacer"></span><button class="primary" data-act="close-sheet">Cerrar</button></div>`);
}

/* ===================== estadísticas ===================== */
function statsScopeOptions(sel) {
  const o = (v, label) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${esc(label)}</option>`;
  const folders = [...S.folders.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const decks = [...S.decks.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const tags = [...S.tags.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return o('all', 'Todas las listas')
    + (folders.length ? `<optgroup label="Carpetas">${folders.map(f => o('folder:' + f.id, f.name)).join('')}</optgroup>` : '')
    + `<optgroup label="Listas">${decks.map(d => o(d.id, deckOptionName(d))).join('')}</optgroup>`
    + (tags.length ? `<optgroup label="Etiquetas">${tags.map(t => o('tag:' + t.id, t.name)).join('')}</optgroup>` : '');
}
export let statsData = null;
export function renderStats() {
  const f = S.stats;
  if (f.scope !== 'all' && !f.scope.includes(':') && !S.decks.has(f.scope)) f.scope = 'all';
  // En Estadísticas «Todos» incluye también los mazos archivados
  const deckSet = f.scope === 'all' ? new Set(S.decks.keys())
    : f.scope.includes(':') ? scopeDecks(f.scope) : new Set([f.scope]);
  const ctx = {
    events: S.events, cards: S.cards, progress: S.progress, decks: S.decks, log: S.log, deckSet,
    modeOf: c => cardModel(c).tpl.mode, modes: MODES,
    scopeOptions: statsScopeOptions, scopeName,
    deckName: id => S.decks.get(id)?.name || 'Lista', deckLabel: id => (S.decks.get(id) ? deckIcon(S.decks.get(id)) : ''),
    cardFront: c => fmt(c.front), icon,
  };
  const { html, data } = statsView(ctx, f);
  statsData = data;
  main.innerHTML = html;
  drawStats(main, data, { animate: true });
  scrollChartsToEnd(main);
}

/* ===================== ajustes ===================== */
export const getPref = path => path.split('.').reduce((o, k) => o?.[k], S.prefs);
export function setPref(path, v) {
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
export function savePrefsSoon() {
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
export const seg = (path, opts, cur = getPref(path)) => `<div class="seg" role="group" data-seg="${path}">${opts.map(([v, l]) =>
  `<button type="button" class="seg-b" data-v="${esc(v)}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join('')}</div>`;
// Periodos de un gráfico: pestañas de texto subrayadas
export const tabs = (path, opts) => seg(path, opts).replace('class="seg"', 'class="seg seg-text" aria-label="Periodo"');
export const sw = (path, cur = getPref(path)) => `<label class="switch"><input type="checkbox" role="switch" data-pref="${path}" ${cur ? 'checked' : ''}><span class="slider" aria-hidden="true"></span></label>`;
export const numIn = (path, { min = 0, max = 9999, step = 1, unit = '', cur = getPref(path), id = '' } = {}) =>
  `<span class="num"><input type="number" ${id ? `id="${id}"` : ''} data-pref="${path}" data-num min="${min}" max="${max}" step="${step}" inputmode="decimal" value="${cur}">${unit ? `<span>${unit}</span>` : ''}</span>`;
// Fila: título + frase de ayuda a la izquierda, control a la derecha (debajo si no cabe).
// El título da nombre accesible al control y la ayuda lo describe. `keys`: más palabras para el buscador.
// Cada fila lleva encima la pestaña donde vive (solo se ve al buscar).
let rowSeq = 0, rowSec = '';
const setRow = (label, hint, control, { id = '', off = false, keys = '', col = false } = {}) => {
  const n = ++rowSeq;
  const ctl = control.replace(/<(input|div class="seg"|div class="swatches"|div class="presets")/, m => `${m} aria-labelledby="sl-${n}" aria-describedby="sh-${n}"`);
  const find = `${label} ${hint.replace(/<[^>]+>/g, '')} ${rowSec} ${keys}`;
  return `<div class="set-row${off ? ' is-off' : ''}${col ? ' set-col' : ''}"${id ? ` id="${id}"` : ''} data-find="${esc(find)}" data-sec="${esc(rowSec)}"><span class="set-tab"><i>${esc(rowSec)}</i></span><div class="set-l"><b id="sl-${n}">${label}</b><small id="sh-${n}">${hint}</small></div><div class="set-c">${ctl}</div></div>`;
};
const setSec = (id, title, body) => `<section class="set-sec" id="${id}"><h2>${title}</h2><div class="set-body">${body}</div></section>`;
const SET_SECTIONS = [['s-look', 'Apariencia'], ['s-session', 'Tanda'], ['s-remind', 'Avisos'], ['s-voice', 'Idioma y voz'], ['s-home', 'Hoy'], ['s-algo', 'Repaso'], ['s-data', 'Datos']];
const secName = id => SET_SECTIONS.find(s => s[0] === id)[1];
// Lo que ya no está en Ajustes: si se busca, se dice dónde ha ido
const MOVED = [
  { t: 'Duración de la tanda', s: 'Ahora la decides en «Tu semana», día a día.', go: 'plan', to: 'Plan', keys: 'tanda duracion minutos tiempo rato' },
  { t: 'Plan de estudio', s: 'Tu semana, tus etapas y tus exámenes.', go: 'plan', to: 'Plan', keys: 'plan examen examenes etapas semana' },
  { t: 'Tu nombre', s: 'Se cambia con el lápiz junto a tu nombre, en Perfil.', go: 'profile', to: 'Perfil', keys: 'nombre perfil' },
  { t: 'Novedades', s: 'Lo nuevo de cada versión está en Perfil.', go: 'profile', to: 'Perfil', keys: 'novedades version nuevo' },
];

// Simulación: intervalos de una tarjeta que aciertas siempre con «Bien»
function algoPreview(A) {
  let p = null, t = Date.now(); const out = [];
  for (let i = 0; i < 7; i++) { p = schedule(p, 3, t, A); out.push(p.interval); t = p.due; }
  const f = d => d < 1 ? 'hoy' : d < 31 ? `${d} d` : d < 365 ? `${Math.round(d / 30)} mes` : `${(d / 365).toFixed(1).replace('.', ',')} años`;
  return out.map(f).join(' → ');
}
// Avisos: el recordatorio diario (a tu hora, si te toca repasar o vas a perder la racha) y cuando alguien
// te anima. Se guardan en este dispositivo (ver js/push.js)
const remindBlock = () => pushBlocker({ cloud: !!api.push });
// Se pueden ofrecer los avisos en este dispositivo (con cuenta y un navegador que los admita)
export const remindOffer = () => !!api.push && !remindBlock();
function remindRows() {
  const R = S.prefs.remind, why = remindBlock(), times = [];
  for (let h = 6; h <= 23; h++) for (const m of ['00', '30']) times.push(`${String(h).padStart(2, '0')}:${m}`);
  if (!times.includes(R.time)) times.push(R.time);
  const box = (id, on) => `<label class="switch"><input type="checkbox" role="switch" id="${id}" ${on && !why ? 'checked' : ''} ${why ? 'disabled' : ''}><span class="slider" aria-hidden="true"></span></label>`;
  return `${setRow('Recordatorio diario', 'Un aviso en este dispositivo, aunque la app esté cerrada, si te toca repasar o vas a perder la racha. Si ya lo tienes todo hecho, no avisa.', box('remindOn', R.on))}
    ${setRow('Hora del aviso', 'A esta hora, cada día.', `<select id="remindAt" aria-label="Hora del aviso">${times.map(t => `<option ${t === R.time ? 'selected' : ''}>${t}</option>`).join('')}</select>`, { id: 'row-remind', off: !R.on || !!why })}
    ${api.social ? setRow('Cuando alguien te anime', 'Un aviso cuando un amigo te mande ánimos.', box('remindCheers', R.cheers)) : ''}
    <p class="hint set-note" id="remindMsg" role="status">${why ? BLOCKER_TEXT[why] : pushPending() ? 'Falta permitir las notificaciones en este dispositivo. <button type="button" class="link" data-act="push-allow">Permitir</button>' : ''}</p>`;
}
// Los avisos vienen activados: si en este dispositivo aún no se han permitido, Inicio lo pide con una
// tarjeta (el permiso solo se puede pedir al tocar un botón); si ya lo están, se suscribe solo al entrar
export const PUSH_ASK = 'flaski-push-ask';
const pushWanted = () => S.prefs.remind.on || S.prefs.remind.cheers;
const pushPending = () => !!api.push && pushWanted() && !remindBlock() && Notification.permission === 'default';
export function pushAskHTML() {
  if (!pushPending()) return '';
  try { if (localStorage.getItem(PUSH_ASK) === 'no') return ''; } catch { /* sin almacenamiento */ }
  const R = S.prefs.remind, what = [R.on && `te recordamos repasar a las ${R.time}`, R.cheers && api.social && 'te avisamos cuando alguien te anime'].filter(Boolean).join(' y ');
  return `<section class="push-ask" id="pushAsk" aria-labelledby="pushAskH">${icon('bell', { size: 20 })}
    <div class="push-ask-t"><b id="pushAskH">Activa los avisos</b><span>${what.charAt(0).toUpperCase() + what.slice(1)}. Puedes cambiarlo en Ajustes → Avisos.</span></div>
    <div class="btnrow"><button type="button" class="primary small-btn" data-act="push-allow">Activar</button><button type="button" class="ghost small-btn" data-act="push-later">Ahora no</button></div></section>`;
}
export function pushAutoSync() {
  const R = S.prefs.remind;
  if (api.push && pushWanted() && !remindBlock() && Notification.permission === 'granted') syncPush({ daily: R.on, cheers: R.cheers, time: R.time }, api.push).catch(() => {});
}
export async function pushAllow() {
  const R = S.prefs.remind;
  try {
    await syncPush({ daily: R.on, cheers: R.cheers, time: R.time }, api.push);
    toast('Avisos activados');
  } catch (err) {
    toast(err.message === 'denied' ? 'Has bloqueado las notificaciones: puedes permitirlas en los ajustes del navegador.' : 'Sin permiso no podemos avisarte. Puedes activarlo cuando quieras en Ajustes → Avisos.');
  }
  try { localStorage.setItem(PUSH_ASK, 'no'); } catch { /* sin almacenamiento */ }
  $('#pushAsk')?.remove();
  if (S.view === 'settings') { const y = scrollY; renderSettings(); scrollTo(0, y); }
}
// Aplica un cambio (key: 'on' | 'cheers' | 'time'); si falla, lo deja como estaba
export async function setRemind(key, value) {
  const R = S.prefs.remind, before = R[key], say = t => { const m = $('#remindMsg'); if (m) m.textContent = t; };
  R[key] = value;
  try {
    await syncPush({ daily: R.on, cheers: R.cheers, time: R.time }, api.push);
    say(key === 'cheers' ? (value ? 'Te avisaremos cuando alguien te anime.' : '') : R.on ? `Te avisaremos a las ${R.time} si tienes algo pendiente.` : '');
  } catch (err) {
    R[key] = before;
    const box = $(key === 'on' ? '#remindOn' : key === 'cheers' ? '#remindCheers' : '#remindAt');
    if (box) box.type === 'checkbox' ? (box.checked = before) : (box.value = before);
    say(err.message === 'denied' ? BLOCKER_TEXT.denied : err.message === 'dismissed' ? 'Hace falta que permitas las notificaciones para avisarte.' : 'No se ha podido guardar. Inténtalo de nuevo.');
  }
  savePrefsSoon();
  $('#row-remind')?.classList.toggle('is-off', !R.on);
}
// Siete secciones: Apariencia · Tanda · Avisos · Idioma y voz · Hoy · Repaso · Datos. Arriba, el buscador; en el
// ordenador, buscador e índice fijos a la izquierda y el contenido en una columna.
const sec = (id, body) => { rowSec = secName(id); return setSec(id, rowSec, body()); };
export function renderSettings() {
  loadAiGuide();   // para que «Copiar instrucciones» copie al instante (Safari lo exige)
  const P = S.prefs, A = algoFor(P, null);
  const presets = [...Object.entries(ALGO_PRESETS), ['custom', { label: 'Personalizado', help: 'Ajusta cada parámetro a mano.' }]];
  const ring = '<svg class="sw-ring" viewBox="0 0 66 66" aria-hidden="true"><path d="M36 4.5c14 1.5 25.5 12 25.5 28 0 16-12.5 29-29 29C17 61.5 4.5 49 4.5 33 4.5 17.5 16 5 31 4.2c3-.2 6 .3 8.5 1.3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const accents = ACCENTS.map(a => `<button type="button" class="swatch" data-accent="${a.id}" aria-pressed="${P.look.accent === a.id}" aria-label="${a.label}"><span class="sw-ball">${ring}${icon('check', { size: 22 })}</span><span aria-hidden="true">${a.label}</span></button>`).join('');
  rowSeq = 0; tocLock = null;
  main.innerHTML = `<div class="set-head"><button type="button" class="back-round" data-nav="profile" aria-label="Volver a Perfil">${icon('chevron-left', { size: 20 })}</button><h1>Ajustes</h1></div>
    <span class="saved" id="setSaved" role="status" aria-live="polite" hidden></span>
    <div class="set-wrap">
    <aside class="set-side">
      <div class="set-find">${icon('search', { size: 18 })}<input id="setFind" type="search" placeholder="Buscar un ajuste" aria-label="Buscar un ajuste" autocomplete="off" spellcheck="false"><button type="button" class="iconbtn" data-act="set-find-clear" aria-label="Borrar la búsqueda" hidden>${icon('x', { size: 18 })}</button></div>
      <nav class="set-toc" aria-label="Secciones de ajustes">${SET_SECTIONS.map(([id, l]) => `<a href="#${id}" data-toc="${id}">${l}</a>`).join('')}</nav>
    </aside>
    <div class="set-main">
    <p class="set-found" id="setFound" role="status" hidden></p>
    ${sec('s-look', () => `
      ${setRow('Tema', 'Automático sigue el modo claro u oscuro de tu dispositivo.', seg('look.theme', [['system', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']]), { keys: 'oscuro claro modo noche' })}
      ${setRow('Color de acento', 'Botones, enlaces y gráficos.', `<div class="swatches" role="group">${accents}</div>`, { col: true, keys: 'color colores' })}
      ${setRow('Tamaño de las preguntas', 'Tamaño del texto al estudiar.', seg('look.cardSize', CARD_SIZES.map(s => [s.id, s.label])), { keys: 'texto letra grande pequeño' })}
      ${setRow('Letra de las preguntas', 'Tipo de letra de las preguntas al estudiar.', seg('look.font', FONTS.map(f => [f.id, `<span class="ff-${f.id}" title="${f.label}">${f.short || f.label}</span>`])), { keys: 'fuente tipografia' })}
      ${setRow('Alineación', 'Cómo se coloca el texto dentro de la pregunta.', seg('look.cardAlign', [['center', 'Centrada'], ['left', 'A la izquierda']]))}
      ${setRow('Densidad', 'Compacta reduce márgenes y la altura de las filas.', seg('look.density', [['comfy', 'Cómoda'], ['compact', 'Compacta']]))}
      <div class="look-pv" aria-label="Vista previa de una pregunta"><article class="card"><div class="front"><div class="fld fld-main"><div class="fld-v"><span class="fld-t">Merhaba</span></div></div></div>
        <div class="answer"><div class="fld fld-main"><div class="fld-v"><span class="fld-t">Hola</span></div></div><div class="fld fld-sub"><div class="fld-v"><span class="fld-t">Saludo informal en turco</span></div></div></div></article></div>`)}
    ${sec('s-session', () => `
      <p class="muted small set-intro">La duración de cada tanda se decide en el <button type="button" class="link" data-nav="plan">Plan de estudio</button>, en «Tu semana».</p>
      ${setRow('Botones de respuesta', 'Con 2 solo eliges entre «Otra vez» y «Bien».', seg('study.buttons', [[4, '4'], [2, '2']]), { keys: 'valorar' })}
      ${setRow('Orden de las nuevas', 'En qué orden salen las preguntas que aún no has estudiado.', seg('study.newOrder', [['order', 'Como en la lista'], ['random', 'Al azar']]), { keys: 'azar aleatorio' })}
      ${setRow('Mezcla', 'Cómo se combinan las nuevas con los repasos.', seg('study.mix', [['mixed', 'Mezcladas'], ['reviewsFirst', 'Repasos antes'], ['newFirst', 'Nuevas antes']]))}
      ${setRow('Mostrar intervalos', 'El «3 d» debajo de cada botón: cuándo volverá la pregunta.', sw('study.showIntervals'))}
      ${setRow('Resaltar la nota sugerida', 'En preguntas de escribir, elegir, ordenar y dibujar.', sw('study.suggest'))}
      ${setRow('Deslizar para valorar', 'En el móvil, con la respuesta a la vista: ← Otra vez · → Bien · ↑ Fácil · ↓ Difícil.', sw('study.swipe'), { keys: 'gestos movil' })}
      ${setRow('Una nueva por nota', 'Si una nota tiene ida y vuelta, solo sale una por tanda.', sw('study.burySiblings'), { keys: 'hermanas inversa' })}
      ${setRow('Ayuda de atajos de teclado', 'Muestra debajo de la pregunta qué teclas puedes usar.', sw('study.shortcuts'), { keys: 'teclas teclado' })}
      ${canVibrate() ? setRow('Vibración', 'Una vibración muy breve al responder y al trazar kanji o hanzi.', sw('study.haptics')) : ''}
      ${canAudio() ? setRow('Efectos de sonido', 'Un tono suave al responder según la valoración («Bien», «Fácil», «Otra vez»).', `<span class="btnrow">${sw('study.sound')}<button type="button" class="ghost small-btn" data-act="test-sound">Probar</button></span>`, { keys: 'sonido sonidos' }) : ''}`)}
    ${sec('s-remind', () => remindRows())}
    ${sec('s-voice', () => `
      ${setRow('Tu idioma', 'En las listas de idiomas, el de las traducciones: se leen en voz alta y se corrigen en este idioma.', `<select data-pref="study.nativeLang" aria-label="Tu idioma">${LANGS.filter(l => l.id).map(l => `<option value="${l.id}" ${l.id === nativeLang() ? 'selected' : ''}>${l.label}</option>`).join('')}</select>`, { keys: 'lengua materna traduccion' })}
      ${setRow('Audio automático', 'Lee los campos marcados con audio al mostrar la pregunta.', sw('study.autoplay'), { keys: 'voz leer' })}
      ${setRow('Velocidad de la voz', 'Para la lectura en voz alta. Pulsa «Probar» para oírla.', `<span class="range"><input type="range" data-pref="study.rate" data-num min="0.5" max="1.5" step="0.05" value="${P.study.rate}"><output id="rateOut">${Math.round(P.study.rate * 100)} %</output><button type="button" class="ghost small-btn" data-act="test-voice">Probar</button></span>`)}
      <p class="hint voice-test" id="voiceTest" role="status" hidden></p>`)}
    ${sec('s-home', () => `
      ${setRow('Meta diaria', 'Respuestas al día. Los días que llegas salen marcados en «Tu actividad». 0 = sin meta.', numIn('home.goal', { max: 2000 }), { keys: 'objetivo' })}
      ${setRow('Tu actividad', 'Los días que has estudiado en los últimos 6 meses y tu meta diaria.', sw('home.activity'), { keys: 'calendario racha' })}
      ${setRow('Cómo va lo que sabes', 'Cuántas preguntas te sabes y cómo ha ido creciendo.', sw('home.forecast'), { keys: 'grafico progreso' })}
      ${setRow('Periodo de «Cómo va lo que sabes»', 'Lo que abarca el gráfico.', seg('home.progressPeriod', PG_PERIODS.map(p => [p.id, p.label])), { id: 'row-fcdays', off: !P.home.forecast })}
      ${api.social ? setRow('Tus amigos', 'El último ánimo que te han mandado y la clasificación de la semana.', sw('home.friends'), { keys: 'amigos animos' }) : ''}`)}
    ${sec('s-algo', () => `
      ${setRow('Algoritmo', `Decide cada cuánto vuelven las preguntas. Si no sabes qué elegir, deja «${esc(ALGO_PRESETS.standard?.label || 'Estándar')}». Cada lista puede usar otro en sus opciones.`, `<div class="presets" role="group">${presets.map(([k, v]) => `<button type="button" class="preset" data-preset="${k}" aria-pressed="${P.algo.preset === k}"><b>${v.label}</b><small>${v.help}</small></button>`).join('')}</div>
        <div class="algo-pv"><span class="muted small">Si aciertas siempre con «Bien», una pregunta nueva vuelve a los:</span><b id="algoPv">${algoPreview(A)}</b></div>
        <details class="opts" ${P.algo.preset === 'custom' ? 'open' : ''} ${P.algo.preset === 'fsrs' ? 'hidden' : ''}><summary>${icon('sliders-horizontal', { size: 16 })} Parámetros avanzados${P.algo.preset === 'custom' ? '' : ' (elige «Personalizado» para editarlos)'}</summary>
          <div class="algo-grid">${ALGO_FIELDS.map(x => `<label class="af"><span>${x.label}</span>${numIn('algo.custom.' + x.k, { min: x.min, max: x.max, step: x.step, unit: x.unit, cur: P.algo.preset === 'custom' ? P.algo.custom[x.k] : A[x.k] }).replace('<input', P.algo.preset === 'custom' ? '<input' : '<input disabled')}</label>`).join('')}</div>
          <div class="btnrow"><button type="button" class="ghost small-btn" data-act="algo-reset" ${P.algo.preset === 'custom' ? '' : 'disabled'}>Volver a los valores estándar</button></div>
        </details>`, { col: true, keys: 'ritmo fsrs sm2 intervalos personalizado parametros' })}
      ${P.algo.preset === 'fsrs' ? setRow('Retención deseada', 'Con qué probabilidad quieres recordar cada pregunta cuando vuelva. Más alta, más repasos. Entre 85 % y 92 % va bien.', `<span class="range"><input type="range" data-pref="algo.retention" data-num min="0.8" max="0.97" step="0.01" value="${P.algo.retention}"><output id="retOut">${Math.round(P.algo.retention * 100)} %</output></span>`) : ''}
      <h3 class="set-sub">Topes de seguridad</h3>
      <p class="muted small set-intro">Por si un día se acumula todo. El plan los respeta.</p>
      ${setRow('Nuevas al día', 'Las de un día normal. Con tu semana, un día con más minutos da más (como mucho el doble) y uno con menos, menos. Cada lista puede tener su propio límite.', `<span class="num"><input type="number" id="set-new" data-num min="0" max="500" inputmode="numeric" value="${S.newPerDay}"></span>`, { keys: 'tope limite maximo nuevas preguntas nuevas' })}
      ${setRow('Repasos al día, como mucho', '0 = sin límite. Si un día se acumulan, el resto queda para mañana.', numIn('study.maxReviews', { max: 9999 }), { keys: 'tope limite maximo repasos' })}`)}
    ${sec('s-data', () => `
      ${setRow('Copia de seguridad', 'Todas tus listas, preguntas, progreso y ajustes en un archivo.', `<button type="button" class="ghost" data-act="backup">${icon('download', { size: 16 })} Descargar</button>`, { keys: 'exportar backup' })}
      ${setRow('Restaurar copia', api.mode === 'local' ? 'Una copia de este navegador lo sustituye todo; una de una cuenta añade las listas que falten.' : 'Añade las listas que no tengas, con su progreso. Las que ya están no se tocan.', `<button type="button" class="ghost" data-act="restore">${icon('upload', { size: 16 })} Elegir archivo</button>`, { keys: 'importar recuperar' })}
      ${setRow('Papelera', trashSummary(), `<button type="button" class="ghost" data-nav="trash">${icon('trash-2', { size: 16 })} Abrir la papelera</button>`, { keys: 'papelera recuperar borrado borrados borradas deshacer' })}
      ${setRow('Listas hechas con IA', 'Instrucciones para que ChatGPT, Gemini o Claude te preparen una lista. Lo que te respondan se pega en Biblioteca › Importar › Pegar.', AI_GUIDE_BTNS(), { keys: 'inteligencia artificial chatgpt' })}
      <div class="set-care"><h3>Con cuidado</h3>
        ${setRow('Reiniciar el progreso', 'Todas las preguntas vuelven a ser nuevas. Las listas no se tocan. No se puede deshacer.', `<button type="button" class="pr-danger" data-act="ask-reset-progress">Reiniciar</button>`, { keys: 'borrar progreso empezar de cero' })}
        ${setRow('Ajustes por defecto', 'Vuelve a la configuración original. No toca tus datos.', `<button type="button" class="ghost" data-act="ask-reset-prefs">Restablecer</button>`, { keys: 'restablecer original' })}
      </div>
      <div class="set-care set-bye">${setRow('Borrar tu cuenta', api.mode === 'local' ? 'Se borra todo lo de Flaski en este navegador: listas, apuntes, preguntas, progreso y simulacros. No se puede deshacer.' : 'Se borra todo lo tuyo de Flaski: listas, apuntes, preguntas, progreso, simulacros y amigos. No se puede deshacer.', `<button type="button" class="danger solid primary" data-nav="bye">Borrar mi cuenta…</button>`, { col: true, keys: 'borrar cuenta eliminar cuenta darse de baja baja' })}</div>`)}
    <div class="set-moved" id="setMoved" hidden></div>
    </div></div>`;
  markToc();
}

/* ---------------- buscar un ajuste ---------------- */
// Sin tildes ni mayúsculas; cada palabra tiene que salir en el título, la ayuda, la pestaña o sus palabras clave.
// Se ven las filas que casan, ya usables, con la pestaña encima y lo buscado resaltado.
const ACC = { a: 'aáàäâ', e: 'eéèëê', i: 'iíìïî', o: 'oóòöô', u: 'uúùüû', n: 'n' };
// Cada palabra buscada tiene que ser el principio de alguna palabra («tanda» no casa con «estándar»)
const hasWords = (text, words) => { const ws = fold(text).split(/[^a-z0-9ñ]+/); return words.every(w => ws.some(x => x.startsWith(w))); };
const loose = w => w.split('').map(ch => ACC[ch] ? `[${ACC[ch]}]` : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
function mark(el, words) {
  if (el.dataset.orig == null) el.dataset.orig = el.innerHTML;
  el.innerHTML = el.dataset.orig;
  if (!words.length) return;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${words.map(loose).join('|')})`, 'giu');
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [];
  while (walk.nextNode()) nodes.push(walk.currentNode);
  for (const t of nodes) {
    if (!re.test(t.data)) continue;
    re.lastIndex = 0;
    const span = document.createElement('span');
    span.innerHTML = esc(t.data).replace(re, '<mark class="set-hl">$1</mark>');
    t.replaceWith(...span.childNodes);
  }
}
export function findSetting(q) {
  const box = $('.set-main'); if (!box) return;
  const words = fold(q.trim()).split(/\s+/).filter(Boolean);
  const on = words.length > 0;
  main.classList.toggle('set-finding', on);
  $('[data-act="set-find-clear"]').hidden = !q;
  const rows = [...box.querySelectorAll('.set-row')], hits = [];
  for (const r of rows) {
    const ok = !on || hasWords(r.dataset.find, words);
    r.hidden = !ok;
    if (on && ok) hits.push(r);
    r.querySelectorAll(':scope > .set-l b, :scope > .set-l small').forEach(el => mark(el, on && ok ? words : []));
  }
  box.querySelectorAll('.set-sec, .set-care').forEach(s => { s.hidden = on && !s.querySelector('.set-row:not([hidden])'); });
  const found = $('#setFound'), moved = $('#setMoved');
  const gone = on ? MOVED.filter(m => hasWords(`${m.t} ${m.s} ${m.keys}`, words)) : [];
  // Si solo sale algo que se ha ido a otro sitio, basta con «Ya no está en Ajustes» (sin «Ningún ajuste»)
  found.hidden = !on || (!hits.length && gone.length > 0);
  if (on) {
    const secs = new Set(hits.map(r => r.dataset.sec));
    found.textContent = hits.length ? `${plural(hits.length, 'ajuste', 'ajustes')}${secs.size === 1 ? ` en ${[...secs][0]}` : ''}` : `Ningún ajuste con «${q.trim()}»`;
  }
  moved.hidden = !gone.length;
  moved.innerHTML = gone.length ? `<p class="set-found">Ya no está en Ajustes</p>${gone.map(m => `<div class="set-gone"><div><b>${m.t}</b><small>${m.s}</small></div><button type="button" class="link" data-nav="${m.go}">${m.to} ›</button></div>`).join('')}` : '';
}
document.addEventListener('input', e => { if (e.target.id === 'setFind') findSetting(e.target.value); });
document.addEventListener('keydown', e => { if (e.target.id === 'setFind' && e.key === 'Escape' && e.target.value) { e.preventDefault(); e.stopPropagation(); e.target.value = ''; findSetting(''); } }, true);
export function clearSettingFind() { const i = $('#setFind'); if (i) { i.value = ''; findSetting(''); i.focus(); } }
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
export function prefChanged(path) {
  if (path.startsWith('look.')) applyLook(S.prefs.look);
  if (path === 'study.rate') { setBaseRate(S.prefs.study.rate); const o = $('#rateOut'); if (o) o.textContent = Math.round(S.prefs.study.rate * 100) + ' %'; }
  if (path.startsWith('algo.')) { const pv = $('#algoPv'); if (pv) pv.textContent = algoPreview(algoFor(S.prefs, null)); const ro = $('#retOut'); if (ro) ro.textContent = Math.round(S.prefs.algo.retention * 100) + ' %'; }
  if (path === 'home.forecast') $('#row-fcdays')?.classList.toggle('is-off', !S.prefs.home.forecast);
  // Los periodos de los gráficos de Inicio: se redibujan en el sitio (el calendario, con su transición)
  if (path === 'home.activityPeriod' && S.view === 'home') drawHeatmap();
  if (path === 'home.progressPeriod' && S.view === 'home') drawProgress();
  savePrefsSoon();
}
// Copia v2: lo mismo en los dos modos y con los identificadores originales, para que al restaurar
// se reconozca lo que ya está. En modo local lleva además el volcado completo del navegador.
export async function backupData() {
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
    images: await exportImages(imageIdsOf({ cards: cardList(), pages: [...S.pages.values()], folders: [...S.folders.values()] })),
  };
}

// Identificador estable para lo que no puede conservar el suyo (en la nube los ids son únicos entre
// todas las cuentas): hash de cuenta + id original con forma de UUID. Restaurar la misma copia otra vez
// da el mismo id, así que se reconoce y no se duplica.
async function derivedId(id) {
  // (digest: sin crypto.subtle, como al abrir la app por la wifi con http://, el mismo SHA-256 en JavaScript)
  const h = (await digest(new TextEncoder().encode(`${S.uid}:${id}`))).slice(0, 16);
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
    const name = str(d?.name || 'Lista', 80);
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
      } catch (e) { await api.deleteDeck(deck.id).catch(() => {}); throw e; }   // sin listas a medias
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
    ${sec(`${restored.length} ${restored.length === 1 ? 'lista restaurada' : 'listas restauradas'}, con su progreso`, restored)}
    ${sec(`${skipped.length} ${skipped.length === 1 ? 'lista ya estaba' : 'listas ya estaban'} en tu cuenta (no se han tocado)`, skipped)}
    ${failed.length ? `<h3>${failed.length === 1 ? 'Un elemento no se pudo restaurar' : `${failed.length} elementos no se pudieron restaurar`}</h3><ul class="list">${failed.map(([n, m]) => `<li class="small"><b>${esc(n)}</b>: ${esc(m)}</li>`).join('')}</ul>` : ''}
    ${!restored.length && !skipped.length && !failed.length ? '<p class="muted">La copia no tenía listas.</p>' : ''}
    <div class="btnrow"><span class="spacer"></span><button class="primary" data-act="close-sheet">Entendido</button></div>`);
}
export async function restoreBackup(file) {
  let data;
  try { data = JSON.parse((await file.text()).replace(/^﻿/, '')); } catch { return toast('El archivo no es una copia válida'); }
  if (data?.format !== 'flaski-backup') return toast('Ese archivo no es una copia de seguridad de Flaski');
  try {
    await importImages(data.images);
    // Copia de este mismo modo local: sustituye todo lo del navegador, como siempre
    if (api.mode === 'local' && data.local) {
      // Al recargar se dice cuánto ha entrado (listas, preguntas, apuntes y carpetas)
      try { sessionStorage.setItem('flaski-restored', String(S.decks.size + S.cards.size + S.pages.size + S.folders.size)); } catch { /* sin almacenamiento */ }
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

export async function saveProfileForm(form) {
  const name = $('#p-name').value.trim().slice(0, 40);
  const btn = form.querySelector('[type=submit]'); btn.disabled = true;
  try {
    if (name !== S.name) { await api.saveProfile(S.uid, name); S.name = name; S.pub = null; }
    toast('Guardado');
    closeSheet();
    if (S.view === 'profile') renderProfile();
  } catch (e) { btn.disabled = false; fail(e); }
}
