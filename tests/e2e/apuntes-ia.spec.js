// Apuntes con IA: «Apunte con IA» (la IA prepara el apunte y sus preguntas) y «Preguntas con IA» (desde un apunte
// que ya tienes). Lo que se pega crea el apunte con sus bloques y cada pregunta queda unida a su apartado.
import { readFile } from 'node:fs/promises';
import { test, expect, openApp, nav, openPage } from './fixtures.js';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const DOC = new URL('../../FORMATO-IA.md', import.meta.url);
async function pageExample() {
  const md = await readFile(DOC, 'utf8');
  const note = /```markdown\r?\n([\s\S]*?)```/.exec(md)[1];
  const json = [...md.matchAll(/```json\r?\n([\s\S]*?)```/g)].map(m => m[1]).find(j => /"section"/.test(j));
  return { note, json };
}
const block = (page, text) => page.locator('#pgBlocks .nb').filter({ hasText: text }).first();

test('«Apunte con IA»: copia el encargo, y al pegar crea el apunte, su lista y sus preguntas unidas a cada apartado @ambos', async ({ page, seed }) => {
  await seed({ folders: ['Biología'] });
  await openApp(page);
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="import-menu"]').click();
  await page.locator('#sheetBody [data-act="ai-page"]').click();
  const sheet = page.locator('#sheetBody');
  await expect(sheet.getByRole('heading', { name: 'Apunte con IA' })).toBeVisible();
  const copy = sheet.locator('[data-act="copy-ai-guide"]');
  await copy.click();
  await expect(copy).toContainText('Copiadas');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^Quiero un apunte para estudiar/);
  expect(copied).toContain('## Apuntes con preguntas');

  // Lo que respondería la IA: el apunte en Markdown y debajo el bloque de preguntas
  const { note, json } = await pageExample();
  await page.locator('#pasteText').fill(`¡Claro! Aquí tienes tu apunte:\n\n${note}\n\`\`\`json\n${json}\`\`\`\n`);
  await sheet.getByRole('button', { name: 'Ver vista previa' }).click();
  await expect(sheet.getByRole('heading', { name: 'La fotosíntesis' })).toBeVisible();
  await expect(sheet).toContainText('Apunte · 2 apartados · 3 preguntas');
  await expect(sheet.locator('.ai-secs li')).toHaveText([/Qué es\s*1 pregunta/, /Fases\s*2 preguntas/]);
  await expect(sheet.locator('.ai-where')).toContainText('En la carpeta «Biología».');
  await sheet.getByRole('button', { name: 'Crear apunte' }).click();

  await expect(page.locator('#pgTitle')).toHaveValue('La fotosíntesis');
  await expect(page.locator('#toast')).toContainText('Apunte creado con 3 preguntas');
  await expect(page.locator('#pgBlocks .nb-tbl')).toHaveCount(1);
  // Cada pregunta, en su apartado
  await expect(block(page, 'Qué es').locator('.nb-cards')).toHaveText('1');
  await expect(block(page, 'Fases').locator('.nb-cards')).toHaveText('2');
  // La lista nueva se llama como el apunte y está en la carpeta
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-folder]').filter({ hasText: 'Biología' }).first().click();
  await expect(page.locator('#main')).toContainText('La fotosíntesis');
});

test('«Apunte con IA» sin preguntas crea solo el apunte; y «Pegar» de Importar también reconoce un apunte', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="import-menu"]').click();
  await page.locator('#sheetBody [data-act="paste"]').click();
  await page.locator('#pasteText').fill('# Los ríos de España\n\n## Vertiente atlántica\n- **Tajo**: el más largo\n- Duero\n\n## Vertiente mediterránea\n- Ebro');
  const sheet = page.locator('#sheetBody');
  await sheet.getByRole('button', { name: 'Ver vista previa' }).click();
  await expect(sheet).toContainText('Apunte · 2 apartados · 0 preguntas');
  await expect(sheet).toContainText('No trae preguntas');
  await sheet.getByRole('button', { name: 'Crear apunte' }).click();
  await expect(page.locator('#pgTitle')).toHaveValue('Los ríos de España');
  await expect(page.locator('#toast')).toContainText('Apunte creado');
  await expect(page.locator('#pgBlocks .nb-cards')).toHaveCount(0);
});

