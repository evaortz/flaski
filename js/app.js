// Flaski · lógica de la interfaz
// Estructura: estado (S) → funciones render*() que pintan cada vista → manejadores de eventos.
import * as api from './api.js';
import { dateKey, DEFAULT_ALGO } from './srs.js';
import { loadPrefs, algoFor, applyLook, applySavedLook } from './prefs.js';
import { APP_NAME } from './config.js';
import { initProgressHover, streaks, initChartTips } from './charts.js';
import { mountEmojiPicker } from './emoji-picker.js';
import { icon } from './icons.js';
import { orderTokens, checkTyped, blankType, copyType, nextId, parsePairs, checkNumber } from './cardtypes.js';
import { setBaseRate } from './tts.js';
import { loadSnapshot, deleteSnapshot, lastUser, forgetUser } from './snapshot.js';
import { parsePasted } from './notes.js';
import { formatCode, parseInvite } from './friends.js';
import { PRESELECT } from './suggest.js';
import { setRemote as setImageRemote } from './media.js';
import { selOffsets } from './liveedit.js';
import { newBlock, blockId, shortcut, pageTitle, TABLE_TEMPLATE, pageToMarkdown, isEmptyPage } from './pages.js';
import { chime } from './feel.js';
import { $, main, S, esc, fmt, plain, cardList, toast, fail, deckIcon, saveOrgPrefs, loadOrgPrefs, shareUrl, addExtraNew, algo, planNodes, backlogOff, tandaMinutes, todayMinutes } from './comun.js';
import { renderAuth, renderNewPassword, submitAuth, onSignedIn, showNews, showIntro, isOffline, onSignedOut } from './pantallas/cuenta.js';
import { renderHome, tandaSheet, backlogSheet } from './pantallas/inicio.js';
import { getType, typeIn, cardModel, sayOrWarn, exitTarget, testVoices, pickMatch, sortAction, playListen, strokesSheet, startSession, shuffleTokens, renderStudy, reveal, grade, undo, ENT_MODES, toggleDictation } from './pantallas/estudio.js';
import { plural, crumbs, renderDeck, importFile, addAnki, download, exportDeck, deckMenu, closeDeckMenu, fromNoteSheet, linkNoteSheet, linkPage } from './pantallas/mazos.js';
import { renderLibrary, createMenuHTML, importMenuHTML } from './pantallas/biblioteca.js';
import { renderExplore, exploreClick, openPublicPreview, openBuiltinPreview, previewImport, pasteSheet, loadAiGuide, copyText, addPreview } from './pantallas/explorar.js';
import { growTitle, fitCrumbs, pageCards, savePageSoon, noteCrumbs, pageFolder, CALLOUT_ICONS, blockHTML, renderPage, curPage, repaint, redrawBlocks, toggleFold, histRecord, histTravel, selRange, selIds, setBlockSel, clearBlockSel, blockAction, justSelected, drag, openOps, closeOps, openFind, closeFind, gotoFind, replaceFind, updateToc, gotoBlock, openWiki, wikiCheck, closeWikiMenu, editBlock, retypeBlock, blockKey, toggleColorMenu, toggleFmtMore, formatSelection, syncBlock, fold, openBlockMenu, closeBlockMenu, chooseBlockType, addImageBlock, removeImageBlock, newPage, importPdf, exportSheet, exportPage, exportAllNotes, setImportInto, cardFromSelection, blockCardsSheet } from './pantallas/apuntes.js';
import { placeTblHandles, openTblMenu, closeTblMenu, tableEd, saveGrid, tableAction, tableKey } from './pantallas/apuntes-tablas.js';
import { notesHelpSheet, showHelpTab } from './pantallas/apuntes-ayuda.js';
import { setSugHidden, openSuggestions, refreshSuggestions, drawSuggestions, hideSuggestion, scheduleSugMarks, paintSugMarks, redrawSuggestions, openSugEditor, saveSugEditor, readSugEdit, createSuggested } from './pantallas/sugerencias.js';
import { renderProfile, renderStats, getPref, setPref, savePrefsSoon, seg, sw, numIn, PUSH_ASK, pushAllow, setRemind, renderSettings, prefChanged, backupData, restoreBackup, saveProfileForm, nameSheet, creditsSheet, clearSettingFind } from './pantallas/perfil.js';
import { qsCheck, qsSkip, qsInsert, rvOn, startReview, stopReview, rvReveal, rvGrade, rvMake, rvKey, rvLeave, rvOffer, rvMakePending } from './pantallas/apuntes-repaso.js';
import { focusPageBlock } from './pantallas/apuntes.js';
import { setMapView, cellClick, practiceResist, practiceCell, openFicha, practiceSel, clearMapSel } from './pantallas/mapa.js';
import { openSheet, closeSheet, requestClose, iconPicker, setIcon, showIconTab, pickFolderImage, tagPicker, redrawTagPicker, filterTagPicker, updateTagFields, deckForm, folderForm, tagsSheet, drawTypePicker, openTypePicker, openEditorPicker, openQuickPicker, setQuickType, markPickedType, useType, edDeck, cardForm, autoGrow, setEditorType, redrawEditorFields, applyFormat, pickImage, rubyLine, rubyApply, rubyClose, occFields, occRedraw, occSetImage, occDelete, readEditor, drawPreview, confirmSheet, shareSheet, readIcon, saveDeckForm, saveFolderForm, addTag, saveTagsSheet, tagName, moveSheet, addDecksSheet, moveDecks, deleteFolder, saveCardForm, quickSheet, drawQuick, saveQuick, typeUsage, typesSheet, typeEditor, drawTypeEditor, readTypeEditor, saveTypeEditor, deckTypes } from './pantallas/editor.js';
import { mountTestBar, loadSampleData } from './pantallas/pruebas.js';
import { renderPlan, renderExam, renderPlanStart, planClick, removeExam } from './pantallas/plan.js';
import { simClick, renderSim, simKey } from './pantallas/simulacro.js';
import { friendsChanged, markCheered, renderFriends, friendAction, addFriend, friendMenu } from './pantallas/amigos.js';

