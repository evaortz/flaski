// Capturas del plan de estudio para revisarlo a ojo: SHOT=1 npx playwright test e2e/capturas-plan.spec.js
// (se guardan en tests/test-results/plan/)
import { test, expect, openApp, nav, addBuiltinDeck } from './fixtures.js';

test.skip(!process.env.SHOT, 'solo con SHOT=1');

const JA = 'Japonés · Demo de Flaski', TR = 'Turco · Armonía vocálica', DE = 'Alemán · A2';
test('plan, etapa, examen y primera vez', async ({ page }, info) => {
  const dir = `test-results/plan/${info.project.name}-`;
  await openApp(page);
  for (const n of [JA, TR, DE]) await addBuiltinDeck(page, n);
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
