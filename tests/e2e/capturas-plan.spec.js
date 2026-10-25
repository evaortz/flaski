// Capturas del plan de estudio para revisarlo a ojo: SHOT=1 npx playwright test e2e/capturas-plan.spec.js
// (se guardan en tests/test-results/plan/)
import { test, expect, openApp, nav } from './fixtures.js';

test.skip(!process.env.SHOT, 'solo con SHOT=1');

const JA = 'Japonés · Demo de Flaski', TR = 'Turco · Armonía vocálica', DE = 'Alemán · A2';
test('plan, etapa, examen y primera vez @ambos', async ({ page, seed }, info) => {
  const dir = `test-results/plan/${info.project.name}-`;
  await seed({ builtin: [JA, TR, DE] });
  await openApp(page);
  await page.evaluate(async () => {
    const { S } = await import('/js/comun.js'); const { dayKey, addDays } = await import('/js/plan.js');
    const id = n => [...S.decks.values()].find(d => d.name.startsWith(n)).id, t = dayKey();
    S.prefs.plan.nodes[id('Turco')] = { exam: addDays(t, 30), lastWeek: true, after: 'reviews' };
    S.prefs.plan.nodes[id('Japonés')] = { exam: addDays(t, 120), lastWeek: true, after: 'reviews' };
    S.prefs.plan.week = { mon: 30, tue: 30, wed: 0, thu: 30, fri: 15, sat: 45, sun: 0 };
    S.prefs.plan.special = [{ id: 's1', from: addDays(t, 40), to: addDays(t, 55), minutes: 15, label: 'vacaciones', at: 1 }];
  });
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await page.screenshot({ path: dir + '1-primera.png', fullPage: true });
  await page.locator('#main .pl-start').click();
  await expect(page.getByRole('heading', { name: 'Hagamos tu plan' })).toBeVisible();
  await page.screenshot({ path: dir + '2-hagamos.png', fullPage: true });
  await page.locator('[data-pl="start-ok"]').click();
  await page.screenshot({ path: dir + '3-plan.png', fullPage: true });
  await page.locator('.ps-card').first().click();
  await page.screenshot({ path: dir + '4-etapa.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.locator('.pe-row').first().click();
  await page.screenshot({ path: dir + '5-examen.png', fullPage: true });
  await page.locator('[data-pl="exam-edit"]').click();
  await page.screenshot({ path: dir + '6-nuevo-examen.png', fullPage: true });
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
    S.prefs.plan.nodes[deck.id] = { exam: addDays(dayKey(), 20), lastWeek: true, after: 'reviews' };
    const t = dayKey();
    S.prefs.sims = [5.9, 6.1, 5.8].map((v, i) => ({ id: 'old' + i, exam: deck.id, at: i, done: i, date: addDays(t, -21 + i * 7), name: 'Constitución', settings: { n: 20, time: 30, pen: 3 }, n: 20, min: 19, score: v, ok: 14, bad: 4, blank: 2, topics: [], qs: null }));
  });
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await page.locator('.pe-row').first().click();
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
