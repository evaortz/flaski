// Base común de las pruebas de punta a punta.
// La app se prueba siempre en modo local (todo en el navegador, sin Supabase):
// se sustituye js/config.js por uno sin credenciales, así nunca se toca la base de datos real.
import { test as base, expect } from '@playwright/test';

const LOCAL_CONFIG = `export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
export const APP_NAME = 'Flaski';
`;

export const test = base.extend({
  // La presentación de bienvenida sale con la app vacía: en las pruebas se da por vista,
  // salvo en las que la prueban (test.use({ intro: true })).
  intro: [false, { option: true }],
  page: async ({ page, intro }, use) => {
    if (!intro) await page.addInitScript(() => { try { localStorage.setItem('flaski-intro-done', '1'); } catch {} });
    await page.route('**/js/config.js', route => route.fulfill({ contentType: 'text/javascript', body: LOCAL_CONFIG }));
    // Nada de red externa (trazos de kanji, etc.)
    await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await use(page);
    expect(errors, 'errores de JavaScript en la página').toEqual([]);
  },
});
export { expect };

// Abre la app y espera a que termine de cargar
export async function openApp(page) {
  await page.goto('/');
  await expect(page.locator('#main .spin')).toHaveCount(0);
}

// Cambia de sección con la barra de abajo (durante una sesión de estudio está oculta: se sale antes)
export async function nav(page, name) {
  const exit = page.locator('.studybar [data-act="exit"]');
  if (await exit.count()) await exit.click();
  await page.locator('#nav').getByRole('button', { name }).click();
}

// Responde la siguiente tarjeta de la sesión con una nota (1-4)
export async function answer(page, g = 3) {
  await page.locator('[data-act="reveal"]').click();
  await page.locator(`[data-grade="${g}"]`).click();
}

export async function createDeck(page, name) {
  await nav(page, 'Mis mazos');
  await page.locator('#main [data-act="new-deck"]').click();
  await page.locator('#d-name').fill(name);
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

// Desde la vista de un mazo: crea tarjetas básicas (pregunta → respuesta)
export async function addBasicCards(page, pairs) {
  await page.locator('#main [data-act="new-card"]').click();
  for (const [i, [q, a]] of pairs.entries()) {
    await page.locator('#fld-q').fill(q);
    await page.locator('#fld-a').fill(a);
    const last = i === pairs.length - 1;
    await page.locator(last ? '.ed-foot button[type="submit"]' : '[data-act="save-card-more"]').click();
    if (!last) await expect(page.locator('#fld-q')).toHaveValue('');
  }
  await expect(page.locator('#sheet')).toBeHidden();
}

// Añade un mazo de los incluidos en la app desde Explorar
export async function addBuiltinDeck(page, name) {
  await nav(page, 'Explorar');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await page.getByRole('button', { name: 'Añadir a mis mazos' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}
// Unos apuntes a partir de un texto: un apunte nuevo (el primer «# » es su título) y el resto pegado dentro
export async function pasteNotes(page, text) {
  const m = /^# (.+)\n+/.exec(text);
  await page.locator('#main [data-act="new-page"]').first().click();
  if (m) await page.locator('#pgTitle').fill(m[1]);
  await page.locator('#pgBlocks .nb').first().locator('.nb-text').click();
  await page.evaluate(t => {
    const dt = new DataTransfer(); dt.setData('text/plain', t);
    document.querySelector('[data-block-input]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, m ? text.slice(m[0].length) : text);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}
