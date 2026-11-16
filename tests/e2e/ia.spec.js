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
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="import-menu"]').click();
  await page.locator('#sheetBody [data-act="paste"]').click();
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
    await expect(sheet).toContainText(`${ex.cards} preguntas`);
    await expect(sheet.locator('.issues-box')).toHaveCount(0);     // ni notas saltadas ni avisos
    await sheet.getByRole('button', { name: 'Añadir a mis listas' }).click();
    await expect(page.getByRole('heading', { level: 1, name: ex.name })).toBeVisible();
    await expect(page.locator('.dk-meta')).toContainText(`${ex.cards} preguntas`);
  }
});

test('las etiquetas se crean y el mazo queda con su idioma al importar', async ({ page }) => {
  const { examples } = await docExamples();
  const ja = examples.find(e => /"lang": "ja-JP"/.test(e.json));
  // (los ejemplos ya no llevan etiquetas: se le pone una, como si la pidieras)
  const data = JSON.parse(ja.json);
  data.notes.find(n => n.type === 'vocab').tags = ['lugares'];
  await openApp(page);
  await paste(page, JSON.stringify(data));
  await page.getByRole('button', { name: 'Añadir a mis listas' }).click();
  await expect(page.locator('#cardRows')).toContainText('lugares');
  await expect(page.locator('#cardRows')).toContainText('Ordenar frase');
  await expect(page.locator('.deckhead')).toContainText('Japonés');                 // el idioma es del mazo
  await expect(page.locator('#cardRows')).not.toContainText('· Japonés');          // sin copias de tipos por idioma
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
  await expect(sheet).toContainText('2 preguntas');
  await expect(sheet).toContainText('Se saltan 2 notas');
  await expect(sheet).toContainText('Nota 2');
  await expect(sheet).toContainText('el tipo «flashcard» no existe');
  await expect(sheet).toContainText('{{hueco}}');
  await expect(sheet.getByText('1 aviso')).toBeVisible();
  await sheet.getByRole('button', { name: 'Añadir a mis listas' }).click();
  await expect(page.locator('.dk-meta')).toContainText('2 preguntas');
});

test('si ninguna nota vale, no se importa nada y se puede volver a pegar lo mismo', async ({ page }) => {
  await openApp(page);
  const bad = '[{ "type": "nada", "fields": { "q": "a" } }]';
  await paste(page, bad);
  await expect(page.getByRole('heading', { name: 'No se ha podido crear ninguna pregunta' })).toBeVisible();
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
  await expect(page.locator('#sheetBody')).toContainText('2 preguntas · desde una tabla');
});

test('un archivo flaski-deck se sigue importando igual', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  await page.locator('#importFile').setInputFiles(new URL('../../decks/japones-demo.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
  await expect(page.locator('#sheetBody')).toContainText('43 preguntas · Japonés · desde archivo Flaski');
});

test('las instrucciones para IA se descargan desde la app', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="import-menu"]').click();
  await page.locator('#sheetBody [data-act="paste"]').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#sheetBody [data-act="download-ai-guide"]').click()]);
  expect(dl.suggestedFilename()).toBe('FORMATO-IA.md');
  expect(await readFile(await dl.path(), 'utf8')).toBe(await readFile(DOC, 'utf8'));

  await page.locator('#sheetBody').getByRole('button', { name: 'Cancelar' }).click();
  await nav(page, 'Perfil');
  await page.locator('[data-nav="settings"]').click();
  await expect(page.locator('#main [data-act="download-ai-guide"]')).toBeVisible();
});

// Una lista que vuelve de la IA con una etiqueta distinta en cada nota: «La IA ha puesto 8 etiquetas · Quitarlas»
test('pegar una lista con 8 etiquetas: «Quitarlas» la añade sin ellas y Biblioteca no tiene filtros nuevos', async ({ page }) => {
  await openApp(page);
  const notes = Array.from({ length: 8 }, (_, i) => ({ fields: { q: `Pregunta ${i + 1}`, a: `Respuesta ${i + 1}` }, tags: [`tema${i + 1}`] }));
  await paste(page, JSON.stringify({ format: 'flaski-notes', name: 'Con etiquetas', notes }));
  await expect(page.locator('#sheetBody .pv-tags')).toContainText('La IA ha puesto 8 etiquetas');
  await page.locator('#sheetBody [data-act="drop-preview-tags"]').click();
  await expect(page.locator('#sheetBody .pv-tags')).toContainText('Sin etiquetas');
  await page.locator('#sheetBody [data-act="add-preview"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
  const r = await page.evaluate(() => import('/js/comun.js').then(({ S }) => ({ tags: S.tags.size, cards: S.cards.size, tagged: [...S.cards.values()].filter(c => (c.tags || []).length).length })));
  expect(r).toEqual({ tags: 0, cards: 8, tagged: 0 });
  await nav(page, 'Biblioteca');
  await expect(page.locator('#main [data-tagfilter]')).toHaveCount(0);
});

test('con pocas etiquetas no se ofrece quitarlas', async ({ page }) => {
  await openApp(page);
  const notes = [1, 2, 3].map(i => ({ fields: { q: `P${i}`, a: `R${i}` }, tags: ['verbos'] }));
  await paste(page, JSON.stringify({ format: 'flaski-notes', name: 'Pocas', notes }));
  await expect(page.locator('#sheetBody [data-act="add-preview"]')).toBeVisible();
  await expect(page.locator('#sheetBody .pv-tags')).toHaveCount(0);
});

/* ---------------- Copiar las instrucciones ---------------- */
const openPaste = async page => {
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="import-menu"]').click();
  await page.locator('#sheetBody [data-act="paste"]').click();
};

