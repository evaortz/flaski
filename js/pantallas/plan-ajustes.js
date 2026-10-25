// Flaski · plan de estudio: Ajustes del plan. No hace falta tocar nada de aquí; es para afinar: el reparto de las
// nuevas, lo que no tiene examen (activo, solo repasar o en pausa), las etapas a mano (mandan durante su rango),
// el goteo al examen siguiente, el tope de nuevas al día y tu tiempo.
import { icon } from '../icons.js';
import { dayKey, addDays, isDay, live, sortStages, childrenOf, LEVELS } from '../plan.js';
import { main, S, esc, toast, folderIcon, deckIcon } from '../comun.js';
import { plan2, forecastNow, stateNow } from '../plan2-app.js';
import { liveExams, sharesToday, newCap } from '../plan2.js';
import { plural } from './mazos.js';
import { openSheet, closeSheet } from './editor.js';
import { rangeDay, shortName, shortDay } from './plan-ui.js';
import { commitPlan, undoTo } from './plan-guardar.js';

const FREE = [['paused', 'Pausa'], ['reviews', 'Solo repasar'], ['active', 'Activo']];
const byName = (a, b) => a.name.localeCompare(b.name, 'es', { numeric: true });
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// Las carpetas de primer nivel y las listas sueltas
function topItems() {
  const top = childrenOf(null, S.decks, S.folders);
  return [...top.folders.sort(byName).map(f => ({ key: 'f:' + f.id, name: f.name, ico: folderIcon(f) })), ...top.decks.sort(byName).map(d => ({ key: d.id, name: d.name, ico: deckIcon(d) }))];
}
const inExam = key => liveExams(plan2()).some(e => (key.startsWith('f:') ? (e.scope?.folders || []).includes(key.slice(2)) : (e.scope?.decks || []).includes(key)));

