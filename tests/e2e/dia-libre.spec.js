// Día libre en tu semana: el plan cuenta con las nuevas de un día normal (Hoy y el Plan dicen lo mismo) y Hoy no
// ofrece «Empezar una tanda» como botón principal
import { test, expect, openApp, nav } from './fixtures.js';

test('domingo libre con examen: Hoy y el Plan dicen lo mismo y Hoy dice «Hoy es tu día libre»', async ({ page, seed }) => {
  await seed({ decks: [{ name: 'Temario', cards: Array.from({ length: 80 }, (_, i) => [`p${i}`, `r${i}`]) }] });
  await openApp(page);
  // Hoy libre, los demás días 30 min; examen dentro de 60 días
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js'); const { WEEK, weekdayOf, dayKey, addDays } = await import('/js/plan.js');
    const today = WEEK[weekdayOf(dayKey())];
    S.prefs.plan.week = Object.fromEntries(WEEK.map(d => [d, d === today ? 0 : 30]));
    S.prefs.plan.nodes = { [[...S.decks.keys()][0]]: { exam: addDays(dayKey(), 60) } };
    await api.saveSettings(S.uid, S.newPerDay, S.prefs);
  });
  await page.reload();
  await expect(page.locator('#main .hero h1')).toHaveText('Hoy es tu día libre');
  await expect(page.locator('#main .hero-go')).toHaveCount(0);
  // Sin nada que toque hoy, se ofrecen nuevas como opción (y entonces la tanda)
  await page.locator('#main .day-rest').click();
  await expect(page.locator('#main .hero h1')).toHaveText('Hoy es tu día libre');
  await expect(page.locator('#main .day-rest')).toContainText('Estudiar igualmente');
  await expect(page.locator('#main .hoy-exam')).not.toContainText('así no te da tiempo');
  // El plan de un día normal no es 0
  expect(await page.evaluate(() => import('/js/comun.js').then(({ newPlan }) => [...newPlan('all', { steady: true }).values()].reduce((a, b) => a + b, 0)))).toBeGreaterThan(0);
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await expect(page.locator('#plSum')).toContainText('Vas bien');
  await expect(page.locator('#main')).not.toContainText('sin nuevas pendientes');
  // La tanda sigue a mano
  await nav(page, 'Hoy');
  await page.locator('#main .day-rest').click();
  const go = page.locator('#sheetBody [data-act="tanda-go"]');
  if (await go.isVisible().catch(() => false)) await go.click();
  await expect(page.locator('.studybar')).toBeVisible();
});
