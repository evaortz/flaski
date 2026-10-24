// Apuntes: escribir por bloques, tablas, crear tarjetas desde lo seleccionado y volver a ellos al estudiar
import { test, expect, openApp, nav, createDeck, pasteNotes } from './fixtures.js';
import { makePdf } from '../pdf-fixture.js';

async function newPage(page, title) {
  await nav(page, 'Biblioteca');
  await page.locator('[data-act="new-page"]').click();
  await page.locator('#pgTitle').fill(title);
}
const block = (page, i) => page.locator('#pgBlocks .nb').nth(i);
// «+ Bloque» y elegir el tipo en el menú
async function addBlock(page, type) {
  await page.locator('[data-act="block-menu"]').click();
  await page.locator(`#blockMenu [data-block-type="${type}"]`).click();
}
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
  expect(await page.locator('#pgBlocks .nb').evaluateAll(els => els.map(e => e.className.split(' ')[1].slice(3)))).toEqual(['h1', 'p', 'li', 'li', 'p']);
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
  await expect(block(page, 3)).toHaveClass(/(^| )nb-p( |$)/);

  // Se guarda: al volver a la lista y abrirlo sigue igual
  await page.reload();
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await nav(page, 'Biblioteca');
  await page.getByRole('button', { name: /Casos del turco/ }).click();
  await expect(page.locator('#pgBlocks .nb')).toHaveCount(4);
  await expect(block(page, 0)).toHaveText('Locativo');
  await expect(block(page, 3)).toHaveClass(/(^| )nb-p( |$)/);
});