export function renderPlanSettings() {
  const p = plan2(), exams = forecastNow().exams.filter(e => e.date && e.date >= dayKey());
  const sh = [...sharesToday(stateNow(), 1)].filter(([id]) => id !== 'free');
  const par = liveExams(p).filter(e => e.mode === 'parallel');
  const split = !exams.length ? 'Sin exámenes: las nuevas se reparten entre tus listas.'
    : p.split?.mode === 'manual' ? sh.map(([id, v]) => `${shortName(liveExams(p).find(e => e.id === id)?.name)} ${v} %`).join(' · ') : `Automático: ${exams.length > 1 ? `el más cercano, el ${p.split?.drip === false ? 100 : 80} %` : 'todo a tu examen'}`;
  const parTxt = par.map(e => `dentro de ${shortName(e.name)}, ${plural(Object.keys(e.shares || {}).length, 'tema', 'temas')} a la vez`).join(' · ');
  const free = topItems().filter(it => !inExam(it.key));
  const stages = sortStages(p.stages), cap = newCap(stateNow());
  const ex = liveExams(p), ret = ex.length && ex.every(e => Number(e.retention) >= 0.95) ? 0.95 : 0.9, retLast = !ex.length || ex.some(e => (Number(e.retentionLast) || 0) > (Number(e.retention) || 0.9));
  main.innerHTML = `<div class="p2-set">
    <div class="crumbs-row"><button class="back-round" data-nav="plan" aria-label="Volver al plan">${icon('chevron-left', { size: 22 })}</button><span class="crumb-t">Plan</span></div>
    <h1 class="p2-h1">Ajustes del plan</h1>
    <p class="p2-lead">No hace falta tocar nada de aquí: el plan funciona solo. Es para afinar.</p>
    <section class="p2-sec" aria-labelledby="h-entra"><h2 class="p2-h2" id="h-entra">Qué entra</h2>
      <button class="p2-row" data-p2="set-reparto"><span><b>Reparto de las nuevas</b><small>${esc([split, parTxt].filter(Boolean).join(' · '))}</small></span>${icon('chevron-right', { size: 18 })}</button>
      ${free.map(it => `<div class="p2-free"><b>${esc(it.name)} · por gusto</b><div class="seg" role="group" aria-label="${esc(it.name)}">${FREE.map(([v, l]) => `<button type="button" class="seg-b" data-p2="set-free" data-key="${esc(it.key)}" data-v="${v}" aria-pressed="${(p.free?.[it.key] || 'active') === v}">${l}</button>`).join('')}</div></div>`).join('')}
      <p class="muted small">Lo que no tiene examen puede estar activo, en solo repasar o en pausa. Lo activo entra en el reparto.</p></section>
    <section class="p2-sec" aria-labelledby="h-etapas"><h2 class="p2-h2" id="h-etapas">Etapas a mano</h2>
      <p class="muted">Para cuando quieres mandar tú en una época: «en diciembre, solo Inglés». Mientras dure, manda sobre lo de arriba.</p>
      ${stages.length ? `<ul class="p2-rows">${stages.map(s => `<li><button class="p2-row" data-p2="stage" data-id="${esc(s.id)}"><span><b>${esc(s.name || 'Etapa')}</b><small>${rangeDay(s.from, s.to)}${s.to < dayKey() ? ' · ya pasó' : ''}</small></span>${icon('chevron-right', { size: 18 })}</button></li>`).join('')}</ul>` : ''}
      <button class="link p2-add" data-p2="stage">${icon('plus', { size: 18 })} Añadir una etapa</button></section>
    <section class="p2-sec" aria-labelledby="h-mas"><h2 class="p2-h2" id="h-mas">Más</h2>
      <div class="set-row"><div class="set-l"><b id="p2drip">Un goteo al examen siguiente</b><small>Unas pocas nuevas al día al segundo examen mientras acabas el primero.</small></div><div class="set-c"><label class="switch"><input type="checkbox" role="switch" aria-labelledby="p2drip" data-p2="set-drip" ${p.split?.drip === false ? '' : 'checked'}><span class="slider" aria-hidden="true"></span></label></div></div>
      <div class="set-row"><div class="set-l"><b>Nuevas al día, como mucho</b><small>${p.caps?.noCap ? 'Sin tope' : p.caps?.newPerDay > 0 ? `${p.caps.newPerDay}` : Number.isFinite(cap) ? `${cap}, las de Ajustes` : 'Sin tope'} · <button class="link" data-p2="set-cap">cambiar</button></small><small>El plan calcula las nuevas con tu tiempo. Esto solo pone un techo.</small></div></div>
      <div class="set-row"><div class="set-l"><b>Repasos al día, como mucho</b><small id="p2revcap">${p.caps?.reviewsPerDay > 0 ? `${p.caps.reviewsPerDay}` : 'Sin tope'} · <button class="link" data-p2="set-revcap">cambiar</button></small><small>Para ir más despacio aunque se junten: lo que pase del tope espera a otro día.</small></div></div>
    </section>
    <section class="p2-sec" aria-labelledby="h-ret"><h2 class="p2-h2" id="h-ret">Lo que quieres recordar</h2>
      <div class="set-row"><div class="set-l"><b id="p2retl">El día del examen</b><small>Con más, más repasos: lo eliges tú.</small></div><div class="set-c"><div class="seg" role="group" aria-labelledby="p2retl">${[[0.9, '90 %'], [0.95, '95 %']].map(([v, l]) => `<button type="button" class="seg-b" data-p2="set-ret" data-v="${v}" aria-pressed="${ret === v}">${l}</button>`).join('')}</div></div></div>
      <div class="set-row"><div class="set-l"><b id="p2retlast">La última semana, al 95 %</b><small>Un repaso más de lo que ya sabes justo antes del examen.</small></div><div class="set-c"><label class="switch"><input type="checkbox" role="switch" aria-labelledby="p2retlast" data-p2="set-retlast" ${retLast ? 'checked' : ''}><span class="slider" aria-hidden="true"></span></label></div></div>
    </section>
    <section class="p2-sec" aria-labelledby="h-avisos"><h2 class="p2-h2" id="h-avisos">Avisos</h2>
      <div class="set-row"><div class="set-l"><b id="p2weekly">Repaso de la semana</b><small>El domingo, cómo vas y un ajuste de un toque.</small></div><div class="set-c"><label class="switch"><input type="checkbox" role="switch" aria-labelledby="p2weekly" data-p2="set-weekly" ${p.weekly?.on === false ? '' : 'checked'}><span class="slider" aria-hidden="true"></span></label></div></div>
      <div class="set-row"><div class="set-l"><b id="p2remind">Recordatorio diario</b><small>Un aviso en este dispositivo si te toca repasar. La hora, en Ajustes › Avisos.</small><small id="remindMsg"></small></div><div class="set-c"><label class="switch"><input type="checkbox" role="switch" aria-labelledby="p2remind" id="remindOn" ${S.prefs.remind?.on ? 'checked' : ''}><span class="slider" aria-hidden="true"></span></label></div></div>
      <button class="p2-row" data-p2="time"><span><b>Tu tiempo</b><small>minutos de cada día, días especiales y pausa</small></span>${icon('chevron-right', { size: 18 })}</button></section>
    <section class="p2-sec" aria-labelledby="h-hist"><h2 class="p2-h2" id="h-hist">Historial</h2>
      ${(p.history || []).length ? `<p class="muted small">Los ${Math.min(20, p.history.length)} últimos cambios del plan. «Deshacer» lo deja como estaba antes de ese cambio (y deshace también los que vinieron después).</p>
      <ul class="p2-hist">${p.history.slice(0, 20).map(h => `<li><span><b>${esc(h.what)}</b><small>${whenText(h.at)}</small></span><button class="link" data-p2="hist-undo" data-at="${h.at}">Deshacer</button></li>`).join('')}</ul>`
        : '<p class="muted">Aún no has cambiado nada del plan. Cada cambio saldrá aquí, con «Deshacer».</p>'}</section></div>`;
}

