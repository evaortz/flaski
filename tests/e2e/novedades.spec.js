// Las Novedades: el vídeo «Así es Flaski». Salen al entrar a quien no las ha visto; «Cerrar» las cierra y no vuelven.
// Perfil › Novedades las abre sin cambiar la marca
import { test, expect, openApp, nav } from './fixtures.js';

test('salen al entrar a quien no las ha visto; «Cerrar» las cierra y al recargar no vuelven', async ({ page }) => {
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('news-t')) { sessionStorage.setItem('news-t', '1'); localStorage.removeItem('flaski-news-seen'); } } catch {} });
  await openApp(page);
  await expect(page.locator('.ob.news')).toBeVisible();
  await expect(page.locator('.ob.news h1')).toHaveText('Así es Flaski');
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.locator('.ob.news')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
  await page.waitForTimeout(800);
  await expect(page.locator('.ob.news')).toHaveCount(0);
});

test('Perfil › Novedades las abre y no cambia la marca', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Perfil');
  await page.locator('.pr-row[data-act="news"]').click();
  await expect(page.locator('.ob.news')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ob.news')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('flaski-news-seen'))).toBe('never');
});
