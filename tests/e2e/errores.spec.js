// Los errores dicen qué ha pasado: el aviso lleva «Detalles» (qué hacías, el error técnico, hora, versión y modo)
// sin claves ni datos de otras personas; con el navegador lleno, lo dice en claro y propone descargar una copia
import { test, expect, openApp, nav } from './fixtures.js';
import { mockCloud, openCloud, UID } from './nube.js';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('un error de Supabase: el aviso con «Detalles» y la hoja con lo que pasó, sin claves ni correos; «Copiar»', async ({ page }) => {
  const srv = await mockCloud(page);
  srv.failWrite = { path: 'folders', status: 409, body: { code: '23505', message: 'duplicate key value violates unique constraint "folders_owner_name_key"', details: `Key (owner, name)=(${UID}, Viajes) already exists; aviso a otra@ejemplo.com, de 22222222-2222-4222-8222-222222222222`, hint: 'Prueba con otro nombre' } };
  await openCloud(page);
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="new-folder"]').click();
  await page.locator('#fo-name').fill('Viajes');
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  const toast = page.locator('#toast');
  await expect(toast).toContainText('duplicate key value');
  await toast.getByRole('button', { name: 'Detalles' }).click();
  const sheet = page.locator('#sheetBody');
  await expect(sheet.locator('h2')).toHaveText('Qué ha pasado');
  for (const t of ['Nueva carpeta › Guardar', '23505', 'duplicate key value', 'Prueba con otro nombre', 'Con cuenta', 'flaski-v']) await expect(sheet).toContainText(t);
  await expect(sheet.locator('dd').filter({ hasText: /^\d{1,2}\/\d{1,2}\/\d{4}/ })).toHaveCount(1);   // la hora
  const text = await sheet.textContent();
  expect(text).not.toContain('otra@ejemplo.com');
  expect(text).not.toContain('22222222-2222');
  expect(text).not.toContain('clave-de-prueba');
  await sheet.getByRole('button', { name: 'Copiar' }).click();
  await expect(toast).toHaveText('Copiado');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('code: 23505');
  expect(copied).toContain('Qué hacías: Nueva carpeta › Guardar');
  expect(copied).toMatch(/Versión: flaski-v\d+/);
});

test('sin espacio en el navegador: «No queda espacio…», «Descargar una copia» y QuotaExceededError en los detalles', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (/^flaski-local/.test(k)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return set.call(this, k, v); };
  });
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="new-deck"]').click();
  await page.locator('#d-name').fill('Llena');
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  const toast = page.locator('#toast');
  await expect(toast).toContainText('No queda espacio en este navegador');
  const dl = page.waitForEvent('download');
  await toast.getByRole('button', { name: 'Descargar una copia' }).click();
  expect((await dl).suggestedFilename()).toMatch(/^flaski-copia-.*\.json$/);
  // Los detalles siguen a mano: el error otra vez y «Detalles»
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  await toast.getByRole('button', { name: 'Detalles' }).click();
  await expect(page.locator('#sheetBody')).toContainText('QuotaExceededError');
  await expect(page.locator('#sheetBody')).toContainText('Modo local');
});
