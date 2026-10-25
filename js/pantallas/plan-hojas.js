// Flaski · plan de estudio: «En tu plan», desde el menú de una carpeta, una lista o un apunte. Tres hojas:
//   con examen: su barra, su parte del reparto, qué toca ahora y el camino;
//   en un tema de un examen: Ya me lo sé, Estudiarlo a la vez que…, Fijar una fecha y Este tema no cae;
//   sin examen: Activo | Solo repasar | Pausa y «Ponerle examen».
import { icon } from '../icons.js';
import { dayKey, addDays, decksUnder } from '../plan.js';
import { S, esc } from '../comun.js';
import { plan2, forecastNow, stateNow } from '../plan2-app.js';
import { liveExams, sharesToday } from '../plan2.js';
import { plural } from './mazos.js';
import { openSheet, closeSheet } from './editor.js';
import { examBarHTML, shortDay, rangeDay, shortName, topicTag, topicName, deckName, calIcon, VERDICT } from './plan-ui.js';
import { commitPlan } from './plan-guardar.js';
import { go } from '../app.js';

const FREE = [['active', 'Activo'], ['reviews', 'Solo repasar'], ['paused', 'Pausa']];
const nameOf = key => (key.startsWith('f:') ? S.folders.get(key.slice(2))?.name : S.decks.get(key)?.name) || '';
// El examen de una carpeta o lista: el que la tiene en su alcance (la carpeta, o la lista suelta)
function examOfKey(key) {
  return liveExams(plan2()).find(e => (key.startsWith('f:') ? (e.scope?.folders || []).includes(key.slice(2)) : (e.scope?.decks || []).includes(key)));
}
// El examen del que una lista es un tema (aunque no sea su alcance directo)
function examOfTopic(deckId) {
  const fc = forecastNow();
  return liveExams(plan2()).find(e => fc.exams.find(x => x.id === e.id)?.topics.some(t => t.id === deckId));
}

// key: «f:id» (carpeta), id de una lista o «page:id» (apunte)
export function enTuPlanSheet(key) {
  if (key.startsWith('page:')) {
    const p = S.pages.get(key.slice(5));
    key = p?.deck_id && S.decks.has(p.deck_id) ? p.deck_id : p?.folder_id ? 'f:' + p.folder_id : '';
    if (!key) return openSheet('<h2 class="sheet-hand">En tu plan</h2><p class="muted">Este apunte aún no tiene preguntas ni está en una carpeta: no entra en ningún plan.</p>');
  }
  S.p2Sheet = key;
  const own = examOfKey(key);
  if (own) return examSheetHTML(own, key);
  if (!key.startsWith('f:')) { const ex = examOfTopic(key); if (ex) return topicSheetHTML(ex, key); }
  return freeSheetHTML(key);
}

