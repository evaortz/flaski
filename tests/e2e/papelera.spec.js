// Papelera (lo borrado se queda 30 días, «Deshacer», recuperar, borrar ya, vaciar y la limpieza al abrir)
// y borrar la cuenta (tres pasos; si falla, se dice y la sesión sigue)
import { test, expect, openApp, nav, createDeck, addBasicCards, answer, startTanda, deckMenu, edExtra } from './fixtures.js';
import { mockCloud, openCloud, sent } from './nube.js';

const deckRow = (page, name) => page.locator('#main .ltile, #main .lfold, #main [data-deck]', { hasText: name });
const S = page => page.evaluate(() => import('/js/comun.js').then(({ S }) => ({ decks: [...S.decks.values()].map(d => d.name), cards: S.cards.size, progress: S.progress.size, trash: [...S.trash.keys()], folders: [...S.folders.values()].map(f => f.name), pages: [...S.pages.values()].map(p => p.title) })));
const db = page => page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /^flaski-(local|pruebas)-v1$/.test(k)) || 'flaski-local-v1')));
async function listWithProgress(page) {
  await openApp(page);
  await createDeck(page, 'Turco');
  await addBasicCards(page, [['ev', 'casa'], ['su', 'agua'], ['el', 'mano']]);
  await nav(page, 'Hoy');
  await startTanda(page);
  await answer(page, 3);
  await page.locator('.studybar [data-act="exit"]').click();
}
async function deleteDeck(page, name) {
  await nav(page, 'Biblioteca');
  await page.locator('#main').getByText(name, { exact: true }).first().click();
  await deckMenu(page, '[data-act="ask-delete-deck"]');
}

test('borrar una lista: hoja de la papelera, «Deshacer» la deja como estaba', async ({ page }) => {
  await listWithProgress(page);
  const before = await S(page);
  await deleteDeck(page, 'Turco');
  await expect(page.locator('#sheetBody')).toContainText('Va a la papelera con sus 3 preguntas y tu progreso. Durante 30 días puedes recuperarla tal cual; después se borra del todo.');
  await page.locator('#sheetBody [data-act="delete-deck"]').click();
  await expect(page.locator('#toast')).toContainText('Lista en la papelera');
  expect((await S(page)).decks).toEqual([]);
  expect((await S(page)).cards).toBe(0);
  await page.locator('#toast .ta-btn').click();
  await expect(page.locator('#toast')).toContainText('Lista recuperada');
  const after = await S(page);
  expect(after.decks).toEqual(before.decks);
  expect(after.cards).toBe(before.cards);
  expect(after.progress).toBe(before.progress);
  expect((await db(page)).decks[0].deleted_at).toBeNull();
});

test('la papelera: desde Biblioteca, la fila con lo que queda, recuperar (con «(recuperada)» si el nombre ya está) y sigue tras recargar', async ({ page }) => {
  await listWithProgress(page);
  await deleteDeck(page, 'Turco');
  await page.locator('#sheetBody [data-act="delete-deck"]').click();
  // Sigue en la papelera al recargar
  await page.reload();
  await expect(page.locator('#main .hero, #main .hoy-done, #main h1').first()).toBeVisible();
  await nav(page, 'Biblioteca');
  await expect(page.locator('.lib-trash')).toHaveText(/Papelera · 1/);
  // A 375 px la píldora cabe (nada se sale de lado)
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.locator('.lib-trash').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Papelera' })).toBeVisible();
  const row = page.locator('.tr-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Turco');
  await expect(row).toContainText('lista · 3 preguntas');
  await expect(row.locator('.tr-left')).toHaveText('30 días');
  await expect(page.locator('.tr-note')).toContainText('Las preguntas sueltas que borras van con su lista');
  // Otra lista con el mismo nombre: la recuperada lleva «(recuperada)»
  await page.evaluate(async () => { const api = await import('/js/api.js'); const { S } = await import('/js/comun.js'); const d = await api.createDeck({ owner: S.uid, name: 'Turco', folder_id: null }); S.decks.set(d.id, { tags: [], ...d }); });
  await row.locator('[data-tr="restore"]').click();
  await expect(page.locator('#toast')).toContainText('«Turco (recuperada)» recuperada en Biblioteca');
  await expect(page.locator('.tr-none')).toContainText('La papelera está vacía. Lo que borres se queda aquí 30 días.');
  const s = await S(page);
  expect(s.decks.sort()).toEqual(['Turco', 'Turco (recuperada)']);
  expect(s.progress).toBeGreaterThan(0);
  // «Ver» lleva a la lista
});

