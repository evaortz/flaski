// Actualizar sin quedarse a medias: si un archivo de la app no carga o es de otra versión (una copia vieja
// guardada), la app borra lo guardado y se recarga una vez. Aquí no vale el «sin errores» de fixtures.js:
// el primer intento falla a propósito.
import { test, expect } from '@playwright/test';

const LOCAL_CONFIG = `export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
export const APP_NAME = 'Flaski';
`;
async function setup(page, file, broken) {
  await page.addInitScript(() => { try { localStorage.setItem('flaski-intro-done', '1'); localStorage.setItem('flaski-news-seen', 'never'); } catch {} });
  await page.route('**/js/config.js', route => route.fulfill({ contentType: 'text/javascript', body: LOCAL_CONFIG }));
  await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
  let first = true;
  await page.route(`**/js/${file}`, route => {
    if (!first) return route.continue();
    first = false;
    return route.fulfill(broken);
  });
  let loads = 0;
  page.on('load', () => loads++);
  return () => loads;
}

test('un módulo de otra versión (le falta lo que otro importa): se recarga una vez y arranca', async ({ page }) => {
  const loads = await setup(page, 'pantallas/amigos.js', { contentType: 'text/javascript', body: 'export const viejo = 1;' });
  await page.goto('/');
  await expect(page.locator('#nav')).toBeVisible();
  await expect(page.locator('#main')).toContainText('Todavía no tienes listas');
  expect(loads()).toBe(2);
});

test('un archivo que ya no existe en el servidor: se recarga una vez y arranca', async ({ page }) => {
  const loads = await setup(page, 'pantallas/biblioteca.js', { status: 404, body: 'not found' });
  await page.goto('/');
  await expect(page.locator('#main')).toContainText('Todavía no tienes listas');
  expect(loads()).toBe(2);
});

test('si sigue fallando no se queda recargando sin parar', async ({ page }) => {
  await setup(page, 'pantallas/biblioteca.js', { status: 404, body: 'not found' });
  await page.unroute('**/js/pantallas/biblioteca.js');
  await page.route('**/js/pantallas/biblioteca.js', route => route.fulfill({ status: 404, body: 'not found' }));
  let loads = 0;
  page.on('load', () => loads++);
  await page.goto('/');
  await page.waitForTimeout(2500);
  expect(loads).toBeLessThanOrEqual(2);
});