test('tablas: se escriben celda a celda (Tab, Enter, filas y columnas, pegar de una hoja de cálculo) y se guardan', async ({ page }) => {
  await openApp(page);
  await newPage(page, 'Tabla');
  await addBlock(page, 'table');
  const cell = (r, c) => page.locator(`.tc[data-r="${r}"][data-c="${c}"]`);
  await expect(cell('h', 0)).toBeFocused();
  await page.keyboard.type('Caso');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Sufijo');
  await page.keyboard.press('Tab');                 // a la primera fila
  await page.keyboard.type('Locativo');
  await page.keyboard.press('Tab');
  await page.keyboard.type('-de | -da');            // una barra dentro de la celda
  await page.keyboard.press('Enter');               // fila de abajo
  await page.keyboard.type('-den');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('Ablativo');
  await page.keyboard.press('Enter');               // última fila: crea otra
  await expect(page.locator('.tbl-grid tbody tr')).toHaveCount(3);
  // Columna nueva a la derecha (menú de la columna) y pegar dos filas desde una hoja de cálculo
  await cell(0, 1).click();
  await page.locator('.tbl-colbtn.cur').click();
  await page.locator('#tblMenu [data-tbl="col-right"]').click();
  await expect(cell(0, 2)).toBeFocused();
  await page.evaluate(() => {
    const dt = new DataTransfer(); dt.setData('text/plain', 'evde\nevden\n');
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(cell(1, 2)).toHaveValue('evden');
  await cell('h', 2).fill('Ejemplo');
  // Quitar la fila vacía del final (menú de la fila)
  await cell(2, 0).click();
  await page.locator('.tbl-rown.cur').click();
  await page.locator('#tblMenu [data-tbl="row-del"]').click();
  await expect(page.locator('.tbl-grid tbody tr')).toHaveCount(2);
  // Ordenar por la primera columna
  await cell(0, 0).click();
  await page.locator('.tbl-colbtn.cur').click();
  await page.locator('#tblMenu [data-tbl="sort-asc"]').click();
  await expect(cell(0, 0)).toHaveValue('Ablativo');
  await page.locator('.tbl-colbtn.cur').click();
  await page.locator('#tblMenu [data-tbl="sort-desc"]').click();
  await expect(cell(0, 0)).toHaveValue('Locativo');
  await page.locator('[data-tbl="done"]').click();
  const table = page.locator('#pgBlocks table');
  await expect(table.locator('th')).toHaveText(['Caso', 'Sufijo', 'Ejemplo']);
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('tbody tr').first().locator('td')).toHaveText(['Locativo', '-de | -da', 'evde']);
  // Tocar una celda la vuelve a abrir en esa celda; y sigue así al recargar
  await table.locator('tbody tr').nth(1).locator('td').nth(1).click();
  await expect(cell(1, 1)).toBeFocused();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await nav(page, 'Biblioteca');
  await page.getByText('Tabla').first().click();
  await expect(page.locator('#pgBlocks table tbody tr').nth(1).locator('td')).toHaveText(['Ablativo', '-den', 'evden']);
});

test('tablas como texto: sigue pudiendo escribirse en Markdown', async ({ page }) => {
  await openApp(page);
  await newPage(page, 'Tabla');
  await addBlock(page, 'table');
  await page.locator('[data-tbl="raw"]').click();
  const t = page.locator('[data-block-input]');
  await t.fill('| Caso | Sufijo |\n| --- | :---: |\n| Locativo | -de |');
  await t.press('Control+End');
  await page.keyboard.press('Enter');           // fila nueva con sus celdas
  await expect(t).toHaveValue('| Caso | Sufijo |\n| --- | :---: |\n| Locativo | -de |\n|  |  |');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pgBlocks table th')).toHaveText(['Caso', 'Sufijo']);
  // Pegar texto con una tabla en un párrafo también la crea
  await addBlock(page, 'p');
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
  await page.locator('#nav').getByRole('button', { name: 'Hoy' }).click();
  await page.getByRole('button', { name: 'Empezar una tanda' }).click();
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
  await nav(page, 'Biblioteca');
  await pasteNotes(page, '# Revolución\n\n## Fechas\n\nLa Bastilla cayó en 1789.\n\n## Personajes\n\nRobespierre lideró el Terror.');
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
  await expect(page.locator('.studybar .left')).toContainText('pregunta 1 de 1');
  await page.locator('[data-act="reveal"]').click();
  await page.locator('[data-grade="1"]').click();
  await page.locator('.studybar [data-act="exit"]').click();      // vuelve a los apuntes
  await expect(page.locator('#pgTitle')).toHaveValue('Revolución');
  await expect(block(page, 1).locator('.nb-cards')).toHaveClass(/st-weak/);
  await expect(block(page, 3).locator('.nb-cards')).toHaveClass(/st-new/);
  await expect(page.locator('.pg-status')).toContainText('1 te cuesta');
});

test('la guía de formato y atajos de los apuntes', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  await page.locator('[data-act="new-page"]').click();
  await page.locator('[data-act="notes-help"]').click();
  await expect(page.getByRole('heading', { name: 'Formato y atajos' })).toBeVisible();
  await expect(page.locator('#sheetBody')).toContainText('Mayús + Enter');
  await expect(page.locator('#sheetBody .help-pre')).toContainText('| :------- | :----: |');
  // Por pestañas: se empieza por lo básico
  await expect(page.locator('[data-help-sec="basico"]')).toBeVisible();
  await expect(page.locator('[data-help-sec="teclado"]')).toBeHidden();
  await page.locator('[data-help-tab="teclado"]').click();
  await expect(page.locator('[data-help-sec="teclado"]')).toContainText('Duplicar');
  // El buscador filtra entre todos los apartados
  await page.locator('#helpQ').fill('tachado');
  await expect(page.locator('#helpBody .help-item:visible')).toHaveCount(2);
  await page.locator('#helpQ').fill('xyzw');
  await expect(page.locator('.help-none')).toBeVisible();
});

async function pastePage(page, text) {
  await pasteNotes(page, text);
}

