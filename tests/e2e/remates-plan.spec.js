// Remates del plan, Explorar y el simulacro: «La tienes» por origen (y, de respaldo, por nombre), huecos en la
// vista previa, mínimo de 6 s por pregunta en las estimaciones
import { test, expect, openApp, nav } from './fixtures.js';

const opos = async page => { await nav(page, 'Explorar'); await page.locator('.ex-chip', { hasText: 'Oposiciones' }).click(); };

test('Explorar: un tema de ejemplo añadido lleva su origen y sale «La tienes»', async ({ page }) => {
  await openApp(page);
  await opos(page);
  await page.locator('[data-ex="add-tema"]').first().click();
  await expect(page.locator('.ex-row [data-ex="open-tema"]')).toHaveText('La tienes');
  expect(await page.evaluate(() => import('/js/comun.js').then(({ S }) => [...S.decks.values()][0].source))).toBe('tema:constitucion-titulo-preliminar');
  // Aunque cambies el nombre del apunte y de la lista, se reconoce por el origen
  await page.evaluate(() => import('/js/comun.js').then(({ S }) => { for (const p of S.pages.values()) p.title = 'Mi tema 1'; for (const d of S.decks.values()) d.name = 'Mi tema 1'; }));
  await nav(page, 'Hoy');
  await opos(page);
  await expect(page.locator('.ex-row [data-ex="open-tema"]')).toHaveText('La tienes');
});

test('Explorar: las listas de antes (sin origen) se reconocen por el nombre sin acentos ni palabras de en medio', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js');
    const d = await api.createDeck({ owner: S.uid, name: 'La Constitucion · Titulo Preliminar', description: '', source: 'apuntes', folder_id: null });
    S.decks.set(d.id, { tags: [], ...d });
  });
  await opos(page);
  await expect(page.locator('.ex-row [data-ex="open-tema"]')).toHaveText('La tienes');
  await page.locator('.ex-row [data-ex="open-tema"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'La Constitucion · Titulo Preliminar' })).toBeVisible();
});

test('Explorar: la vista previa pinta los huecos como en la tanda y la respuesta aparte', async ({ page }) => {
  await openApp(page);
  await opos(page);
  await page.locator('.ex-row [data-ex="see-tema"]').first().click();
  await expect(page.locator('#sheetBody .preview li')).toHaveCount(5);
  await expect(page.locator('#sheetBody')).not.toContainText('{{');
  const row = page.locator('#sheetBody .preview li', { hasText: 'ratificada en referéndum' });
  await expect(row.locator('span')).toContainText('[…]');
  await expect(row.locator('b')).toContainText('1978');
});

test('estimaciones con un mínimo de 6 s por pregunta: Hoy y «salen unas X al día» del Plan', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Explorar');
  await page.locator('[data-ex="add-builtin"][data-file="aleman-a2.json"]').click();
  await expect(page.locator('#main [data-builtin="aleman-a2.json"] .go')).toHaveText('La tienes');
  // 40 respuestas de 2 s
  await page.evaluate(() => import('/js/comun.js').then(({ S }) => { const now = Date.now(); S.events = Array.from({ length: 40 }, (_, i) => ({ ms: 2000, t: now - i * 1000, grade: 3 })); }));
  expect(await page.evaluate(() => import('/js/pantallas/estudio.js').then(m => m.shortInfo().secs))).toBe(6);
  await nav(page, 'Hoy');
  const t = await page.locator('#main .hero-go small').textContent();
  const [, min, n] = /(\d+) min · (\d+) pregunta/.exec(t).map(Number);
  expect(min).toBeGreaterThanOrEqual(Math.ceil((n * 6) / 60));
  await nav(page, 'Perfil');
  await page.locator('#main [data-nav="plan"]').click();
  await expect(page.locator('#plSum')).toContainText('Con tus tandas de 10 min salen unas 100 preguntas al día');
});
