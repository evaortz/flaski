// Apuntes: escribir por bloques, tablas, crear tarjetas desde lo seleccionado y volver a ellos al estudiar
import { test, expect, openApp, nav, createDeck } from './fixtures.js';

async function newPage(page, title) {
  await nav(page, 'Apuntes');
  await page.locator('[data-act="new-page"]').click();
  await page.locator('#pgTitle').fill(title);
}
const block = (page, i) => page.locator('#pgBlocks .nb').nth(i);
// Escribe en el bloque que se está editando
const type = (page, text) => page.locator('[data-block-input]').pressSequentially(text);

test('escribir apuntes por bloques: títulos, listas, Enter y Retroceso', async ({ page }) => {
  await openApp(page);
  await newPage(page, 'Casos del turco');
  await block(page, 0).locator('.nb-text').click();
  await type(page, '# Locativo');
  await page.keyboard.press('Enter');
  await type(page, 'Indica dónde está algo.');
  await page.keyboard.press('Enter');
  await type(page, '- evde: en casa');
  await page.keyboard.press('Enter');
  await type(page, 'okulda: en la escuela');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');          // Enter en un punto vacío: se acaba la lista
  await type(page, 'Fin.');
  await page.keyboard.press('Escape');

  await expect(page.locator('#pgBlocks .nb')).toHaveCount(5);
  expect(await page.locator('#pgBlocks .nb').evaluateAll(els => els.map(e => e.className.replace('nb nb-', '')))).toEqual(['h1', 'p', 'li', 'li', 'p']);
  // Retroceso al principio de un párrafo lo junta con el anterior
  await block(page, 4).locator('.nb-text').click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Escape');
  await expect(block(page, 3)).toHaveText('okulda: en la escuelaFin.');
  await expect(page.locator('#pgBlocks .nb')).toHaveCount(4);
  // Retroceso al principio de un punto de lista lo convierte en párrafo
  await block(page, 3).locator('.nb-text').click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Escape');
  await expect(block(page, 3)).toHaveClass('nb nb-p');

  // Se guarda: al volver a la lista y abrirlo sigue igual
  await page.reload();
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await nav(page, 'Apuntes');
  await page.getByRole('button', { name: /Casos del turco/ }).click();
  await expect(page.locator('#pgBlocks .nb')).toHaveCount(4);
  await expect(block(page, 0)).toHaveText('Locativo');
  await expect(block(page, 3)).toHaveClass('nb nb-p');
});

test('tablas en Markdown: se escriben como en Obsidian y se ven como tabla', async ({ page }) => {
  await openApp(page);
  await newPage(page, 'Tabla');
  await page.locator('[data-act="add-table"]').click();
  const t = page.locator('[data-block-input]');
  await t.fill('| Caso | Sufijo |\n| --- | :---: |\n| Locativo | -de |');
  await page.keyboard.press('End');
  await t.press('Control+End');
  await page.keyboard.press('Enter');           // fila nueva con sus celdas
  await expect(t).toHaveValue('| Caso | Sufijo |\n| --- | :---: |\n| Locativo | -de |\n|  |  |');
  await page.keyboard.type('Dativo');
  await page.keyboard.press('Escape');
  const table = page.locator('#pgBlocks table');
  await expect(table.locator('th')).toHaveText(['Caso', 'Sufijo']);
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('tbody tr').nth(1).locator('td').first()).toHaveText('Dativo');
  // Pegar texto con una tabla en un párrafo también la crea
  await page.locator('[data-act="add-block"]').click();
  await page.locator('[data-block-input]').fill('| A | B |\n|---|---|\n| 1 | 2 |');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pgBlocks table')).toHaveCount(2);
});

test('crear una tarjeta desde lo seleccionado, estudiarla y volver a los apuntes', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Turco');
  await newPage(page, 'Casos');
  await page.locator('#pgDeck').selectOption({ label: 'Turco' });
  await block(page, 0).locator('.nb-text').click();
  await type(page, 'El locativo se forma con -de: evde.');
  // Seleccionar «evde» dentro del bloque que se está editando
  await page.locator('[data-block-input]').evaluate(t => { const i = t.value.indexOf('evde'); t.setSelectionRange(i, i + 4); document.dispatchEvent(new Event('selectionchange')); });
  await expect(page.locator('#selBar')).toBeVisible();
  await page.locator('[data-act="sel-cloze"]').click();
  await expect(page.locator('.ed-typesel')).toContainText('Huecos');
  await expect(page.locator('#fld-x')).toHaveValue('El locativo se forma con -de: {{evde}}.');
  await expect(page.locator('.prop-link')).toContainText('Casos');
  await page.locator('.ed-foot button[type="submit"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('.nb-cards')).toHaveText('1');

  // Al estudiarla, «Ver en los apuntes» lleva al bloque y se puede volver al estudio
  await page.locator('#nav').getByRole('button', { name: 'Estudiar' }).click();
  await page.getByRole('button', { name: 'Empezar a estudiar' }).click();
  await page.locator('[data-act="reveal"]').click();
  await page.getByRole('button', { name: 'Ver en los apuntes' }).click();
  await expect(page.locator('#pgTitle')).toHaveValue('Casos');
  await expect(block(page, 0)).toHaveClass(/flash/);
  await page.getByRole('button', { name: 'Volver al estudio' }).click();
  await expect(page.locator('[data-grade="3"]')).toBeVisible();
});

