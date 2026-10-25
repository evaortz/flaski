// Capturas del plan de estudio para revisarlo a ojo: SHOT=1 npx playwright test e2e/capturas-plan.spec.js
// (se guardan en tests/test-results/plan/)
import { test, expect, openApp, nav } from './fixtures.js';

test.skip(!process.env.SHOT, 'solo con SHOT=1');

import { readFileSync } from 'node:fs';
const D945 = readFileSync(new URL('../fixtures/oposicion-945.json', import.meta.url), 'utf8');
// El estado de 945 preguntas (dos exámenes) el lunes 26 oct: Hoy, el Plan, un examen, el reparto, nuevo examen,
// Tu tiempo, Ajustes del plan y «En tu plan»
test('plan, examen, reparto, nuevo examen, tu tiempo, ajustes y en tu plan @ambos', async ({ page }, info) => {
  const dir = `test-results/plan/${info.project.name}-`;
  await page.clock.install({ time: new Date('2026-10-26T10:00:00') });
  await page.addInitScript(d => { if (!sessionStorage.getItem('c945')) { sessionStorage.setItem('c945', '1'); localStorage.setItem('flaski-local-v1', d); } }, D945);
  await openApp(page);
  await page.screenshot({ path: dir + '1-hoy.png', fullPage: true });
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await page.screenshot({ path: dir + '2-plan.png', fullPage: true });
  await page.locator('#main .p2-exrow').first().click();
  await page.screenshot({ path: dir + '3-examen.png', fullPage: true });
  await page.locator('#main [data-p2="mode"][data-v="parallel"]').click();
  await page.screenshot({ path: dir + '4-reparto.png' });
  await page.keyboard.press('Escape');
  await page.locator('#main [data-p2="exam-edit"]').click();
  await page.screenshot({ path: dir + '5-nuevo-examen.png' });
  await page.keyboard.press('Escape');
  await page.evaluate(() => import('/js/app.js').then(({ go }) => go('planTime')));
  await page.screenshot({ path: dir + '6-tu-tiempo.png', fullPage: true });
  await page.evaluate(() => import('/js/app.js').then(({ go }) => go('planSettings')));
  await page.screenshot({ path: dir + '7-ajustes.png', fullPage: true });
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-folder]').first().click();
  await page.locator('#main [data-p2="entuplan"]').click();
  await page.screenshot({ path: dir + '8-en-tu-plan.png' });
});

test('explorar @ambos', async ({ page, seed }, info) => {
  await seed({ builtin: ['Alemán · A2'] });
  await openApp(page);
  await nav(page, 'Explorar');
  await page.screenshot({ path: `test-results/plan/${info.project.name}-7-explorar.png`, fullPage: true });
});

test('simulacro @ambos', async ({ page }, info) => {
  const dir = `test-results/plan/${info.project.name}-sim-`;
  await openApp(page);
  await nav(page, 'Explorar');
  await page.locator('.ex-chip', { hasText: 'Oposiciones' }).click();
  await page.locator('[data-ex="add-tema"]').first().click();
  await expect(page.locator('#pgTitle')).toBeVisible();   // al añadirlo se abre el apunte
  await page.evaluate(async () => {
    const { S } = await import('/js/comun.js'); const { dayKey, addDays } = await import('/js/plan.js');
    const deck = [...S.decks.values()][0], now = Date.now();
    for (const c of S.cards.values()) S.progress.set(c.id, { reps: 2, interval: 10, ease: 2.5, lapses: 0, due: now + 9 * 864e5, last: now - 864e5 });
    const { editPlan2 } = await import('/js/plan2-app.js');
    editPlan2().exams.push({ id: 'ex-' + deck.id, name: deck.name, scope: { folders: [], decks: [deck.id], pages: [] }, date: addDays(dayKey(), 20), lastWeek: true, after: 'keep' });
    const t = dayKey();
    S.prefs.sims = [5.9, 6.1, 5.8].map((v, i) => ({ id: 'old' + i, exam: deck.id, at: i, done: i, date: addDays(t, -21 + i * 7), name: 'Constitución', settings: { n: 20, time: 30, pen: 3 }, n: 20, min: 19, score: v, ok: 14, bad: 4, blank: 2, topics: [], qs: null }));
  });
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await page.locator('#main .p2-exrow').first().click();
  await page.screenshot({ path: dir + '1-ficha.png', fullPage: true });
  await page.locator('[data-sim="prep"]').click();
  await page.screenshot({ path: dir + '2-preparar.png', fullPage: true });
  await page.locator('[data-sim="start"]').click();
  const kinds = await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.sim.qs.map(q => q.kind)));
  const ci = kinds.indexOf('choice');
  for (let i = 0; i < ci; i++) await page.locator('[data-sim="next"]').click();
  await page.locator('.sm-choices .choice').nth(2).click();
  await page.locator('[data-sim="flag"]').click();
  await page.screenshot({ path: dir + '3-pregunta.png', fullPage: true });
  await page.locator('.sm-clock').click();
  await page.screenshot({ path: dir + '4-entregas.png', fullPage: true });
  await page.locator('[data-sim="submit"]').click();
  await page.screenshot({ path: dir + '5-nota.png', fullPage: true });
  await page.locator('[data-sim="answers"]').click();
  await page.screenshot({ path: dir + '6-respuestas.png', fullPage: true });
});
