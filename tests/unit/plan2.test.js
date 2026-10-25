// Motor del plan nuevo (plan2.js): ritmo, repasos previstos, cuánto cabe, reparto, simulación y arreglos.
// Escenarios fijos (con fecha y datos fijos) y propiedades con datos al azar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medirRitmo, newKernel, forecast, today, whatIf, fixes, sharesToday, toPercent, minutesOn, plan2On } from '../../js/plan2.js';
import { addDays, daysBetween } from '../../js/plan.js';
import { startOfDay } from '../../js/srs.js';
import { state945, TODAY, deckByName, examByName, invent, rng } from './plan2-datos.js';

const DAY = 864e5;
const T1 = 'f1a4a82c-3197-48d2-a180-b00b1dccd8cc', T2 = '0902a08c-7fbe-4181-b75c-86ba22f2e128';
const reaches = v => v === 'llegas' || v === 'justo';
const exam = (fc, name) => fc.exams.find(e => e.name.startsWith(name));

/* ---------------- 1 · el ritmo ---------------- */
test('el ritmo: mediana por nueva (sumando sus vueltas del mismo día) y por repaso; sin pausas; con pocas, 40 s y 12 s', () => {
  assert.deepEqual(medirRitmo([]), { secNew: 40, secReview: 12, measured: false, n: 0 });
  const ev = [];
  for (let i = 0; i < 40; i++) {
    ev.push({ card_id: 'n' + i, ts: `2026-10-0${1 + (i % 9)}T10:00:${String(i).padStart(2, '0')}Z`, state: 'new', ms: 20000 });
    ev.push({ card_id: 'n' + i, ts: `2026-10-0${1 + (i % 9)}T10:05:${String(i).padStart(2, '0')}Z`, state: 'learning', ms: 10000 });
  }
  for (let i = 0; i < 30; i++) ev.push({ card_id: 'r' + i, ts: `2026-10-10T10:00:${String(i).padStart(2, '0')}Z`, state: 'review', ms: 8000 });
  ev.push({ card_id: 'r0', ts: '2026-10-10T11:00:00Z', state: 'review', ms: 10 * 60e3 });   // una pausa: no cuenta
  assert.deepEqual(medirRitmo(ev), { secNew: 30, secReview: 8, measured: true, n: 110 });
  // Con menos de 50 respuestas, lo de siempre
  assert.equal(medirRitmo(ev.slice(0, 49)).secNew, 40);
});

test('cada nueva trae sus repasos en los días siguientes (de media), y con el 95 % más que con el 90 %', () => {
  const sum = K => K.reduce((a, [, w]) => a + w, 0);
  const k90 = newKernel(0.9), k95 = newKernel(0.95);
  assert.equal(k90[0][0], 1);                       // las que se fallan, al día siguiente
  assert.ok(k90.find(([d]) => d === 3)[1] > 0.9);   // la mayoría, a los 3 días
  assert.ok(sum(k95) > sum(k90) + 2);
});

test('los minutos de un día: pausa, «hoy solo tengo…», día especial y semana', () => {
  const plan = { time: { week: { mon: 45, tue: 45, wed: 45, thu: 45, fri: 30, sat: 90, sun: 0 }, special: [{ id: 'n', from: '2026-12-24', to: '2026-12-26', minutes: 0 }], today: { day: '2026-10-27', minutes: 10 }, pause: { from: '2026-11-03', to: '2026-11-06' } } };
  assert.equal(minutesOn(plan, '2026-10-26'), 45);
  assert.equal(minutesOn(plan, '2026-10-27'), 10);
  assert.equal(minutesOn(plan, '2026-10-31'), 90);
  assert.equal(minutesOn(plan, '2026-11-01'), 0);
  assert.equal(minutesOn(plan, '2026-11-04'), 0);
  assert.equal(minutesOn(plan, '2026-12-25'), 0);
  assert.equal(minutesOn({ time: { week: null } }, '2026-10-26', 15), 15);
});

/* ---------------- escenarios fijos ---------------- */
// Los dos exámenes del diseño: 945 preguntas, T1 y T2 ya sabidos; tope: las 20 nuevas al día de Ajustes
const design = change => state945(p => { p.exams[0].known = [T1, T2]; change?.(p); });

