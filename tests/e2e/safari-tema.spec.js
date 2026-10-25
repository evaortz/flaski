// Safari (WebKit, iPhone): Explorar › «Añadir y leer» del tema destacado, con cuenta y sin cuenta.
// Un fallo con la imagen de la pregunta de tapar no puede tumbar el tema, y si algo falla a medias, al volver a
// pulsar se completa lo que falta
import { test, expect, nav, openApp } from './fixtures.js';
import { devices } from '@playwright/test';
import { mockCloud, openCloud, sent } from './nube.js';

test.use({ ...devices['iPhone 13'], browserName: 'webkit' });

const start = async page => {
  await nav(page, 'Explorar');
  await page.locator('.ex-hero [data-ex="read-tema"]').click();
};

test('Safari con cuenta: «Añadir y leer» crea el tema entero y abre la tanda', async ({ page }) => {
  const srv = await mockCloud(page);
  await openCloud(page);
  await start(page);
  await expect(page.locator('#pgTitle')).toHaveValue(/Por qué se te olvidan/);
  await expect.poll(() => sent(srv, 'cards').flatMap(w => [].concat(w[2])).length).toBe(17);
});

test('Safari sin cuenta: «Añadir y leer» crea el tema entero y abre la tanda', async ({ page }) => {
  await openApp(page);
  await start(page);
  await expect(page.locator('#pgTitle')).toHaveValue(/Por qué se te olvidan/);
  expect(await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.cards.size))).toBe(17);
});

test('Safari: si el navegador no deja guardar la imagen, el tema se crea entero igual', async ({ page }) => {
  await page.addInitScript(() => { IDBObjectStore.prototype.put = function () { throw new DOMException('no', 'UnknownError'); }; });
  await openApp(page);
  await start(page);
  await expect(page.locator('#pgTitle')).toHaveValue(/Por qué se te olvidan/);
  expect(await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.cards.size))).toBe(17);
});

test('Safari con cuenta: si falla a medias, al volver a pulsar se completa lo que falta (sin otra lista ni otro apunte)', async ({ page }) => {
  const srv = await mockCloud(page);
  srv.failWrite = { path: 'cards', status: 500, body: { code: 'XX000', message: 'fallo de prueba' } };
  await openCloud(page);
  await start(page);
  await expect(page.locator('#toast')).toContainText('fallo de prueba');
  // El apunte y la lista vacía ya están; el tema sigue ofreciendo «Añadir y leer»
  await nav(page, 'Explorar');
  await expect(page.locator('.ex-hero [data-ex="read-tema"]')).toBeVisible();
  srv.failWrite = null;
  await page.locator('.ex-hero [data-ex="read-tema"]').click();
  await expect(page.locator('#pgTitle')).toHaveValue(/Por qué se te olvidan/);
  await expect.poll(() => sent(srv, 'cards').filter(w => w[0] === 'POST').flatMap(w => [].concat(w[2])).length).toBe(17);
  expect(sent(srv, 'decks').filter(w => w[0] === 'POST')).toHaveLength(1);
  expect(sent(srv, 'pages').filter(w => w[0] === 'POST' && !w[2]?.deck_id)).toHaveLength(1);
});

test('Safari con cuenta: la lista vacía de un intento anterior (ya en la cuenta) se completa al volver a pulsar', async ({ page }) => {
  const srv = await mockCloud(page);
  srv.tables.decks.push({ id: 'd0000000-0000-4000-8000-0000000000aa', owner: '11111111-1111-4111-8111-111111111111', name: 'Por qué se te olvidan las cosas', description: '', source: 'tema:por-que-se-te-olvidan-las-cosas', created_at: '2026-10-25T10:42:00Z', tags: [], is_public: false });
  await openCloud(page);
  await start(page);
  await expect(page.locator('#pgTitle')).toHaveValue(/Por qué se te olvidan/);
  expect(sent(srv, 'decks').filter(w => w[0] === 'POST')).toHaveLength(0);   // reutiliza la que había
  await expect.poll(() => sent(srv, 'cards').filter(w => w[0] === 'POST').flatMap(w => [].concat(w[2])).map(c => c.deck_id)).toEqual(Array(17).fill('d0000000-0000-4000-8000-0000000000aa'));
});
