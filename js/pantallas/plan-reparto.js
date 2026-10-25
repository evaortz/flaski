// Flaski · plan de estudio: cómo repartes las nuevas. Entre exámenes (Automático: el más cercano se lleva el
// 80 %; o A mi manera, con porcentajes) y dentro de un examen (un tema tras otro o varios a la vez, con
// porcentajes). Los deslizadores siempre suman 100 y la franja «Así sigues llegando» se recalcula al moverlos.
import { icon } from '../icons.js';
import { dayKey } from '../plan.js';
import { S, esc, stateOf } from '../comun.js';
import { plan2, forecastNow, stateNow } from '../plan2-app.js';
import { whatIf, liveExams, sharesToday, toPercent, freeKeyOf } from '../plan2.js';
import { plural } from './mazos.js';
import { openSheet, closeSheet } from './editor.js';
import { slidersHTML, shareBarHTML, paintShares, rebalance, asiSoon, compareHTML, shortDay, shortName, topicTag, deckName } from './plan-ui.js';
import { commitPlan } from './plan-guardar.js';

const upcoming = () => forecastNow().exams.filter(e => e.date && e.date >= dayKey()).sort((a, b) => a.date.localeCompare(b.date));
const evenly = ids => Object.fromEntries([...toPercent(new Map(ids.map(id => [id, 1])))]);
const LEVELS = [['low', 'Poco'], ['normal', 'Normal'], ['high', 'Mucho']];

