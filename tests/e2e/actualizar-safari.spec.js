// En Safari, un módulo de otra versión da otro error («Importing binding name 'x' is not found»): también se
// borra lo guardado y se recarga una vez (ver el script de index.html)
import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['iPhone 13'], browserName: 'webkit' });

test('Safari: un módulo de otra versión (le falta lo que otro importa): se recarga una vez y arranca', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'movil', 'una vez');
  const old = (await (await request.get('/js/comun.js')).text()).replace('export function toastAction', 'function toastAction');
  await page.addInitScript(() => { try { localStorage.setItem('flaski-intro-done', '1'); localStorage.setItem('flaski-news-seen', 'never'); } catch {} });
  await page.route('**/js/config.js*', route => route.fulfill({ contentType: 'text/javascript', body: "export const SUPABASE_URL = '';\nexport const SUPABASE_ANON_KEY = '';\nexport const APP_NAME = 'Flaski';\n" }));
  await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
  let first = true;
  await page.route('**/js/comun.js*', route => {
    if (!first) return route.continue();
    first = false;
    return route.fulfill({ contentType: 'text/javascript', headers: { 'cache-control': 'no-store' }, body: old });
  });
  let loads = 0;
  page.on('load', () => loads++);
  await page.goto('/');
  await expect(page.locator('#main')).toContainText('Todavía no tienes listas', { timeout: 15000 });
  expect(loads).toBe(2);
});