test('los dos exámenes: el 80 % al más cercano; Auxiliar acaba el 23 nov (7 semanas de repaso) y después Inglés', () => {
  const S = design(), fc = forecast(S);
  const sh = sharesToday(S, 1);
  assert.deepEqual([...sh.values()], [80, 20]);
  assert.equal(fc.days[1].new, 20);
  assert.deepEqual(Object.fromEntries(Object.entries(fc.days[1].newBy).map(([id, n]) => [S.decks.get(id).name.slice(0, 2), n])), { T3: 16, Gr: 4 });   // Inglés, un tema tras otro: Gramática va antes por nombre
  const a = exam(fc, 'Auxiliar'), b = exam(fc, 'Inglés');
  assert.equal(a.start, 400);
  assert.equal(a.finish, '2026-11-23');
  assert.equal(a.verdict, 'llegas');
  assert.deepEqual(a.phases, { temario: ['2026-10-25', '2026-11-23'], repaso: ['2026-11-24', '2027-01-08'], lastWeek: ['2027-01-09', '2027-01-15'] });
  assert.equal(Math.round(a.review / 7), 7);
  assert.equal(b.finish, '2026-12-04');   // el diseño decía 2 dic: con 20 al día no caben 190 en 8 días
  assert.equal(b.verdict, 'llegas');
  // El camino: T3 primero, después T4…
  const t3 = a.topics.find(t => t.id === deckByName(S, 'T3')), t4 = a.topics.find(t => t.id === deckByName(S, 'T4'));
  assert.equal(t3.from, '2026-10-26');
  assert.ok(t3.finish <= t4.from);
  assert.equal(a.topics.find(t => t.id === T1).state, 'known');
});

test('Hoy y el Plan dicen lo mismo el domingo libre: 48 repasos, sin nuevas', () => {
  const S = state945(), t = today(S), fc = forecast(S);
  const end = startOfDay(new Date(TODAY + 'T12:00:00').getTime()) + DAY;
  const due = [...S.progress.values()].filter(p => p.due < end).length;
  assert.equal(due, 48);
  assert.equal(t.reviews, 48);
  assert.equal(t.new, 0);
  assert.equal(t.total, 48);
  assert.equal(t.rest, true);
  assert.equal(fc.days[0].reviewsDue, t.reviews);
  // Lo de hoy no está hecho mientras queden repasos; hechos, sí
  assert.equal(t.done, false);
  const S2 = { ...S, progress: new Map([...S.progress].map(([id, p]) => [id, p.due < end ? { ...p, due: end + 2 * DAY, last: end - 3600e3 } : p])), done: { reviews: 48, new: 0 } };
  assert.equal(today(S2).done, true);
});

test('examen a 26 días: no llegas, y las tres opciones propuestas sí llegan', () => {
  const S = state945(p => { p.exams[0].date = addDays(TODAY, 26); });
  const id = examByName(S, 'Auxiliar').id;
  const base = exam(forecast(S), 'Auxiliar');
  assert.equal(base.verdict, 'no');
  assert.equal(base.left, 169);                    // de 425 (el diseño, a ojo, decía 131)
  const fx = fixes(S, id);
  assert.equal(fx.options.length, 3);
  assert.equal(fx.drop, null);
  for (const o of fx.options) {
    assert.ok(reaches(o.exam.verdict));
    assert.ok(reaches(exam(forecast({ ...S, plan: o.plan }), 'Auxiliar').verdict));
  }
  // Las que cambian menos primero, y cada una distinta
  assert.ok(fx.options[0].cost <= fx.options[1].cost && fx.options[1].cost <= fx.options[2].cost);
  assert.equal(new Set(fx.options.map(o => o.kinds)).size, 3);
  // La primera: subir el tope de Ajustes de 20 al mínimo que llega
  assert.deepEqual(fx.options[0].levers, [{ kind: 'cap', from: 20, newPerDay: 36 }]);
  assert.equal(fx.options[0].plan.caps.newPerDay, 36);
  assert.equal(exam(forecast({ ...S, plan: fx.options[0].plan }), 'Auxiliar').verdict, 'justo');
  assert.equal(exam(whatIf(S, { caps: { newPerDay: 35 } }), 'Auxiliar').verdict, 'no');
});

