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
