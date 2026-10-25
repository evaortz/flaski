// Minutos de verdad: si hoy tocan pocas preguntas, la tanda dice lo que tardarás en ellas (no los minutos del día),
// y Hoy propone «Te sobra tiempo: ¿aprendes 10 nuevas más?»
import { test, expect, openApp, nav } from './fixtures.js';

test('hoy tocan 14 preguntas y el día tiene 60 min: «Empezar la tanda · N min» con lo que tardas y «Te sobra tiempo»', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js');
    const d = await api.createDeck({ owner: S.uid, name: 'Repaso', description: '', source: 'manual', folder_id: null });
    S.decks.set(d.id, { tags: [], ...d });
    const rows = Array.from({ length: 40 }, (_, i) => ({ deck_id: d.id, owner: S.uid, front: `p${i}`, back: 'r', type_id: 'basic', template: 't1', fields: { q: `p${i}`, a: 'r' } }));
    for (const c of await api.createCards(rows)) S.cards.set(c.id, c);
    S.newPerDay = 14;
    S.prefs.plan.week = { mon: 60, tue: 60, wed: 60, thu: 60, fri: 60, sat: 60, sun: 60 };
  });
  const mins = await page.evaluate(() => import('/js/pantallas/estudio.js').then(m => { const f = m.tandaFit(m.todayQueue('all').ids.length); return [f.m, f.mins]; }));
  expect(mins[0]).toBe(14);
  expect(mins[1]).toBeLessThan(60);
  // Plan › Hoy toca
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await expect(page.locator('#main [data-act="tanda-short"]')).toHaveText(`Empezar la tanda · ${mins[1]} min`);
  // Hoy: el mismo botón y debajo, «Te sobra tiempo»
  await nav(page, 'Hoy');
  await expect(page.locator('.hero-go')).toContainText(`${mins[1]} min · 14 preguntas`);
  await expect(page.locator('.hero-spare')).toHaveText('Te sobra tiempo: ¿aprendes 10 nuevas más?');
  await page.locator('.hero-spare [data-act="more-today"]').click();
  await expect(page.locator('.hero-num')).toHaveText('24');
  await expect(page.locator('.hero-go')).toContainText('24 preguntas');
});