test('el tope de nuevas: las de Ajustes (nunca más de 20 en un día); sin valor, mandan los minutos', () => {
  const S = state945(), fc = forecast(S);
  assert.equal(S.newPerDay, 20);
  assert.ok(fc.days.every(d => d.new <= 20));
  assert.equal(fc.days[1].new, 20);                                   // el lunes cabrían 36
  const free = forecast({ ...S, newPerDay: null });
  assert.equal(free.days[1].new, 36);
  assert.ok(exam(free, 'Auxiliar').finish < exam(fc, 'Auxiliar').finish);
  // El tope de Ajustes del plan manda sobre el de Ajustes
  assert.ok(whatIf(S, { caps: { newPerDay: 10 } }).days.every(d => d.new <= 10));
});

test('la palanca del tope solo sale si el examen no llega (y si hay tope)', () => {
  const ok = state945();
  assert.equal(exam(forecast(ok), 'Auxiliar').verdict, 'llegas');
  assert.deepEqual(fixes(ok, examByName(ok, 'Auxiliar').id).options, []);
  const late = state945(p => { p.exams[0].date = addDays(TODAY, 26); });
  assert.ok(fixes(late, examByName(late, 'Auxiliar').id).options.some(o => o.kinds === 'cap'));
  // Sin tope (cuenta nueva), no hay tope que subir
  const S = { ...state945(p => { p.exams[0].date = addDays(TODAY, 12); }), newPerDay: null };
  const fx = fixes(S, examByName(S, 'Auxiliar').id);
  assert.equal(fx.base.verdict, 'no');
  assert.ok(fx.options.every(o => !o.kinds.includes('cap')));
});

test('ningún arreglo llega: propone qué temas dejar para el final', () => {
  const S = invent({ seed: 3, n: 3000, nExams: 1, nTopics: 6, seen: 0, days: [10] });
  S.plan.caps.newPerDay = 20;
  const fx = fixes(S, 'ex0');
  assert.equal(fx.base.verdict, 'no');
  assert.deepEqual(fx.options, []);
  assert.ok(fx.drop.topics.length >= 1);
  assert.ok(reaches(fx.drop.exam.verdict));
  assert.equal(fx.drop.topics.at(-1), 'd0-5');       // los últimos del camino
});

// Un examen con tres temas a mano (sin progreso), tope de 20 al día y todos los días con tiempo de sobra
function three(fresh, extra) {
  const decks = [], cards = [];
  fresh.forEach((n, k) => { decks.push({ id: 'abc'[k], folder_id: 'f', name: `T${k + 1}` }); for (let i = 0; i < n; i++) cards.push({ id: `${k}-${i}`, deck_id: 'abc'[k] }); });
  const plan = {
    v: 2, time: { week: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => [d, 120])), special: [] },
    exams: [{ id: 'e', name: 'Examen', scope: { folders: ['f'] }, date: addDays(TODAY, 90), mode: 'seq', order: [], shares: {}, fixed: {}, lastWeek: false, ...extra }],
    split: { mode: 'auto' }, free: {}, caps: { newPerDay: 20 }, stages: [],
  };
  return { plan, today: TODAY, decks, folders: [{ id: 'f', name: 'Examen' }], cards, progress: new Map(), pace: { secNew: 40, secReview: 12 } };
}

test('varios temas a la vez al 50, 30 y 20 %: cuando uno se acaba, su parte pasa a los que quedan', () => {
  const fc = forecast(three([100, 30, 200], { mode: 'parallel', shares: { a: 50, b: 30, c: 20 } }));
  assert.deepEqual(fc.days[0].newBy, { a: 10, b: 6, c: 4 });
  const e = fc.exams[0], b = e.topics.find(t => t.id === 'b');
  assert.equal(b.finish, addDays(TODAY, 4));                          // 30 a 6 al día: 5 días
  assert.deepEqual(fc.days[5].newBy, { a: 14, c: 6 });               // 50 : 20 de 20
  assert.equal(fc.days.reduce((s, d) => s + d.new, 0), 330);
});

