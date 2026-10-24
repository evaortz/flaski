// Logo: favicon, icono de Apple, iconos del manifest y la marca (F de puntos) en el color de acento
import { test, expect, openApp } from './fixtures.js';

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

test('la marca va en la cabecera (móvil) o en la barra lateral (ordenador), con el color de acento', async ({ page }, info) => {
  await openApp(page);
  const mark = page.locator(info.project.name === 'movil' ? '.top .brand .mark' : '.nav-brand .mark');
  await expect(mark).toBeVisible();
  await expect(mark.locator('circle')).toHaveCount(12);
  const [color, accent] = await mark.evaluate(el => [getComputedStyle(el).color, getComputedStyle(document.body).getPropertyValue('--accent').trim()]);
  const probe = await page.evaluate(a => { const d = document.createElement('div'); d.style.color = a; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; }, accent);
  expect(color).toBe(probe);
});