function examSheetHTML(ex, key) {
  const fc = forecastNow(), e = fc.exams.find(x => x.id === ex.id), t = dayKey();
  const sh = Object.fromEntries(sharesToday(stateNow(), 1)), pct = sh[ex.id] ?? 100;
  const others = Object.entries(sh).filter(([id]) => id !== ex.id && id !== 'free').map(([id, v]) => `${shortName(liveExams(plan2()).find(x => x.id === id)?.name || '')} el ${v} %`);
  const day = fc.days.find(d => d.minutes > 0 && d.new), ids = new Set(e.topics.map(x => x.id));
  const per = day ? Object.entries(day.newBy).filter(([id]) => ids.has(id)).reduce((a, [, n]) => a + n, 0) : 0;
  const cur = e.topics.find(x => x.state === 'study' && x.from && x.from <= t && (!x.finish || x.finish >= t)) || e.topics.find(x => x.state === 'study' && x.fresh > 0);
  const next = cur ? e.topics.slice(e.topics.indexOf(cur) + 1).find(x => x.state === 'study') : null;
  const head = e.verdict === 'no' ? `te faltarían ${e.left}` : e.finish ? `acabas el temario el ${shortDay(e.finish)}${e.review >= 7 ? ` · ${plural(Math.round(e.review / 7), 'semana', 'semanas')} de repaso` : ''}` : 'ya lo has visto todo';
  openSheet(`<div class="p2-sheet"><p class="p2-sheet-k">${icon('folder', { size: 20 })} ${esc(nameOf(key))} · en tu plan</p>
    <div class="p2-excard">${calIcon(ex.date, 44)}<div><b>Examen el ${shortDay(ex.date)} · ${VERDICT[e.verdict] || ''}</b><small>${head}</small></div>${examBarHTML(e)}</div>
    <ul class="p2-rows">
      <li><button class="p2-row" data-p2="sheet-reparto" data-id="${esc(ex.id)}">${icon('chart-pie', { size: 22 })}<span><b>Se lleva el ${pct} % de tus nuevas</b><small>unas ${per} al día${others.length ? ` · ${esc(others.join(' · '))}` : ''}</small></span>${icon('chevron-right', { size: 18 })}</button></li>
      ${cur ? `<li><button class="p2-row" data-p2="sheet-exam" data-id="${esc(ex.id)}">${icon('layers', { size: 22 })}<span><b>Ahora: ${esc(deckName(cur.id))}</b><small>${cur.finish ? `hasta el ${shortDay(cur.finish)}` : ''}${next ? ` · luego ${esc(topicTag(deckName(next.id)))}` : ''}</small></span>${icon('chevron-right', { size: 18 })}</button></li>` : ''}
      <li><button class="p2-row" data-p2="sheet-exam" data-id="${esc(ex.id)}">${icon('target', { size: 22 })}<span><b>Ver el camino del examen</b><small>${plural(e.topics.length, 'tema', 'temas')}, fases y fechas</small></span>${icon('chevron-right', { size: 18 })}</button></li>
    </ul>
    <p class="p2-exfoot"><button class="link" data-p2="exam-edit" data-id="${esc(ex.id)}">Cambiar la fecha</button> · <button class="link danger" data-p2="sheet-exam-del" data-id="${esc(ex.id)}">Quitar el examen</button></p></div>`);
}

function topicSheetHTML(ex, deckId) {
  const fc = forecastNow(), e = fc.exams.find(x => x.id === ex.id), t = e.topics.find(x => x.id === deckId);
  let n = 0, seen = 0, mature = 0;
  for (const c of S.cards.values()) if (c.deck_id === deckId) { n++; const p = S.progress.get(c.id); if (p) { seen++; if ((p.interval || 0) >= 21) mature++; } }
  const study = e.topics.filter(x => x.state === 'study' && x.id !== deckId && x.fresh > 0);
  const cur = study.find(x => x.from && x.from <= dayKey()) || study[0];
  const state = t.state, starts = t.from ? `empieza el ${shortDay(t.from)}` : '';
  const rows = [];
  if (state === 'study' || state === 'done') rows.push(row('topic-known', 'star', 'Ya me lo sé', 'pasa a repaso sin verlo como nuevo'));
  if (state === 'known') rows.push(row('topic-unknown', 'star', 'Ya lo sabes', 'volver a estudiarlo como nuevo'));
  if (state === 'study' && cur && ex.mode !== 'parallel') rows.push(row('topic-parallel', 'chart-pie', `Estudiarlo a la vez que ${topicTag(deckName(cur.id))}`, 'con un porcentaje para cada uno'));
  if (state === 'study') rows.push(row('topic-date', 'calendar', 'Fijar una fecha', ex.fixed?.[deckId] ? `antes del ${shortDay(ex.fixed[deckId])} · cambiarla` : `por ejemplo, terminarlo antes del ${shortDay(addDays(dayKey(), 10))}`));
  rows.push(state === 'exclude' ? row('topic-in', 'ban', 'Este tema no cae', 'ahora está fuera del examen · volver a meterlo') : row('topic-out', 'ban', 'Este tema no cae', 'sale del examen sin borrarlo; sus repasos siguen'));
  openSheet(`<div class="p2-sheet"><h2 class="sheet-hand">${esc(deckName(deckId))}</h2>
    <p class="muted">${esc(ex.name)} · ${plural(n, 'pregunta', 'preguntas')}, ${plural(seen, 'vista', 'vistas')}${starts ? ` · ${starts}` : ''}</p>
    <div class="p2-tiles3"><div><b class="hand">${n ? Math.round((100 * seen) / n) : 0} %</b><span>visto</span></div><div><b class="hand">${seen ? `${Math.round((100 * mature) / n)} %` : '—'}</b><span>consolidado</span></div><div><b class="hand">${t.from ? rangeDay(t.from, t.finish) : state === 'done' ? 'hecho' : '—'}</b><span>en el plan</span></div></div>
    <ul class="p2-rows">${rows.join('')}</ul></div>`);
  S.p2Topic = { examId: ex.id, deckId, cur: cur?.id };
}
const row = (act, ic, title, sub) => `<li><button class="p2-row" data-p2="${act}">${icon(ic, { size: 22 })}<span><b>${esc(title)}</b><small>${esc(sub)}</small></span>${icon('chevron-right', { size: 18 })}</button></li>`;