test('un tema tras otro, y una fecha fijada sube la parte de ese tema justo lo necesario', () => {
  const seq = forecast(three([100, 100, 0]));
  assert.deepEqual(seq.days[0].newBy, { a: 20 });
  assert.equal(seq.exams[0].topics.find(t => t.id === 'b').finish, addDays(TODAY, 9));
  const fixed = forecast(three([100, 100, 0], { fixed: { b: addDays(TODAY, 4) } }));
  assert.deepEqual(fixed.days[0].newBy, { b: 20 });                   // 100 en 5 días: 20 al día
  const S = three([100, 100, 0], { fixed: { b: addDays(TODAY, 9) } }), f2 = forecast(S);
  assert.deepEqual(f2.days[0].newBy, { b: 10, a: 10 });               // 100 en 10 días: 10 al día
  assert.equal(f2.exams[0].topics.find(t => t.id === 'b').finish, addDays(TODAY, 9));
  // Lo que ya sabes no da nuevas; lo que «no cae» sale del examen
  const k = forecast(three([100, 100, 50], { known: ['a'], exclude: ['c'] }));
  assert.deepEqual(k.days[0].newBy, { b: 20 });
  assert.equal(k.exams[0].start, 100);
});

test('día especial, pausa de 4 días y «hoy solo tengo 10 min»', () => {
  const S = invent({ seed: 5, n: 900, nExams: 1, seen: 0.4, days: [80] });
  const base = forecast(S);
  const P = { ...S, plan: { ...S.plan, time: { ...S.plan.time, today: { day: TODAY, minutes: 10 }, special: [{ id: 'n', label: 'Navidad', from: '2026-12-24', to: '2026-12-26', minutes: 0 }], pause: { from: '2026-11-03', to: '2026-11-06' } } } };
  const fc = forecast(P), day = k => fc.days.find(d => d.day === k);
  // Hoy (domingo, que suele ser libre) tienes 10 min: caben repasos, no más
  assert.equal(fc.days[0].minutes, 10);
  assert.ok(fc.days[0].secs <= 600);
  for (const k of ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-12-24', '2026-12-25', '2026-12-26']) {
    assert.equal(day(k).minutes, 0); assert.equal(day(k).new, 0); assert.equal(day(k).reviews, 0);
  }
  // Lo de la pausa se hace después (no se pierde) y el examen acaba más tarde
  assert.ok(day('2026-11-07').reviewsDue > base.days.find(d => d.day === '2026-11-07').reviewsDue);
  assert.ok(fc.exams[0].finish > base.exams[0].finish);
  // today() con los 10 min
  const t = today(P);
  assert.equal(t.minutes, 10);
  assert.ok(t.secs <= 600 || !t.fits);
});

test('más repasos de los que caben: ese día no hay nuevas y se avisa', () => {
  const S = invent({ seed: 9, n: 800, nExams: 1, seen: 1, days: [60], week: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => [d, 30])) });
  const t0 = new Date(TODAY + 'T09:00:00').getTime();
  let i = 0;
  for (const [id, p] of S.progress) if (i++ < 300) S.progress.set(id, { ...p, due: t0 });
  for (let k = 0; k < 100; k++) { S.cards.push({ id: 'x' + k, deck_id: 'd0-0' }); }
  const fc = forecast(S), d0 = fc.days[0];
  assert.ok(d0.reviewsDue >= 300);
  assert.equal(d0.reviews, 150);                    // 30 min a 12 s
  assert.equal(d0.short, true);
  assert.equal(d0.new, 0);
  assert.ok(fc.short.includes(TODAY));
  const t = today(S);
  assert.equal(t.short, true);
  assert.equal(t.fits, false);
  assert.equal(t.new, 0);
});