test('carpetas: una sola por tema, con apuntes y listas dentro; crear y mover apuntes', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  await pastePage(page, '# Primer apunte\n\nTexto.');
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="new-folder"]').click();
  await page.locator('#fo-name').fill('Turco');
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Turco' })).toBeVisible();      // ya dentro de la carpeta
  await pastePage(page, '# Casos\n\nEl locativo.');                                        // se crea dentro
  await expect(page.locator('.pg-top .crumbs')).toHaveText(/Biblioteca\s*\/\s*Turco\s*\/\s*Casos/);
  await page.locator('.pg-top .crumbs [data-nfolder=""]').click();
  await expect(page.locator('#main .ltiles li')).toHaveCount(1);                          // en la raíz, solo el primero (suelto)
  await expect(page.locator('#main .lfold')).toHaveCount(1);                              // la carpeta sale una sola vez
  await expect(page.locator('#main .lfold')).toContainText('1 apunte');

  // Mover el primero a la carpeta desde sus propiedades
  await page.getByRole('button', { name: /Primer apunte/ }).click();
  await page.locator('#pgFolder').selectOption({ label: 'Turco' });
  await expect(page.locator('.pg-top .crumbs')).toContainText('Turco');
  await page.locator('.pg-top .crumbs [data-nfolder=""]').click();
  await expect(page.locator('#main .lfold')).toContainText('2 apuntes');
  await expect(page.locator('#main .ltiles')).toHaveCount(0);

  // Una lista dentro de la carpeta con el botón de crear: sale junto a los apuntes
  await page.locator('#main .lfold').click();
  await page.locator('#main [data-act="create-menu"]').click();
  await expect(page.locator('#sheetBody [data-act]')).toHaveCount(2);                     // Apunte o Lista
  await page.locator('#sheetBody [data-act="new-deck"]').click();
  await page.locator('#d-name').fill('Vocabulario');
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Vocabulario' })).toBeVisible();
  await page.locator('#main .crumbs [data-folder]', { hasText: 'Turco' }).click();
  await expect(page.locator('#main .ltiles li')).toHaveCount(3);
  await expect(page.locator('#main .fhero')).toContainText('2 apuntes · 1 lista');
  await page.locator('[data-libkind="lists"]').click();
  await expect(page.locator('#main .ltiles .lt-name')).toHaveText(['Vocabulario']);
  await page.locator('[data-libkind="notes"]').click();
  await expect(page.locator('#main .ltiles .lt-name')).toHaveText(['Primer apunte', 'Casos']);
  await nav(page, 'Biblioteca');
  await expect(page.locator('#main .lfold')).toContainText('2 apuntes · 1 lista');
  await expect(page.locator('#main [data-act="new-folder"]')).toHaveCount(1);             // un solo «+ Carpeta»
});

test('borrar una carpeta no pierde sus apuntes ni sus listas: pasan a sueltos', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="new-folder"]').click();
  await page.locator('#fo-name').fill('Turco');
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  await pastePage(page, '# Casos\n\nEl locativo.');
  await page.locator('.pg-top .crumbs [data-nfolder]', { hasText: 'Turco' }).click();
  await page.locator('#main [data-act="edit-folder"]').click();
  await page.locator('[data-act="ask-delete-folder"]').click();
  await page.locator('#sheetBody [data-act="delete-folder"]').click();
  await expect(page.locator('#main .lfold')).toHaveCount(0);
  await expect(page.locator('#main .ltiles .lt-name')).toHaveText(['Casos']);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('flaski-local-v1')).pages.map(p => p.folder_id));
  await expect.poll(stored).toEqual([null]);
  await page.reload();
  await nav(page, 'Biblioteca');
  await expect(page.locator('#main .ltiles .lt-name')).toHaveText(['Casos']);
});

