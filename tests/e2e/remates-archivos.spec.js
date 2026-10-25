// Remates de archivos: aviso tras restaurar una copia, Markdown con «#» y «##», página web con los colores y letras de
// Flaski, y «Destacado» sin emoji en el menú de bloques
import { readFile } from 'node:fs/promises';
import { test, expect, openApp, nav, createDeck, addBasicCards, pasteNotes } from './fixtures.js';

test('tras restaurar una copia, al recargar dice cuánto ha entrado (o que ya lo tenías todo)', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Copia');
  await addBasicCards(page, [['su', 'agua'], ['ekmek', 'pan']]);
  await nav(page, 'Perfil');
  await page.locator('[data-nav="settings"]').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-act="backup"]').click()]);
  const backup = JSON.parse(await readFile(await dl.path(), 'utf8'));
  // Sin cambiar nada: ya lo tenías todo
  // (la copia recarga la página: se espera la recarga junto con lo que la provoca)
  await Promise.all([page.waitForEvent('load'), page.locator('#backupFile').setInputFiles({ name: 'copia.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })]);
  await expect(page.locator('#toast')).toHaveText('Copia restaurada: ya lo tenías todo');
  // Tras borrarlo todo: 1 lista y 2 preguntas
  await nav(page, 'Perfil');
  await page.locator('[data-act="ask-reset-local"]').click();
  await page.locator('[data-act="reset-local"]').click();
  await page.locator('[data-nav="settings"]').click();
  await Promise.all([page.waitForEvent('load'), page.locator('#backupFile').setInputFiles({ name: 'copia.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })]);
  await expect(page.locator('#toast')).toHaveText('Copia restaurada: 3 cosas añadidas');
});

test('Markdown: el título con «#» y los apartados con «##»; la página web con los colores y letras de Flaski', async ({ page }) => {
  await openApp(page);
  const out = await page.evaluate(async () => {
    const { pageToMarkdown } = await import('/js/pages.js');
    const { pageToHTML } = await import('/js/notesio.js');
    const p = { title: 'Tema 1', blocks: [{ id: 'a', type: 'h1', text: 'Apartado' }, { id: 'b', type: 'p', text: 'Texto.' }, { id: 'c', type: 'h2', text: 'Detalle' }] };
    return { md: pageToMarkdown(p), html: pageToHTML(p) };
  });
  expect(out.md).toBe('# Tema 1\n\n## Apartado\n\nTexto.\n\n### Detalle\n');
  expect(out.html).toContain('Gochi Hand');
  expect(out.html).toContain('Atkinson Hyperlegible');
  expect(out.html).toContain('#2F3DB5');
  expect(out.html).not.toContain('#37352F');
});

test('menú de bloques: «Destacado» con el icono de la app, sin emoji', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  await pasteNotes(page, '# Tema\n\nTexto.');
  await page.locator('#pgBlocks .nb').first().locator('.nb-text').click();
  await page.locator('[data-block-input]').fill('/');
  await page.locator('[data-block-input]').press('End');
  await page.locator('[data-block-input]').type('desta');
  const item = page.locator('#blockMenu').getByText('Destacado').locator('xpath=ancestor::*[contains(@class,"blk-item") or self::button][1]');
  await expect(item.locator('.blk-glyph svg')).toHaveCount(1);
  await expect(item.locator('.blk-glyph')).not.toContainText('💡');
});