test('después del examen: en pausa sus repasos dejan de contar; los temas que dejaste para después entran entonces', () => {
  const S = three([60, 60, 0], { date: addDays(TODAY, 10), later: ['b'], after: 'pause' });
  const fc = forecast({ ...S, plan: { ...S.plan, exams: [...S.plan.exams, { id: 'z', name: 'Otro', scope: { decks: ['zz'] }, date: addDays(TODAY, 40) }] }, decks: [...S.decks, { id: 'zz', name: 'Z' }] });
  const e = fc.exams[0];
  assert.equal(e.start, 60);
  assert.equal(e.verdict, 'llegas');
  const b = e.topics.find(t => t.id === 'b');
  assert.equal(b.state, 'later');
  assert.ok(b.from >= addDays(TODAY, 10));
  assert.ok(fc.days[30].reviewsDue === 0);           // a y b en pausa tras el examen
});

test('las etapas a mano mandan durante su rango', () => {
  const S = invent({ seed: 2, n: 600, nExams: 2, seen: 0, days: [60, 120] });
  S.plan.caps.newPerDay = 20;
  S.plan.stages = [{ id: 's', name: 'Inglés primero', from: TODAY, to: addDays(TODAY, 6), levels: { 'f:f0': 'reviews', 'f:f1': 'high' }, order: {} }];
  const fc = forecast(S);
  assert.ok(Object.keys(fc.days[1].newBy).every(id => id.startsWith('d1-')));
  assert.ok(Object.keys(fc.days[8].newBy).some(id => id.startsWith('d0-')));
});

test('whatIf: el mismo forecast con un cambio, sin tocar el plan', () => {
  const S = design(), before = JSON.stringify(S.plan);
  const w = whatIf(S, { time: { week: { mon: 90, tue: 90, wed: 90, thu: 90, fri: 90, sat: 90, sun: 90 } }, caps: { newPerDay: null } });
  assert.equal(JSON.stringify(S.plan), before);
  assert.ok(exam(w, 'Auxiliar').finish < exam(forecast(S), 'Auxiliar').finish);
  const w2 = whatIf(S, p => { p.exams[1].hold = '2026-11-23'; });
  assert.equal(w2.days[1].new, 20);
  assert.ok(Object.keys(w2.days[1].newBy).every(id => S.decks.get(id).folder_id === S.plan.exams[0].scope.folders[0]));
});

test('el interruptor de pruebas «plan2»', () => {
  assert.equal(plan2On({ search: '?local&plan2' }, null), true);
  assert.equal(plan2On({ search: '' }, { getItem: () => '1' }), true);
  assert.equal(plan2On({ search: '?local' }, { getItem: () => null }), false);
});

/* ---------------- propiedades ---------------- */
function randomState(r, seed) {
  const nExams = 1 + Math.floor(r() * 3);
  const days = [5 + Math.floor(r() * 60), 30 + Math.floor(r() * 120), 60 + Math.floor(r() * 200)];
  const week = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => [d, r() < 0.2 ? 0 : 5 * Math.floor(r() * 19)]));
  const S = invent({ seed, n: 100 + Math.floor(r() * 500), nExams, nTopics: 1 + Math.floor(r() * 5), seen: r() * 0.6, days, week });
  if (r() < 0.4) { S.plan.split = { mode: 'manual', shares: Object.fromEntries(S.plan.exams.map(e => [e.id, Math.floor(r() * 100)])) }; }
  for (const e of S.plan.exams) {
    e.lastWeek = r() < 0.5;
    if (r() < 0.3) { e.mode = 'parallel'; e.shares = { [`${e.scope.folders[0].replace('f', 'd')}-0`]: 60, [`${e.scope.folders[0].replace('f', 'd')}-1`]: 40 }; }
  }
  if (r() < 0.3) S.plan.caps.newPerDay = 5 + Math.floor(r() * 30);
  // A veces un tema está en dos exámenes (el segundo examen incluye una lista del primero)
  if (S.plan.exams.length > 1 && r() < 0.3) S.plan.exams[1].scope.decks = ['d0-0'];
  if (r() < 0.2) S.plan.time.special = [{ id: 's', from: addDays(TODAY, 3), to: addDays(TODAY, 9), minutes: 0 }];
  return S;
}

