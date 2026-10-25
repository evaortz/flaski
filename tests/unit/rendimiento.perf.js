// Rendimiento del motor del plan (plan2.js): con 5.000 preguntas, 3 exámenes y un año por delante, forecast < 50 ms y
// fixes < 500 ms. Mide de verdad, así que va aparte de la batería normal: lánzalo con el ordenador libre (sin otra
// batería de Playwright a la vez), desde tests/:  npm run rendimiento
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecast, fixes } from '../../js/plan2.js';
import { invent } from './plan2-datos.js';

test('rendimiento: 5.000 preguntas, 3 exámenes y un año: forecast < 50 ms y fixes < 500 ms', () => {
  const S = invent({ seed: 21, n: 5000, nExams: 3, nTopics: 8, seen: 0.4, days: [45, 200, 365] });
  S.plan.caps.newPerDay = 25;
  forecast(S);                                       // la primera vez cuenta el progreso (se guarda)
  const time = f => { const t = performance.now(); f(); return performance.now() - t; };
  const fcs = Array.from({ length: 7 }, () => time(() => forecast(S))).sort((a, b) => a - b);
  const fx = Array.from({ length: 3 }, () => time(() => fixes(S, 'ex0'))).sort((a, b) => a - b);
  console.log(`forecast ${fcs[0].toFixed(1)} ms (mediana ${fcs[3].toFixed(1)}) · fixes ${fx[0].toFixed(1)} ms (mediana ${fx[1].toFixed(1)})`);
  assert.ok(fcs[3] < 50, `forecast ${fcs[3]} ms`);
  assert.ok(fx[1] < 500, `fixes ${fx[1]} ms`);
});
