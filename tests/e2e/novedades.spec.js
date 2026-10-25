// Las novedades: ahora no hay ninguna (las de octubre se quitaron), así que no salen al entrar ni hay fila en Perfil
import { test, expect, openApp, nav } from './fixtures.js';

test.describe('al entrar', () => {
  test.use({ intro: true });
  test('sin novedades, no sale nada al abrir la app aunque no se hayan visto', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('flaski-intro-done', '1'); localStorage.removeItem('flaski-news-seen'); } catch {} });
    await openApp(page);
    await page.waitForTimeout(400);
    await expect(page.locator('.ob.news')).toHaveCount(0);
  });
});

test('sin novedades, Perfil no tiene la fila «Novedades»', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Perfil');
  await expect(page.locator('.pr-row[data-act="news"]')).toHaveCount(0);
});