test('«Preguntas con IA» desde un apunte: copia el apunte con las instrucciones y las preguntas quedan en su apartado @ambos', async ({ page, seed }) => {
  await seed({ pages: [{ md: '# Mitosis\n\n## Fases\nProfase, metafase, anafase y telofase.\n\n## Para qué sirve\nPara el crecimiento y la reparación.' }] });
  await openApp(page);
  await openPage(page, 'Mitosis');
  await page.locator('[data-act="page-menu"]').click();
  await page.locator('#sheetBody [data-act="ai-cards"]').click();
  const sheet = page.locator('#sheetBody');
  await expect(sheet.getByRole('heading', { name: 'Preguntas con IA' })).toBeVisible();
  await sheet.locator('[data-act="copy-ai-guide"]').click();
  await expect(sheet.locator('[data-act="copy-ai-guide"]')).toContainText('Copiadas');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('=== MI APUNTE ===');
  expect(copied).toContain('## Para qué sirve');
  expect(copied).toContain('"format": "flaski-notes"');

  await page.locator('#pasteText').fill('```json\n' + JSON.stringify({ format: 'flaski-notes', version: 1, name: 'Mitosis', notes: [
    { type: 'steps', section: 'Fases', fields: { q: 'Ordena las fases', s: ['Profase', 'Metafase', 'Anafase', 'Telofase'] } },
    { type: 'truefalse', section: 'para que sirve', fields: { s: 'La mitosis sirve para reparar tejidos.', v: 'V' } },
    { type: 'basic', section: 'Un apartado que no existe', fields: { q: '¿Cuántas fases?', a: '4' } },
    { type: 'flashcard', fields: { q: 'x', a: 'y' } },
  ] }, null, 2) + '\n```');
  await sheet.getByRole('button', { name: 'Ver vista previa' }).click();
  await expect(sheet.getByRole('heading', { name: 'Preguntas para «Mitosis»' })).toBeVisible();
  await expect(sheet.locator('.ai-secs li')).toHaveText([/Fases\s*1 pregunta/, /Para qué sirve\s*1 pregunta/, /Sin apartado\s*1 pregunta/]);
  await expect(sheet).toContainText('Van a una lista nueva: «Mitosis».');
  await expect(sheet).toContainText('Se salta 1 nota');
  await sheet.getByRole('button', { name: 'Añadir 3 preguntas' }).click();
  await expect(page.locator('#toast')).toContainText('3 preguntas añadidas al apunte');
  await expect(block(page, 'Fases').locator('.nb-cards')).toHaveText('1');
  await expect(block(page, 'Para qué sirve').locator('.nb-cards')).toHaveText('1');
});

test('«Preguntas con IA»: si lo pegado no son preguntas lo dice, y si no se puede copiar se vuelve a la misma hoja', async ({ page, seed }) => {
  await page.addInitScript(() => {
    const no = () => Promise.reject(new DOMException('no', 'NotAllowedError'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: no, write: no, readText: no } });
    document.execCommand = () => false;
  });
  await seed({ pages: [{ md: '# Mitosis\n\n## Fases\nCuatro.' }] });
  await openApp(page);
  await openPage(page, 'Mitosis');
  await page.locator('[data-act="page-menu"]').click();
  await page.locator('#sheetBody [data-act="ai-cards"]').click();
  const sheet = page.locator('#sheetBody');
  await page.locator('#pasteText').fill('Lo siento, no puedo ayudarte con eso.');
  await sheet.getByRole('button', { name: 'Ver vista previa' }).click();
  await expect(page.locator('#pasteError')).toContainText('No parecen preguntas de Flaski');
  await sheet.locator('[data-act="copy-ai-guide"]').click();
  await expect(page.locator('#aiGuideText')).toHaveValue(/=== MI APUNTE ===[\s\S]*## Fases/);
  await sheet.getByRole('button', { name: 'Volver' }).click();
  await expect(sheet.getByRole('heading', { name: 'Preguntas con IA' })).toBeVisible();
  await expect(page.locator('#pasteText')).toHaveValue('Lo siento, no puedo ayudarte con eso.');
});