test('propiedad: los porcentajes del reparto siempre suman 100', () => {
  const r = rng(11);
  for (let k = 0; k < 200; k++) {
    const S = randomState(r, k + 1), sh = sharesToday(S, Math.floor(r() * 5));
    if (sh.size) assert.equal([...sh.values()].reduce((a, b) => a + b, 0), 100);
    const w = new Map(Array.from({ length: 1 + Math.floor(r() * 6) }, (_, i) => [i, r() * 10]));
    assert.equal([...toPercent(w).values()].reduce((a, b) => a + b, 0), 100);
  }
});

test('propiedad: más minutos nunca retrasan una fecha', () => {
  const r = rng(12);
  for (let k = 0; k < 200; k++) {
    const S = randomState(r, k + 300), more = 5 + 5 * Math.floor(r() * 6);
    const a = forecast(S, { light: true });
    const b = whatIf(S, p => { for (const d of Object.keys(p.time.week)) if (p.time.week[d] > 0) p.time.week[d] += more; }, { light: true });
    a.exams.forEach((e, i) => {
      const f = b.exams[i];
      if (e.finish) assert.ok(f.finish && f.finish <= e.finish, `caso ${k}: ${e.id} ${e.finish} → ${f.finish}`);
      assert.ok(f.left <= e.left, `caso ${k}: quedan ${e.left} → ${f.left}`);
    });
  }
});

test('propiedad: nunca más nuevas de las que hay ni más minutos de los del día', () => {
  const r = rng(13);
  for (let k = 0; k < 200; k++) {
    const S = randomState(r, k + 600), fc = forecast(S), fresh = new Map();
    for (const c of S.cards) if (!S.progress.has(c.id)) fresh.set(c.deck_id, (fresh.get(c.deck_id) || 0) + 1);
    const got = new Map();
    for (const d of fc.days) {
      assert.ok(d.secs <= d.minutes * 60, `caso ${k}: ${d.day} ${d.secs} s en ${d.minutes} min`);
      for (const [id, n] of Object.entries(d.newBy)) { assert.ok(n > 0); got.set(id, (got.get(id) || 0) + n); }
      if (S.plan.caps.newPerDay) assert.ok(d.new <= S.plan.caps.newPerDay);
    }
    for (const [id, n] of got) assert.ok(n <= (fresh.get(id) || 0), `caso ${k}: ${id} ${n} de ${fresh.get(id)}`);
  }
});

test('propiedad: un arreglo que llega, aplicado, llega', () => {
  const r = rng(14);
  let checked = 0;
  for (let k = 0; k < 200 && checked < 40; k++) {
    const S = randomState(r, k + 900), fc = forecast(S, { light: true }), late = fc.exams.find(e => e.verdict === 'no');
    if (!late) continue;
    checked++;
    const fx = fixes(S, late.id);
    for (const o of fx.options) {
      const e = forecast({ ...S, plan: o.plan }, { light: true }).exams.find(x => x.id === late.id);
      assert.equal(e.verdict, o.exam.verdict);
      assert.ok(reaches(e.verdict));
    }
  }
  assert.ok(checked >= 10, `solo ${checked} casos sin llegar`);
});

/* ---------------- rendimiento ---------------- */
test('rendimiento: 5.000 preguntas, 3 exámenes y un año: forecast < 50 ms y fixes < 500 ms', () => {
  const S = invent({ seed: 21, n: 5000, nExams: 3, nTopics: 8, seen: 0.4, days: [45, 200, 365] });
  S.plan.caps.newPerDay = 25;
  forecast(S);                                       // la primera vez cuenta el progreso (se guarda)
  const time = f => { const t = performance.now(); f(); return performance.now() - t; };
  // El mejor de varios intentos: si otra batería ocupa el ordenador, la mediana sube y la prueba fallaría sin motivo
  const fcs = Array.from({ length: 7 }, () => time(() => forecast(S))).sort((a, b) => a - b);
  const fx = Array.from({ length: 3 }, () => time(() => fixes(S, 'ex0'))).sort((a, b) => a - b);
  console.log(`forecast ${fcs[0].toFixed(1)} ms (mediana ${fcs[3].toFixed(1)}) · fixes ${fx[0].toFixed(1)} ms (mediana ${fx[1].toFixed(1)})`);
  assert.ok(fcs[0] < 50, `forecast ${fcs[0]} ms`);
  assert.ok(fx[0] < 500, `fixes ${fx[0]} ms`);
});

