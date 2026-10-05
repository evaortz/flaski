// Formato para IAs: los ejemplos de FORMATO-IA.md se pegan en la app tal cual, para que el documento
// y la app no se desincronicen nunca.
import { readFile } from 'node:fs/promises';
import { test, expect, openApp, nav } from './fixtures.js';

const DOC = new URL('../../FORMATO-IA.md', import.meta.url);

async function docExamples() {
  const md = await readFile(DOC, 'utf8');
  const blocks = [...md.matchAll(/```json\r?\n([\s\S]*?)```/g)];
  const examples = [...md.matchAll(/```json\r?\n([\s\S]*?)```\s*\r?\n\s*Este ejemplo crea (\d+) tarjetas\./g)]
    .map(m => ({ json: m[1], cards: Number(m[2]), name: JSON.parse(m[1]).name }));
  return { blocks: blocks.length, examples };
}

async function paste(page, text) {
  await nav(page, 'Mis mazos');
  await page.locator('#main [data-act="paste"]').click();
  await page.locator('#pasteText').fill(text);
  await page.getByRole('button', { name: 'Ver vista previa' }).click();
}

test('cada bloque JSON de FORMATO-IA.md dice cuántas tarjetas crea', async () => {
  const { blocks, examples } = await docExamples();
  expect(examples.length).toBeGreaterThanOrEqual(3);
  expect(examples.length, 'pon «Este ejemplo crea N tarjetas.» después de cada ```json').toBe(blocks);
});

test('los ejemplos de FORMATO-IA.md se importan enteros, tal como los daría una IA', async ({ page }) => {
  const { examples } = await docExamples();
  await openApp(page);
  for (const ex of examples) {
    // Como lo pega alguien desde el chat de la IA: con el bloque ```json y una frase antes
    await paste(page, `¡Claro! Aquí tienes tu mazo:\n\n\`\`\`json\n${ex.json}\`\`\`\n`);
    const sheet = page.locator('#sheetBody');
    await expect(sheet).toContainText(`${ex.cards} tarjetas`);
    await expect(sheet.locator('.issues-box')).toHaveCount(0);     // ni notas saltadas ni avisos
    await sheet.getByRole('button', { name: 'Añadir a mis mazos' }).click();
    await expect(page.getByRole('heading', { level: 1, name: ex.name })).toBeVisible();
    await expect(page.locator('#cardCount')).toHaveText(`${ex.cards} tarjetas`);
  }
});

test('las etiquetas y los tipos en otro idioma se crean al importar', async ({ page }) => {
  const { examples } = await docExamples();
  const ja = examples.find(e => /"lang": "ja-JP"/.test(e.json));
  await openApp(page);
  await paste(page, ja.json);
  await page.getByRole('button', { name: 'Añadir a mis mazos' }).click();
  await expect(page.locator('#cardRows')).toContainText('lugares');
  await expect(page.locator('#cardRows')).toContainText('Ordenar frase · Japonés');
});

test('pegar con errores: dice qué notas se saltan y por qué, e importa el resto', async ({ page }) => {
  await openApp(page);
  await paste(page, JSON.stringify({
    format: 'flaski-notes', version: 1, name: 'Con errores',
    notes: [
      { type: 'basic', fields: { q: 'bien', a: 'ok' } },
      { type: 'flashcard', fields: { q: 'tipo inventado', a: 'x' } },
      { type: 'cloze', fields: { x: 'olvidé los huecos' } },
      { type: 'basic', fields: { q: 'campo de más', a: 'ok', foto: 'x' } },
    ],
  }));
  const sheet = page.locator('#sheetBody');
  await expect(sheet).toContainText('2 tarjetas');
  await expect(sheet).toContainText('Se saltan 2 notas');
  await expect(sheet).toContainText('Nota 2');
  await expect(sheet).toContainText('el tipo «flashcard» no existe');
  await expect(sheet).toContainText('{{hueco}}');
  await expect(sheet.getByText('1 aviso')).toBeVisible();
  await sheet.getByRole('button', { name: 'Añadir a mis mazos' }).click();
  await expect(page.locator('#cardCount')).toHaveText('2 tarjetas');
});

test('si ninguna nota vale, no se importa nada y se puede volver a pegar lo mismo', async ({ page }) => {
  await openApp(page);
  const bad = '[{ "type": "nada", "fields": { "q": "a" } }]';
  await paste(page, bad);
  await expect(page.getByRole('heading', { name: 'No se ha podido crear ninguna tarjeta' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver a pegar' }).click();
  await expect(page.locator('#pasteText')).toHaveValue(bad);
});

test('JSON roto: el error dice la línea y no se cierra la hoja', async ({ page }) => {
  await openApp(page);
  await paste(page, '{\n  "name": "X",\n  "notes": [ { "fields": { "q": "a" "a": "b" } } ]\n}');
  await expect(page.locator('#pasteError')).toContainText('línea 3');
  await expect(page.locator('#pasteText')).toBeVisible();
});

test('pegar columnas de una hoja de cálculo (CSV)', async ({ page }) => {
  await openApp(page);
  await paste(page, 'pregunta\trespuesta\nev\tcasa\nkapı\tpuerta');
  await expect(page.locator('#sheetBody')).toContainText('2 tarjetas · desde CSV');
});

test('un archivo flaski-deck se sigue importando igual', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Mis mazos');
  await page.locator('#importFile').setInputFiles(new URL('../../decks/japones-demo.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
  await expect(page.locator('#sheetBody')).toContainText('43 tarjetas · desde archivo Flaski');
});

test('las instrucciones para IA se descargan desde la app', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Mis mazos');
  await page.locator('#main [data-act="paste"]').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#sheetBody [data-act="download-ai-guide"]').click()]);
  expect(dl.suggestedFilename()).toBe('FORMATO-IA.md');
  expect(await readFile(await dl.path(), 'utf8')).toBe(await readFile(DOC, 'utf8'));

  await page.locator('#sheetBody').getByRole('button', { name: 'Cancelar' }).click();
  await nav(page, 'Perfil');
  await page.locator('[data-nav="settings"]').click();
  await expect(page.locator('#main [data-act="download-ai-guide"]')).toBeVisible();
});