test('color de la carpeta: cobalto si no se elige ninguno; si no, el elegido', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  for (const [name, color] of [['Turco', ''], ['Macro', 'green']]) {
    await page.locator('#main [data-act="new-folder"]').click();
    await page.locator('#fo-name').fill(name);
    if (color) await page.locator(`input[name="f-color"][value="${color}"]`).check({ force: true });
    await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('#main .fhero')).toHaveAttribute('style', color ? `--fold:var(--c-${color})` : '--fold:var(--accent)');
    await nav(page, 'Biblioteca');
  }
  await expect(page.locator('#main .lfold', { hasText: 'Turco' })).toHaveAttribute('style', '--fold:var(--accent)');
  await expect(page.locator('#main .lfold', { hasText: 'Macro' })).toHaveAttribute('style', '--fold:var(--c-green)');
});

test('dibujo de carpeta: se elige junto a los emojis y asoma en la tarjeta; sin dibujo, su emoji', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="new-folder"]').click();
  await page.locator('#fo-name').fill('Macro');
  // Tres maneras: Emoji (por defecto) · Dibujos de Flaski · Tu imagen
  await expect(page.locator('[data-icon-tab]')).toHaveText(['Emoji', 'Dibujos de Flaski', 'Tu imagen']);
  await expect(page.locator('[data-icon-tab="emoji"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-icon-tab="draw"]').click();
  await expect(page.locator('.draw-pick [data-drawing]')).toHaveCount(8);
  await page.locator('[data-drawing="d:economia"]').click();
  await expect(page.locator('.icon-current img')).toHaveAttribute('src', 'img/carpetas/economia.svg');
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#main .fhero .lfold-draw')).toHaveAttribute('src', 'img/carpetas/economia.svg');
  await expect(page.locator('#main .lib-top .crumbs')).not.toContainText('d:');
  await pasteNotes(page, '# Tema 1\n\nTexto.');
  await expect(page.locator('.pg-top .crumbs')).toHaveText(/Biblioteca\s*\/\s*Macro\s*\/\s*Tema 1/);
  await nav(page, 'Biblioteca');
  const card = page.locator('#main .lfold', { hasText: 'Macro' });
  await expect(card.locator('img.lfold-draw')).toHaveAttribute('src', 'img/carpetas/economia.svg');
  expect(await card.locator('img.lfold-draw').evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);   // el archivo existe
  // Quitar el dibujo y poner un emoji: asoma el emoji
  await card.click();
  await page.locator('#main [data-act="edit-folder"]').click();
  await expect(page.locator('[data-drawing="d:economia"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-act="clear-icon"]').click();
  await page.locator('[data-act="toggle-emoji"]').first().click();
  await page.locator('#emojiPanel [data-emoji]').first().click();
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#main .fhero img.lfold-draw')).toHaveCount(0);
  await expect(page.locator('#main .fhero span.lfold-deco')).not.toBeEmpty();
});

