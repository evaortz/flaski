// Dos dispositivos con la misma cuenta (la nube simulada): el que tiene lo de ayer no pisa lo que hiciste en el otro
import { test, expect } from './fixtures.js';
import { mockCloud, openCloud } from './nube.js';

// La app pasa a segundo plano y vuelve al cabo de un rato (5 min)
async function awayAndBack(page) {
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.evaluate(() => {
    const real = Date.now.bind(Date); Date.now = () => real() + 5 * 60e3;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}
const deckNames = page => page.evaluate(() => import('/js/comun.js').then(({ S }) => [...S.decks.values()].map(d => d.name).sort()));

test('al volver a la app tras un rato, trae lo que cambiaste en otro dispositivo', async ({ page }) => {
  const srv = await mockCloud(page);
  await openCloud(page);
  expect(await deckNames(page)).toEqual(['Turco en la nube']);
  // En el ordenador: una lista nueva y otro tema de color
  srv.tables.decks.push({ ...srv.tables.decks[0], id: 'd0000000-0000-4000-8000-000000000002', name: 'Del ordenador' });
  srv.settings = { new_per_day: 15, prefs: { look: { accent: 'violeta' } } };
  await awayAndBack(page);
  await expect.poll(() => deckNames(page)).toEqual(['Del ordenador', 'Turco en la nube']);
  expect(await page.evaluate(() => import('/js/comun.js').then(({ S }) => S.prefs.look.accent))).toBe('violeta');
});

test('en plena tanda, al volver no se recarga nada', async ({ page }) => {
  const srv = await mockCloud(page);
  await openCloud(page);
  srv.tables.decks.push({ ...srv.tables.decks[0], id: 'd0000000-0000-4000-8000-000000000002', name: 'Del ordenador' });
  await page.locator('#main [data-act="tanda-short"], #main [data-start]').first().click().catch(() => {});
  await page.evaluate(async () => { const { startSession } = await import('/js/pantallas/estudio.js'); const { S } = await import('/js/comun.js'); if (!S.session) startSession('all'); });
  await awayAndBack(page);
  await page.waitForTimeout(800);
  expect(await deckNames(page)).toEqual(['Turco en la nube']);
});

test('ajustes: el móvil con lo de ayer solo sube lo que cambias en él; lo del ordenador se queda', async ({ page }) => {
  const srv = await mockCloud(page);
  srv.settings = { new_per_day: 15, prefs: { look: { accent: 'cobalto' }, study: { tandaMin: 10 } } };
  await openCloud(page);
  // Mientras, en el ordenador: otra duración de la tanda
  srv.settings = { new_per_day: 15, prefs: { ...srv.settings.prefs, study: { ...srv.settings.prefs.study, tandaMin: 20 } } };
  // En el móvil (sin recargar): otro color
  await page.evaluate(async () => { const { S } = await import('/js/comun.js'); const { savePrefsSoon } = await import('/js/pantallas/perfil.js'); S.prefs.look.accent = 'teja'; savePrefsSoon(); });
  await expect.poll(() => srv.settings.prefs.look?.accent, { timeout: 10000 }).toBe('teja');
  expect(srv.settings.prefs.study.tandaMin).toBe(20);
});

// Apuntes: se guardan sobre la versión de la nube que se tiene; si otro dispositivo lo cambió, lo suyo se queda y lo
// de aquí va a una copia (nada se pierde)
const PAGE = 'p0000000-0000-4000-8000-000000000001';
const T0 = '2026-11-15T10:00:00.123456+00:00';
const pageRowOf = (title, text, updated_at) => ({ id: PAGE, owner: '11111111-1111-4111-8111-111111111111', title, icon: '', deck_id: null, folder_id: null, tags: [], blocks: [{ id: 'b1', type: 'p', text }], created_at: T0, updated_at });
const editHere = (page, text) => page.evaluate(async ([id, text]) => {
  const { S } = await import('/js/comun.js'); const { savePageSoon } = await import('/js/pantallas/apuntes.js');
  const p = S.pages.get(id); p.blocks = [{ ...p.blocks[0], text }]; savePageSoon(p, 0);
}, [PAGE, text]);

test('apuntes: sin nadie más, cada guardado va sobre el anterior (sin copias)', async ({ page }) => {
  const srv = await mockCloud(page);
  srv.tables.pages = [pageRowOf('Tema 1', 'Hola', T0)];
  await openCloud(page);
  await editHere(page, 'Hola, móvil');
  await expect.poll(() => srv.tables.pages[0].blocks[0].text).toBe('Hola, móvil');
  await editHere(page, 'Hola otra vez');
  await expect.poll(() => srv.tables.pages[0].blocks[0].text).toBe('Hola otra vez');
  // Sin red, dos cambios seguidos; al volver, uno solo y sobre la versión buena
  srv.reachable = false;
  await editHere(page, 'Sin red 1');
  await editHere(page, 'Sin red 2');
  await page.waitForTimeout(300);
  srv.reachable = true;
  await page.evaluate(() => import('/js/api.js').then(api => api.offline.flush()));
  await expect.poll(() => srv.tables.pages[0].blocks[0].text).toBe('Sin red 2');
  expect(srv.tables.pages).toHaveLength(1);
});

test('apuntes: si otro dispositivo lo cambió, lo suyo se queda y lo de aquí va a una copia', async ({ page }) => {
  const srv = await mockCloud(page);
  srv.tables.pages = [pageRowOf('Tema 1', 'Hola', T0)];
  await openCloud(page);
  // En el ordenador lo reescriben
  srv.tables.pages[0] = pageRowOf('Tema 1', 'Del ordenador', '2026-11-16T09:00:00.000Z');
  // En el móvil (con lo de ayer) se corrige una errata
  await editHere(page, 'Hola (errata corregida)');
  await expect.poll(() => srv.tables.pages.length).toBe(2);
  const [orig, copy] = srv.tables.pages;
  expect(orig.blocks[0].text).toBe('Del ordenador');
  expect(copy.title).toBe('Tema 1 (copia de este dispositivo)');
  expect(copy.blocks[0].text).toBe('Hola (errata corregida)');
  await expect(page.locator('#toast')).toContainText('cambió en otro dispositivo');
  const here = await page.evaluate(() => import('/js/comun.js').then(({ S }) => [...S.pages.values()].map(p => [p.title, p.blocks[0]?.text]).sort()));
  expect(here).toEqual(expect.arrayContaining([['Tema 1', 'Del ordenador'], ['Tema 1 (copia de este dispositivo)', 'Hola (errata corregida)']]));
  expect(here).toHaveLength(2);
});
