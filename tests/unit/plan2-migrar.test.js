// Migración del plan de ahora al nuevo (plan2-migrar.js): la demo, un plan con etapas y uno con niveles
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrate, examIdFor } from '../../js/plan2-migrar.js';
import { forecast } from '../../js/plan2.js';
import { load, TODAY } from './plan2-datos.js';
import { addDays } from '../../js/plan.js';

const AUX = 'b810603e-b940-4d49-bb4d-c15fb880071c', ING = 'c2ff82f4-fb95-447f-9dcb-e2a2e40c3bd7';
const T1 = 'f1a4a82c-3197-48d2-a180-b00b1dccd8cc', T3 = 'fdb4ce9b-9c9b-4f88-93e6-eee436b8c7e7';
const ctx = D => ({ today: TODAY, decks: D.decks, folders: D.folders, at: 7 });

test('la demo (datos de ejemplo de ?local): sin exámenes, todo lo de antes en su sitio y la copia v1', () => {
  const demo = JSON.parse(readFileSync(new URL('../fixtures/demo.json', import.meta.url), 'utf8'));
  const p = migrate(demo.plan, { today: TODAY, decks: demo.decks, folders: demo.folders, at: 7 });
  assert.equal(p.v, 2);
  assert.deepEqual(p.exams, []);
  assert.deepEqual(p.time, { week: null, special: [], today: null, pause: null, updated_at: 7 });
  assert.deepEqual(p.split, { mode: 'auto', shares: {}, updated_at: 7 });
  assert.deepEqual(p.free, {});
  assert.deepEqual(p.stages, []);
  assert.deepEqual(p.v1, { saved: TODAY, until: '2026-12-24', plan: demo.plan });
  // El motor funciona con ella: sin exámenes, todo lo nuevo es «lo que no tiene examen»
  const fc = forecast({ plan: p, today: TODAY, decks: demo.decks, folders: demo.folders, cards: demo.cards, progress: new Map(demo.progress.map(x => [x.card_id, x])), events: demo.events });
  assert.deepEqual(fc.exams, []);
  assert.equal(fc.pace.measured, true);
});

test('el plan de 945 preguntas: dos exámenes por carpeta, con su semana y Navidad', () => {
  const D = load(), p = migrate(D.old, ctx(D));
  assert.deepEqual(p.exams.map(e => [e.id, e.name, e.date, e.lastWeek, e.after, e.scope.folders]), [
    [examIdFor('f:' + AUX), 'Auxiliar Administrativo', '2027-01-16', true, null, [AUX]],
    [examIdFor('f:' + ING), 'Inglés B2', '2027-03-20', true, null, [ING]],
  ]);
  assert.deepEqual(p.time.week, D.old.week);
  assert.deepEqual(p.time.special, D.old.special);
  assert.equal(p.split.mode, 'auto');
  assert.equal(Object.values(p.split.shares).reduce((a, b) => a + b, 0), 100);
});

test('un plan con etapas: las etapas quedan igual y su orden de temas pasa al camino del examen', () => {
  const D = load();
  const stages = [
    { id: 's1', name: 'Acabar el temario de Auxiliar', from: TODAY, to: '2026-12-31', levels: { ['f:' + AUX]: 'high', ['f:' + ING]: 'low' }, order: { [AUX]: [{ deck: T3 }, { deck: T1, until: '2026-11-15' }] }, at: 3 },
    { id: 's2', name: 'Recta final', from: '2027-01-01', to: '2027-01-16', levels: { ['f:' + AUX]: 'reviews' }, order: {}, at: 4 },
    { id: 's3', deleted: true, at: 5 },
  ];
  const old = { ...D.old, nodes: { ...D.old.nodes, ['f:' + AUX]: { exam: '2027-01-16', lastWeek: false, after: 'paused' } }, stages, startDone: true };
  const p = migrate(old, ctx(D));
  assert.deepEqual(p.stages, stages);
  assert.equal(p.startDone, true);
  const aux = p.exams.find(e => e.id === examIdFor('f:' + AUX));
  assert.deepEqual(aux.order, [T3, T1]);
  assert.equal(aux.lastWeek, false);
  assert.equal(aux.after, 'pause');
  // Durante la etapa 1 manda ella: Auxiliar en «Mucho» (4) frente a Inglés en «Poco» (1)
  const fc = forecast({ plan: p, today: TODAY, decks: D.decks, folders: D.folders, cards: D.cards, progress: D.progress });
  const day = fc.days[1], inAux = Object.entries(day.newBy).filter(([id]) => D.decks.get(id).folder_id === AUX).reduce((a, [, n]) => a + n, 0);
  assert.ok(inAux >= day.new * 0.75 && inAux < day.new, `${inAux} de ${day.new}`);
  assert.ok(day.newBy[T3] > 0);                      // T3 va primero, como en la etapa
});

