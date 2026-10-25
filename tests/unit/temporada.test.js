// Temporada del plan: días de calendario, minutos de cada día, etapas, orden de temas, proyección y
// la unión de listas entre dispositivos. Con hora de Madrid, para cruzar los cambios de hora.
process.env.TZ = 'Europe/Madrid';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minutesOn, newOn, stageOn, nodesOn, dayKey, addDays, daysBetween, weekdayOf, topicOrder, simulate, normalizeWeights } from '../../js/plan.js';
import { mergeSynced, trimSims, loadPrefs } from '../../js/prefs.js';

const week = { mon: 30, tue: 30, wed: 0, thu: 30, fri: 15, sat: 45, sun: 0 };

test('días de calendario: sumar días y contar cruza los cambios de hora sin saltarse ni repetir ninguno', () => {
  for (const [a, b] of [['2025-10-25', '2025-10-27'], ['2026-10-24', '2026-10-26'], ['2026-03-28', '2026-03-30'], ['2027-03-27', '2027-03-29']]) {
    assert.equal(addDays(a, 1), addDays(b, -1));
    assert.equal(addDays(a, 2), b);
    assert.equal(daysBetween(a, b), 2);
  }
  // Cualquier hora del día del cambio da ese mismo día
  assert.equal(dayKey(new Date(2025, 9, 26, 0, 30).getTime()), '2025-10-26');
  assert.equal(dayKey(new Date(2025, 9, 26, 23, 59).getTime()), '2025-10-26');
  assert.equal(dayKey(new Date(2026, 2, 29, 2, 30).getTime()), '2026-03-29');
  assert.equal(weekdayOf('2025-10-26'), 6);   // domingo
  assert.equal(weekdayOf('2026-03-29'), 6);
});

test('minutesOn: el día de tu semana, el especial manda y sin semana null; también los días del cambio de hora', () => {
  const plan = { week, special: [{ id: 's1', from: '2025-10-25', to: '2025-10-26', minutes: 15, at: 1 }] };
  assert.equal(minutesOn(plan, '2025-10-24'), 15);   // viernes
  assert.equal(minutesOn(plan, '2025-10-25'), 15);   // sábado, especial
  assert.equal(minutesOn(plan, '2025-10-26'), 15);   // domingo del cambio, especial (sin él, libre)
  assert.equal(minutesOn(plan, '2025-10-27'), 30);   // lunes
  assert.equal(minutesOn({ week }, '2026-03-29'), 0);   // último domingo de marzo, libre
  assert.equal(minutesOn({ week }, '2026-03-30'), 30);
  assert.equal(minutesOn({ week }, '2026-03-28'), 45);
  assert.equal(minutesOn({ week: null }, '2026-03-29'), null);
  // Un especial borrado no cuenta; si se pisan dos, el último creado
  assert.equal(minutesOn({ week, special: [{ id: 'x', from: '2026-03-28', to: '2026-03-30', minutes: 5, deleted: true }] }, '2026-03-28'), 45);
  assert.equal(minutesOn({ week, special: [{ id: 'a', from: '2026-03-01', to: '2026-03-31', minutes: 5, at: 1 }, { id: 'b', from: '2026-03-29', to: '2026-03-29', minutes: 60, at: 2 }] }, '2026-03-29'), 60);
});

test('stageOn: la etapa que cubre el día, con los extremos incluidos, a ambos lados del cambio de hora', () => {
  const stages = [
    { id: 'a', from: '2025-10-01', to: '2025-10-26', levels: {} },
    { id: 'b', from: '2025-10-27', to: '2026-03-29', levels: {} },
    { id: 'c', from: '2026-03-30', to: '2026-06-30', levels: {} },
    { id: 'z', from: '2025-01-01', to: '2030-01-01', deleted: true },
  ];
  assert.equal(stageOn(stages, '2025-10-26').id, 'a');
  assert.equal(stageOn(stages, '2025-10-27').id, 'b');
  assert.equal(stageOn(stages, '2026-03-29').id, 'b');
  assert.equal(stageOn(stages, '2026-03-30').id, 'c');
  assert.equal(stageOn(stages, '2026-07-01'), null);
  assert.equal(stageOn([], '2026-03-29'), null);
});