test('today(): «Hecho por hoy» al cumplir los minutos (o sin nada pendiente); un día libre, nunca', () => {
  const S = three([100, 0, 0], { lastWeek: false });
  S.plan.time.week = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => [d, 10]));
  assert.equal(today(S).dayDone, null);
  assert.equal(today({ ...S, done: { new: 5, reviews: 0, n: 9, ms: 4 * 60e3 } }).dayDone, null);
  // 15 nuevas a 40 s = 10 min: hecho
  assert.deepEqual(today({ ...S, done: { new: 15, reviews: 0, n: 30, ms: 7 * 60e3 } }).dayDone, { n: 30, minutes: 7 });
  // O 10 min de verdad respondiendo
  assert.ok(today({ ...S, done: { new: 3, reviews: 0, n: 12, ms: 10 * 60e3 } }).dayDone);
  const free = { ...S, plan: { ...S.plan, time: { ...S.plan.time, week: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => [d, 0])) } } };
  assert.equal(today({ ...free, done: { new: 15, reviews: 0, n: 30, ms: 20 * 60e3 } }).dayDone, null);
});

test('today(): las «N nuevas más» que pides se suman a las del plan', () => {
  const S = three([100, 30, 0]);
  assert.equal(today(S).new, 20);
  const t = today({ ...S, extraNew: 10 });
  assert.equal(t.new, 30);
  assert.equal(Object.values(t.newBy).reduce((a, b) => a + b, 0), 30);
  // Ya hechas las 20 del plan, quedan las 10 de más
  assert.equal(today({ ...S, extraNew: 10, done: { new: 20, reviews: 0, n: 20, ms: 0 } }).new, 10);
});

/* ---------------- revisión del paso A ---------------- */
// Un tema en el alcance de dos exámenes (un examen en una carpeta y otro en una de sus listas)
function shared(n = 47) {
  const S = invent({ seed: 4, n: 0, nExams: 2, nTopics: 2, seen: 0, days: [40, 90] });
  for (let i = 0; i < n; i++) S.cards.push({ id: 's' + i, deck_id: 'd0-0' });
  S.plan.exams[1].scope = { folders: ['f1'], decks: ['d0-0'], pages: [] };
  S.plan.time.week = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => [d, 120]));
  return S;
}
test('1 · un tema de dos exámenes no se reparte dos veces', () => {
  const fc = forecast(shared());
  assert.equal(fc.days[0].newBy['d0-0'], 47);                       // 47, no 60
  assert.equal(fc.days.reduce((s, d) => s + (d.newBy['d0-0'] || 0), 0), 47);
});

// Ningún número del forecast (ni de sus exámenes y días) sale NaN
function noNaN(o, path = 'forecast') {
  if (typeof o === 'number') assert.ok(!Number.isNaN(o), `${path} es NaN`);
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) noNaN(v, `${path}.${k}`);
}
test('2 · un ritmo de menos de medio segundo cuenta como 1 s: nada sale NaN', () => {
  const ev = Array.from({ length: 60 }, (_, i) => ({ card_id: 'c' + i, ts: `2026-10-20T10:${String(i).padStart(2, '0')}:00Z`, state: 'review', ms: 400 }));
  const pace = medirRitmo(ev);
  assert.equal(pace.secReview, 1);
  const S = { ...state945(), pace: undefined, events: ev };
  const fc = forecast(S);
  noNaN(fc);
  assert.equal(fc.days[0].minutes, 0);                  // el domingo libre: 0 / 0 daba NaN
  assert.deepEqual(fc.exams.map(e => e.verdict), ['llegas', 'llegas']);
  noNaN(today(S), 'today');
});

