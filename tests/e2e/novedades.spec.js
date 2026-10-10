// Las novedades: salen al entrar (mientras se revisan, siempre) y también desde Perfil
import { test, expect, openApp, nav } from './fixtures.js';

test.describe('al entrar', () => {
  test.use({ intro: true });
  test('salen al abrir la app y se recorren con las flechas', async ({ page }, info) => {
    await page.addInitScript(() => { try { localStorage.setItem('flaski-intro-done', '1'); } catch {} });
    await openApp(page);
    const news = page.locator('.ob.news');
    await expect(news).toBeVisible();
    await expect(news.locator('h1')).toHaveText('Novedades en Flaski');
    if (process.env.OUT) await page.screenshot({ path: `${process.env.OUT}/n-${info.project.name}-1.png` });
    await news.locator('.news-jump').nth(3).click();
    await expect(news.locator('h2')).toHaveText('Tarjetas sugeridas, sin IA');
    await expect(news.locator('.ob-phone img')).toHaveAttribute('src', /img\/novedades\/sugerencias-(light|dark)\.jpg/);
    if (process.env.OUT) { await page.waitForTimeout(400); await page.screenshot({ path: `${process.env.OUT}/n-${info.project.name}-2.png` }); }
    await page.keyboard.press('ArrowRight');
    await expect(news.locator('h2')).toHaveText('Ocho tipos de tarjeta nuevos');
    await page.keyboard.press('Escape');
    await expect(news).toHaveCount(0);
    // Ya vistas: no vuelven a salir al entrar
    await page.reload();
    await expect(page.locator('#main .spin')).toHaveCount(0);
    await page.waitForTimeout(300);
    await expect(news).toHaveCount(0);
  });
});

test('desde Ajustes → Ver las últimas novedades', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Perfil');
  await page.locator('[data-nav="settings"]').click();
  await page.locator('.set-news').click();
  await expect(page.locator('.ob.news h1')).toHaveText('Novedades en Flaski');
});

test('desde Perfil → Novedades', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.ob.news')).toHaveCount(0);   // en las pruebas no salen solas
  await nav(page, 'Perfil');
  await page.locator('[data-act="news"]').click();
  const news = page.locator('.ob.news');
  await expect(news).toBeVisible();
  await news.locator('[data-ob-to="1"]').last().click();
  for (let k = 0; k < 7; k++) await news.locator('.ob-nav .primary').click();
  await news.locator('[data-news-close]').last().click();
  await expect(news).toHaveCount(0);
});