function freeSheetHTML(key) {
  const cur = plan2().free?.[key] || 'active';
  const topics = key.startsWith('f:') ? decksUnder(key.slice(2), S.decks, S.folders).length : 1;
  openSheet(`<div class="p2-sheet"><p class="p2-sheet-k">${icon(key.startsWith('f:') ? 'folder' : 'layers', { size: 20 })} ${esc(nameOf(key))} · en tu plan</p>
    <p class="muted">No tiene examen. ${key.startsWith('f:') ? `Sus ${plural(topics, 'lista', 'listas')} entran` : 'Entra'} en el reparto según lo que elijas.</p>
    <div class="seg" role="group" aria-label="Cómo entra en tu plan">${FREE.map(([v, l]) => `<button type="button" class="seg-b" data-p2="free-set" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>
    <p class="muted small">${cur === 'active' ? 'Nuevas y repasos.' : cur === 'reviews' ? 'No entran nuevas, pero repasas lo que ya sabes.' : 'No entra nada: ni nuevas ni repasos.'}</p>
    <button class="primary big" data-p2="sheet-new-exam">${icon('calendar', { size: 20 })} Ponerle examen</button></div>`);
}

export function sheetClick(b) {
  const ds = b.dataset, key = S.p2Sheet, T = S.p2Topic;
  switch (ds.p2) {
    case 'sheet-reparto': return import('./plan-reparto.js').then(m => m.repartoSheet({ examId: ds.id }));
    case 'sheet-exam': return go('exam', { examId: ds.id });
    case 'sheet-exam-del': S.examId = ds.id; return import('./plan-examen.js').then(m => m.removeExam());
    case 'sheet-new-exam': return import('./plan-nuevo.js').then(m => m.newExamSheet({ key }));
    case 'free-set': closeSheet(); return commitPlan(`${nameOf(key)}: ${FREE.find(f => f[0] === ds.v)[1].toLowerCase()}`, p => { p.free = { ...(p.free || {}) }; if (ds.v === 'active') delete p.free[key]; else p.free[key] = ds.v; });
    case 'topic-known': closeSheet(); return commitPlan(`${topicTag(deckName(T.deckId))}: ya lo sabes`, p => { const x = p.exams.find(e => e.id === T.examId); x.known = [...new Set([...(x.known || []), T.deckId])]; });
    case 'topic-unknown': closeSheet(); return commitPlan(`${topicTag(deckName(T.deckId))}: otra vez como nuevo`, p => { const x = p.exams.find(e => e.id === T.examId); x.known = (x.known || []).filter(id => id !== T.deckId); });
    case 'topic-out': closeSheet(); return commitPlan(`${topicTag(deckName(T.deckId))} no cae`, p => { const x = p.exams.find(e => e.id === T.examId); x.exclude = [...new Set([...(x.exclude || []), T.deckId])]; });
    case 'topic-in': closeSheet(); return commitPlan(`${topicTag(deckName(T.deckId))} vuelve al examen`, p => { const x = p.exams.find(e => e.id === T.examId); x.exclude = (x.exclude || []).filter(id => id !== T.deckId); });
    case 'topic-date': S.examId = T.examId; return import('./plan-examen.js').then(m => m.fixDateSheet(T.deckId));
    case 'topic-parallel': {
      // Los dos a la vez, al 50 %: se abre el reparto del examen para afinarlo
      return import('./plan-reparto.js').then(m => { m.repartoSheet({ examId: T.examId, mode: 'parallel' }); S.p2Rep.within.shares = { [T.cur]: 50, [T.deckId]: 50 }; m.redrawReparto(); });
    }
  }
}
export { topicName };
