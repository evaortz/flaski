// El aviso de sincronización («N cambios por enviar», «Sin conexión») flota encima: la tanda no se mueve al salir
import { test, expect } from './fixtures.js';
import { mockCloud, openCloud } from './nube.js';

test('la pregunta de la tanda no cambia de sitio mientras sincroniza @ambos', async ({ page }) => {
  const srv = await mockCloud(page);
  await openCloud(page);
  await page.locator('#main .hero-go').click();
  const go = page.locator('#sheetBody [data-act="tanda-go"]');
  if (await go.isVisible().catch(() => false)) await go.click();
  const bar = page.locator('.studybar');
  await expect(bar).toBeVisible();
  const pos = async () => { const b = await bar.boundingBox(); const q = await page.locator('.card .front').first().boundingBox(); return [Math.round(b.y), Math.round(q.y)]; };
  const before = await pos();
  await expect(page.locator('#net')).toBeHidden();
  // Sin red, la respuesta queda por enviar y sale el aviso
  srv.reachable = false;
  await page.locator('[data-act="reveal"]').click();
  await page.locator('[data-grade="3"]').click();
  await expect(page.locator('#net')).toBeVisible();
  expect(await pos()).toEqual(before);
  // Al volver la red y enviarse, tampoco
  srv.reachable = true;
  await page.evaluate(() => import('/js/api.js').then(api => api.offline.flush()));
  await expect(page.locator('#net')).toBeHidden();
  expect(await pos()).toEqual(before);
});
