// Las novedades: la hoja con el vídeo «Lo nuevo» y lo mismo en texto; salen al entrar y también desde Perfil
import { test, expect, openApp, nav } from './fixtures.js';

const VIDEO = 'media/flaski-lo-nuevo-720x1280.mp4';

test.describe('al entrar', () => {
  test.use({ intro: true });
  test('salen al abrir la app con el vídeo arriba, la lista debajo y «Cerrar»', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('flaski-intro-done', '1'); } catch {} });
    await openApp(page);
    const news = page.locator('.ob.news');
    await expect(news).toBeVisible();
    await expect(news.locator('h1')).toHaveText('Lo nuevo en Flaski');
    const video = news.locator('.news-video video');
    await expect(video).toHaveAttribute('src', VIDEO);
    await expect(video).toHaveAttribute('poster', 'media/portada.jpg');
    expect(await video.evaluate(v => [v.muted, v.loop, v.autoplay, v.playsInline])).toEqual([true, true, true, true]);
    // Como mucho 360 px de ancho, con bordes redondeados de 24 px
    const box = await news.locator('.news-video').boundingBox();
    expect(box.width).toBeLessThanOrEqual(360);
    expect(await news.locator('.news-video').evaluate(el => getComputedStyle(el).borderTopLeftRadius)).toBe('24px');
    await expect(news.locator('.news-items li b')).toHaveText(['El mapa de lo que sabes', 'Repasar dentro del apunte', 'Preguntas para entender', 'Simulacro de examen', 'Un plan hasta el examen', 'Colores y pegatinas', 'Explorar']);
    await expect(news.locator('.news-play')).toHaveCount(0);
    await news.locator('.news-btns [data-news-close]').click();
    await expect(news).toHaveCount(0);
    // Ya vistas: no vuelven a salir al entrar
    await page.reload();
    await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
    await page.waitForTimeout(300);
    await expect(news).toHaveCount(0);
  });

  test('con «reducir movimiento» no se reproduce solo: portada y «Ver el vídeo»', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => { try { localStorage.setItem('flaski-intro-done', '1'); } catch {} });
    await openApp(page);
    const video = page.locator('.ob.news .news-video video');
    expect(await video.evaluate(v => v.autoplay)).toBe(false);
    await expect(video).toHaveAttribute('poster', 'media/portada.jpg');
    await page.locator('.news-play').click();
    await expect(page.locator('.news-play')).toHaveCount(0);
    expect(await video.evaluate(v => v.controls)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ob.news')).toHaveCount(0);
  });
});

test('desde Perfil → Novedades; «Probar el simulacro» abre el Plan', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.ob.news')).toHaveCount(0);   // en las pruebas no salen solas
  await nav(page, 'Perfil');
  await page.locator('.pr-row[data-act="news"]').click();
  const news = page.locator('.ob.news');
  await expect(news).toBeVisible();
  await news.locator('[data-news-try]').click();
  await expect(news).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Plan de estudio' })).toBeVisible();
});

test.describe('sin conexión', () => {
  test.use({ serviceWorkers: 'allow' });
  test('el service worker guarda el vídeo y lo da por trozos, también sin conexión', async ({ page, context }) => {
    await openApp(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(async () => (await caches.open('flaski-media-v1')).keys().then(k => k.length)), { timeout: 30_000 }).toBe(2);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    const part = await page.evaluate(async src => {
      const r = await fetch(src, { headers: { Range: 'bytes=100-199' } });
      return [r.status, r.headers.get('content-range'), (await r.arrayBuffer()).byteLength];
    }, VIDEO);
    expect(part[0]).toBe(206);
    expect(part[1]).toMatch(/^bytes 100-199\/\d+$/);
    expect(part[2]).toBe(100);
    expect(await page.evaluate(async () => (await fetch('media/portada.jpg')).status)).toBe(200);
    await context.setOffline(false);
  });
});