test('3 · el tope de repasos al día no cuenta como «no caben»: el tiempo que sobra va a las nuevas', () => {
  const S = state945(p => { p.caps.reviewsPerDay = 5; });
  const fc = forecast({ ...S, newPerDay: null }), mon = fc.days[1];
  assert.equal(mon.reviews, 5);
  assert.equal(mon.short, false);
  assert.equal(mon.new, Math.floor((45 * 60 - 5 * 12) / 40));        // 66
  assert.deepEqual(fc.short, []);
  assert.deepEqual(fc.exams.map(e => e.verdict), ['llegas', 'llegas']);
  // Sin el tope, de verdad no caben: 300 repasos en 30 min
  const big = invent({ seed: 9, n: 400, nExams: 1, seen: 1, days: [60], week: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => [d, 30])) });
  const t0 = new Date(TODAY + 'T09:00:00').getTime();
  for (const [id, p] of big.progress) big.progress.set(id, { ...p, due: t0 });
  assert.equal(forecast(big).days[0].short, true);
});

// Dos exámenes: ex0 el 9 dic (300 nuevas, llegas) y ex1 el 16 ene (1.600, no llegas). Antes se proponía pausar
// ex0 hasta el 16 ene para arreglar ex1, y ex0 se quedaba en «no»
function twoLate() {
  const S = invent({ seed: 7, n: 0, nExams: 2, nTopics: 4, seen: 0, days: [45, 83] });
  for (let i = 0; i < 300; i++) S.cards.push({ id: 'a' + i, deck_id: 'd0-' + (i % 4) });
  for (let i = 0; i < 1600; i++) S.cards.push({ id: 'b' + i, deck_id: 'd1-' + (i % 4) });
  S.plan.caps.newPerDay = 25;
  return S;
}
test('4 · «pausar otro examen» solo pausa uno que va después, y ningún arreglo empeora otro examen', () => {
  const S = twoLate(), fc = forecast(S, { light: true });
  assert.deepEqual(fc.exams.map(e => [e.date, e.verdict]), [['2026-12-09', 'llegas'], ['2027-01-16', 'no']]);
  const late = fc.exams[1], fx = fixes(S, late.id);
  assert.equal(fx.options.length, 3);
  assert.ok(fx.options.every(o => !o.levers.some(l => l.kind === 'pauseOther' && l.exam === 'ex0')));
  for (const o of [...fx.options, ...(fx.drop ? [fx.drop] : [])]) {
    for (const l of o.levers || []) if (l.kind === 'pauseOther') assert.ok(S.plan.exams.find(e => e.id === l.exam).date > S.plan.exams.find(e => e.id === late.id).date);
    const after = forecast({ ...S, plan: o.plan }, { light: true }).exams;
    for (const e of after) if (e.id !== late.id) {
      const b = fc.exams.find(x => x.id === e.id);
      assert.ok({ no: 0, justo: 1, llegas: 2 }[e.verdict] >= { no: 0, justo: 1, llegas: 2 }[b.verdict], `${e.id}: ${b.verdict} → ${e.verdict}`);
    }
  }
});

test('5 · mover la fecha solo con fecha aproximada, y como último recurso', () => {
  const make = (n, d, approx) => { const S = invent({ seed: 3, n, nExams: 1, nTopics: 3, seen: 0, days: [d] }); S.plan.caps.newPerDay = 20; S.plan.exams[0].approx = approx; return S; };
  // 500 nuevas a 10 días: nada más llega; con fecha aproximada, se propone moverla (lo menos posible)
  const a = fixes(make(500, 10, true), 'ex0');
  assert.deepEqual(a.options.map(o => o.kinds), ['date']);
  assert.equal(a.options[0].levers[0].weeks, 4);                       // con 2 semanas más no llega
  const S2 = make(500, 10, true);
  assert.equal(whatIf(S2, p => { p.exams[0].date = addDays(p.exams[0].date, 14); }, { light: true }).exams[0].verdict, 'no');
  // Con fecha exacta, nunca
  const b = fixes(make(500, 10, false), 'ex0');
  assert.ok(b.options.every(o => !o.kinds.includes('date')));
  // Si otra cosa llega, la fecha no compite aunque sea aproximada
  const c = fixes(make(300, 21, true), 'ex0');
  assert.ok(c.options.length > 0 && c.options.every(o => !o.kinds.includes('date')));
});