test('icono de carpeta con tu imagen: se recorta cuadrada a 256 px, asoma en la carpeta y sigue ahí al recargar', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-act="new-folder"]').click();
  await page.locator('#fo-name').fill('Viajes');
  await page.locator('[data-icon-tab="img"]').click();
  // Una foto apaisada de 600×300
  const png = await page.evaluate(async () => {
    const c = Object.assign(document.createElement('canvas'), { width: 600, height: 300 });
    const g = c.getContext('2d'); g.fillStyle = '#e33'; g.fillRect(0, 0, 600, 300); g.fillStyle = '#33e'; g.fillRect(150, 0, 300, 300);
    return [...new Uint8Array(await (await new Promise(ok => c.toBlob(ok, 'image/png'))).arrayBuffer())];
  });
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-act="folder-image"]').click();
  await (await chooser).setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await expect(page.locator('#f-icon')).toHaveValue(/^i:[\w-]{14}$/);
  const shown = page.locator('.icon-current img.own-ic');
  await expect(shown).toHaveAttribute('src', /^blob:/);
  // Cuadrada, de 256 px y recortada por el centro (azul)
  expect(await shown.evaluate(async i => { await i.decode(); return [i.naturalWidth, i.naturalHeight]; })).toEqual([256, 256]);
  const mid = await shown.evaluate(i => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return [...g.getImageData(10, 128, 1, 1).data.slice(0, 3)]; });
  expect(mid[2]).toBeGreaterThan(150);
  await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#main .fhero img.lfold-draw.own-ic')).toHaveAttribute('src', /^blob:/);
  await page.reload();
  await nav(page, 'Biblioteca');
  const card = page.locator('#main .lfold', { hasText: 'Viajes' });
  await expect(card.locator('img.own-ic')).toHaveAttribute('src', /^blob:/);
  // Asoma por la esquina sin salirse de la carpeta: lo de fuera se corta
  const [cb, clip] = [await card.boundingBox(), await card.locator('.lfold-clip').boundingBox()];
  expect(clip).toEqual(cb);
  await expect(card.locator('.lfold-clip')).toHaveCSS('overflow', 'hidden');
  // Al editarla, se abre en «Tu imagen»
  await card.click();
  await page.locator('#main [data-act="edit-folder"]').click();
  await expect(page.locator('[data-icon-tab="img"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-act="folder-image"]')).toContainText('Cambiar la imagen');
});

test('etiquetas, buscar y ordenar en la Biblioteca', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  await pastePage(page, '# Beta\n\nVerbos irregulares.');
  await page.locator('[data-act="page-tags"]').click();
  await page.locator('#f-newtag').fill('examen');
  await page.locator('[data-act="add-tag-inline"]').click();
  await page.locator('[data-act="save-page-tags"]').click();
  await expect(page.locator('.pg-props')).toContainText('examen');
  await nav(page, 'Biblioteca');
  await pastePage(page, '# Alfa\n\nSustantivos.');
  await nav(page, 'Biblioteca');

  await expect(page.locator('#main .ltiles .lt-name')).toHaveText(['Alfa', 'Beta']);       // editados recientemente
  await page.locator('#libSort').selectOption('name');
  await expect(page.locator('#main .ltiles .lt-name')).toHaveText(['Alfa', 'Beta']);
  await page.locator('[data-tagfilter]', { hasText: 'examen' }).click();
  await expect(page.locator('#main .ltiles .lt-name')).toHaveText(['Beta']);
  await page.locator('[data-act="clear-filters"]').click();
  await page.locator('#libSearch').fill('sustantivos');
  await expect(page.locator('#main .ltiles .lt-name')).toHaveText(['Alfa']);
});

test('icono, descargar en Markdown y acceso a los apuntes desde el mazo', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Historia');
  await nav(page, 'Biblioteca');
  await pastePage(page, '# Revolución\n\n## Fechas\n\n- 1789\n- 1793');
  await page.locator('#pgDeck').selectOption({ label: 'Historia' });
  await page.locator('[data-act="page-icon"]').click();
  await page.locator('[data-act="toggle-emoji"]').first().click();
  await page.locator('#emojiPanel [data-emoji]').first().click();
  await page.locator('[data-act="save-page-icon"]').click();
  await expect(page.locator('.pg-icon')).toBeVisible();

  await page.locator('[data-act="page-menu"]').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), (async () => { await page.locator('[data-act="export-page"]').click(); await page.locator('[data-export="md"]').click(); })()]);
  expect(dl.suggestedFilename()).toBe('Revolución.md');
  const { readFile } = await import('node:fs/promises');
  expect(await readFile(await dl.path(), 'utf8')).toBe('# Revolución\n\n## Fechas\n\n- 1789\n- 1793\n');

  await nav(page, 'Biblioteca');
  await page.getByRole('button', { name: /Historia/ }).first().click();
  await page.locator('.deck-notes [data-page]').click();
  await expect(page.locator('#pgTitle')).toHaveValue('Revolución');
});

