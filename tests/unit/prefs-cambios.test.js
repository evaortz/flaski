// Ajustes entre dispositivos: de este dispositivo solo sube lo que se cambió aquí (prefsChanges + mergeSynced),
// para que un móvil con lo de ayer no pise lo que hiciste hoy en el ordenador
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefsChanges, withChanges, mergeSynced } from '../../js/prefs.js';

test('prefsChanges: solo las hojas que cambian (una lista, entera)', () => {
  const base = { look: { theme: 'light', accent: 'blue' }, study: { algo: 'fsrs', tandaMin: 10 }, plan: { exams: [{ id: 'a' }] } };
  const cur = structuredClone(base);
  assert.deepEqual(prefsChanges(base, cur), []);
  cur.look.theme = 'dark'; cur.plan.exams.push({ id: 'b' }); cur.extra = 1;
  assert.deepEqual(prefsChanges(base, cur).map(p => p.join('.')).sort(), ['extra', 'look.theme', 'plan.exams']);
});

test('withChanges: lo de la nube con lo cambiado aquí (y lo quitado aquí, quitado)', () => {
  const cloud = { look: { theme: 'light', accent: 'red' }, study: { algo: 'sm2' } };
  const mine = { look: { theme: 'dark', accent: 'blue' }, study: {} };
  assert.deepEqual(withChanges(cloud, mine, [['look', 'theme'], ['study', 'algo']]), { look: { theme: 'dark', accent: 'red' }, study: {} });
});

test('mergeSynced con cambios: el ordenador cambió el algoritmo; el móvil (de ayer) solo el tema: quedan los dos', () => {
  const ayer = { look: { theme: 'light' }, study: { algo: 'sm2', retention: 0.9 }, plan: { v: 2, exams: [], caps: { newPerDay: 5 } } };
  const nube = structuredClone(ayer); nube.study.algo = 'fsrs'; nube.study.retention = 0.85; nube.plan.caps.newPerDay = 9;
  const movil = structuredClone(ayer); movil.look.theme = 'dark';
  const out = mergeSynced(nube, movil, prefsChanges(ayer, movil));
  assert.equal(out.look.theme, 'dark');
  assert.equal(out.study.algo, 'fsrs');
  assert.equal(out.study.retention, 0.85);
  assert.equal(out.plan.caps.newPerDay, 9);
  // Sin la lista de cambios, lo de antes: todo lo del móvil
  assert.equal(mergeSynced(nube, movil).study.algo, 'sm2');
});

test('mergeSynced con cambios y el plan de la app vieja en la nube: el plan nuevo no se pierde', () => {
  const v1 = { nodes: { d: { exam: '2026-12-01' } }, week: null, special: [{ id: 'puente', at: 5 }], stages: [] };
  const mine = { look: { theme: 'dark' }, plan: { v: 2, exams: [], time: { week: null, special: [] }, caps: { newPerDay: 7 } } };
  const out = mergeSynced({ look: { theme: 'light' }, plan: v1 }, mine, [['plan', 'caps']]);
  assert.equal(out.plan.v, 2);
  assert.equal(out.plan.caps.newPerDay, 7);
  assert.equal(out.look.theme, 'light');
});
