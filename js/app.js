// Flaski · lógica de la interfaz
// Estructura: estado (S) → funciones render*() que pintan cada vista → manejadores de eventos.
import * as api from './api.js';
import { toRow, progressCols } from './rows.js';
import { schedule, dateKey, ALGO_PRESETS, DEFAULT_ALGO } from './srs.js';
import { loadPrefs, algoFor, applyLook, applySavedLook, ACCENTS, FONTS, CARD_SIZES, ALGO_FIELDS } from './prefs.js';
import { statsView, drawStats } from './stats.js';
import { pushBlocker, BLOCKER_TEXT, syncPush } from './push.js';
import { STATES, folderState, examStatus, childrenOf, weightOf, folderKey, urgencyWeight } from './plan.js';
import { APP_NAME } from './config.js';
import { initProgressHover, PG_PERIODS, streaks, initChartTips, scrollChartsToEnd } from './charts.js';
import { mountEmojiPicker } from './emoji-picker.js';
import { icon } from './icons.js';
import { BUILTIN_TYPES, MODES, LANGS, RUBY_RE, NEEDS_ANSWER, orderTokens, activeTemplates, summarize, missingFor, splitQuick, checkTyped, choiceOptions, blankType, copyType, nextId, typeFit, typeScope, LANG_ROLES, baseLang, parsePairs, parseMasks, masksToText, imageIdIn, MAX_MASKS, checkNumber } from './cardtypes.js';
import { speak, ttsAvailable, setBaseRate } from './tts.js';
import { COLORS, colorVar, folderPath, folderTree, decksInFolder, sortDecks } from './org.js';
import { loadSnapshot, deleteSnapshot, lastUser, forgetUser } from './snapshot.js';
import { parsePasted } from './notes.js';
import { formatCode, cleanCode, inviteLink, parseInvite, weekDays, WEEK_LETTERS, weekTotal, ranking, initial } from './friends.js';
import { PRESELECT } from './suggest.js';
import { addImage, imgToken, imageIdsOf, exportImages, importImages, setRemote as setImageRemote } from './media.js';
import { selOffsets } from './liveedit.js';
import { BLOCK_TYPES, newBlock, blockId, shortcut, pageTitle, TABLE_TEMPLATE, pageToMarkdown } from './pages.js';
import { canVibrate, chime, canAudio } from './feel.js';
import { $, main, S, esc, fmt, plain, norm, cardList, toast, errMsg, fail, deckIcon, folderIcon, scopeDecks, scopeName, deckName, saveOrgPrefs, loadOrgPrefs, shareUrl, addExtraNew, algo, counts, planNodes, stateOf, freshByDeck, newPlan } from './comun.js';
import { renderAuth, renderNewPassword, submitAuth, onSignedIn, showNews, showIntro, isOffline, onSignedOut } from './pantallas/cuenta.js';
import { renderHome, drawHeatmap, drawProgress } from './pantallas/inicio.js';
import { typeIcon, getType, deckLang, nativeLang, typeIn, langLabel, cardModel, SPEAK_ICON, faceHTML, pickMatch, occlusionHTML, clozeChoices, sortAction, playListen, strokesSheet, startSession, shuffleTokens, renderStudy, reveal, grade, undo } from './pantallas/estudio.js';
import { plural, crumbs, renderDecks, renderDeck, importFile, addAnki, download, exportDeck } from './pantallas/mazos.js';
import { renderExplore, openPublicPreview, openBuiltinPreview, previewImport, pasteSheet, AI_GUIDE_BTNS, loadAiGuide, copyText, addPreview } from './pantallas/explorar.js';
import { pageCards, pageRow, savePageSoon, noteCrumbs, pageFolder, renderNotes, CALLOUT_ICONS, blockHTML, renderPage, curPage, repaint, redrawBlocks, toggleFold, histRecord, histTravel, selRange, selIds, setBlockSel, clearBlockSel, blockAction, justSelected, drag, openOps, closeOps, openFind, closeFind, gotoFind, replaceFind, updateToc, gotoBlock, openWiki, wikiCheck, closeWikiMenu, editBlock, retypeBlock, blockKey, toggleColorMenu, formatSelection, syncBlock, placeTblHandles, openTblMenu, closeTblMenu, tableEd, saveGrid, tableAction, tableKey, fold, openBlockMenu, closeBlockMenu, chooseBlockType, addImageBlock, removeImageBlock, newPage, importPdf, exportSheet, exportPage, exportAllNotes, setImportInto, cardFromSelection, notesHelpSheet, showHelpTab, blockCardsSheet, setSugHidden, openSuggestions, refreshSuggestions, drawSuggestions, hideSuggestion, scheduleSugMarks, paintSugMarks, redrawSuggestions, openSugEditor, saveSugEditor, readSugEdit, createSuggested } from './pantallas/apuntes.js';