test('pegar unos apuntes enteros', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  await pasteNotes(page, '# Revolución francesa\n\nEmpezó en 1789.\n\n- Toma de la Bastilla\n- Declaración de derechos\n\n| Año | Hecho |\n|---|---|\n| 1789 | Bastilla |');
  await expect(page.locator('#pgTitle')).toHaveValue('Revolución francesa');
  expect(await page.locator('#pgBlocks .nb').evaluateAll(els => els.map(e => e.className.split(' ')[1].slice(3)))).toEqual(['p', 'li', 'li', 'table', 'p']);   // detrás de una tabla, un párrafo para seguir escribiendo
  await nav(page, 'Biblioteca');
  await page.locator('#libSearch').fill('bastilla');
  await expect(page.locator('#main .ltiles li')).toHaveCount(1);
  await page.locator('#libSearch').fill('nada');
  await expect(page.locator('#main .ltiles li')).toHaveCount(0);
});

// Imagen de 2×2 píxeles
const PNG = { name: 'mapa.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64') };

test('imágenes: en una tarjeta y en los apuntes con su pie; siguen ahí al recargar', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Geografía');
  // En una tarjeta: con el botón de la barra de formato, en el campo activo
  await page.locator('#main [data-act="new-card"]').click();
  await page.locator('#fld-q').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-fmt="image"]').click();
  await (await chooser).setFiles(PNG);
  await expect(page.locator('#fld-q')).toHaveValue(/^!\[\]\(img:[a-z0-9]+\)$/);
  await expect(page.locator('#pvBody img.media')).toHaveAttribute('src', /^blob:/);
  await page.locator('#fld-a').fill('Turquía');
  await page.locator('.ed-foot button[type="submit"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#main .row img.media')).toHaveAttribute('src', /^blob:/);

  // En los apuntes: un bloque de imagen con su pie
  await newPage(page, 'Mapas');
  const chooser2 = page.waitForEvent('filechooser');
  await addBlock(page, 'img');
  await (await chooser2).setFiles(PNG);
  const fig = page.locator('#pgBlocks .nb-img');
  await expect(fig.locator('img.media')).toHaveAttribute('src', /^blob:/);
  await fig.locator('.nb-text').click();
  await type(page, 'Mapa de Turquía');
  await page.keyboard.press('Escape');
  await expect(fig.locator('figcaption')).toHaveText('Mapa de Turquía');

  await page.reload();
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await nav(page, 'Biblioteca');
  await page.getByText('Mapas').first().click();
  const img = page.locator('#pgBlocks .nb-img img.media');
  await expect(img).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => img.evaluate(i => i.complete && i.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('#pgBlocks .nb-img figcaption')).toHaveText('Mapa de Turquía');
});

