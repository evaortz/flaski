// Exportar e importar apuntes: Word (ida y vuelta), Markdown con imágenes, HTML, CSV y varios archivos a la vez
import { test, expect, openApp, nav } from './fixtures.js';
import fs from 'node:fs';

async function newPage(page, title) {
  await nav(page, 'Apuntes');
  await page.locator('[data-act="new-page"]').click();
  await page.locator('#pgTitle').fill(title);
}
const kinds = page => page.locator('#pgBlocks .nb').evaluateAll(els => els.map(e => e.className.split(' ')[1].slice(3)));
async function fillPage(page) {
  await page.locator('#pgBlocks .nb').first().locator('.nb-text').click();
  const t = s => page.locator('[data-block-input]').pressSequentially(s);
  await t('## Partes'); await page.keyboard.press('Enter');
  await t('La **célula** tiene núcleo.'); await page.keyboard.press('Enter');
  await t('- Núcleo'); await page.keyboard.press('Enter');
  await t('ADN'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await t('Fin.');
  await page.keyboard.press('Escape');
}
async function exportAs(page, fmt) {
  await page.locator('[data-act="page-menu"]').click();
  await page.locator('[data-act="export-page"]').click();
  const dl = page.waitForEvent('download');
  await page.locator(`[data-export="${fmt}"]`).click();
  return dl;
}

test('exportar a Word y volver a importarlo: mismos títulos, listas con sangría y formato', async ({ page }, info) => {
  await openApp(page);
  await newPage(page, 'Célula');
  await fillPage(page);
  const dl = await exportAs(page, 'docx');
  expect(dl.suggestedFilename()).toBe('Célula.docx');
  const file = info.outputPath('celula.docx');
  await dl.saveAs(file);
  // Importarlo desde la lista de apuntes: un apunte nuevo
  await nav(page, 'Apuntes');
  await page.locator('#noteFile').setInputFiles(file);
  await expect(page.locator('#pgTitle')).toHaveValue('Célula');
  expect(await kinds(page)).toEqual(['h2', 'p', 'li', 'li', 'p']);
  await expect(page.locator('#pgBlocks .nb').nth(1).locator('b')).toHaveText('célula');
  await expect(page.locator('#pgBlocks .nb[data-ind="1"]')).toHaveText('ADN');
});

test('exportar en Markdown y en HTML', async ({ page }, info) => {
  await openApp(page);
  await newPage(page, 'Apunte md');
  await fillPage(page);
  const md = await exportAs(page, 'md');
  expect(md.suggestedFilename()).toBe('Apunte md.md');
  const text = fs.readFileSync(await md.path(), 'utf8');
  expect(text).toBe('# Apunte md\n\n## Partes\n\nLa **célula** tiene núcleo.\n\n- Núcleo\n  - ADN\n\nFin.\n');
  const html = await exportAs(page, 'html');
  const h = fs.readFileSync(await html.path(), 'utf8');
  expect(h).toContain('<h1 class="title">Apunte md</h1>');
  expect(h).toContain('<b>célula</b>');
});

test('importar varios archivos a la vez (Markdown, CSV, HTML) y dentro de un apunte', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Apuntes');
  await page.locator('#noteFile').setInputFiles([
    { name: 'mitosis.md', mimeType: 'text/markdown', buffer: Buffer.from('# Mitosis\n\nDivisión **celular**.\n\n1. Profase\n2. Metafase\n') },
    { name: 'casos.csv', mimeType: 'text/csv', buffer: Buffer.from('Caso;Sufijo\nLocativo;-de\n') },
    { name: 'web.html', mimeType: 'text/html', buffer: Buffer.from('<html><head><title>Una web</title></head><body><h2>Apartado</h2><p>Texto <em>importante</em>.</p></body></html>') },
  ]);
  await expect(page.locator('#main .notes-list li')).toHaveCount(3);
  await page.getByRole('button', { name: /Mitosis/ }).click();
  expect(await kinds(page)).toEqual(['p', 'ol', 'ol']);
  // Dentro del apunte abierto: se añade al final
  await page.locator('[data-act="page-menu"]').click();
  await page.locator('[data-act="import-into-page"]').click();
  await page.locator('#noteFile').setInputFiles({ name: 'casos.csv', mimeType: 'text/csv', buffer: Buffer.from('Caso;Sufijo\nLocativo;-de\n') });
  await expect(page.locator('#pgBlocks table th')).toHaveText(['Caso', 'Sufijo']);
  expect(await kinds(page)).toEqual(['p', 'ol', 'ol', 'h1', 'table']);
});

test('exportar todos los apuntes en un .zip', async ({ page }) => {
  await openApp(page);
  await newPage(page, 'Uno');
  await fillPage(page);
  await nav(page, 'Apuntes');
  const dl = page.waitForEvent('download');
  await page.locator('[data-act="export-all-notes"]').click();
  expect((await dl).suggestedFilename()).toMatch(/^Apuntes de Flaski .*\.zip$/);
});
