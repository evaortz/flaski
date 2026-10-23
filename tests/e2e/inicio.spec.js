// Gráficos de Inicio: el calendario con periodos (en el color del tema) («Tu progreso» está en progreso.spec.js)
import { test, expect, openApp, nav, addBuiltinDeck, answer } from './fixtures.js';

test('calendario de actividad: cambiar de periodo recoloca los cuadrados y se recuerda', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Japonés · Demo de Flaski');
  await page.locator('#main [data-start]').click();
  for (let i = 0; i < 3; i++) await answer(page, 3);
  await page.locator('.studybar [data-act="exit"]').click();
  await nav(page, 'Hoy');
  const visible = () => page.locator('#hmHost rect.hm:not(.is-out)').count();
  expect(await visible()).toBeGreaterThan(300);              // el año
  await expect(page.locator('#hmSum')).toContainText('en el último año');
  const before = await page.locator('#hmHost rect.hm-today').evaluate(r => r.getBBox().width);
  await page.locator('[data-seg="home.activityPeriod"] [data-v="m1"]').click();
  await expect(page.locator('#hmSum')).toContainText('3 repasos en el último mes');
  expect(await visible()).toBeLessThanOrEqual(35);
  await expect.poll(() => page.locator('#hmHost rect.hm-today').evaluate(r => r.getBBox().width)).toBeGreaterThan(before * 2);
  // El color es el del tema
  const fill = await page.locator('#hmHost .hm-key.l4').evaluate(r => getComputedStyle(r).backgroundColor);
  const accent = await page.evaluate(() => { const d = document.createElement('div'); d.style.color = 'var(--accent)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
  expect(fill).toBe(accent);
  // Se recuerda
  await nav(page, 'Biblioteca'); await nav(page, 'Hoy');
  await expect(page.locator('[data-seg="home.activityPeriod"] [data-v="m1"]')).toHaveAttribute('aria-pressed', 'true');
});