test('un plan con niveles: Pausa y Repasar a free (o fuera del examen), Poco y Mucho a porcentajes 1 : 4', () => {
  const D = load();
  D.decks.set('jap', { id: 'jap', name: 'Japonés', folder_id: null });
  const T7 = [...D.decks.values()].find(d => d.name.startsWith('T7')).id;
  const old = {
    ...D.old,
    nodes: {
      ['f:' + AUX]: { exam: '2027-01-16', lastWeek: true, weight: 2 },
      ['f:' + ING]: { exam: '2027-03-20', lastWeek: true, weight: 0.5 },
      [T7]: { state: 'paused' },
      jap: { state: 'reviews' },
    },
  };
  const p = migrate(old, ctx(D));
  assert.deepEqual(p.free, { jap: 'reviews' });
  assert.deepEqual(p.exams.find(e => e.scope.folders[0] === AUX).exclude, [T7]);
  assert.equal(p.split.mode, 'manual');
  assert.deepEqual(p.split.shares, { [examIdFor('f:' + AUX)]: 80, [examIdFor('f:' + ING)]: 20 });
  // Todos en Normal: automático
  const normal = migrate({ ...old, nodes: { ['f:' + AUX]: { exam: '2027-01-16' }, ['f:' + ING]: { exam: '2027-03-20', weight: 1 } } }, ctx(D));
  assert.equal(normal.split.mode, 'auto');
});

test('se puede ejecutar varias veces sin estropear nada, y la copia v1 se quita a los 60 días', () => {
  const D = load(), once = migrate(D.old, ctx(D));
  assert.deepEqual(migrate(once, ctx(D)), once);
  assert.deepEqual(migrate(migrate(once, { ...ctx(D), today: addDays(TODAY, 30) }), ctx(D)), once);
  // Dos dispositivos que migran a la vez dan los mismos exámenes (mismos id)
  assert.deepEqual(migrate(D.old, { ...ctx(D), at: 99 }).exams.map(e => e.id), once.exams.map(e => e.id));
  // No toca el plan de entrada
  const before = JSON.stringify(D.old);
  migrate(D.old, ctx(D));
  assert.equal(JSON.stringify(D.old), before);
  assert.ok(migrate(once, { ...ctx(D), today: '2026-12-24' }).v1);
  assert.equal(migrate(once, { ...ctx(D), today: '2026-12-25' }).v1, undefined);
  // Sin plan (prefs viejas o vacías): uno vacío
  assert.deepEqual(migrate(undefined, ctx(D)).exams, []);
});