test('una carpeta va entera a la papelera y vuelve con lo que tenía, eligiendo dónde', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js');
    const f = await api.createFolder({ owner: S.uid, name: 'Tema 3', parent_id: null }); S.folders.set(f.id, f);
    const d = await api.createDeck({ owner: S.uid, name: 'Las Cortes', folder_id: f.id }); S.decks.set(d.id, { tags: [], ...d });
    for (const c of await api.createCards([{ deck_id: d.id, owner: S.uid, front: 'a', back: 'b', fields: { q: 'a', a: 'b' } }])) S.cards.set(c.id, c);
  });
  await nav(page, 'Biblioteca');
  await page.locator('#main').getByText('Tema 3', { exact: true }).first().click();
  await page.locator('#main [data-act="edit-folder"]').click();
  await page.locator('#sheetBody [data-act="ask-delete-folder"]').click();
  await expect(page.locator('#sheetBody')).toContainText('Va a la papelera entera, con todo lo que tiene dentro');
  await page.locator('#sheetBody [data-act="delete-folder"]').click();
  expect(await S(page)).toMatchObject({ folders: [], decks: [], cards: 0 });
  await nav(page, 'Perfil');
  await page.locator('.pr-row[data-nav="settings"]').click();
  await expect(page.locator('#s-data .set-row', { hasText: 'Papelera' })).toContainText('1 cosa · lo más antiguo se borra del todo en 30 días.');
  await page.locator('#s-data [data-nav="trash"]').click();
  await expect(page.locator('.tr-row')).toContainText('carpeta · 1 lista');
  await page.locator('.tr-row [data-tr="restore"]').click();
  await expect(page.locator('#sheetBody h2')).toHaveText('Recuperar «Tema 3»');
  await expect(page.locator('#sheetBody .tr-inside')).toContainText('Las Cortes · 1 pregunta');
  await expect(page.locator('#trWhere')).toHaveValue('');
  await page.locator('#sheetBody [data-tr="restore-ok"]').click();
  expect(await S(page)).toMatchObject({ folders: ['Tema 3'], decks: ['Las Cortes'], cards: 1, trash: [] });
});

test('«Borrar ya», «Vaciar» con confirmación, y al abrir se borra del todo lo que lleva más de 30 días', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js');
    const old = new Date(Date.now() - 31 * 864e5).toISOString(), recent = new Date(Date.now() - 28 * 864e5).toISOString();
    for (const [name, at] of [['Vieja', old], ['Casi', recent], ['Otra', null]]) { const d = await api.createDeck({ owner: S.uid, name, folder_id: null }); if (at) await api.updateDeck(d.id, { deleted_at: at }); }
  });
  await page.reload();
  await expect(page.locator('#main h1').first()).toBeVisible();
  // La de hace 31 días ya no está ni en la papelera ni guardada
  await expect.poll(async () => (await db(page)).decks.map(d => d.name).sort()).toEqual(['Casi', 'Otra']);
  await nav(page, 'Biblioteca');
  await page.locator('.lib-trash').click();
  const row = page.locator('.tr-row');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.tr-left')).toHaveText('2 días');
  await expect(row.locator('.tr-left')).toHaveClass(/soon/);
  await row.locator('[data-tr="ask-purge"]').click();
  await expect(page.locator('#sheetBody')).toContainText('Se borra del todo. No se puede deshacer.');
  await page.locator('#sheetBody [data-tr="purge"]').click();
  await expect(page.locator('.tr-none')).toBeVisible();
  expect((await db(page)).decks.map(d => d.name)).toEqual(['Otra']);
  // Vaciar
  await nav(page, 'Biblioteca');
  await page.locator('#main').getByText('Otra', { exact: true }).first().click();
  await deckMenu(page, '[data-act="ask-delete-deck"]');
  await page.locator('#sheetBody [data-act="delete-deck"]').click();
  await page.locator('.lib-trash').click();
  await page.locator('[data-tr="ask-empty"]').click();
  await page.locator('#sheetBody [data-tr="empty"]').click();
  await expect(page.locator('.tr-none')).toBeVisible();
  expect((await db(page)).decks).toEqual([]);
});