// Lo que no tiene examen y está activo, con nuevas por ver: cada carpeta o lista de arriba (o la que tenga su nivel)
// con sus listas → [{ key, name, ids }]
export function freeItems(levels = plan2().split?.freeLevels || {}) {
  const inExam = new Set(forecastNow().exams.filter(e => !e.date || e.date >= dayKey()).flatMap(e => e.topics.map(t => t.id)));
  const fresh = new Set();
  for (const c of S.cards.values()) if (!S.progress.has(c.id)) fresh.add(c.deck_id);
  const out = new Map();
  for (const d of S.decks.values()) {
    if (d.archived || inExam.has(d.id) || !fresh.has(d.id) || stateOf(d) !== 'active') continue;
    const { key } = freeKeyOf(d, S.folders, levels);
    if (!out.has(key)) out.set(key, { key, name: key.startsWith('f:') ? S.folders.get(key.slice(2))?.name || 'Carpeta' : d.name, ids: [] });
    out.get(key).ids.push(d.id);
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

// opts: { examId, mode, freeKey }: abrir con un examen («Dentro de…») y, si se pide, ya en «Varios a la vez»; o con
// una carpeta o lista sin examen marcada («Darle más tiempo», desde «En tu plan»)
export function repartoSheet({ examId = '', mode = '', freeKey = '' } = {}) {
  const p = plan2(), exams = upcoming(), st = stateNow(), hasFree = freeItems().length > 0;
  const ex = liveExams(p).find(e => e.id === examId) || (freeKey ? null : liveExams(p).find(e => e.id === exams[0]?.id));
  const today = Object.fromEntries([...sharesToday(st, 1)].filter(([id]) => exams.some(e => e.id === id) || (hasFree && id === 'free')));
  const split = { mode: p.split?.mode === 'manual' ? 'manual' : 'auto', shares: { ...(p.split?.mode === 'manual' ? p.split.shares : today) } };
  // Los porcentajes de los exámenes que vienen y de «Sin examen» (los que no tenían, a 0), que sumen 100
  const ids = [...exams.map(e => e.id), ...(hasFree && exams.length ? ['free'] : [])];
  split.shares = ids.length ? Object.fromEntries([...toPercent(new Map(ids.map(id => [id, Number(split.shares[id]) || 0])))]) : {};
  if (ids.length && !Object.values(split.shares).some(Boolean)) split.shares = evenly(ids);
  let within = null;
  if (ex) {
    const e = forecastNow().exams.find(y => y.id === ex.id), study = e.topics.filter(t => t.state === 'study' && t.fresh > 0).map(t => t.id);
    let shares = Object.fromEntries(Object.entries(ex.shares || {}).filter(([id]) => study.includes(id)));
    if (!Object.keys(shares).length) shares = study.length >= 3 ? { [study[0]]: 50, [study[1]]: 30, [study[2]]: 20 } : evenly(study.slice(0, 2));
    within = { mode: mode || (ex.mode === 'parallel' ? 'parallel' : 'seq'), shares: Object.fromEntries([...toPercent(new Map(Object.entries(shares)))]) };
  }
  S.p2Rep = { examId: ex?.id || '', split, within, levels: { ...(p.split?.freeLevels || {}) }, focus: freeKey };
  drawReparto();
  if (freeKey) requestAnimationFrame(() => document.querySelector(`#sheetBody [data-free-key="${CSS.escape(freeKey)}"]`)?.scrollIntoView({ block: 'center' }));
}
function change() {
  const r = S.p2Rep;
  return p => {
    p.split = { ...(p.split || {}), mode: r.split.mode, shares: r.split.mode === 'manual' ? { ...r.split.shares } : (p.split?.shares || {}), freeLevels: { ...r.levels } };
    if (r.within) { const x = p.exams.find(e => e.id === r.examId); if (x) { x.mode = r.within.mode; if (r.within.mode === 'parallel') x.shares = { ...r.within.shares }; } }
  };
}
export function redrawReparto() { drawReparto(); }
function drawReparto() {
  const r = S.p2Rep, exams = upcoming(), after = whatIf(stateNow(), change());
  const days = after.days.filter(d => d.minutes > 0).slice(0, 14), avg = days.length ? Math.round(days.reduce((a, d) => a + d.new, 0) / days.length) : 0;
  const perDay = ids => { const set = new Set(ids), ds = days.filter(d => d.new); return ds.length ? Math.round(ds.reduce((a, d) => a + Object.entries(d.newBy).filter(([id]) => set.has(id)).reduce((s, [, n]) => s + n, 0), 0) / ds.length) : 0; };
  const fe = id => after.exams.find(e => e.id === id);
  let between = '';
  const frees = freeItems(r.levels), freeIds = frees.flatMap(f => f.ids);
  const freeRow = frees.length && exams.length ? { id: 'free', label: 'Sin examen', sub: `${plural(frees.length, 'lista o carpeta', 'listas o carpetas')} · unas ${perDay(freeIds)} al día`, value: r.split.shares.free ?? 0 } : null;
  if (exams.length > 1 || freeRow) {
    const items = [...exams.map(e => ({ id: e.id, label: e.name, sub: `examen el ${shortDay(e.date)} · unas ${perDay(fe(e.id).topics.map(t => t.id))} al día`, value: r.split.shares[e.id] ?? 0 })), ...(freeRow ? [freeRow] : [])];
    between = `<h3 class="p2-h3">Entre exámenes</h3>
      <div class="seg" role="group" aria-label="Entre exámenes"><button type="button" class="seg-b" data-p2="rep-split" data-v="auto" aria-pressed="${r.split.mode === 'auto'}">Automático</button><button type="button" class="seg-b" data-p2="rep-split" data-v="manual" aria-pressed="${r.split.mode === 'manual'}">A mi manera</button></div>
      ${r.split.mode === 'manual' ? `<div data-sharebar="split">${shareBarHTML(r.split.shares)}</div>${slidersHTML('split', items)}`
        : `<ul class="p2-auto">${items.filter(it => it.id !== 'free').map(it => `<li><b>${esc(it.label)}</b><small>${it.sub}</small></li>`).join('')}</ul>${freeRow ? slidersHTML('split', [freeRow]) : ''}`}
      <p class="muted small">Automático: el examen más cercano se lleva el 80 % hasta que acaba su temario; el resto, un goteo para no dejarlo frío${freeRow ? '. Al mover «Sin examen», pasas a «A mi manera»' : ''}.</p>`;
  }
  // Dentro de «Sin examen»: cada carpeta o lista con su peso (Poco 1 : Normal 2 : Mucho 4)
  let freeIn = '';
  if (frees.length > (exams.length ? 0 : 1)) {
    freeIn = `<h3 class="p2-h3">Sin examen</h3>
      <ul class="p2-freelv">${frees.map(f => { const v = r.levels[f.key] || 'normal'; return `<li data-free-key="${esc(f.key)}"${r.focus === f.key ? ' class="p2-focus"' : ''}>
        <span><b>${esc(f.name)}</b><small data-sub="lv-${esc(f.key)}">≈ ${plural(perDay(f.ids), 'nueva', 'nuevas')} al día</small></span>
        <span class="seg" role="group" aria-label="${esc(f.name)}">${LEVELS.map(([lv, l]) => `<button type="button" class="seg-b" data-p2="rep-lvl" data-key="${esc(f.key)}" data-v="${lv}" aria-pressed="${v === lv}">${l}</button>`).join('')}</span></li>`; }).join('')}</ul>
      <p class="muted small">Mucho se lleva el doble que Normal, y Normal el doble que Poco. <button type="button" class="link" data-p2="rep-pause">Pausar alguna o dejarla en solo repasar</button></p>`;
  }
  let inside = '';
  const ex = liveExams(plan2()).find(e => e.id === r.examId);
  if (ex && r.within) {
    const e = fe(ex.id), study = e.topics.filter(t => t.state === 'study' && (t.fresh > 0)).map(t => t.id);
    const items = Object.keys(r.within.shares).map(id => { const t = e.topics.find(x => x.id === id); return { id, label: deckName(id), sub: `unas ${perDay([id])} al día${t?.finish ? ` · acabas el ${shortDay(t.finish)}` : ''}`, value: r.within.shares[id] }; });
    const more = study.filter(id => !(id in r.within.shares));
    const nextTag = study.find(id => !(id in r.within.shares));
    inside = `<h3 class="p2-h3">Dentro de ${esc(shortName(ex.name))}</h3>
      <div class="seg" role="group" aria-label="Dentro del examen"><button type="button" class="seg-b" data-p2="rep-within" data-v="seq" aria-pressed="${r.within.mode === 'seq'}">Un tema tras otro</button><button type="button" class="seg-b" data-p2="rep-within" data-v="parallel" aria-pressed="${r.within.mode === 'parallel'}">Varios a la vez</button></div>
      ${r.within.mode === 'parallel' ? `<div data-sharebar="within">${shareBarHTML(r.within.shares)}</div>${slidersHTML('within', items)}
        ${more.length ? `<label class="p2-addtopic">${icon('plus', { size: 16 })}<select data-p2="rep-add" aria-label="Añadir otro tema a la vez"><option value="">Añadir otro tema a la vez</option>${more.map(id => `<option value="${esc(id)}">${esc(deckName(id))}</option>`).join('')}</select></label>` : ''}
        <p class="muted small">Cuando acabas un tema, su parte pasa ${nextTag ? `al siguiente del orden (${esc(topicTag(deckName(nextTag)))})` : 'a los que quedan'}. Los porcentajes siempre suman 100: al mover uno, los demás se ajustan.</p>`
      : '<p class="muted small">Los temas van en el orden del camino: cuando acabas uno, empieza el siguiente.</p>'}`;
  }
  openSheet(`<div class="p2-rep"><h2 class="sheet-hand">Cómo repartes las nuevas</h2>
    <p class="muted">Unas ${plural(avg, 'nueva', 'nuevas')} al día con tu tiempo. Los repasos de todo salen siempre.</p>
    ${between}${freeIn}${inside}
    <div id="p2Asi">${compareHTML(forecastNow(), after, { auto: true })}</div>
    <button class="primary big" data-p2="rep-save">Guardar el reparto</button></div>`);
}
// Mover un deslizador: los demás del grupo se ajustan y la franja se recalcula (sin repintar la hoja)
export function shareInput(el) {
  const r = S.p2Rep, g = el.dataset.group, box = g === 'split' ? r.split : r.within;
  if (!box) return;
  box.shares = rebalance(box.shares, el.dataset.id, Number(el.value));
  // «Sin examen» en «Automático»: al moverlo, pasa a «A mi manera» (con los deslizadores de todos)
  if (g === 'split' && r.split.mode === 'auto') { r.split.mode = 'manual'; drawReparto(); return; }
  paintShares(document.getElementById('sheetBody'), g, box.shares);
  asiSoon(document.getElementById('p2Asi'), change(), { auto: true });
}
export function repartoClick(b) {
  const r = S.p2Rep, ds = b.dataset;
  if (ds.p2 === 'rep-split') { r.split.mode = ds.v; return drawReparto(); }
  if (ds.p2 === 'rep-within') { r.within.mode = ds.v; return drawReparto(); }
  // (la pausa y «solo repasar» están en Ajustes del plan › Qué entra)
  if (ds.p2 === 'rep-pause') { closeSheet(); return import('../app.js').then(m => { m.go('planSettings'); let n = 0; const to = () => { const h = document.getElementById('h-entra'); if (h) h.scrollIntoView({ block: 'start' }); else if (n++ < 30) requestAnimationFrame(to); }; to(); }); }
  if (ds.p2 === 'rep-lvl') { if (ds.v === 'normal') delete r.levels[ds.key]; else r.levels[ds.key] = ds.v; r.focus = ds.key; return drawReparto(); }
  if (ds.p2 === 'rep-save') return saveReparto();
}
export function repartoAdd(el) {
  const r = S.p2Rep, id = el.value;
  if (!id || !r.within) return;
  const n = Object.keys(r.within.shares).length + 1;
  r.within.shares = rebalance({ ...r.within.shares, [id]: 0 }, id, Math.round(100 / n / 5) * 5);
  drawReparto();
}
function saveReparto() {
  const r = S.p2Rep, ex = liveExams(plan2()).find(e => e.id === r.examId);
  const lv = Object.entries(r.levels).map(([k, v]) => `${freeItems(r.levels).find(f => f.key === k)?.name || ''} ${LEVELS.find(l => l[0] === v)?.[1].toLowerCase()}`).filter(s => s.trim()).join(', ');
  const what = r.split.mode === 'manual' && Object.keys(r.split.shares).length > 1 ? `Reparto ${Object.entries(r.split.shares).filter(([k]) => k !== 'free').map(([, v]) => v).join('/')}${r.split.shares.free > 0 ? ` · sin examen ${r.split.shares.free} %` : ''}${lv ? ` · ${lv}` : ''}` : r.within?.mode === 'parallel' ? `${shortName(ex?.name || '')}: varios temas a la vez` : lv ? `Sin examen: ${lv}` : 'Reparto guardado';
  closeSheet();
  commitPlan(what, change());
}