test('nuevas según los minutos: entre la mitad y el doble de las de Ajustes; libre, ninguna; sin semana, las de siempre', () => {
  assert.equal(newOn({ week }, '2026-03-30', 12), 12);   // 30 min = la media (30)
  assert.equal(newOn({ week }, '2026-03-28', 12), 18);   // 45 / 30
  assert.equal(newOn({ week }, '2026-03-27', 12), 6);    // 15 / 30
  assert.equal(newOn({ week }, '2026-03-29', 12), 0);    // libre
  assert.equal(newOn({ week: null }, '2026-03-29', 12), 12);
  // Casi todo a 0 y un día largo: ese día, como mucho el doble
  const lumpy = { week: { mon: 5, tue: 5, wed: 5, thu: 5, fri: 5, sat: 0, sun: 120 } };
  assert.equal(newOn(lumpy, '2026-03-29', 10), 20);
  assert.equal(newOn(lumpy, '2026-03-30', 10), 5);
  // Un día especial sin semana se compara con la tanda de Ajustes
  assert.equal(newOn({ week: null, special: [{ id: 's', from: '2026-03-29', to: '2026-03-29', minutes: 5 }] }, '2026-03-29', 10, 10), 5);
});

test('nodesOn: la etapa pone el nivel; la última semana, solo repasos; después del examen, su «after»', () => {
  const plan = {
    nodes: { 'f:tr': { exam: '2026-12-12', lastWeek: true, after: 'reviews' }, ja: { state: 'paused' } },
    stages: [{ id: 's', from: '2026-10-24', to: '2026-12-04', levels: { 'f:tr': 'high', ja: 'low' } }],
  };
  assert.deepEqual(nodesOn(plan, '2026-10-25')['f:tr'], { exam: '2026-12-12', lastWeek: true, after: 'reviews', state: 'active', weight: 2 });
  assert.equal(nodesOn(plan, '2026-10-25').ja.state, 'active');
  assert.equal(nodesOn(plan, '2026-12-01').ja.weight, 0.5);
  assert.equal(nodesOn(plan, '2026-12-05').ja.state, 'paused');     // fuera de la etapa, el de siempre
  assert.equal(nodesOn(plan, '2026-12-04')['f:tr'].state, 'active');   // 8 días antes
  assert.equal(nodesOn(plan, '2026-12-05')['f:tr'].state, 'reviews');  // 7 días antes
  assert.equal(nodesOn(plan, '2026-12-12')['f:tr'].state, undefined);  // el día del examen, como siempre
  assert.equal(nodesOn(plan, '2026-12-13')['f:tr'].state, 'reviews');  // después
  // Sin etapas ni reglas nuevas, los nodos de siempre
  assert.deepEqual(nodesOn({ nodes: { a: { state: 'reviews', weight: 2 } } }, '2026-10-25'), { a: { state: 'reviews', weight: 2 } });
});

const folders = new Map([['tr', { id: 'tr', parent_id: null }]]);
const decks = new Map([['voc', { id: 'voc', folder_id: 'tr', name: 'Voc' }], ['acu', { id: 'acu', folder_id: 'tr', name: 'Acu' }], ['pas', { id: 'pas', folder_id: 'tr', name: 'Pas' }]]);

test('orden de temas: solo da nuevas la primera lista sin terminar; las que no están en el orden, al final', () => {
  const stage = { order: { tr: [{ deck: 'voc' }, { deck: 'acu' }] } };
  let r = topicOrder(stage, decks, folders, new Map([['voc', 0], ['acu', 5], ['pas', 9]]));
  assert.equal(r.current.get('tr'), 'acu');
  assert.deepEqual([...r.blocked].sort(), ['pas', 'voc']);
  r = topicOrder(stage, decks, folders, new Map([['voc', 0], ['acu', 0], ['pas', 9]]));
  assert.equal(r.current.get('tr'), 'pas');
});