// «hoy, 10:42», «ayer, 18:05» o «12 oct, 9:30»
function whenText(t) {
  const d = new Date(t), k = dayKey(d.getTime()), hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${k === dayKey() ? 'hoy' : k === addDays(dayKey(), -1) ? 'ayer' : shortDay(k)}, ${hm}`;
}

/* ---------------- el tope ---------------- */
function capSheet() {
  const p = plan2(), cur = p.caps?.noCap ? '' : p.caps?.newPerDay > 0 ? p.caps.newPerDay : '';
  openSheet(`<h2 class="sheet-hand">Nuevas al día, como mucho</h2>
    <p class="muted">Por defecto, las de Ajustes (${S.newPerDay}). Con un número aquí, manda este; con «Sin tope», solo tus minutos.</p>
    <label for="p2cap">Como mucho</label><input type="number" id="p2cap" min="1" max="500" step="1" value="${cur}" placeholder="${S.newPerDay}">
    <div class="btnrow"><button class="ghost" data-p2="cap-none">Sin tope</button><button class="ghost" data-p2="cap-default">Las de Ajustes</button><span class="spacer"></span><button class="primary" data-p2="cap-save">Guardar</button></div>`);
}
function setCap(kind) {
  const n = Number(document.getElementById('p2cap')?.value);
  if (kind === 'save' && !(n >= 1)) return toast('Pon un número');
  closeSheet();
  commitPlan(kind === 'none' ? 'Sin tope de nuevas' : kind === 'default' ? 'Tope: las de Ajustes' : `Como mucho ${n} nuevas al día`, p => {
    p.caps = { ...(p.caps || {}), noCap: kind === 'none', newPerDay: kind === 'save' ? Math.min(500, Math.round(n)) : null };
  });
}

function revCapSheet() {
  const cur = plan2().caps?.reviewsPerDay > 0 ? plan2().caps.reviewsPerDay : '';
  openSheet(`<h2 class="sheet-hand">Repasos al día, como mucho</h2>
    <p class="muted">Lo que pase del tope espera a otro día. Sin tope, los que caben en tus minutos.</p>
    <label for="p2revc">Como mucho</label><input type="number" id="p2revc" min="1" max="2000" step="1" value="${cur}" placeholder="Sin tope">
    <div class="btnrow"><button class="ghost" data-p2="revcap-none">Sin tope</button><span class="spacer"></span><button class="primary" data-p2="revcap-save">Guardar</button></div>`);
}
function setRevCap(none) {
  const n = Number(document.getElementById('p2revc')?.value);
  if (!none && !(n >= 1)) return toast('Pon un número');
  closeSheet();
  commitPlan(none ? 'Sin tope de repasos' : `Como mucho ${n} repasos al día`, p => { p.caps = { ...(p.caps || {}), reviewsPerDay: none ? null : Math.min(2000, Math.round(n)) }; });
}

/* ---------------- etapas a mano ---------------- */
const LV = LEVELS.map(l => [l.id, l.label]);
function stageSheet(id) {
  const t = dayKey(), s = (id && live(plan2().stages).find(x => x.id === id)) || { id: '', name: '', from: t, to: addDays(t, 30), levels: {}, order: {} };
  S.p2Stage = JSON.parse(JSON.stringify(s));
  drawStage();
}
function drawStage() {
  const s = S.p2Stage;
  openSheet(`<h2 class="sheet-hand">${s.id ? 'Etapa' : 'Nueva etapa'}</h2>
    <p class="muted">Mientras dure, cada cosa entra con su nivel: Poco, Normal y Mucho reparten 1 : 2 : 4; Repasar, sin nuevas; Pausa, nada.</p>
    <label for="stName">Nombre</label><input id="stName" maxlength="40" placeholder="Ej.: en diciembre, solo Inglés" value="${esc(s.name || '')}">
    <div class="pl-dates"><label>Desde<input type="date" id="stFrom" value="${s.from}"></label><label>Hasta<input type="date" id="stTo" value="${s.to}"></label></div>
    ${topItems().map(it => `<div class="p2-free"><b>${esc(it.name)}</b><div class="seg lv-seg" role="group" aria-label="${esc(it.name)}">${LV.map(([v, l]) => `<button type="button" class="seg-b lvb-${v}" data-p2="stage-lv" data-key="${esc(it.key)}" data-v="${v}" aria-pressed="${(s.levels?.[it.key] || 'normal') === v}">${l}</button>`).join('')}</div></div>`).join('')}
    <div class="btnrow">${s.id ? '<button class="ghost danger" data-p2="stage-del">Borrar</button>' : ''}<span class="spacer"></span><button class="ghost" data-act="close-sheet">Cancelar</button><button class="primary" data-p2="stage-save">Guardar</button></div>`);
}
function readStage() {
  const s = S.p2Stage;
  s.name = document.getElementById('stName').value.trim().slice(0, 40);
  s.from = document.getElementById('stFrom').value; s.to = document.getElementById('stTo').value;
}
function saveStage(del = false) {
  if (!del) readStage();
  const s = S.p2Stage;
  if (!del && (!isDay(s.from) || !isDay(s.to))) return toast('Pon las dos fechas');
  if (!del) [s.from, s.to] = [s.from, s.to].sort();
  closeSheet();
  commitPlan(del ? 'Etapa borrada' : s.id ? 'Etapa cambiada' : 'Etapa guardada', p => {
    p.stages = p.stages || [];
    const item = del ? { id: s.id, deleted: true, at: Date.now() } : { ...s, id: s.id || newId(), at: Date.now() };
    const i = p.stages.findIndex(x => x.id === item.id);
    if (i >= 0) p.stages[i] = item; else p.stages.push(item);
  });
}

export function settingsClick(b) {
  const ds = b.dataset;
  switch (ds.p2) {
    case 'set-reparto': return import('./plan-reparto.js').then(m => m.repartoSheet());
    case 'set-free': return commitPlan(`${b.closest('.p2-free')?.querySelector('b')?.textContent.replace(' · por gusto', '') || 'Lista'}: ${FREE.find(f => f[0] === ds.v)[1].toLowerCase()}`, p => { p.free = { ...(p.free || {}) }; if (ds.v === 'active') delete p.free[ds.key]; else p.free[ds.key] = ds.v; });
    case 'set-drip': return commitPlan(b.checked ? 'Con goteo al examen siguiente' : 'Sin goteo: primero el más cercano', p => { p.split = { mode: 'auto', shares: {}, ...(p.split || {}), drip: !!b.checked }; });
    case 'set-cap': return capSheet();
    case 'cap-none': return setCap('none');
    case 'cap-default': return setCap('default');
    case 'cap-save': return setCap('save');
    case 'set-revcap': return revCapSheet();
    case 'revcap-none': return setRevCap(true);
    case 'revcap-save': return setRevCap(false);
    case 'set-ret': { const v = Number(ds.v); return commitPlan(`Recordar el ${Math.round(v * 100)} % el día del examen`, p => { for (const e of p.exams) if (!e.deleted) { const last = (Number(e.retentionLast) || 0) > (Number(e.retention) || 0.9); e.retention = v; e.retentionLast = last ? Math.max(0.95, v) : v; } }); }
    case 'set-retlast': return commitPlan(b.checked ? 'La última semana, al 95 %' : 'La última semana, como las demás', p => { for (const e of p.exams) if (!e.deleted) e.retentionLast = b.checked ? Math.max(0.95, Number(e.retention) || 0.9) : (Number(e.retention) || 0.9); });
    case 'set-weekly': return commitPlan(b.checked ? 'Repaso de la semana, encendido' : 'Repaso de la semana, apagado', p => { p.weekly = { ...(p.weekly || {}), on: !!b.checked }; });
    case 'stage': return stageSheet(ds.id);
    case 'stage-lv': { readStage(); S.p2Stage.levels = { ...(S.p2Stage.levels || {}), [ds.key]: ds.v }; if (ds.v === 'normal') delete S.p2Stage.levels[ds.key]; return drawStage(); }
    case 'stage-save': return saveStage();
    case 'stage-del': return saveStage(true);
    case 'hist-undo': return undoTo(Number(ds.at));
  }
}
export { shortDay };