/* ===================== navegación ===================== */
export function go(view, extra = {}) {
  Object.assign(S, { view }, extra);
  closeSheet(); closeBlockMenu(); closeOps(); closeWikiMenu(); closeFind();
  S.bsel = null; S.tocOpen = false;
  render();
  window.scrollTo(0, 0);
}
export function render() {
  const authed = !!S.uid && !S.recovery;
  $('#nav').hidden = !authed || S.view === 'study';
  document.body.classList.toggle('no-nav', $('#nav').hidden);
  document.body.classList.toggle('in-study', authed && S.view === 'study');
  document.body.dataset.view = S.view;
  if (authed && !S.loading) navMe();
  for (const b of document.querySelectorAll('[data-nav]')) {
    const cur = b.dataset.nav === S.view || (b.dataset.nav === 'decks' && ['deck', 'plan'].includes(S.view)) || (b.dataset.nav === 'profile' && ['settings', 'friends'].includes(S.view)) || (b.dataset.nav === 'notes' && S.view === 'page');
    if (cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  $('#banner').hidden = !(api.mode === 'local' && S.view === 'home');
  if (S.recovery) return renderNewPassword();
  if (!S.uid) return renderAuth();
  if (S.loading) { main.innerHTML = '<div class="empty"><div class="spin" aria-label="Cargando"></div><p class="muted">Cargando tus tarjetas…</p></div>'; return; }
  ({ home: renderHome, study: renderStudy, decks: renderDecks, deck: renderDeck, explore: renderExplore, notes: renderNotes, page: renderPage, profile: renderProfile, friends: renderFriends, stats: renderStats, settings: renderSettings, plan: renderPlan }[S.view] || renderHome)();
}

// Abajo de la barra lateral (en el ordenador): tu inicial, tu nombre y tu racha
function navMe() {
  const el = $('#navMe');
  if (!el) return;
  const who = S.name || (api.mode === 'local' ? 'Tú' : (S.email || '').split('@')[0]) || 'Tú', st = streaks(S.log).current;
  el.innerHTML = `<span class="pf-av">${esc(who.trim().charAt(0).toUpperCase())}</span><span class="nav-me-t"><b>${esc(who)}</b><span>${icon('fire', { size: 13 })} ${plural(st, 'día', 'días')}</span></span>`;
}

/* ===================== perfil ===================== */
function renderProfile() {
  const total = S.cards.size;
  let learned = 0;
  for (const p of S.progress.values()) if (p.interval >= 21) learned++;
  const st = streaks(S.log), who = S.name || (api.mode === 'local' ? 'Tú' : (S.email || '').split('@')[0]);
  const num = (n, l) => `<div class="pf-num"><b>${n}</b><span>${l}</span></div>`;
  main.innerHTML = `<h1>Perfil</h1>
    <div class="pf-head"><span class="pf-av" aria-hidden="true">${esc((who || '?').trim().charAt(0).toUpperCase())}</span>
      <div class="pf-who"><b>${esc(who)}</b><span>${icon('fire', { size: 16, cls: 'flame' })} ${plural(st.current, 'día', 'días')} de racha</span></div></div>
    <div class="pf-nums">${num(total, total === 1 ? 'tarjeta' : 'tarjetas')}${num(S.decks.size, S.decks.size === 1 ? 'mazo' : 'mazos')}${num(S.progress.size, 'empezadas')}${num(learned, 'consolidadas')}</div>
    <ul class="list linklist">
      <li><button class="row-link" data-nav="friends">${icon('users', { size: 20 })}<span><b>Amigos</b><small>Invita a tus amigos y mira cómo van sus rachas</small></span><span class="fr-badge" id="frBadge" ${incoming().length ? '' : 'hidden'}>${incoming().length}</span>${icon('chevron-right', { size: 18, cls: 'chev' })}</button></li>
      <li><button class="row-link" data-nav="settings">${icon('settings', { size: 20 })}<span><b>Ajustes</b><small>Estudio, ritmo de repaso, apariencia, inicio y copias de seguridad</small></span>${icon('chevron-right', { size: 18, cls: 'chev' })}</button></li>
      <li><button class="row-link" data-nav="stats">${icon('chart-column', { size: 20 })}<span><b>Estadísticas</b><small>Gráficos con filtros por periodo, mazo y tipo de tarjeta</small></span>${icon('chevron-right', { size: 18, cls: 'chev' })}</button></li>
      <li><button class="row-link" data-act="news">${icon('sparkles', { size: 20 })}<span><b>Novedades</b><small>Lo nuevo de la última versión</small></span>${icon('chevron-right', { size: 18, cls: 'chev' })}</button></li>
      <li><button class="row-link" data-act="intro">${icon('circle-help', { size: 20 })}<span><b>Ver la presentación</b><small>Qué puedes hacer con Flaski, en un minuto</small></span>${icon('chevron-right', { size: 18, cls: 'chev' })}</button></li>
    </ul>
    <form class="pf-sec" data-form="profile">
      <label for="p-name" class="pf-h">Tu nombre<small>Lo ven quienes usan tus mazos compartidos</small></label>
      <div class="pf-row"><input id="p-name" maxlength="40" value="${esc(S.name)}"><button class="pill-tint" type="submit" aria-label="Guardar nombre">Guardar</button></div></form>
    ${api.mode === 'local'
      ? `<div class="pf-sec"><span class="pf-h">Cuenta</span><p class="small muted">Estás en <b>modo local</b>: no hay cuenta y todo se guarda en este navegador.</p>
          <div class="btnrow"><button class="ghost danger" data-act="ask-reset-local">Borrar datos locales</button></div></div>`
      : `<div class="pf-sec"><span class="pf-h">Cuenta</span><p class="small muted">Has entrado como <b>${esc(S.email)}</b></p>
          <div class="btnrow"><button class="pill-tint" data-act="change-pass">Cambiar contraseña</button><button class="ghost danger" data-act="signout">Cerrar sesión</button></div></div>`}
    <div class="pf-foot"><p class="muted small">Escritura de kanji y hanzi con <a href="https://hanziwriter.org" target="_blank" rel="noopener">Hanzi Writer</a> de David Chanin (MIT), con datos de trazos de animCJK y Make Me A Hanzi (licencias Arphic y LGPL). Iconos de <a href="https://lucide.dev" target="_blank" rel="noopener">Lucide</a> (ISC) y <a href="https://github.com/microsoft/fluentui-emoji" target="_blank" rel="noopener">Fluent Emoji</a> de Microsoft (MIT). Detalles en la carpeta <i>licenses</i>.</p>
    <p class="muted small">Flaski es software libre. <span class="hand-inline">Consejo:</span> en el iPhone, abre la app en Safari y pulsa Compartir → «Añadir a pantalla de inicio».</p></div>`;
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
export let statsData = null;
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

/* ===================== plan de estudio (pantalla) ===================== */
// Un árbol con tus carpetas y mazos: de cada uno, su estado, su foco (el % frente a sus hermanos), las
// nuevas al día que le tocan y su fecha de examen, con un aviso si a ese ritmo no llegas.
const planOpen = new Set();   // filas desplegadas (se conservan al repintar)
const planNode = key => planNodes()[key] || (planNodes()[key] = {});
function setPlanNode(key, fields) {
  const n = planNode(key);
  for (const [k, v] of Object.entries(fields)) { if (v === '' || v === 'active') delete n[k]; else n[k] = v; }
  if (!Object.keys(n).length) delete planNodes()[key];
  savePrefsSoon();
  renderPlan();
}
// Hermanos de una fila (las claves de su grupo): para que los % sumen 100 al mover uno
function planSiblings(key) {
  const N = planNodes(), S2 = S.folders;
  const parent = key.startsWith('f:') ? (S2.get(key.slice(2))?.parent_id || null) : (S.decks.get(key)?.folder_id || null);
  const fid = parent && S2.has(parent) ? parent : null;
  const k = childrenOf(fid, S.decks, S2);
  return [...k.folders.map(f => folderKey(f.id)), ...k.decks.map(d => d.id)];
}
function setPlanWeight(key, pct) {
  const sib = planSiblings(key), others = sib.filter(k => k !== key);
  const sum = others.reduce((a, k) => a + weightOf(planNodes(), k), 0);
  const rest = Math.max(0, 100 - pct);
  for (const k of others) planNode(k).weight = sum ? (weightOf(planNodes(), k) / sum) * rest : rest / others.length;
  planNode(key).weight = pct;
  savePrefsSoon();
  renderPlan();
}
function planUrgent() {
  const N = planNodes();
  const exams = new Map();   // clave → examen más cercano (el suyo o el de algo de dentro)
  const near = (a, b) => (!a ? b : !b ? a : a < b ? a : b);
  for (const d of S.decks.values()) {
    if (d.archived) continue;
    let e = N[d.id]?.exam || '';
    exams.set(d.id, near(exams.get(d.id), e));
    let f = d.folder_id; const seen = new Set();
    while (f && S.folders.has(f) && !seen.has(f)) { seen.add(f); e = near(e, N[folderKey(f)]?.exam || ''); exams.set(folderKey(f), near(exams.get(folderKey(f)), e)); f = S.folders.get(f).parent_id; }
  }
  for (const f of S.folders.values()) if (N[folderKey(f.id)]?.exam) exams.set(folderKey(f.id), near(exams.get(folderKey(f.id)), N[folderKey(f.id)].exam));
  let any = false;
  for (const [k, e] of exams) { const w = urgencyWeight(e); if (w > 1) any = true; planNode(k).weight = w; }
  if (!any) { for (const n of Object.values(N)) delete n.weight; toast('Pon alguna fecha de examen para priorizar lo urgente'); }
  else toast('Más foco para lo que tiene el examen más cerca');
  savePrefsSoon();
  renderPlan();
}
function renderPlan() {
  const N = planNodes(), now = Date.now();
  const perDay = newPlan('all', { steady: true }), remaining = freshByDeck(c => S.decks.get(c.deck_id) && !S.decks.get(c.deck_id).archived);
  const today = counts('all').newToday;
  const sumIn = (fid, m) => decksInFolder(S.decks, S.folders, fid).filter(d => !d.archived).reduce((a, d) => a + (m.get(d.id) || 0), 0);
  const examText = d => (d == null ? '' : d < 0 ? 'el examen ya pasó' : d === 0 ? 'examen hoy' : d === 1 ? 'examen mañana' : `examen en ${d} días`);
  function row(key, depth) {
    const isF = key.startsWith('f:'), f = isF ? S.folders.get(key.slice(2)) : null, d = isF ? null : S.decks.get(key);
    const own = N[key] || {}, eff = isF ? folderState(f.id, S.folders, N) : stateOf(d);
    const inherited = eff !== (own.state || 'active');
    const sib = planSiblings(key), sw = sib.reduce((a, k) => a + weightOf(N, k), 0);
    const pct = sw ? Math.round((weightOf(N, key) / sw) * 100) : 0;
    const daily = isF ? sumIn(f.id, perDay) : perDay.get(key) || 0;
    const left = isF ? sumIn(f.id, remaining) : remaining.get(key) || 0;
    const ex = examStatus(key, { decks: S.decks, folders: S.folders, nodes: N, remaining, perDay, now });
    const label = STATES.find(s => s.id === eff).label;
    const meta = [label, sib.length > 1 ? `${pct} %` : '', eff === 'active' ? (daily ? `≈ ${plural(daily, 'nueva', 'nuevas')} al día` : left ? 'hoy sin nuevas' : 'sin nuevas pendientes') : '', examText(ex?.days)].filter(Boolean).join(' · ');
    const warn = ex && ex.late && eff !== 'paused' ? (ex.days <= 0
      ? `<p class="pl-warn">${icon('alert-triangle', { size: 14 })} El examen ya pasó. Si lo terminaste, ponlo en «Solo repasos» para no olvidarlo.</p>`
      : `<p class="pl-warn">${icon('alert-triangle', { size: 14 })} Así no te da tiempo: quedan ${plural(ex.left, 'nueva', 'nuevas')} y harían falta unas ${ex.need} al día (ahora le tocan ${ex.per}). Súbele el foco o el número de nuevas al día en Ajustes.</p>`) : '';
    const name = isF ? `${folderIcon(f)}<span class="pl-name">${esc(f.name)}</span>` : `${deckIcon(d)}<span class="pl-name">${esc(d.name)}</span>`;
    const kids = isF ? (() => { const k = childrenOf(f.id, S.decks, S.folders); return [...k.folders.sort((a, b) => a.name.localeCompare(b.name, 'es')).map(x => folderKey(x.id)), ...k.decks.sort((a, b) => a.name.localeCompare(b.name, 'es')).map(x => x.id)]; })() : [];
    return `<details class="pl-row${isF ? ' pl-folder' : ''}${eff !== 'active' ? ' pl-' + eff : ''}" data-plkey="${key}" ${planOpen.has(key) ? 'open' : ''}>
      <summary><span class="pl-head">${name}<span class="pl-meta">${meta}</span></span>${icon('chevron-down', { size: 16, cls: 'pl-chev' })}</summary>
      <div class="pl-body">
        <div class="pl-field"><span class="pl-lab">Estado</span><div class="seg seg-sm" role="group" aria-label="Estado de ${esc(isF ? f.name : d.name)}" data-plstate="${key}">${STATES.map(s => `<button type="button" class="seg-b" data-v="${s.id}" aria-pressed="${(own.state || 'active') === s.id}" title="${s.hint}">${s.label}</button>`).join('')}</div>
          ${inherited ? `<p class="hint">Ahora manda su carpeta: está ${eff === 'paused' ? 'en pausa' : 'en «solo repasos»'}.</p>` : `<p class="hint">${STATES.find(s => s.id === (own.state || 'active')).hint}</p>`}</div>
        <div class="pl-field"><span class="pl-lab">Foco</span>${sib.length > 1
          ? `<span class="range"><input type="range" min="0" max="100" step="5" value="${pct}" data-plw="${key}" aria-label="Foco de ${esc(isF ? f.name : d.name)}"><output>${pct} %</output></span>
             <p class="hint">${depth ? (isF ? 'De las nuevas de su carpeta, la parte para esta subcarpeta' : 'De las nuevas de su carpeta, la parte para este mazo') : (isF ? 'De las nuevas de cada día, la parte para esta carpeta' : 'De las nuevas de cada día, la parte para este mazo')}${eff === 'active' ? `: ≈ ${plural(daily, 'nueva', 'nuevas')} al día.` : '.'}</p>`
          : `<p class="hint">Es lo único a su nivel: se lleva todo el foco${eff === 'active' ? ` (≈ ${plural(daily, 'nueva', 'nuevas')} al día)` : ''}.</p>`}</div>
        <div class="pl-field"><span class="pl-lab">Examen</span><span class="btnrow"><input type="date" data-plexam="${key}" value="${own.exam || ''}" aria-label="Fecha de examen">${own.exam ? `<button type="button" class="link small" data-plclear="${key}">Quitar</button>` : ''}</span>
          <p class="hint">${ex ? `${examText(ex.days).replace(/^./, c => c.toUpperCase())}${ex.days > 0 ? ` · quedan ${plural(ex.left, 'nueva', 'nuevas')}` : ''}.` : 'Con fecha, le damos el ritmo justo para verlo todo antes.'}</p>${warn}</div>
      </div>
      ${kids.length ? `<div class="pl-kids">${kids.map(k => row(k, depth + 1)).join('')}</div>` : ''}
    </details>`;
  }
  const top = childrenOf(null, S.decks, S.folders);
  const keys = [...top.folders.sort((a, b) => a.name.localeCompare(b.name, 'es')).map(f => folderKey(f.id)), ...top.decks.sort((a, b) => a.name.localeCompare(b.name, 'es')).map(d => d.id)];
  const y = scrollY;
  main.innerHTML = `<div class="section-h"><h1>Plan de estudio</h1></div>
    <p class="muted pl-lead">Decide qué estudias ahora y cuánto foco le das a cada cosa. Con tu plan, hoy te ${today === 1 ? 'toca' : 'tocan'} <b>${plural(today, 'nueva', 'nuevas')}</b> de las ${S.newPerDay} al día que tienes en Ajustes. Los repasos de todo lo que no está en pausa salen siempre, para que no se te olvide lo que ya sabes.</p>
    <div class="btnrow"><button type="button" class="ghost" data-act="plan-equal">Repartir por igual</button><button type="button" class="ghost" data-act="plan-urgent">Prioridad a lo urgente</button></div>
    ${keys.length ? `<div class="pl-tree">${keys.map(k => row(k, 0)).join('')}</div>` : '<div class="empty"><p class="muted">Aún no tienes mazos. Crea uno o busca alguno en Explorar.</p></div>'}`;
  for (const el of main.querySelectorAll('.pl-row')) el.addEventListener('toggle', () => { el.open ? planOpen.add(el.dataset.plkey) : planOpen.delete(el.dataset.plkey); });
  for (const r of main.querySelectorAll('[data-plw]')) r.addEventListener('input', () => { r.nextElementSibling.textContent = r.value + ' %'; });
  if (S.view === 'plan') scrollTo(0, y);
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
// El título da nombre accesible al control y la ayuda lo describe.
let rowSeq = 0;
const setRow = (label, hint, control, { id = '', off = false } = {}) => {
  const n = ++rowSeq;
  const ctl = control.replace(/<(input|div class="seg"|div class="swatches")/, m => `${m} aria-labelledby="sl-${n}" aria-describedby="sh-${n}"`);
  return `<div class="set-row${off ? ' is-off' : ''}"${id ? ` id="${id}"` : ''}><div class="set-l"><b id="sl-${n}">${label}</b><small id="sh-${n}">${hint}</small></div><div class="set-c">${ctl}</div></div>`;
};
const setSec = (ic, title, body, id = '') => `<section class="set-sec"${id ? ` id="${id}"` : ''}><h2>${icon(ic, { size: 18 })} ${title}</h2><div class="set-body">${body}</div></section>`;
const SET_SECTIONS = [['s-look', 'Apariencia'], ['s-study', 'Estudio'], ['s-remind', 'Avisos'], ['s-session', 'Sesión'], ['s-voice', 'Voz'], ['s-home', 'Inicio'], ['s-algo', 'Ritmo'], ['s-data', 'Datos']];

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
const PUSH_ASK = 'flaski-push-ask';
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
async function pushAllow() {
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
async function setRemind(key, value) {
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
// Orden: primero lo que más se cambia (apariencia, estudio diario); al final lo avanzado (ritmo) y los datos
function renderSettings() {
  loadAiGuide();   // para que «Copiar instrucciones» copie al instante (Safari lo exige)
  const P = S.prefs, A = algoFor(P, null);
  const presets = [...Object.entries(ALGO_PRESETS), ['custom', { label: 'Personalizado', help: 'Ajusta cada parámetro a mano.' }]];
  const accents = ACCENTS.map(a => `<button type="button" class="swatch" data-accent="${a.id}" aria-pressed="${P.look.accent === a.id}" aria-label="${a.label}" title="${a.label}"></button>`).join('');
  rowSeq = 0; tocLock = null;
  main.innerHTML = `<div class="set-head"><h1>Ajustes</h1><button type="button" class="link small set-news" data-act="news">${icon('sparkles', { size: 14 })} Ver las últimas novedades</button></div>
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
      ${setRow('Plan de estudio', 'Qué mazos estudias ahora, cuánto foco le das a cada uno y tus fechas de examen.', '<button type="button" class="ghost small-btn" data-nav="plan">Abrir el plan</button>')}
      ${setRow('Tarjetas nuevas al día', 'Entre 10 y 20 va bien. Cada mazo puede tener su propio límite.', `<span class="num"><input type="number" id="set-new" data-num min="0" max="500" inputmode="numeric" value="${S.newPerDay}"></span>`)}
      ${setRow('Repasos máximos al día', '0 = sin límite. Si un día se acumulan, el resto queda para mañana.', numIn('study.maxReviews', { max: 9999 }))}
      ${setRow('Meta diaria', 'Respuestas al día. Aparece como barra de progreso en Inicio. 0 = sin meta.', numIn('home.goal', { max: 2000 }))}
      ${setRow('Orden de las nuevas', 'En qué orden salen las tarjetas que aún no has estudiado.', seg('study.newOrder', [['order', 'Como en el mazo'], ['random', 'Al azar']]))}
      ${setRow('Mezcla', 'Cómo se combinan las nuevas con los repasos.', seg('study.mix', [['mixed', 'Mezcladas'], ['reviewsFirst', 'Repasos primero'], ['newFirst', 'Nuevas primero']]))}
      ${setRow('Tu idioma', 'En los mazos de idiomas, el de las traducciones: se leen en voz alta y se corrigen en este idioma.', `<select data-pref="study.nativeLang" aria-label="Tu idioma">${LANGS.filter(l => l.id).map(l => `<option value="${l.id}" ${l.id === nativeLang() ? 'selected' : ''}>${l.label}</option>`).join('')}</select>`)}`, 's-study')}
    ${setSec('bell', 'Avisos', remindRows(), 's-remind')}
    ${setSec('layers', 'Durante la sesión', `
      ${setRow('Botones de respuesta', 'Con 2 solo eliges entre «Otra vez» y «Bien».', seg('study.buttons', [[4, '4 botones'], [2, '2 botones']]))}
      ${setRow('Mostrar intervalos', 'El «3 d» debajo de cada botón: cuándo volverá la tarjeta.', sw('study.showIntervals'))}
      ${setRow('Resaltar la nota sugerida', 'En tarjetas de escribir, elegir, ordenar y dibujar.', sw('study.suggest'))}
      ${setRow('Una nueva por nota', 'Si una nota genera varias tarjetas (p. ej. ida y vuelta), solo sale una nueva por sesión.', sw('study.burySiblings'))}
      ${setRow('Ayuda de atajos de teclado', 'Muestra debajo de la tarjeta qué teclas puedes usar.', sw('study.shortcuts'))}
      ${setRow('Deslizar para valorar', 'En el móvil, con la respuesta a la vista: izquierda «Otra vez», derecha «Bien», arriba «Fácil».', sw('study.swipe'))}
      ${canVibrate() ? setRow('Vibración', 'Una vibración muy breve al responder y al trazar kanji o hanzi.', sw('study.haptics')) : ''}
      ${canAudio() ? setRow('Efectos de sonido', 'Un tono suave al responder según la valoración («Bien», «Fácil», «Otra vez»).', `<span class="btnrow">${sw('study.sound')}<button type="button" class="ghost small-btn" data-act="test-sound">Probar</button></span>`) : ''}`, 's-session')}
    ${setSec('volume-2', 'Voz', `
      ${setRow('Audio automático', 'Lee los campos marcados con audio al mostrar la tarjeta.', sw('study.autoplay'))}
      ${setRow('Velocidad de la voz', 'Para la lectura en voz alta. Pulsa «Probar» para oírla.', `<span class="range"><input type="range" data-pref="study.rate" data-num min="0.5" max="1.5" step="0.05" value="${P.study.rate}"><output id="rateOut">${Math.round(P.study.rate * 100)} %</output><button type="button" class="ghost small-btn" data-act="test-voice">Probar</button></span>`)}`, 's-voice')}
    ${setSec('house', 'Inicio', `
      ${setRow('Calendario de actividad', 'Los días que has estudiado y tus rachas.', sw('home.activity'))}
      ${setRow('Tu progreso', 'Cuántas tarjetas te sabes, cómo ha ido creciendo y lo que te toca los próximos días.', sw('home.forecast'))}
      ${setRow('Periodo de «Tu progreso»', 'Lo que abarca el gráfico (también se cambia en el propio gráfico).', seg('home.progressPeriod', PG_PERIODS.map(p => [p.id, p.label])), { id: 'row-fcdays', off: !P.home.forecast })}
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
  // Los periodos de los gráficos de Inicio: se redibujan en el sitio (el calendario, con su transición)
  if (path === 'home.activityPeriod' && S.view === 'home') drawHeatmap();
  if (path === 'home.progressPeriod' && S.view === 'home') drawProgress();
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
export function openSheet(html, { full = false } = {}) {
  $('#sheetBody').innerHTML = html;
  $('#sheet').classList.toggle('sheet-full', full);
  $('#sheet').hidden = false;
  const f = $('#sheetBody').querySelector('input,textarea');
  if (f && matchMedia('(hover:hover)').matches) setTimeout(() => f.focus(), 30);
}
export function closeSheet() {
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
export function charsFor(lang) {
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
export function folderSelect(id, selected, exclude = null, rootLabel = 'Ninguna (en «Mis mazos»)') {
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
export function deckOptions(selected) {
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
export function cardForm(c, { deckId: forcedDeck, prefill = null, source = null, sugIndex = null } = {}) {
  const sessionDeck = S.session && S.decks.has(S.session.scope) ? S.session.scope : null;
  const deckId = c?.deck_id || forcedDeck || (S.view === 'deck' && S.deckId) || sessionDeck || [...S.decks.values()].find(d => !d.archived)?.id || [...S.decks.keys()][0];
  if (!deckId && sugIndex == null) { toast('Crea primero un mazo'); return deckForm(null); }   // (una sugerencia se edita aunque aún no haya mazos)
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
export function autoGrow(t) { if (t.tagName !== 'TEXTAREA') return; t.style.height = 'auto'; t.style.height = Math.min(320, t.scrollHeight + 2) + 'px'; }
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
export function pickImage() {
  return new Promise(ok => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
    inp.addEventListener('change', () => ok(inp.files?.[0] || null));
    inp.addEventListener('cancel', () => ok(null));
    inp.click();
  });
}
// Guarda la imagen y devuelve su id (o null si no se ha podido)
export async function saveImage(file) {
  try { return await addImage(file); } catch (e) { toast(e.message || 'No se ha podido añadir la imagen'); return null; }
}
// Mete una imagen en un campo del editor, donde está el cursor (en su propia línea)
export async function imageIntoField(t, file) {
  const id = await saveImage(file);
  if (!id || !t.isConnected) return;
  const a = t.selectionStart, z = t.selectionEnd, before = t.value.slice(0, a), after = t.value.slice(z);
  const tok = (before && !before.endsWith('\n') ? '\n' : '') + imgToken(id) + (after && !after.startsWith('\n') ? '\n' : '');
  t.value = before + tok + after;
  t.focus(); t.selectionStart = t.selectionEnd = a + tok.length;
  S.edit.dirty = true;
  autoGrow(t); readEditor(); drawPreview();
}
export const imageFile = dt => [...(dt?.files || [])].find(f => /^image\//.test(f.type)) || null;
/* ---------- Furigana en el editor ---------- */
const KANJI = /[㐀-䶿一-鿿豈-﫿々〆ヶ]/;
export const hasRuby = s => new RegExp(RUBY_RE.source).test(String(s || ''));
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
export async function occSetImage(file) {
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
export function readEditor() {
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
export async function addTag(name, color = 'gray') {
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
export function deckTypes(deckId) {
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
export async function adoptTypes(types = []) {
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
export async function dedupeTypes() {
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
export function migrateDeckLangs() {
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
    // Enlace a otro apunte: se abre (mientras se escribe en el bloque, con Ctrl+clic)
    const wl = e.target.closest('a.wl');
    if (wl) {
      e.preventDefault();
      if (!wl.closest('[data-block-input]') || e.ctrlKey || e.metaKey) return openWiki(wl.dataset.wiki);
    }
    const toc = e.target.closest('#pgToc [data-toc]');
    if (toc) { e.preventDefault(); S.tocOpen = false; updateToc(); return gotoBlock(toc.dataset.toc); }
    // Mayús+clic en un bloque: selecciona desde el que se estaba editando (o el último seleccionado) hasta él
    const nbk = S.view === 'page' && e.shiftKey && e.target.closest('#pgBlocks .nb');
    if (nbk) {
      const from = S.bsel?.anchor || document.querySelector('[data-block-input]')?.dataset.blockInput || nbk.dataset.block;
      const open = document.querySelector('[data-block-input]');
      if (open) { open.blur(); }
      getSelection()?.removeAllRanges();
      return setBlockSel(selRange(from, nbk.dataset.block), from, nbk.dataset.block);
    }
    if (Date.now() - justSelected < 400) return;   // se acaba de seleccionar arrastrando por varios bloques
    // Tocar un bloque de los apuntes lo pone en edición (salvo que se esté seleccionando texto)
    const eb = e.target.closest('[data-edit-block]');
    const td = e.target.closest?.('.nb-tbl td, .nb-tbl th');
    if (eb && td && !getSelection()?.toString().trim()) return editBlock(eb.dataset.editBlock, { r: td.tagName === 'TH' ? 'h' : td.parentElement.rowIndex - 1, c: td.cellIndex });
    // Un enlace en un bloque que no se está editando se abre (no pasa a edición)
    if (eb && e.target.closest('a[href]')) return;
    if (eb && !getSelection()?.toString().trim()) {
      // El cursor, donde se ha tocado (el texto pintado es el mismo Markdown con las marcas ocultas)
      const o = eb.classList.contains('md') ? selOffsets(eb) : null;
      return editBlock(eb.dataset.editBlock, o ? o.a : null);
    }
    if (e.target.id === 'sheet') requestClose();
    else if (e.target.closest('.pv-card') && S.edit) { S.edit.pvSide = S.edit.pvSide === 'front' ? 'back' : 'front'; drawPreview(); }
    return;
  }
  const ds = b.dataset;
  if (b.parentElement?.dataset.plstate && ds.v) return setPlanNode(b.parentElement.dataset.plstate, { state: ds.v });
  if (ds.plclear) return setPlanNode(ds.plclear, { exam: '' });
  if (ds.nav) { if (S.view === 'study') S.session = null; return go(ds.nav, ds.nav === 'deck' ? {} : { cardQuery: '' }); }
  if (ds.nfmt) return formatSelection(ds.nfmt, ds.color);
  if (ds.bop) return blockAction(ds.bop);
  if (ds.helpTab) return showHelpTab(ds.helpTab);
  if (ds.export) return exportPage(ds.export);
  if (ds.fold) return toggleFold(ds.fold);
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
  if (ds.tblmenu) return S.tblMenu ? closeTblMenu() : openTblMenu(b);
  if (ds.tbl) { const tid = b.closest('[data-table-ed]')?.dataset.tableEd || S.tblMenu?.id; return tid && tableAction(tid, ds.tbl); }
  if (ds.sugOpen !== undefined) return openSugEditor(+ds.sugOpen);
  if (ds.sugHide !== undefined) return hideSuggestion(+ds.sugHide);
  if (ds.sugBlock) return openSuggestions(ds.sugBlock);
  if (ds.sugType) {
    const g = S.sug, all = [...new Set(g.list.map(x => x.typeId))];
    if (!g.types) g.types = new Set(all);
    g.types.has(ds.sugType) ? g.types.delete(ds.sugType) : g.types.add(ds.sugType);
    if (!g.types.size || g.types.size === all.length) g.types = null;
    return redrawSuggestions();
  }
  if (ds.sugGroup) {
    readSugEdit();
    const g = S.sug, items = g.list.filter(x => (!g.types || g.types.has(x.typeId)) && (ds.sugGroup === 'all' ? x.blockId === g.only : (ds.sugGroup === 'rec') === (x.score >= PRESELECT)));
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
    case 'test-sound': return chime('good');
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
    case 'import-pdf': closeSheet(); return $('#pdfFile').click();
    case 'import-into-page': closeSheet(); setImportInto(true); return $('#noteFile').click();
    case 'import-notes': setImportInto(false); return $('#noteFile').click();
    case 'export-page': return exportSheet();
    case 'export-all-notes': return exportAllNotes();
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
        <li><button class="row-link" data-act="import-into-page">${icon('upload', { size: 20 })}<span><b>Importar…</b><small>PDF, Word, Markdown, HTML o CSV · ${curPage().blocks.some(b => b.text.trim() || b.type === 'img' || b.type === 'hr') ? 'se añade al final de este apunte' : 'se convierte en este apunte'}</small></span></button></li>
        <li><button class="row-link" data-act="export-page">${icon('download', { size: 20 })}<span><b>Exportar…</b><small>Markdown, Word, PDF o página web</small></span></button></li>
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
    case 'news': return showNews();
    case 'ruby-ok': return rubyApply();
    case 'ruby-del': return rubyApply(true);
    case 'fmt-colors': return toggleColorMenu();
    case 'pg-undo': return histTravel(-1);
    case 'pg-redo': return histTravel(1);
    case 'find': return S.find?.open ? closeFind() : openFind();
    case 'find-next': return gotoFind(1);
    case 'find-prev': return gotoFind(-1);
    case 'find-close': return closeFind();
    case 'find-rep': S.find.rep = !S.find.rep; return openFind(S.find.rep);
    case 'find-one': return replaceFind(false);
    case 'find-all': return replaceFind(true);
    case 'toc': S.tocOpen = !S.tocOpen; return updateToc();
    case 'bsel-ops': return openOps(selIds()[0], b);
    case 'bsel-dup': return blockAction('dup');
    case 'bsel-del': return blockAction('del');
    case 'bsel-clear': return clearBlockSel();
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
    case 'plan-equal': {
      for (const n of Object.values(planNodes())) delete n.weight;
      savePrefsSoon(); toast('Foco repartido por igual'); return renderPlan();
    }
    case 'plan-urgent': return planUrgent();
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
    case 'sug-refresh': return refreshSuggestions(true);
    case 'sug-all': S.sug.only = null; return drawSuggestions();
    case 'sug-unhide': setSugHidden(S.sug.pageId, new Set()); refreshSuggestions(true); return scheduleSugMarks(0);
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
    case 'push-allow': return pushAllow();
    case 'push-later': { try { localStorage.setItem(PUSH_ASK, 'no'); } catch { /* sin almacenamiento */ } $('#pushAsk')?.remove(); return; }
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
  if (e.target.matches?.('.tc')) { histRecord('type'); autoGrow(e.target); placeTblHandles(e.target.parentElement); return saveGrid(e.target.closest('[data-table-ed]').dataset.tableEd); }
  if (e.target.matches?.('[data-block-input]')) {
    const t = e.target, b = curPage()?.blocks.find(x => x.id === t.dataset.blockInput);
    // «# », «- », «1. », «[] », «> »… al principio de un párrafo cambian el tipo de bloque
    const sc = b && b.type === 'p' && shortcut(t.value);
    if (sc) return retypeBlock(b, sc.type, sc.text, sc.type === 'todo' ? { checked: sc.checked } : {});
    syncBlock(t, 'type');
    wikiCheck(t);
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
  if (e.target.dataset.plw) return setPlanWeight(e.target.dataset.plw, Number(e.target.value));
  if (e.target.dataset.plexam !== undefined && e.target.dataset.plexam) return setPlanNode(e.target.dataset.plexam, { exam: e.target.value || '' });
  if (e.target.id === 'remindOn') return setRemind('on', e.target.checked);
  if (e.target.id === 'remindCheers') return setRemind('cheers', e.target.checked);
  if (e.target.id === 'remindAt') { if (!S.prefs.remind.on) { S.prefs.remind.time = e.target.value; return savePrefsSoon(); } return setRemind('time', e.target.value); }
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
  if (e.target.id === 'sugMarksOpt') {
    try { localStorage.setItem('flaski-sugmarks', e.target.checked ? 'on' : 'off'); } catch { /* sin almacenamiento */ }
    return paintSugMarks();
  }
  if (e.target.id === 'sugDeck') {
    // Otro mazo puede cambiar los tipos (los de idiomas) y lo que ya está como tarjeta
    S.sug.deckId = e.target.value;
    return refreshSuggestions(false);
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

/* ===================== amigos ===================== */
// Se cargan aparte de lo demás (no retrasan la app) y se refrescan como mucho una vez por minuto
const FR = () => S.friends || (S.friends = { me: null, list: [], requests: [], cheers: [], loaded: false, missing: false, error: '', at: 0 });
export async function loadFriends(force = false) {
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
export function homeFriendsHTML() {
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
export function inviteSheet(code) {
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
initProgressHover();
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