test('más tipos de bloque: atajos, menú /, casillas, destacado, código y separador; y vuelta a Markdown', async ({ page }) => {
  await openApp(page);
  await newPage(page, 'Bloques');
  await block(page, 0).locator('.nb-text').click();
  await type(page, '### Apartado');
  await page.keyboard.press('Enter');
  await type(page, '1. uno');
  await page.keyboard.press('Enter');
  await type(page, 'dos');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');            // fin de la lista numerada
  await type(page, '[] repasar');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  // Menú /: se filtra escribiendo y se elige con Enter
  await type(page, '/desta');
  await expect(page.locator('#blockMenu .blk-item')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await type(page, 'Ojo con esto');
  await page.keyboard.press('Enter');
  await type(page, '```');
  await type(page, 'x = 1');
  await page.keyboard.press('Enter');
  await type(page, 'y = 2');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');            // línea vacía al final: sale del código
  await type(page, '---');
  await type(page, 'Fin');
  await page.keyboard.press('Escape');

  const types = await page.locator('#pgBlocks .nb').evaluateAll(els => els.map(e => e.className.split(' ')[1].slice(3).replace(' is-done', '')));
  expect(types).toEqual(['h3', 'ol', 'ol', 'todo', 'callout', 'code', 'hr', 'p']);
  await expect(page.locator('#pgBlocks .nb-num')).toHaveText(['1.', '2.']);
  await expect(page.locator('#pgBlocks pre.nb-code')).toHaveText('x = 1\ny = 2');
  // Marcar la casilla y cambiar el icono del destacado
  await page.locator('#pgBlocks .nb-check').click();
  await expect(page.locator('#pgBlocks .nb-todo')).toHaveClass(/is-done/);
  await page.locator('#pgBlocks .nb-icon').click();
  await expect(page.locator('#pgBlocks .nb-icon')).toHaveText('⚠️');

  // Se guarda y vuelve igual al recargar
  await page.reload();
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await nav(page, 'Biblioteca');
  await page.getByText('Bloques').first().click();
  await expect(page.locator('#pgBlocks .nb-todo')).toHaveClass(/is-done/);
  await expect(page.locator('#pgBlocks .nb')).toHaveCount(8);
});

test('importar un PDF desde el menú de un apunte: títulos, párrafos, listas, tablas y páginas escaneadas como imagen', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  await page.locator('[data-act="new-page"]').first().click();
  await page.locator('[data-act="page-menu"]').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#sheetBody [data-act="import-into-page"]').click();
  await (await chooser).setFiles({ name: 'casos.pdf', mimeType: 'application/pdf', buffer: makePdf() });
  // Después de importar se ofrecen las tarjetas sugeridas
  await expect(page.locator('#sheetBody')).toContainText('Preguntas sugeridas');
  await page.locator('#sheetBody [data-act="close-sheet"]').first().click();
  await expect(page.locator('#pgTitle')).toHaveValue('Los casos del turco');
  const blocks = page.locator('#pgBlocks .nb');
  await expect(page.locator('#pgBlocks .nb-img')).toHaveCount(1);
  expect(await blocks.evaluateAll(els => els.map(e => e.className.split(' ')[1].slice(3)))).toEqual(['h2', 'p', 'h3', 'li', 'li', 'table', 'img']);
  await expect(blocks.nth(0)).toHaveText('El locativo');
  await expect(blocks.nth(1)).toHaveText('El locativo indica dónde está algo. Se forma con el sufijo -de o -da según la armonía vocálica.');
  await expect(blocks.nth(4)).toHaveText('okulda: en la escuela');
  await expect(page.locator('#pgBlocks table th')).toHaveText(['Caso', 'Sufijo', 'Ejemplo']);
  await expect(page.locator('#pgBlocks table tbody tr')).toHaveCount(2);
  await expect(page.locator('#pgBlocks .nb-img img.media')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('#pgBlocks .nb-img figcaption')).toHaveText('Página 2');

  // Otra vez en el mismo apunte: se añade al final
  await page.locator('[data-act="page-menu"]').click();
  await expect(page.locator('#sheetBody')).toContainText('se añade al final');
  const chooser2 = page.waitForEvent('filechooser');
  await page.locator('#sheetBody [data-act="import-into-page"]').click();
  await (await chooser2).setFiles({ name: 'casos.pdf', mimeType: 'application/pdf', buffer: makePdf() });
  await expect(page.locator('#sheetBody')).toContainText('Preguntas sugeridas');
  await page.locator('#sheetBody [data-act="close-sheet"]').first().click();
  await expect(page.locator('#pgBlocks .nb-img')).toHaveCount(2);
  await expect(blocks).toHaveCount(15);   // lo añadido va encabezado por el título del PDF
  await expect(blocks.nth(7)).toHaveText('Los casos del turco');
});