test('al juntar dos dispositivos, cada examen, tu tiempo y el reparto: el más reciente; días especiales y etapas, por id', async () => {
  const { mergeSynced, loadPrefs } = await import('../../js/prefs.js');
  const base = { v: 2, time: { week: { mon: 30 }, special: [{ id: 'n', from: '2026-12-24', to: '2026-12-26', minutes: 0, at: 1 }], updated_at: 1 }, exams: [], split: { mode: 'auto', shares: {}, updated_at: 1 }, stages: [], free: {}, caps: {}, history: [] };
  const a = { plan: { ...base, exams: [{ id: 'ex-a', name: 'A', date: '2027-01-16', updated_at: 5 }, { id: 'ex-b', name: 'B viejo', updated_at: 1 }], time: { ...base.time, week: { mon: 60 }, updated_at: 9 } } };
  const b = { plan: { ...base, exams: [{ id: 'ex-a', name: 'A', date: '2027-01-20', updated_at: 3 }, { id: 'ex-b', name: 'B nuevo', updated_at: 4 }, { id: 'ex-c', name: 'C', updated_at: 4 }], time: { ...base.time, special: [{ id: 'v', from: '2027-03-01', to: '2027-03-05', minutes: 10, at: 2 }], updated_at: 2 }, split: { mode: 'manual', shares: { 'ex-a': 70 }, updated_at: 7 } } };
  const m = mergeSynced(a, b).plan;
  assert.deepEqual(m.exams.map(e => [e.id, e.date || e.name]).sort(), [['ex-a', '2027-01-16'], ['ex-b', 'B nuevo'], ['ex-c', 'C']]);
  assert.deepEqual(m.time.week, { mon: 60 });
  assert.deepEqual(m.time.special.map(s => s.id).sort(), ['n', 'v']);
  assert.equal(m.split.mode, 'manual');
  // Uno migrado y otro no: el migrado
  assert.equal(mergeSynced({ plan: { nodes: { x: { exam: '2027-01-01' } } } }, b).plan.v, 2);
  assert.equal(mergeSynced(b, { plan: { nodes: {} } }).plan.v, 2);
  // Las preferencias cargadas conservan el plan nuevo tal cual (con lo que le falte)
  const p = loadPrefs({ plan: { v: 2, exams: [{ id: 'ex-a' }] } });
  assert.deepEqual(p.plan.exams, [{ id: 'ex-a' }]);
  assert.deepEqual(p.plan.time.special, []);
  assert.equal(p.plan.split.mode, 'auto');
});

/* ---------------- dos dispositivos: una versión vieja (v1) y la nueva (v2) ---------------- */
// Lo que hace una versión vieja de la app con el plan: al cargar, solo las claves que conoce (y sim entero); al
// guardar, su plan con los días especiales y las etapas unidos por id con los de la nube
const OLD_KEYS = ['nodes', 'week', 'special', 'stages', 'simGoal', 'sim', 'startDone', 'lateOk'];
const oldLoad = plan => { const p = {}; for (const k of OLD_KEYS) p[k] = plan?.[k] !== undefined ? JSON.parse(JSON.stringify(plan[k])) : ({ nodes: {}, week: null, special: [], stages: [], simGoal: {}, sim: {}, startDone: false, lateOk: '' })[k]; return p; };
const union = (a = [], b = []) => { const m = new Map(); for (const x of [...a, ...b]) { const o = m.get(x.id); if (!o || (x.at || 0) >= (o.at || 0)) m.set(x.id, x); } return [...m.values()]; };
const oldSave = (cloud, mine) => ({ ...mine, special: union(cloud?.special, mine.special), stages: union(cloud?.stages, mine.stages) });

function v2Plan(D) {
  const p = migrate(D.old, ctx(D));
  const aux = p.exams[0];
  aux.mode = 'parallel'; aux.shares = { [T1]: 60, [T3]: 40 }; aux.fixed = { [T3]: '2026-11-20' };
  p.split = { mode: 'manual', shares: { [p.exams[0].id]: 70, [p.exams[1].id]: 30 }, updated_at: 5 };
  return p;
}