/* ===================== navegación ===================== */
export function go(view, extra = {}) {
  const leaving = S.view === 'page' && (view !== 'page' || extra.pageId !== S.pageId);
  if (leaving) dropEmptyPage(S.pageId);
  // Irse del apunte a mitad de un repaso: se propone crear lo fallado que aún no es pregunta
  const rvp = leaving ? rvLeave() : null;
  Object.assign(S, { view }, extra);
  closeSheet(); closeBlockMenu(); closeOps(); closeWikiMenu(); closeFind(); closeDeckMenu();
  S.bsel = null; S.tocOpen = false;
  render();
  window.scrollTo(0, 0);
  if (S.focusBlock) focusPageBlock();
  if (rvp) rvOffer(rvp);
}
// Un apunte que se deja vacío y sin título (y sin preguntas) se descarta al salir de él
function dropEmptyPage(id) {
  const p = S.pages.get(id);
  if (!isEmptyPage(p, cardList().some(c => c.page_id === id))) return;
  S.pages.delete(id);
  api.deletePage(id).catch(() => {});
}
export function render() {
  const authed = !!S.uid && !S.recovery;
  // Un solo árbol de carpetas: la carpeta de los apuntes y la de las listas es la misma vista (decks + folderId);
  // sin carpeta, la raíz de la Biblioteca
  if (S.view === 'notes') Object.assign(S, { view: 'decks', folderId: S.noteFolder || null });
  if (S.view === 'decks' && !S.folderId) S.view = 'library';
  if (S.view === 'library') Object.assign(S, { folderId: null, noteFolder: null });
  if (S.view === 'decks') S.noteFolder = S.folderId;
  $('#nav').hidden = !authed || S.view === 'study' || (S.view === 'sim' && (S.simShow ? S.simShow.mode !== 'answers' : !!S.sim));
  document.body.classList.toggle('no-nav', $('#nav').hidden);
  document.body.classList.toggle('in-study', authed && (S.view === 'study' || (S.view === 'sim' && !S.simShow?.mode?.startsWith('answers'))) && !document.body.classList.contains('study-sheet'));
  document.body.dataset.view = S.view;
  if (authed && !S.loading) navMe();
  for (const b of document.querySelectorAll('[data-nav]:not(#navMe)')) {
    const cur = b.dataset.nav === S.view || (b.dataset.nav === 'library' && ['decks', 'deck', 'notes', 'page'].includes(S.view)) || (b.dataset.nav === 'profile' && ['settings', 'friends', 'stats', 'plan', 'exam', 'planStart', 'sim'].includes(S.view));
    if (cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  $('#banner').hidden = !(api.mode === 'local' && !api.testMode && S.view === 'home');
  if (S.recovery) return renderNewPassword();
  if (!S.uid) return renderAuth();
  if (S.loading) { main.innerHTML = '<div class="empty"><div class="spin" aria-label="Cargando"></div><p class="muted">Cargando tus preguntas…</p></div>'; return; }
  ({ home: renderHome, study: renderStudy, library: renderLibrary, decks: renderLibrary, deck: renderDeck, explore: renderExplore, notes: renderLibrary, page: renderPage, profile: renderProfile, friends: renderFriends, stats: renderStats, settings: renderSettings, plan: renderPlan, exam: renderExam, planStart: renderPlanStart, sim: renderSim }[S.view] || renderHome)();
}

// Abajo de la barra lateral (en el ordenador): tu inicial, tu nombre y tu racha
function navMe() {
  const el = $('#navMe');
  if (!el) return;
  const who = S.name || (api.mode === 'local' ? 'Tú' : (S.email || '').split('@')[0]) || 'Tú', st = streaks(S.log).current;
  el.innerHTML = `<span class="pf-av">${esc(who.trim().charAt(0).toUpperCase())}</span><span class="nav-me-t"><b>${esc(who)}</b><span>${icon(st ? 'racha' : 'racha-apagada', { size: 14 })} ${plural(st, 'día', 'días')}</span></span>`;
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
  // Plan de estudio, exámenes y simulacros: sus botones llevan data-pl o data-sim
  if (ds.pl) return planClick(b);
  if (ds.sim) return simClick(b, e);
  if (ds.nav) { if (S.view === 'study') S.session = null; return go(ds.nav, ds.nav === 'deck' ? {} : { cardQuery: '' }); }
  if (ds.nfmt) return formatSelection(ds.nfmt, ds.color);
  if (ds.bop) return blockAction(ds.bop);
  if (ds.helpTab) return showHelpTab(ds.helpTab);
  if (ds.export) return exportPage(ds.export);
  if (ds.fold) return toggleFold(ds.fold);
  if (ds.start) return startSession(ds.start);
  // Mapa: «Lista | Mapa», tocar una casilla (ficha o elegir varias) y practicar
  if ('mapView' in ds) { setMapView(ds.scope, ds.mapView === 'map'); return render(); }
  if (ds.mapCell) return cellClick(b, e);
  // Repasar un apunte: tocar lo tapado lo destapa; los 4 botones, como en la tanda
  // Entender: cómo lo explicas, ↑ = ↓ de cada efecto y dictar
  if (ds.exMode && S.session?.st?.ex) { S.session.st.ex.mode = ds.exMode; renderStudy(); if (ds.exMode !== 'think') $('#exText')?.focus(); return; }
  if (ds.wi && S.session?.st?.ex) { const [i, d] = ds.wi.split(':'); S.session.st.ex.picks[+i] = d; return renderStudy(); }
  if (ds.rv) return rvReveal(Number(ds.rv));
  if (ds.rvGrade) return rvGrade(Number(ds.rvGrade));
  if (ds.remindAt) {
    Object.assign(S.prefs.remind, { on: true, time: ds.remindAt }); savePrefsSoon();
    const box = $('#firstRemind'); if (box) box.innerHTML = `<h3>Te avisaremos a las ${esc(ds.remindAt)}</h3><p>Si ese día ya lo tienes todo hecho, no avisa. Lo cambias en Ajustes › Avisos.</p>`;
    return pushAllow();
  }
  if (ds.tandaMin) {
    const m = Number(ds.tandaMin);
    S.prefs.study.tandaMin = m; S.prefs.study.tandaAsked = true; savePrefsSoon();
    b.parentElement.querySelectorAll('.tanda-opt').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    const btn = $('#sheetBody [data-act="tanda-go"]'); if (btn) btn.textContent = `Empezar · ${m} min`;
    if (S.view === 'home') render();
    return;
  }
  if (ds.stats) { S.stats.scope = ds.stats; return go('stats'); }
  if (ds.stp !== undefined) { S.stats.period = Number(ds.stp); const y = scrollY; renderStats(); scrollTo(0, y); return; }
  if (ds.stfc) { S.stats.fcDays = Number(ds.stfc); const y = scrollY; renderStats(); scrollTo(0, y); return; }
  if (ds.v !== undefined && b.parentElement?.dataset.seg) {
    const path = b.parentElement.dataset.seg;
    const v = typeof getPref(path) === 'number' ? Number(ds.v) : ds.v;
    setPref(path, v);
    if (path === 'study.tandaMin') S.prefs.study.tandaAsked = true;
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
  if (ds.say) { const c = S.cards.get(S.session?.queue[0]); if (c) { const m = cardModel(c); sayOrWarn(m.fields[ds.say], m.type.fields.find(f => f.id === ds.say)?.lang); } return; }
  if (ds.sayInput) { const t = typeIn(getType(S.edit?.typeId), edDeck()); sayOrWarn($('#fld-' + ds.sayInput).value, t?.fields.find(f => f.id === ds.sayInput)?.lang); return; }
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
  if (ds.quickType) return setQuickType(ds.quickType);
  if (ds.pickType) return markPickedType(ds.pickType);
  if (ds.page) return go('page', { pageId: ds.page });
  if (ds.cfilter) { Object.assign(S, { cardFilter: ds.cfilter, cardAll: false }); return renderDeck(); }
  if (ds.linkPage) return linkPage(ds.linkPage);
  if (ds.noteSug) {
    // Sugerencias del apunte elegido, para la lista desde la que se ha pedido
    const deckId = S.deckId;
    go('page', { pageId: ds.noteSug });
    openSuggestions();
    if (S.sug && S.decks.has(deckId)) { S.sug.deckId = deckId; refreshSuggestions(false); }
    return;
  }
  if (ds.nfolder !== undefined) { Object.assign(S.org, { query: '', tagIds: [], archived: false }); S.libKind = 'all'; return go('decks', { folderId: ds.nfolder || null }); }
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
    try { await api.social.cheer(ds.cheer, ds.cheerKind || 'clap'); } catch (err) { e.target.closest('button').disabled = false; return fail(err); }
    markCheered(ds.cheer);
    toast(`Le has mandado ánimos a ${p?.name || 'tu amigo'} 👏`);
    if (S.view === 'friends') renderFriends();
    if (S.view === 'home') friendsChanged();
    return;
  }
  // «Ver en el apunte» (también desde el mapa de ese apunte: se vuelve a la vista Apunte)
  if (ds.openPage) { if (S.mapView === `page:${ds.openPage}`) S.mapView = null; if (b.closest('.mp-ficha')) closeSheet(); return go('page', { pageId: ds.openPage, focusBlock: ds.openBlock || null }); }
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
  if (ds.folder !== undefined) { Object.assign(S.org, { query: '', tagIds: [], archived: false }); S.libKind = 'all'; return go('decks', { folderId: ds.folder || null }); }
  if (ds.libkind) { S.libKind = ds.libkind; return renderLibrary(); }
  if (ds.drawing) return setIcon(ds.drawing);
  if (ds.iconTab) return showIconTab(ds.iconTab);
  if (ds.tagfilter) {
    const t = ds.tagfilter, list = S.org.tagIds;
    S.org.tagIds = list.includes(t) ? list.filter(x => x !== t) : [...list, t];
    return renderLibrary();
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
      toast('Etiqueta borrada');
      return tagsSheet();
    } catch (err) { return fail(err); }
  }
  if (ds.renameTag) return tagsSheet(ds.renameTag);
  if (ds.tagColor) { try { await updateTagFields(ds.tagColor, { color: ds.color }); } catch (err) { fail(err); } return; }
  if (ds.card) return cardForm(S.cards.get(ds.card));
  if (ds.ex) return exploreClick(b);
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
    case 'sample-data': return loadSampleData(b);
    case 'reveal': return reveal(!!b.dataset.giveup);
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
    case 'test-voice': return testVoices();
    case 'test-sound': return chime('good');
    case 'algo-reset': { S.prefs.algo.custom = { ...DEFAULT_ALGO }; prefChanged('algo.custom'); const y = scrollY; renderSettings(); scrollTo(0, y); return; }
    case 'backup': {
      const day = dateKey();
      download(JSON.stringify(await backupData(), null, 1), `flaski-copia-${day}.json`, 'application/json');
      return toast('Copia descargada');
    }
    case 'restore': return $('#backupFile').click();
    case 'ask-reset-progress': return confirmSheet('¿Reiniciar el progreso de todas las preguntas?', 'reset-progress', 'Reiniciar todo');
    case 'reset-progress': {
      try { await api.clearManyProgress(S.uid, null); S.progress = new Map(); closeSheet(); toast('Progreso reiniciado'); } catch (err) { fail(err); }
      return;
    }
    case 'ask-reset-deck': return confirmSheet('¿Reiniciar el progreso de esta lista?', 'reset-deck', 'Reiniciar lista');
    case 'reset-deck': {
      const ids = cardList().filter(c => c.deck_id === S.deckId).map(c => c.id);
      try { await api.clearManyProgress(S.uid, ids); ids.forEach(id => S.progress.delete(id)); closeSheet(); toast('Progreso de la lista reiniciado'); renderDeck(); } catch (err) { fail(err); }
      return;
    }
    case 'ask-reset-prefs': return confirmSheet('¿Restablecer todos los ajustes?', 'reset-prefs', 'Restablecer');
    case 'reset-prefs': { S.prefs = loadPrefs(); applyLook(S.prefs.look); setBaseRate(1); savePrefsSoon(); closeSheet(); toast('Ajustes restablecidos'); return renderSettings(); }
    case 'exit': {
      // Al salir se vuelve a donde empezó la tanda (apunte, lista o carpeta)
      const [view, opts] = exitTarget(S.session?.scope);
      S.session = null;
      return go(view, opts);
    }
    case 'more': { addExtraNew(Number(b.dataset.more) || 10); return startSession(S.session?.scope || 'all'); }
    // Tanda corta: la primera vez se pregunta cuánto suele durar el rato de estudio
    case 'tanda-short': return S.prefs.study.tandaAsked || todayMinutes() ? startSession('all', { minutes: tandaMinutes() }) : tandaSheet();
    case 'tanda-min': return tandaSheet();
    case 'first-done': S.session = null; return go('home');
    case 'remind-other': {
      const box = $('#firstRemind'), times = [];
      for (let h = 6; h <= 23; h++) for (const m of ['00', '30']) times.push(`${String(h).padStart(2, '0')}:${m}`);
      if (box) box.innerHTML = `<h3>¿A qué hora te aviso?</h3><div class="first-opts"><select id="firstTime" aria-label="Hora del aviso">${times.map(t => `<option ${t === S.prefs.remind.time ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <button type="button" class="first-yes" data-act="remind-pick">Avísame</button></div>`;
      return;
    }
    case 'remind-pick': { const t = $('#firstTime')?.value; if (t) { b.dataset.remindAt = t; b.click(); } return; }
    case 'atrasos': return backlogSheet();
    case 'atrasos-all': { backlogOff(); closeSheet(); return render(); }
    case 'tanda-go': { S.prefs.study.tandaAsked = true; savePrefsSoon(); closeSheet(); return startSession('all', { minutes: tandaMinutes() }); }
    case 'tanda-again': return startSession('all', { minutes: S.session?.minutes || tandaMinutes() });
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
    case 'new-folder': {
      // Desde «Mover a otra carpeta»: al crearla, se mueve ahí lo que se estaba moviendo
      const mv = document.querySelector('#sheetBody .movelist')?.dataset.moving;
      S.moveAfterFolder = mv ? JSON.parse(mv) : null;
      return folderForm(null);
    }
    case 'create-menu': return openSheet(createMenuHTML());
    case 'import-menu': return openSheet(importMenuHTML());
    case 'toggle-emoji': {
      const panel = $('#emojiPanel');
      panel.hidden = !panel.hidden;
      $('.icon-current').setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden && !panel.dataset.ready) { panel.dataset.ready = '1'; mountEmojiPicker(panel, setIcon); }
      return;
    }
    case 'clear-icon': return setIcon('');
    case 'folder-image': return pickFolderImage();
    case 'move-deck': return moveSheet([S.deckId]);
    case 'add-decks-here': return addDecksSheet();
    case 'confirm-add-decks': {
      const ids = [...document.querySelectorAll('input[name="pick-deck"]:checked')].map(i => i.value);
      if (!ids.length) return toast('Elige al menos una lista');
      b.disabled = true;
      return moveDecks(ids, S.folderId);
    }
    case 'edit-folder': return folderForm(S.folders.get(S.folderId));
    case 'ask-delete-folder': return confirmSheet('¿Borrar esta carpeta?', 'delete-folder', 'Borrar carpeta');
    case 'delete-folder': {
      b.disabled = true;
      const fid = S.folderId;
      const parent = S.folders.get(fid)?.parent_id || null;
      const up = parent && S.folders.has(parent) ? parent : null;
      try { await deleteFolder(fid); toast('Carpeta borrada'); return go('decks', { folderId: up }); }
      catch (err) { b.disabled = false; return fail(err); }
    }
    case 'manage-tags': return tagsSheet();
    case 'quick-add': return quickSheet();
    case 'manage-types': S.typeEdit = null; return typesSheet();
    case 'new-page': return newPage();
    case 'import-pdf': closeSheet(); return $('#pdfFile').click();
    case 'import-into-page': closeSheet(); setImportInto(true); return $('#noteFile').click();
    case 'import-notes': closeSheet(); setImportInto(false); return $('#noteFile').click();
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
    case 'ask-delete-page': return confirmSheet('¿Borrar este apunte?', 'delete-page', 'Borrar');
    case 'delete-page': {
      const id = S.pageId;
      try { await api.deletePage(id); } catch (err) { return fail(err); }
      S.pages.delete(id);
      for (const c of S.cards.values()) if (c.page_id === id) { c.page_id = null; c.block_id = null; }
      toast('Apunte borrado. Sus preguntas se conservan.');
      return go('notes');
    }
    case 'back-study': return go('study');
    case 'edit-nfolder': return folderForm(S.folders.get(S.noteFolder));
    case 'page-tags': {
      if (S.pageTagsMissing) return openSheet('<h2>Etiquetas en los apuntes</h2><p>Para usar etiquetas en los apuntes, vuelve a ejecutar <code>supabase/schema.sql</code> en el SQL Editor de Supabase y recarga la app.</p><div class="btnrow"><span class="spacer"></span><button class="primary" data-act="close-sheet">Entendido</button></div>');
      return openSheet(`<h2>Etiquetas del apunte</h2><p class="muted small">Las mismas que usas en las listas: sirven para filtrar en Biblioteca.</p>
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
        <li><button class="row-link" data-act="suggest-cards">${icon('sugerencia', { size: 20 })}<span><b>Sugerir preguntas</b><small>Propone preguntas a partir de las definiciones, negritas, tablas y listas</small></span></button></li>
        <li><button class="row-link" data-act="import-into-page">${icon('upload', { size: 20 })}<span><b>Importar…</b><small>PDF, Word, Markdown, HTML o CSV · ${curPage().blocks.some(b => b.text.trim() || b.type === 'img' || b.type === 'hr') ? 'se añade al final de este apunte' : 'se convierte en este apunte'}</small></span></button></li>
        <li><button class="row-link" data-act="export-page">${icon('download', { size: 20 })}<span><b>Exportar…</b><small>Markdown, Word, PDF o página web</small></span></button></li>
        <li><button class="row-link" data-act="page-copy-md">${icon('copy', { size: 20 })}<span><b>Copiar como texto</b><small>Con títulos, listas y tablas en Markdown</small></span></button></li>
        <li><button class="row-link danger" data-act="ask-delete-page">${icon('trash-2', { size: 20 })}<span><b>Borrar apunte</b><small>Sus preguntas no se borran: solo dejan de estar unidas a él</small></span></button></li>
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
    case 'edit-name': return nameSheet();
    case 'set-find-clear': return clearSettingFind();
    case 'credits': return creditsSheet();
    case 'ruby-ok': return rubyApply();
    case 'ruby-del': return rubyApply(true);
    case 'fmt-colors': return toggleColorMenu();
    case 'fmt-more': return toggleFmtMore();
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
    case 'sel-done': document.activeElement?.blur(); return getSelection()?.removeAllRanges();
    case 'goto-src': return S.edit?.source && gotoBlock(S.edit.source.block_id);
    case 'pick-type': return document.querySelector('#q-type') ? openQuickPicker() : openEditorPicker();
    case 'use-type': return useType();
    case 'close-picker': return openTypePicker(false);
    case 'types-all': S.pick.all = !S.pick.all; return drawTypePicker();
    case 'new-type': return typeEditor(blankType());
    case 'add-field': { const t = readTypeEditor(); const id = nextId('f', t.fields); t.fields.push({ id, name: `Campo ${t.fields.length + 1}`, lang: '', autoplay: false, help: '' }); return drawTypeEditor(); }
    case 'add-template': { const t = readTypeEditor(); t.templates.push({ id: nextId('t', t.templates), name: `Pregunta ${t.templates.length + 1}`, mode: 'flip', front: [t.fields[0].id], back: t.fields.slice(1).map(f => f.id) }); return drawTypeEditor(); }
    case 'delete-type': {
      const t = S.typeEdit; const n = typeUsage(t.id);
      if (n) return toast(`No se puede borrar: lo usan ${n} preguntas. Cámbialas de tipo primero.`);
      try { await api.deleteType(t.id); S.types.delete(t.id); toast('Tipo borrado'); return typesSheet(); } catch (err) { return fail(err); }
    }
    case 'make-cloze': {
      const ta = $('#' + ds.target); const a = ta.selectionStart, z = ta.selectionEnd;
      if (a === z) return toast('Selecciona primero la parte que quieres ocultar');
      ta.value = ta.value.slice(0, a) + '{{' + ta.value.slice(a, z) + '}}' + ta.value.slice(z);
      ta.focus(); ta.selectionStart = ta.selectionEnd = z + 4; readEditor(); return drawPreview();
    }
    case 'save-tags': return saveTagsSheet();
    case 'exam-del-ok': return removeExam();
    case 'toggle-archived': S.org.archived = !S.org.archived; return renderLibrary();
    case 'clear-filters': Object.assign(S.org, { query: '', tagIds: [], archived: false }); return renderLibrary();
    case 'add-tag-inline': {
      const input = $('#f-newtag');
      try {
        const color = document.querySelector('input[name="f-newtag-color"]:checked')?.value;
        const t = await addTag(input.value, color);
        if (!t) return;
        const checked = [...document.querySelectorAll('input[name="f-tag"]:checked')].map(i => i.value);
        if (!checked.includes(t.id)) checked.push(t.id);
        const compact = $('#tagPick').classList.contains('compact');
        redrawTagPicker(checked);
        (compact ? $('#tagPick .tag-add') : $('#f-newtag'))?.focus();
      } catch (err) { fail(err); }
      return;
    }
    // Editor en el móvil: Borrar, Duplicar y Reiniciar progreso en «⋯ Más»
    case 'ed-extra': { const f = b.closest('.ed-foot'), on = !f.classList.contains('show-extra'); f.classList.toggle('show-extra', on); b.setAttribute('aria-expanded', on); return; }
    case 'pg-mode': return ds.mode === 'review' ? (rvOn() ? null : startReview()) : (rvOn() ? stopReview() : null);
    case 'ex-dictate': return toggleDictation();
    case 'rv-reveal': return rvReveal();
    case 'rv-make': return rvMake();
    case 'rv-make-pending': return rvMakePending();
    case 'rv-again': return startReview();
    case 'qs-skip': return qsSkip();
    case 'qs-insert': return qsInsert();
    case 'map-resist': return practiceResist(ds.scope);
    case 'map-practice': return practiceCell(b.closest('[data-map-scope]').dataset.mapScope, ds.key);
    case 'map-ficha': return openFicha(b.closest('[data-map-scope]').dataset.mapScope, ds.key);
    case 'map-sel-go': return practiceSel();
    case 'map-sel-clear': return clearMapSel();
    case 'untag': b.closest('.tagsel')?.remove(); redrawTagPicker(); $('#tagPick .tag-add')?.focus(); return;
    case 'tagpick-open': {
      const pop = $('#tagPick .tagpick-pop'), open = pop.hidden;
      pop.hidden = !open; b.setAttribute('aria-expanded', open);
      if (open) { $('#f-newtag').value = ''; filterTagPicker(); $('#f-newtag').focus(); }
      return;
    }
    case 'edit-deck': return deckForm(S.decks.get(S.deckId));
    case 'add-menu': return deckMenu('add', b);
    case 'deck-menu': return deckMenu('more', b);
    case 'cards-all': S.cardAll = true; return renderDeck();
    case 'from-note': return fromNoteSheet();
    case 'link-note': return linkNoteSheet();
    case 'archive-deck': {
      const d = S.decks.get(S.deckId);
      try {
        const nd = await api.updateDeck(d.id, { archived: !d.archived });
        S.decks.set(nd.id, { ...d, ...nd });
        toast(nd.archived ? 'Lista archivada' : 'Lista fuera del archivo');
        closeSheet(); return renderDeck();
      } catch (err) { return fail(err); }
    }
    case 'new-card': return cardForm(null);
    case 'share': return shareSheet();
    case 'import': closeSheet(); return $('#importFile').click();
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
    case 'goal-change': { go('settings'); $('#s-home')?.scrollIntoView(); return; }
    case 'cheers-seen': {
      const ids = (S.friends?.cheers || []).map(c => c.id);
      S.friends.cheers = [];
      friendsChanged();
      return api.social.seen(ids).catch(() => {});
    }
    case 'paste': return pasteSheet();
    case 'paste-preview': {
      S.pasteText = $('#pasteText').value;
      try { previewImport(parsePasted(S.pasteText), { source: 'pegado', baseName: 'Lista pegada' }); }
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
    case 'export-csv': if ($('.dk-msheet')) closeSheet(); return exportDeck('csv');
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
    case 'ask-delete-deck': return confirmSheet('¿Borrar esta lista y todas sus preguntas?', 'delete-deck', 'Borrar lista');
    case 'delete-deck': {
      b.disabled = true;
      const folderOfDeleted = S.decks.get(S.deckId)?.folder_id || null;
      try {
        await api.deleteDeck(S.deckId);
        for (const c of cardList()) if (c.deck_id === S.deckId) { S.cards.delete(c.id); S.progress.delete(c.id); }
        S.decks.delete(S.deckId); S.pub = null;
        toast('Lista borrada'); return go('decks', { folderId: folderOfDeleted });
      } catch (err) { b.disabled = false; return fail(err); }
    }
    case 'ask-delete-card': {
      const ids = S.edit?.siblings?.length ? S.edit.siblings : [b.closest('form').dataset.id];
      S.deleting = ids;
      return confirmSheet(ids.length > 1 ? `¿Borrar esta nota y sus ${ids.length} preguntas?` : '¿Borrar esta pregunta?', 'delete-card', 'Borrar');
    }
    case 'delete-card': {
      const ids = S.deleting || []; b.disabled = true;
      try {
        for (const id of ids) { await api.deleteCard(id); S.cards.delete(id); S.progress.delete(id); }
        if (S.session) { S.session.queue = S.session.queue.filter(x => !ids.includes(x)); S.session.st = null; S.session.revealed = false; }
        toast(ids.length > 1 ? 'Preguntas borradas' : 'Pregunta borrada'); closeSheet(); return render();
      } catch (err) { b.disabled = false; return fail(err); }
    }
    case 'open-owned': return go('deck', { deckId: b.dataset.deck, cardQuery: '' });
    case 'ask-reset-card': S.resetCard = b.closest('form').dataset.id; return confirmSheet('¿Reiniciar el progreso de esta pregunta?', 'reset-card', 'Reiniciar');
    case 'reset-card': {
      const id = S.resetCard; S.resetCard = null;
      if (!id) return closeSheet();
      try { await api.clearProgress(S.uid, id); S.progress.delete(id); toast('Progreso reiniciado'); closeSheet(); return render(); }
      catch (err) { return fail(err); }
    }
    case 'change-pass':
      return openSheet(`<h2>Cambiar contraseña</h2><form data-form="changepass"><label for="cp">Contraseña nueva</label><input id="cp" type="password" autocomplete="new-password" minlength="6" required>
        <div class="btnrow" style="margin-top:14px"><span class="spacer"></span><button type="button" class="ghost" data-act="close-sheet">Cancelar</button><button type="submit" class="primary">Guardar</button></div></form>`);
    case 'ask-reset-local': return confirmSheet('¿Borrar todas las listas y el progreso de este navegador?', 'reset-local', 'Borrar todo');
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
    try { const t = await addTag($('#nt-name').value); if (t) tagsSheet(); } catch (err) { fail(err); }
    return;
  }
  if (kind === 'renametag') {
    const name = tagName(form.querySelector('.t-name').value);
    if (!name) return;
    if ([...S.tags.values()].some(t => t.id !== form.dataset.id && t.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return toast('Ya tienes una etiqueta con ese nombre');
    try { await updateTagFields(form.dataset.id, { name }); } catch (err) { fail(err); }
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
  if (e.target.id === 'f-newtag') return filterTagPicker();
  if (e.target.id === 'exText' && S.session?.st?.ex) { S.session.st.ex.text = e.target.value; return; }
  if (e.target.id === 'typeSearch' && S.pick) { S.pick.q = e.target.value; return drawTypePicker(); }
  if (e.target.matches?.('.tc')) { histRecord('type'); autoGrow(e.target); placeTblHandles(e.target.parentElement); return saveGrid(e.target.closest('[data-table-ed]').dataset.tableEd); }
  if (e.target.matches?.('[data-block-input]')) {
    const t = e.target, b = curPage()?.blocks.find(x => x.id === t.dataset.blockInput);
    // «# », «- », «1. », «[] », «> »… al principio de un párrafo cambian el tipo de bloque
    const sc = b && b.type === 'p' && shortcut(t.value);
    if (sc) return retypeBlock(b, sc.type, sc.text, sc.type === 'todo' ? { checked: sc.checked } : {});
    syncBlock(t, 'type');
    wikiCheck(t);
    qsCheck(t);
    // «/» en un bloque vacío abre el menú de bloques; lo que se escribe detrás lo filtra
    const m = b && !['code', 'table', 'img'].includes(b.type) && /^\/([^\s/]*)$/.exec(t.value);
    if (m) openBlockMenu({ mode: 'slash', blockId: b.id, q: m[1], anchor: t });
    else if (S.blockMenu?.mode === 'slash') closeBlockMenu();
    autoGrow(t);
    return;
  }
  if (e.target.id === 'pgTitle') {
    // Un solo renglón de texto (aunque se vea en varias líneas): lo pegado con saltos se junta
    if (/[\r\n]/.test(e.target.value)) e.target.value = e.target.value.replace(/\s*[\r\n]+\s*/g, ' ');
    growTitle();
    const p = curPage();
    if (p) { p.title = e.target.value; savePageSoon(p); const cur = document.querySelector('.pg-top .crumbs .crumb-cur:last-child'); if (cur) { cur.dataset.full = pageTitle(p); fitCrumbs(); } }
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
  } else if (e.target.id === 'libSearch') {
    S.org.query = e.target.value;
    const pos = e.target.selectionStart;
    renderLibrary();
    const f = $('#libSearch'); f.focus(); f.setSelectionRange(pos, pos);
  } else if (e.target.id === 'exploreSearch') {
    S.exploreQuery = e.target.value;
    const pos = e.target.selectionStart;
    renderExplore();
    const f = $('#exploreSearch'); f.focus(); f.setSelectionRange(pos, pos);
  }
});
document.addEventListener('change', async e => {
  if (e.target.dataset.pl) return planClick(e.target);
  if (e.target.id === 'cardSort') { S.cardSort = e.target.value; return renderDeck(); }
  if (e.target.id === 'remindOn') return setRemind('on', e.target.checked);
  if (e.target.id === 'remindCheers') return setRemind('cheers', e.target.checked);
  if (e.target.id === 'remindAt') { if (!S.prefs.remind.on) { S.prefs.remind.time = e.target.value; return savePrefsSoon(); } return setRemind('time', e.target.value); }
  if (e.target.matches?.('[data-sug]')) {
    const sgi = S.sug?.list[+e.target.dataset.sug];
    if (sgi) { sgi.selected = e.target.checked; e.target.closest('.sug')?.classList.toggle('on', sgi.selected); }
    const sel = S.sug.list.filter(x => x.selected), n = sel.reduce((k, x) => k + (x.cards || 1), 0), btn = document.querySelector('[data-act="sug-create"]');
    if (btn) { btn.disabled = !n; btn.textContent = n ? `Crear ${plural(n, 'pregunta', 'preguntas')}` : 'Marca alguna'; }
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
  if (e.target.dataset?.idea != null && S.session?.st?.ex?.ideas) { S.session.st.ex.ideas[+e.target.dataset.idea] = e.target.checked; const y = scrollY; renderStudy(); scrollTo(0, y); return; }
  if (e.target.name === 'f-tag' && e.target.closest('.tagpick.compact')) { redrawTagPicker(); $('#tagPick .tag-add')?.focus(); }
  if (e.target.id === 'pgDeck') { const p = curPage(); if (p) { p.deck_id = e.target.value || null; savePageSoon(p); } }
  if (e.target.id === 'pgFolder') {
    const p = curPage();
    if (p) { p.folder_id = e.target.value || null; savePageSoon(p); $('.pg-top .crumbs').outerHTML = noteCrumbs(pageFolder(p), pageTitle(p)); }
  }
  if (e.target.id === 'libSort') { S.org.sort = e.target.value; saveOrgPrefs(); renderLibrary(); }
  if (e.target.id === 'c-deck') {
    const d = S.decks.get(e.target.value);
    const ic = e.target.closest('.ed-deck')?.querySelector('.icon, .dot');
    if (ic && d) ic.outerHTML = deckIcon(d);
    if (S.edit) { S.edit.dirty = true; readEditor(); redrawEditorFields(); }
  }
  if (['q-type', 'q-sep', 'q-deck'].includes(e.target.id)) drawQuick();
  if (e.target.id === 'destDeck') { const w = $('#newDeckWrap'); if (w) w.hidden = !!e.target.value; }
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
document.addEventListener('mousedown', e => { if (e.target.closest('[data-char], [data-fmt], #kbBar')) e.preventDefault(); });
$('#backupFile').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) restoreBackup(f); e.target.value = ''; });
$('#pdfFile').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) importPdf(f); e.target.value = ''; });
$('#importFile').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; });

