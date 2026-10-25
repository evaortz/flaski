// Logo: favicon, icono de Apple e iconos del manifest; la marca (F de puntos) solo en la pantalla de entrar
import { test, expect, openApp } from './fixtures.js';
import { mockCloud, openCloud } from './nube.js';

test('favicon, apple-touch-icon y manifest con los iconos nuevos, y todos cargan', async ({ page, request }) => {
  await openApp(page);
  const links = await page.evaluate(() => [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')].map(l => l.getAttribute('href')));
  expect(links).toEqual(['icons/favicon.svg', 'icons/favicon-32.png', 'icons/flaski-icono-180.png']);
  const man = await (await request.get('/manifest.webmanifest')).json();
  expect(man.icons.map(i => [i.src, i.sizes, i.purpose])).toEqual([
    ['icons/flaski-icono-192.png', '192x192', 'any'], ['icons/flaski-icono-512.png', '512x512', 'any'],
    ['icons/flaski-icono-maskable-192.png', '192x192', 'maskable'], ['icons/flaski-icono-maskable-512.png', '512x512', 'maskable'],
    ['icons/flaski-icono.svg', 'any', 'any']]);
  for (const src of [...links, ...man.icons.map(i => i.src)]) expect((await request.get('/' + src)).status(), src).toBe(200);
});

test('la marca no sale dentro de la app: ni en la cabecera del móvil ni en la barra lateral, y el contenido sube', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.nav-brand')).toHaveCount(0);
  await expect(page.locator('.top .brand')).toBeHidden();
  await expect(page.locator('.top')).toBeHidden();
  // Entre lo de arriba (el aviso del modo local) y el contenido no queda hueco de cabecera
  const gap = await page.evaluate(() => { const b = document.querySelector('#banner'), above = b && !b.hidden ? b.getBoundingClientRect().bottom : document.querySelector('.app').getBoundingClientRect().top; return document.querySelector('#main').getBoundingClientRect().top - above; });
  expect(gap).toBeLessThan(24);
});

test('en la pantalla de entrar sí sale la marca, con el color de acento', async ({ page }) => {
  await mockCloud(page);
  await openCloud(page);
  await page.locator('#nav .nav-inner [data-nav="profile"]').click();
  await page.locator('[data-act="signout"]').click();
  const mark = page.locator('.top .brand .mark');
  await expect(mark).toBeVisible();
  await expect(mark.locator('circle')).toHaveCount(12);
  const [color, accent] = await mark.evaluate(el => [getComputedStyle(el).color, getComputedStyle(document.body).getPropertyValue('--accent').trim()]);
  const probe = await page.evaluate(a => { const d = document.createElement('div'); d.style.color = a; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }, accent);
  expect(color).toBe(probe);
});
