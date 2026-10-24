// «Tu actividad» en Hoy: 6 meses, colores del diseño (día sin estudio en blanco con borde, hoy con anillo) y la meta
import { test, expect, openApp, nav, addBuiltinDeck, answer } from './fixtures.js';

test('tu actividad: los últimos 6 meses con los colores del diseño y la meta diaria', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Japonés · Demo de Flaski');
  await page.locator('#main [data-start]').click();
  for (let i = 0; i < 3; i++) await answer(page, 3);
  await page.locator('.studybar [data-act="exit"]').click();
  await nav(page, 'Hoy');
  const act = page.locator('section[aria-labelledby="h-act"]');
  await expect(act.locator('.hoy-note')).toHaveText('últimos 6 meses');
  await expect(act.locator('.hoy-week')).toHaveText('esta semana: 1 día · 3 preguntas');
  await expect(act.locator('.hoy-streak')).toContainText('Racha de 1 día');
  await expect(act.locator('.hoy-streak .st-freeze')).toContainText('Comodín de la semana disponible');
  await expect(act.locator('.hoy-hm-foot')).toContainText('Sin meta diaria · poner una');
  expect(await page.locator('#hmHost rect.hm:not(.is-out)').count()).toBeLessThanOrEqual(26 * 7);
  // Hoy: estudiado (relleno sin borde de la escala) y con el anillo cobalto
  const today = page.locator('#hmHost rect.hm-today');
  const st = el => { const c = getComputedStyle(el); return { fill: c.fill, stroke: c.stroke, w: c.strokeWidth }; };
  expect(await today.evaluate(st)).toEqual({ fill: 'rgb(85, 96, 194)', stroke: 'rgb(47, 61, 181)', w: '1.5px' });
  // Un día sin estudio: blanco con borde
  expect(await page.locator('#hmHost rect.hm.l0:not(.is-out)').first().evaluate(st)).toEqual({ fill: 'rgb(255, 255, 255)', stroke: 'rgb(213, 215, 238)', w: '1px' });
  // Sin meta: se ofrece ponerla; con meta, el día que se llega lleva un punto
  await expect(act.locator('.hoy-hm-foot')).toContainText('Sin meta diaria');
  await expect(page.locator('#hmHost .hm-dot')).toHaveCount(0);
  await act.locator('[data-act="goal-change"]').click();
  const goal = page.locator('input[data-pref="home.goal"]');
  await goal.fill('3');
  await goal.blur();
  await nav(page, 'Hoy');
  await expect(act.locator('.hoy-hm-foot')).toContainText('Meta: 3 al día · cambiar');
  await expect(page.locator('#hmHost .hm-dot')).toHaveCount(1);
  await expect(page.locator('#hmHost rect.hm-today')).toHaveClass(/hm-goal/);
});