test('simulate: acaba los temas en orden y respeta los días libres', () => {
  const plan = { week: { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 0, sun: 0 }, stages: [{ id: 's', from: '2026-10-26', to: '2027-01-01', levels: {}, order: { tr: [{ deck: 'voc' }, { deck: 'acu' }, { deck: 'pas' }] } }] };
  const { finish } = simulate({ decks, folders, plan, newPerDay: 10, remaining: new Map([['voc', 20], ['acu', 10], ['pas', 10]]), from: '2026-10-26', to: '2026-12-31' });
  assert.equal(finish.get('voc'), '2026-10-27');   // lunes y martes
  assert.equal(finish.get('acu'), '2026-10-28');
  assert.equal(finish.get('pas'), '2026-10-29');
  // El sábado y el domingo no avanzan
  const r = simulate({ decks, folders, plan: { week: plan.week }, newPerDay: 10, remaining: new Map([['voc', 60]]), from: '2026-10-26', to: '2026-12-31' });
  assert.equal(r.finish.get('voc'), '2026-11-02');
});

test('los pesos de antes (porcentajes) pasan a Poco · Normal · Mucho dentro de cada grupo', () => {
  const f = new Map([['a', { id: 'a', parent_id: null }]]);
  const d = new Map([['x', { id: 'x', folder_id: 'a' }], ['y', { id: 'y', folder_id: 'a' }], ['z', { id: 'z', folder_id: null }]]);
  const nodes = { x: { weight: 80 }, y: { weight: 20, exam: '2026-12-01' } };
  assert.equal(normalizeWeights(d, f, nodes), true);
  assert.deepEqual(nodes, { x: { weight: 2 }, y: { weight: 0.5, exam: '2026-12-01' } });
  assert.equal(normalizeWeights(d, f, nodes), false);
  const eq = { x: { weight: 50 }, y: { weight: 50 } };
  normalizeWeights(d, f, eq);
  assert.deepEqual(eq, {});
});

test('unión entre dispositivos: dos copias con simulacros distintos dan los dos; lo borrado no vuelve', () => {
  const a = { look: { theme: 'dark' }, sims: [{ id: 's1', exam: 'f:x', done: 1, at: 1, qs: [] }], plan: { nodes: {}, special: [{ id: 'd1', from: '2026-12-20', to: '2027-01-06', minutes: 15, at: 5 }], stages: [{ id: 'e1', at: 2 }] } };
  const b = { look: { theme: 'light' }, sims: [{ id: 's2', exam: 'f:x', done: 2, at: 2, qs: [] }], plan: { nodes: {}, special: [], stages: [{ id: 'e1', deleted: true, at: 3 }, { id: 'e2', at: 3 }] } };
  const m = mergeSynced(a, b);
  assert.deepEqual(m.sims.map(s => s.id).sort(), ['s1', 's2']);
  assert.deepEqual(mergeSynced(b, a).sims.map(s => s.id).sort(), ['s1', 's2']);
  assert.equal(m.plan.special.length, 1);
  assert.deepEqual(m.plan.stages.map(s => [s.id, !!s.deleted]).sort(), [['e1', true], ['e2', false]]);
  assert.equal(m.look.theme, 'light');   // lo demás, lo de este dispositivo
  // Lo más reciente gana con el mismo id
  assert.equal(mergeSynced({ plan: { stages: [{ id: 'e', name: 'vieja', at: 1 }] } }, { plan: { stages: [{ id: 'e', name: 'nueva', at: 2 }] } }).plan.stages[0].name, 'nueva');
  assert.equal(mergeSynced({ plan: { stages: [{ id: 'e', name: 'nueva', at: 2 }] } }, { plan: { stages: [{ id: 'e', name: 'vieja', at: 1 }] } }).plan.stages[0].name, 'nueva');
  // Las preferencias cargadas conservan todo
  const p = loadPrefs(m);
  assert.equal(p.sims.length, 2);
  assert.equal(p.plan.special[0].minutes, 15);
});

test('el detalle se guarda de los 10 últimos simulacros de cada examen', () => {
  const sims = [...Array(13)].map((_, i) => ({ id: 'a' + i, exam: 'A', done: i, at: i, qs: [['c', 'x', 0, 'o']] }))
    .concat([{ id: 'b0', exam: 'B', done: 0, at: 0, qs: [] }]);
  const t = trimSims(sims);
  assert.equal(t.filter(s => s.exam === 'A' && s.qs).length, 10);
  assert.deepEqual(t.filter(s => s.exam === 'A' && !s.qs).map(s => s.id), ['a0', 'a1', 'a2']);
  assert.ok(t.find(s => s.id === 'b0').qs);
  assert.equal(t.length, 14);
});