test.describe('copiar instrucciones', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('copia aunque las instrucciones aún no hayan llegado, y lo dice en el botón @ambos', async ({ page }) => {
    // La red tarda: se toca «Copiar» antes de que llegue FORMATO-IA.md (antes, en Safari, no copiaba nada)
    let release;
    const gate = new Promise(r => { release = r; });
    await page.route('**/FORMATO-IA.md', async route => { await gate; await route.continue(); });
    await openApp(page);
    await openPaste(page);
    const btn = page.locator('#sheetBody [data-act="copy-ai-guide"]');
    await btn.click();
    setTimeout(release, 300);
    await expect(btn).toContainText('Copiadas');
    await expect(page.locator('#toast')).toContainText('Instrucciones copiadas');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('"format": "flaski-notes"');
    expect(copied).toContain('`whatif`');
    await expect(btn).toContainText('Copiar instrucciones', { timeout: 5000 });
  });

  test('si el navegador no deja copiar, enseña el texto para copiarlo a mano y se puede volver @ambos', async ({ page }) => {
    await page.addInitScript(() => {
      const no = () => Promise.reject(new DOMException('no', 'NotAllowedError'));
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: no, write: no, readText: no } });
      document.execCommand = () => false;
    });
    await openApp(page);
    await openPaste(page);
    await page.locator('#pasteText').fill('lo que llevaba pegado');
    await page.locator('#sheetBody [data-act="copy-ai-guide"]').click();
    const sheet = page.locator('#sheetBody');
    await expect(sheet.getByRole('heading', { name: 'Copia las instrucciones' })).toBeVisible();
    await expect(page.locator('#aiGuideText')).toHaveValue(/flaski-notes/);
    expect(await page.evaluate(() => { const t = document.getElementById('aiGuideText'); return t.selectionEnd - t.selectionStart; })).toBeGreaterThan(1000);
    await expect(sheet.locator('[data-act="download-ai-guide"]')).toBeVisible();
    await sheet.getByRole('button', { name: 'Volver' }).click();
    await expect(sheet.getByRole('heading', { name: 'Pegar una lista' })).toBeVisible();
  });

  test('en Ajustes › Datos también copia', async ({ page }) => {
    await openApp(page);
    await nav(page, 'Perfil');
    await page.locator('.pr-row', { hasText: 'Ajustes' }).click();
    const btn = page.locator('#main [data-act="copy-ai-guide"]');
    await btn.click();
    await expect(btn).toContainText('Copiadas');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('flaski-notes');
  });
});

/* ---------------- Tipos nuevos y carpeta ---------------- */
test('una lista con «folder» va a esa carpeta: la que ya tienes o una nueva', async ({ page, seed }) => {
  await seed({ folders: ['Biología'] });
  await openApp(page);
  const notes = [{ type: 'steps', fields: { q: 'Ordena la mitosis', s: ['Profase', 'Metafase', 'Anafase'] } },
    { type: 'sort', fields: { g: { Vertebrados: ['rana'], Invertebrados: ['pulpo'] } } }];
  await paste(page, JSON.stringify({ format: 'flaski-notes', version: 1, name: 'La célula', folder: 'biologia', notes }));
  const sheet = page.locator('#sheetBody');
  await expect(sheet).toContainText('2 preguntas');
  await expect(sheet.locator('.pv-folder')).toHaveText(/Va a la carpeta «biologia»$/);
  await sheet.getByRole('button', { name: 'Añadir a mis listas' }).click();
  await expect(page.locator('.crumbs')).toContainText('Biología');
  await paste(page, JSON.stringify({ format: 'flaski-notes', version: 1, name: 'Ríos', folder: 'Geografía', notes }));
  await expect(sheet.locator('.pv-folder')).toContainText('(se crea)');
  await sheet.getByRole('button', { name: 'Añadir a mis listas' }).click();
  await expect(page.locator('.crumbs')).toContainText('Geografía');
});