// Crea una tarjeta (básica) desde el texto de un bloque, seleccionando «palabra»
async function cardFrom(page, i, palabra, pregunta) {
  await block(page, i).locator('.nb-text').click();
  await page.locator('[data-block-input]').evaluate((t, w) => { const k = t.value.indexOf(w); t.setSelectionRange(k, k + w.length); document.dispatchEvent(new Event('selectionchange')); }, palabra);
  await page.locator('[data-act="sel-card"]').click();
  await page.locator('#fld-q').fill(pregunta);
  await page.locator('.ed-foot button[type="submit"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
}

test('cómo llevas cada parte y estudiar un apartado', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Historia');
  await nav(page, 'Apuntes');
  await page.locator('[data-act="paste-page"]').click();
  await page.locator('#pagePaste').fill('# Revolución\n\n## Fechas\n\nLa Bastilla cayó en 1789.\n\n## Personajes\n\nRobespierre lideró el Terror.');
  await page.locator('[data-act="paste-page-ok"]').click();
  await page.locator('#pgDeck').selectOption({ label: 'Historia' });
  await cardFrom(page, 1, '1789', '¿Año de la Bastilla?');
  await cardFrom(page, 3, 'Robespierre', '¿Quién lideró el Terror?');

  await expect(block(page, 1).locator('.nb-cards')).toHaveClass(/st-new/);
  await expect(page.locator('.pg-status')).toContainText('2 sin estudiar');
  await expect(page.locator('.pg-status [data-start]')).toHaveText('Estudiar este apunte · 2');
  const fechas = block(page, 0);                                  // «## Fechas» (el título del apunte se quitó al pegar)
  await expect(fechas.locator('.nb-sec')).toHaveText('Estudiar 1');

  // Estudiar solo el apartado «Fechas» y fallarla
  await fechas.locator('.nb-sec').click();
  await expect(page.locator('.studybar .where')).toContainText('Fechas');
  await expect(page.locator('.studybar .left')).toHaveText('1 quedan');
  await page.locator('[data-act="reveal"]').click();
  await page.locator('[data-grade="1"]').click();
  await page.locator('.studybar [data-act="exit"]').click();      // vuelve a los apuntes
  await expect(page.locator('#pgTitle')).toHaveValue('Revolución');
  await expect(block(page, 1).locator('.nb-cards')).toHaveClass(/st-weak/);
  await expect(block(page, 3).locator('.nb-cards')).toHaveClass(/st-new/);
  await expect(page.locator('.pg-status')).toContainText('1 te cuesta');
});

test('la chuleta de los apuntes', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Apuntes');
  await page.locator('[data-act="new-page"]').click();
  await page.locator('[data-act="notes-help"]').click();
  await expect(page.getByRole('heading', { name: 'Chuleta de los apuntes' })).toBeVisible();
  await expect(page.locator('#sheetBody')).toContainText('Mayús + Enter');
  await expect(page.locator('#sheetBody .help-pre')).toContainText('| :------- | :----: |');
});

test('pegar unos apuntes enteros', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Apuntes');
  await page.locator('[data-act="paste-page"]').click();
  await page.locator('#pagePaste').fill('# Revolución francesa\n\nEmpezó en 1789.\n\n- Toma de la Bastilla\n- Declaración de derechos\n\n| Año | Hecho |\n|---|---|\n| 1789 | Bastilla |');
  await page.locator('[data-act="paste-page-ok"]').click();
  await expect(page.locator('#pgTitle')).toHaveValue('Revolución francesa');
  expect(await page.locator('#pgBlocks .nb').evaluateAll(els => els.map(e => e.className.replace('nb nb-', '')))).toEqual(['p', 'li', 'li', 'table']);
  await nav(page, 'Apuntes');
  await page.locator('#pageSearch').fill('bastilla');
  await expect(page.locator('#main .list li')).toHaveCount(1);
  await page.locator('#pageSearch').fill('nada');
  await expect(page.locator('#main .list li')).toHaveCount(0);
});