test('una pregunta borrada en el editor no va a la papelera: «Deshacer» la devuelve', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Turco');
  await addBasicCards(page, [['ev', 'casa']]);
  const id = await page.evaluate(() => import('/js/comun.js').then(({ S }) => [...S.cards.keys()][0]));
  await page.locator(`[data-card="${id}"], .dk-card`).first().click();
  await edExtra(page);
  await page.locator('[data-act="ask-delete-card"]').first().click();
  await page.locator('#sheetBody [data-act="delete-card"]').click();
  await expect(page.locator('#toast')).toContainText('Pregunta borrada');
  expect((await S(page)).cards).toBe(0);
  await page.locator('#toast .ta-btn').click();
  expect((await S(page)).cards).toBe(1);
  await page.waitForTimeout(6500);
  expect((await db(page)).cards).toHaveLength(1);
});

test('Ajustes › Datos: el buscador encuentra «papelera» y «borrar cuenta»', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Perfil');
  await page.locator('.pr-row[data-nav="settings"]').click();
  await page.locator('#setFind').fill('papelera');
  await expect(page.locator('.set-row:visible')).toContainText(['Papelera']);
  await page.locator('#setFind').fill('eliminar cuenta');
  await expect(page.locator('.set-row:visible')).toContainText(['Borrar tu cuenta']);
  await page.locator('#setFind').fill('recuperar');
  await expect(page.locator('.set-row:visible', { hasText: 'Papelera' })).toHaveCount(1);
});

test('borrar la cuenta (modo local): copia, lo que se borra, escribir «borrar» y la pantalla final', async ({ page }) => {
  await listWithProgress(page);
  await nav(page, 'Perfil');
  await page.locator('.pr-row[data-nav="settings"]').click();
  await page.locator('[data-nav="bye"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Borrar tu cuenta' })).toBeVisible();
  await expect(page.locator('.bye-box')).toContainText('Listas1');
  await expect(page.locator('.bye-box')).toContainText('Preguntas y su progreso3');
  const go = page.locator('[data-bye="go"]');
  await expect(go).toBeDisabled();
  const dl = page.waitForEvent('download');
  await page.locator('[data-bye="backup"]').click();
  const file = (await dl).suggestedFilename();
  await expect(page.locator('[data-bye="backup"]')).toHaveText('Descargada');
  await page.locator('#byeWord').fill('borra');
  await expect(go).toBeDisabled();
  await page.locator('#byeWord').fill('borrar');
  await expect(go).toBeEnabled();
  await go.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tu cuenta se ha borrado' })).toBeVisible();
  await expect(page.locator('.bye-done')).toContainText(file);
  await expect(page.locator('.bye-done')).not.toContainText('correo');
  expect((await db(page)).decks).toEqual([]);
});

test('borrar la cuenta (con cuenta): si falla, lo dice y la sesión sigue; si va bien, borra imágenes y cuenta', async ({ page }) => {
  const srv = await mockCloud(page);
  srv.files.set(`media/11111111-1111-4111-8111-111111111111/foto1`, { body: Buffer.from('x'), type: 'image/webp' });
  srv.deleteFails = true;
  await openCloud(page);
  await page.goto('/#');
  await page.evaluate(() => import('/js/app.js').then(({ go }) => go('bye')));
  await expect(page.locator('.bye-box')).toContainText('Amigos');
  await page.locator('#byeWord').fill('BORRAR');
  await page.locator('[data-bye="go"]').click();
  await expect(page.locator('.bye-err')).toContainText('No se ha podido borrar la cuenta');
  await expect(page.getByRole('heading', { level: 1, name: 'Borrar tu cuenta' })).toBeVisible();
  expect(await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.uid))).toBeTruthy();
  // Ahora sí
  srv.deleteFails = false;
  await page.locator('#byeWord').fill('BORRAR');
  await page.locator('[data-bye="go"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tu cuenta se ha borrado' })).toBeVisible();
  expect([...srv.files.keys()].filter(k => k.includes('foto1'))).toEqual([]);
  expect(sent(srv, 'delete_my_account')).toHaveLength(2);
  await page.locator('[data-bye="close"]').click();
  await expect(page.locator('label[for="a-email"]')).toBeVisible();
});