test('una versión vieja que guarda después de la nueva no borra el plan nuevo: se juntan los dos', async () => {
  const { mergeSynced } = await import('../../js/prefs.js');
  const { toV1 } = await import('../../js/plan2-migrar.js');
  const D = load(), v2 = v2Plan(D);
  // La nueva guarda en la nube: el plan, su espejo en v1 y su copia
  const cloud1 = mergeSynced({}, { plan: v2 }).plan;
  assert.equal(cloud1.v, 2);
  assert.deepEqual(cloud1.nodes, toV1(v2).nodes);
  // La vieja lo abre: ve los dos exámenes (por el espejo) y la semana
  const seen = oldLoad(cloud1);
  assert.equal(Object.values(seen.nodes).filter(n => n.exam).length, 2);
  assert.deepEqual(seen.week, D.old.week);
  // La vieja cambia la fecha de Auxiliar y añade un día especial, y guarda (su v1 pisa el plan de la nube)
  const auxKey = 'f:' + AUX;
  seen.nodes[auxKey] = { ...seen.nodes[auxKey], exam: '2027-01-30' };
  seen.special = [...seen.special, { id: 'puente', label: 'Puente', from: '2026-12-07', to: '2026-12-08', minutes: 0, at: 9 }];
  const cloud2 = oldSave(cloud1, seen);
  assert.equal(cloud2.v, undefined);
  // La nueva vuelve a entrar: lo de la vieja, encima de su plan (reparto, varios a la vez, fecha fijada siguen)
  const back = migrate(cloud2, ctx(D));
  const aux = back.exams.find(e => e.scope.folders[0] === AUX);
  assert.equal(back.v, 2);
  assert.equal(aux.date, '2027-01-30');
  assert.equal(aux.mode, 'parallel');
  assert.deepEqual(aux.shares, { [T1]: 60, [T3]: 40 });
  assert.deepEqual(aux.fixed, { [T3]: '2026-11-20' });
  assert.deepEqual(back.split.shares, v2.split.shares);
  assert.deepEqual(back.time.special.map(s => s.id).sort(), ['puente', 'sp1']);
  assert.equal(back.nodes, undefined);
  assert.equal(back.sim.__v2, undefined);
  // Y si la nueva guarda sin volver a entrar (con su plan de antes en memoria), no deshace lo de la vieja
  const cloud3 = mergeSynced({ plan: cloud2 }, { plan: v2 }).plan;
  assert.equal(cloud3.exams.find(e => e.scope.folders[0] === AUX).date, '2027-01-30');
  assert.deepEqual(cloud3.exams.find(e => e.scope.folders[0] === AUX).shares, { [T1]: 60, [T3]: 40 });
  // Si la vieja guarda sin cambiar nada del plan, la nueva lo recupera tal cual
  const same = migrate(oldSave(cloud1, oldLoad(cloud1)), ctx(D));
  assert.deepEqual(same.exams, v2.exams);
  assert.deepEqual(same.split, v2.split);
});

test('al revés: la vieja guarda primero (v1 sin copia) y la nueva migra; después la vieja sigue viendo su plan', async () => {
  const { mergeSynced } = await import('../../js/prefs.js');
  const D = load();
  const v1 = oldSave({}, oldLoad(D.old));
  const v2 = migrate(v1, ctx(D));
  assert.equal(v2.exams.length, 2);
  // La nueva guarda; la vieja lo abre y ve los mismos exámenes y la semana que tenía
  const seen = oldLoad(mergeSynced({ plan: v1 }, { plan: v2 }).plan);
  assert.deepEqual(Object.keys(seen.nodes).sort(), Object.keys(D.old.nodes).sort());
  for (const k of Object.keys(D.old.nodes)) assert.equal(seen.nodes[k].exam, D.old.nodes[k].exam);
  assert.deepEqual(seen.week, D.old.week);
  // Quitar un examen en la vieja lo quita en la nueva
  delete seen.nodes['f:' + ING];
  const back = migrate(oldSave({}, seen), ctx(D));
  assert.deepEqual(back.exams.filter(e => !e.deleted).map(e => e.name), ['Auxiliar Administrativo']);
});