document.addEventListener('keydown', e => {
  if (e.target.matches?.('[data-block-input]')) return blockKey(e);
  if (rvKey(e)) return;
  if (simKey(e)) return;
  if (e.target.matches?.('.tc')) return tableKey(e);
  if (e.key === 'Escape' && S.mapSel && $('#sheet').hidden) { clearMapSel(); return; }
  if (e.key === 'Escape' && e.target.id === 'f-newtag' && e.target.closest('.tagpick.compact')) { e.preventDefault(); redrawTagPicker(); $('#tagPick .tag-add')?.focus(); return; }
  if (e.key === 'Enter' && e.target.id === 'f-newtag') { e.preventDefault(); document.querySelector('[data-act="add-tag-inline"]')?.click(); return; }
  if (!$('#sheet').hidden) {
    // Escape o Enter en el buscador de tipos: cerrar el selector o elegir el primero
    if (S.pick && e.key === 'Escape') { e.preventDefault(); return openTypePicker(false); }
    if (e.target.id === 'rpIn' && (e.key === 'Enter' || e.key === 'Escape')) {
      e.preventDefault();
      if (e.key === 'Enter') return rubyApply();
      const t = S.rubyEdit?.t; rubyClose(); t?.focus(); return;
    }
    if (S.pick && e.key === 'Enter' && e.target.id === 'typeSearch') { e.preventDefault(); const id = document.querySelector('#typePicker [data-pick-type]')?.dataset.pickType; if (id) markPickedType(id, true); return; }
    if (e.key === 'Escape') requestClose();
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'i') && e.target.matches('.ef-input')) { e.preventDefault(); applyFormat(e.key === 'b' ? 'bold' : 'italic'); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { const f = document.querySelector('#sheetBody form[data-form]'); if (f) { e.preventDefault(); f.requestSubmit(); } }
    return;
  }
  if (S.view !== 'study' || !S.session || e.target.matches('input,textarea,select')) return;
  const ses = S.session; const c = S.cards.get(ses.queue[0]); const mode = c ? cardModel(c).tpl.mode : 'flip';
  if ((e.key === ' ' || e.key === 'Enter') && !ses.revealed && ses.queue.length && ['flip', 'cloze', 'occlusion'].includes(mode)) { e.preventDefault(); reveal(); }
  else if (!ses.revealed && (mode === 'choice' || mode === 'clozechoice') && /^[1-4]$/.test(e.key)) { e.preventDefault(); document.querySelector(`[data-choice="${+e.key - 1}"]`)?.click(); }
  else if (ses.revealed && /^[1-4]$/.test(e.key) && !(ENT_MODES.includes(mode) && e.key === '4')) { e.preventDefault(); grade(Number(e.key)); }
});

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
  // Modo local de pruebas (localhost con «?local»): aviso fijo en lugar del de «Modo local»
  if (api.testMode) { mountTestBar(); return onSignedIn(await api.auth.session()); }
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
