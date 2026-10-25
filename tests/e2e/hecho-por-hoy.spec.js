// «Hecho por hoy»: el día se cumple con tus minutos, no con dejar la cola a cero. Lo que queda pasa a mañana
// y se ofrece como enlace secundario, nunca como el botón principal
import { test, expect, openApp, nav, answer } from './fixtures.js';

const DAY = 864e5;

test('15 min hoy y más repasos de los que caben: tras la tanda del Plan, Hoy y el Plan dicen «Hecho por hoy» y lo que sobra sale mañana', async ({ page }) => {
  await openApp(page);
  // 60 repasos que tocan hoy y una semana de 15 min: la tanda de hoy es de 45 (20 s por pregunta)
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js');
    const d = await api.createDeck({ owner: S.uid, name: 'Repaso', description: '', source: 'manual', folder_id: null });
    const rows = Array.from({ length: 60 }, (_, i) => ({ deck_id: d.id, owner: S.uid, front: `p${i}`, back: 'r', type_id: 'basic', template: 't1', fields: { q: `p${i}`, a: 'r' }, position: i }));
    const now = Date.now(), day = 864e5;
    for (const c of await api.createCards(rows)) await api.saveProgress(S.uid, c.id, { reps: 3, interval: 10, ease: 2.5, lapses: 0, due: now - 1000, firstSeen: now - 30 * day, last: now - 11 * day, stability: 10, difficulty: 5 });
    S.prefs.plan.week = { mon: 15, tue: 15, wed: 15, thu: 15, fri: 15, sat: 15, sun: 15 };
    await api.saveSettings(S.uid, S.newPerDay, S.prefs);
  });
  await page.reload();
  await expect(page.locator('.hero-num')).toHaveText('60');
  // La tanda, desde el Plan
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await page.locator('#main [data-act="tanda-short"]').click();
  for (let i = 0; i < 45; i++) await answer(page, 3);
  // Hoy: «Hecho por hoy», sin «Empezar» y con lo que queda como enlace
  await nav(page, 'Hoy');
  await expect(page.locator('#main .hero h1')).toHaveText('Hecho por hoy');
  await expect(page.locator('#main .day-done')).toContainText('45 preguntas');
  await expect(page.locator('#main .hero-go')).toHaveCount(0);
  await expect(page.locator('#main button', { hasText: 'Empezar' })).toHaveCount(0);
  await expect(page.locator('#main .day-rest')).toHaveText(/^Quedan 15 repasos · otra tanda de \d+ min$/);
  // El Plan: lo mismo, y nada de «Hoy N nuevas»
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await expect(page.locator('#main .day-done')).toContainText('Hecho por hoy');
  await expect(page.locator('#main [data-act="tanda-short"]')).toHaveCount(0);
  await expect(page.locator('#main .ht-why')).toHaveCount(0);
  await expect(page.locator('#main .day-rest')).toHaveText(/^Quedan 15 repasos/);
  // Mañana salen las 15 que sobraron (y el día vuelve a empezar)
  const left = await page.evaluate(() => import('/js/pantallas/estudio.js').then(m => m.todayQueue('all').ids));
  expect(left).toHaveLength(15);
  await page.clock.install({ time: new Date(Date.now() + DAY) });
  await page.reload();
  await expect(page.locator('#main .hero-go')).toBeVisible();
  const tomorrow = await page.evaluate(() => import('/js/pantallas/estudio.js').then(m => m.todayQueue('all').ids));
  expect(tomorrow).toEqual(expect.arrayContaining(left));
});