test('sugerir tarjetas: propone las claras ya marcadas, se retocan y se crean enlazadas a su parte del apunte', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Biología');
  await newPage(page, 'La célula');
  await page.locator('#pgDeck').selectOption({ label: 'Biología' });
  await page.locator('#pgBlocks .nb').first().locator('.nb-text').click();
  await page.locator('[data-block-input]').evaluate((t, v) => { t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); }, 'x');
  await page.keyboard.press('Escape');
  // Pegar unos apuntes con definición, negrita, pasos y una frase sin nada que preguntar
  await page.locator('#pgBlocks .nb').first().locator('.nb-text').click();
  await page.locator('[data-block-input]').fill('');
  await page.evaluate(() => {
    const t = document.querySelector('[data-block-input]');
    const dt = new DataTransfer();
    dt.setData('text/plain', 'Mitosis: división de una célula en dos células hijas.\n\nLa **membrana** protege la célula.\n\n## Fases de la mitosis\n\n1. Profase\n2. Metafase\n3. Anafase\n\nMe gusta mucho este tema.');
    t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.keyboard.press('Escape');
  await page.locator('[data-act="suggest-cards"]').first().click();
  const items = page.locator('.sug');
  await expect(items).toHaveCount(3);
  await expect(page.locator('.sug.on')).toHaveCount(3);
  await expect(items.nth(0)).toContainText('Mitosis');
  await expect(items.nth(1)).toContainText('La […] protege la célula.');
  await expect(items.nth(2)).toContainText('Ordena: fases de la mitosis');
  // Filtro por tipo de tarjeta
  await page.locator('[data-sug-type="cloze"]').click();
  await expect(items).toHaveCount(2);
  await page.locator('[data-sug-type="cloze"]').click();
  await expect(items).toHaveCount(3);
  // Editar con el mismo editor que «+ Tarjeta»: se guarda en la sugerencia y se vuelve a la lista
  await items.nth(0).locator('[data-sug-open]').click();
  await expect(page.locator('.ed-title')).toContainText('Editar sugerencia');
  await expect(page.locator('#fld-q')).toHaveValue('Mitosis');
  await page.locator('#fld-q').fill('¿Qué es la mitosis?');
  await page.locator('.ed-foot button[type="submit"]').click();
  await expect(page.locator('#sheetBody')).toContainText('Preguntas sugeridas');
  await expect(items.nth(0)).toContainText('¿Qué es la mitosis?');
  // Cerrar el editor sin guardar también vuelve a la lista
  await items.nth(2).locator('[data-sug-open]').click();
  await page.locator('.ed-x').click();
  await expect(page.locator('#sheetBody')).toContainText('Preguntas sugeridas');
  await items.nth(1).locator('[data-sug]').uncheck();
  await expect(page.locator('[data-act="sug-create"]')).toHaveText('Crear 2 preguntas');
  await page.locator('[data-act="sug-create"]').click();
  await expect(page.locator('#toast')).toContainText('2 preguntas creadas en «Biología»');
  await expect(page.locator('#pgBlocks .nb-cards')).toHaveCount(2);
  // Al pedirlas otra vez, ya no propone lo que es tarjeta
  await page.locator('[data-act="suggest-cards"]').first().click();
  await expect(page.locator('.sug')).toHaveCount(1);
});

test('sugerencias: la lista se desplaza con la rueda del ratón', async ({ page }) => {
  await openApp(page);
  await newPage(page, 'Muchas');
  await page.locator('#pgBlocks .nb').first().locator('.nb-text').click();
  const md = Array.from({ length: 30 }, (_, i) => `Término ${i + 1}: definición número ${i + 1} del tema.`).join('\n\n');
  await page.evaluate(v => {
    const dt = new DataTransfer(); dt.setData('text/plain', v);
    document.querySelector('[data-block-input]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, md);
  await page.keyboard.press('Escape');
  await page.locator('[data-act="suggest-cards"]').first().click();
  await expect(page.locator('.sug')).toHaveCount(30);
  const main = page.locator('#sugMain');
  const box = await main.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 900);
  await expect.poll(() => main.evaluate(el => el.scrollTop)).toBeGreaterThan(200);
});
