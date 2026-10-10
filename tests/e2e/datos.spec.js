import { readFile } from 'node:fs/promises';
import { test, expect, openApp, nav, answer, createDeck, addBasicCards, pasteNotes } from './fixtures.js';

const CSV = '﻿pregunta;respuesta;nota\nçiçek;flor;"con ""comillas"""\nkapı;puerta;\nsolo;;\n';

test('importar un CSV, revisar la vista previa y volver a exportarlo igual', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Mis mazos');
  await page.locator('#importFile').setInputFiles({ name: 'vocabulario-turco.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await expect(page.locator('#sheetBody')).toContainText('2 tarjetas · desde CSV');
  await expect(page.locator('#sheetBody')).toContainText('Se han saltado 1 filas');
  await page.getByRole('button', { name: 'Añadir a mis mazos' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'vocabulario turco' })).toBeVisible();
  await expect(page.locator('#cardCount')).toHaveText('2 tarjetas');

  await page.locator('#main [data-act="share"]').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar CSV' }).click()]);
  expect(dl.suggestedFilename()).toBe('vocabulario-turco.csv');
  const out = await readFile(await dl.path(), 'utf8');
  expect(out).toBe('﻿pregunta;respuesta;nota\r\nçiçek;flor;"con ""comillas"""\r\nkapı;puerta;\r\n');
});

test('buscar dentro de un mazo', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Buscar');
  await addBasicCards(page, [['ev', 'casa'], ['kapı', 'puerta'], ['evet', 'sí']]);
  await page.locator('#cardSearch').fill('ev');
  await expect(page.locator('#cardCount')).toHaveText('2 de 3 tarjetas');
});

async function downloadBackup(page) {
  await nav(page, 'Perfil');
  await page.locator('[data-nav="settings"]').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-act="backup"]').click()]);
  return JSON.parse(await readFile(await dl.path(), 'utf8'));
}
async function wipeLocal(page) {
  await nav(page, 'Perfil');
  await page.locator('[data-act="ask-reset-local"]').click();
  await page.locator('[data-act="reset-local"]').click();
  await expect(page.locator('#main')).toContainText('0 tarjetas en 0 mazos');
}
async function restore(page, data) {
  await nav(page, 'Perfil');
  await page.locator('[data-nav="settings"]').click();
  await page.locator('#backupFile').setInputFiles({ name: 'copia.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
}

test('copia de seguridad local: borrar todo y restaurar deja mazos y progreso como estaban', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Copia');
  await addBasicCards(page, [['su', 'agua'], ['ekmek', 'pan']]);
  await page.locator('#main [data-start]').click();
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.locator('[data-grade="3"]').click();

  const backup = await downloadBackup(page);
  expect(backup.format).toBe('flaski-backup');
  expect(backup.decks).toHaveLength(1);
  expect(backup.progress).toHaveLength(1);

  await wipeLocal(page);
  await restore(page, backup);
  await page.waitForEvent('load');
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await expect(page.locator('.hero-num')).toHaveText('1');          // 1 nueva pendiente, la otra ya estudiada
  await nav(page, 'Perfil');
  await expect(page.locator('#main')).toContainText('2 tarjetas en 1 mazo · 1 empezadas');
});

test('restaurar una copia de cuenta: añade lo que falta y no duplica al repetir', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'De la nube');
  await addBasicCards(page, [['göz', 'ojo']]);
  await page.locator('#main [data-start]').click();
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.locator('[data-grade="3"]').click();

  const { local, ...cloudLike } = await downloadBackup(page);   // sin «local»: se trata como copia de una cuenta
  await wipeLocal(page);

  await restore(page, cloudLike);
  await expect(page.locator('#sheetBody')).toContainText('1 mazo restaurado');
  await page.locator('#sheetBody').getByRole('button', { name: 'Entendido' }).click();

  await restore(page, cloudLike);
  await expect(page.locator('#sheetBody')).toContainText('1 mazo ya estaba');
  await page.locator('#sheetBody').getByRole('button', { name: 'Entendido' }).click();

  await nav(page, 'Perfil');
  await expect(page.locator('#main')).toContainText('1 tarjeta en 1 mazo · 1 empezadas');
});

test('la copia de seguridad incluye los apuntes y el vínculo de sus tarjetas', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Con apuntes');
  await nav(page, 'Apuntes');
  await pasteNotes(page, '# Mis apuntes\n\nEl agua es su.');
  await page.locator('#pgDeck').selectOption({ label: 'Con apuntes' });
  await page.locator('#pgBlocks .nb-text').first().click();
  await page.locator('[data-block-input]').evaluate(t => { const k = t.value.indexOf('su'); t.setSelectionRange(k, k + 2); document.dispatchEvent(new Event('selectionchange')); });
  await page.locator('[data-act="sel-card"]').click();
  await page.locator('#fld-q').fill('¿Agua en turco?');
  await page.locator('.ed-foot button[type="submit"]').click();
  await expect(page.locator('.nb-cards')).toHaveText('1');

  const { local, ...cloudLike } = await downloadBackup(page);
  expect(cloudLike.pages).toHaveLength(1);
  await wipeLocal(page);
  await restore(page, cloudLike);
  await expect(page.locator('#sheetBody')).toContainText('Apuntes: 1 restaurado');
  await page.locator('#sheetBody').getByRole('button', { name: 'Entendido' }).click();

  await nav(page, 'Apuntes');
  await page.getByRole('button', { name: /Mis apuntes/ }).click();
  await expect(page.locator('.nb-cards')).toHaveText('1');                // la tarjeta sigue unida a su parte
  await expect(page.locator('#pgDeck')).toHaveValue(/.+/);                // y el apunte, a su mazo
});
