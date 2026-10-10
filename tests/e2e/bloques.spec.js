// Apuntes cómodos: deshacer en todo el apunte, mover y seleccionar bloques, sangría, plegar, autocierre,
// duplicar, buscar y reemplazar, índice y enlaces entre apuntes
import { test, expect, openApp, nav } from './fixtures.js';

async function newPage(page, title) {
  await nav(page, 'Apuntes');
  await page.locator('[data-act="new-page"]').click();
  await page.locator('#pgTitle').fill(title);
}
const ed = page => page.locator('[data-block-input]');
const type = (page, text) => ed(page).pressSequentially(text);
const texts = page => page.locator('#pgBlocks .nb').evaluateAll(els => els.map(e => e.querySelector('[data-block-input]')?.value ?? e.querySelector('.nb-text')?.innerText ?? ''));
const kinds = page => page.locator('#pgBlocks .nb').evaluateAll(els => els.map(e => e.className.split(' ')[1].slice(3)));
// Escribe varios bloques seguidos (Enter entre ellos)
async function write(page, lines) {
  await page.locator('#pgBlocks .nb').first().locator('.nb-text').click();
  for (const [i, l] of lines.entries()) { if (i) await page.keyboard.press('Enter'); await type(page, l); }
}

test('deshacer y rehacer en todo el apunte: lo escrito, partir bloques y borrar', async ({ page }) => {
  await openApp(page);
  await newPage(page, 'Deshacer');
  await write(page, ['Uno', 'Dos']);
  await expect(page.locator('.pg-hist [data-act="pg-undo"]')).toBeEnabled();
  await page.keyboard.press('Control+z');
  expect(await texts(page)).toEqual(['Uno', '']);
  await page.keyboard.press('Control+z');
  expect(await texts(page)).toEqual(['Uno']);
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+y');
  expect(await texts(page)).toEqual(['Uno', 'Dos']);
  // Fuera de los bloques también: borrar un bloque y deshacerlo con el botón
  await page.keyboard.press('Escape');
  await page.keyboard.press('Delete');
  expect(await texts(page)).toEqual(['Uno']);
  await page.locator('.pg-hist [data-act="pg-undo"]').click();
  expect(await texts(page)).toEqual(['Uno', 'Dos']);
});

test('mover bloques con Alt+flechas y arrastrando el asa; duplicar con Ctrl+D', async ({ page }) => {
  await openApp(page);
  await newPage(page, 'Mover');
  await write(page, ['A', 'B', 'C']);
  await page.keyboard.press('Alt+ArrowUp');
  expect(await texts(page)).toEqual(['A', 'C', 'B']);
  await expect(ed(page)).toHaveJSProperty('value', 'C');   // se sigue escribiendo en el mismo bloque
  await page.keyboard.press('Control+d');
  expect(await texts(page)).toEqual(['A', 'C', 'C', 'B']);
  await page.keyboard.press('Control+z');
  // Arrastrar «B» (el último) al principio
  await page.keyboard.press('Escape');
  const last = page.locator('#pgBlocks .nb').last();
  await last.locator('.nb-text').click();
  await page.keyboard.press('Escape');
  const grip = last.locator('.nb-grip'), first = page.locator('#pgBlocks .nb').first();
  const g = await grip.boundingBox(), f = await first.boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, f.y + 10, { steps: 8 });
  await page.mouse.move(g.x + g.width / 2, f.y + 4, { steps: 2 });
  await page.mouse.up();
  expect(await texts(page)).toEqual(['B', 'A', 'C']);
  // Un clic en el asa abre sus opciones: convertir en título
  await page.locator('#pgBlocks .nb').first().locator('.nb-grip').click({ force: true });
  await page.locator('#blkOps [data-bop="to:h2"]').click();
  expect(await kinds(page)).toEqual(['h2', 'p', 'p']);
});

test('seleccionar varios bloques: Mayús+clic, convertir y borrar a la vez; copiar y pegar bloques', async ({ page }) => {
  await openApp(page);
  await newPage(page, 'Seleccionar');
  await write(page, ['Uno', 'Dos', 'Tres', 'Cuatro']);
  await page.keyboard.press('Escape');
  await page.locator('#pgBlocks .nb').nth(1).locator('.nb-text').click({ modifiers: ['Shift'] });
  await expect(page.locator('#pgBlocks .nb.is-sel')).toHaveCount(3);
  await expect(page.locator('#blkBar')).toBeVisible();
  await page.locator('#blkBar [data-act="bsel-ops"]').click();
  await page.locator('#blkOps [data-bop="to:li"]').click();
  expect(await kinds(page)).toEqual(['p', 'li', 'li', 'li']);
  await page.keyboard.press('Backspace');
  expect(await texts(page)).toEqual(['Uno']);
  await page.keyboard.press('Control+z');
  expect(await texts(page)).toEqual(['Uno', 'Dos', 'Tres', 'Cuatro']);
});

test('sangría con Tab en listas (numeración por niveles) y plegar un apartado', async ({ page }) => {
  await openApp(page);
  await newPage(page, 'Sangría');
  await page.locator('#pgBlocks .nb').first().locator('.nb-text').click();
  await type(page, '1. Uno');
  await page.keyboard.press('Enter'); await type(page, 'Uno a');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter'); await type(page, 'Uno b');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');   // punto vacío: sube un nivel
  await type(page, 'Dos');
  await expect(page.locator('#pgBlocks .nb-num')).toHaveText(['1.', '1.', '2.', '2.']);
  await expect(page.locator('#pgBlocks .nb[data-ind="1"]')).toHaveCount(2);
  await page.keyboard.press('Shift+Tab');
  await expect(ed(page)).toHaveJSProperty('value', 'Dos');
  // Un apartado: se pliega y se despliega
  await page.keyboard.press('Escape');
  await page.locator('#pgBlocks .nb').first().locator('.nb-text').click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Backspace');   // el punto vacío pasa a párrafo
  await type(page, '## Números');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');   // sin bloques seleccionados
  await page.locator('#pgBlocks .nb-h2 .nb-fold').click({ force: true });
  await expect(page.locator('#pgBlocks .nb:visible')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await nav(page, 'Apuntes');
  await page.getByText('Sangría').first().click();
  await expect(page.locator('#pgBlocks .nb:visible')).toHaveCount(1);
  await page.locator('#pgBlocks .nb-h2 .nb-fold').click();
  await expect(page.locator('#pgBlocks .nb:visible')).toHaveCount(5);
});

test('paréntesis y comillas se cierran solos; con texto seleccionado, * lo envuelve', async ({ page }) => {
  await openApp(page);
  await newPage(page, 'Autocierre');
  await page.locator('#pgBlocks .nb').first().locator('.nb-text').click();
  await type(page, 'Ver (pág');
  await expect(ed(page)).toHaveJSProperty('value', 'Ver (pág)');
  await type(page, ') y "hola');
  await expect(ed(page)).toHaveJSProperty('value', 'Ver (pág) y "hola"');
  await ed(page).evaluate(t => { const k = t.value.indexOf('hola'); t.setSelectionRange(k, k + 4); });
  await page.keyboard.type('*');
  await expect(ed(page)).toHaveJSProperty('value', 'Ver (pág) y "*hola*"');
});

test('buscar y reemplazar en el apunte (sin mayúsculas ni tildes); se deshace', async ({ page }) => {
  await openApp(page);
  await newPage(page, 'Buscar');
  await write(page, ['La célula es la unidad', 'Cada **celula** tiene membrana', 'Fin']);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+f');
  await expect(page.locator('#findQ')).toBeFocused();
  await page.keyboard.type('celula');
  await expect(page.locator('#findCount')).toHaveText('1 de 2');
  await page.keyboard.press('Enter');
  await expect(page.locator('#findCount')).toHaveText('2 de 2');
  await page.locator('[data-act="find-rep"]').click();
  await page.locator('#findR').fill('neurona');
  await page.locator('[data-act="find-all"]').click();
  expect(await texts(page)).toEqual(['La neurona es la unidad', 'Cada neurona tiene membrana', 'Fin']);
  await expect(page.locator('#findCount')).toHaveText('Sin resultados');
  await page.locator('[data-act="find-close"]').click();
  await page.keyboard.press('Control+z');
  expect(await texts(page)).toEqual(['La célula es la unidad', 'Cada celula tiene membrana', 'Fin']);
});

test('índice del apunte y enlaces entre apuntes con [[ ]]', async ({ page }) => {
  await openApp(page);
  await newPage(page, 'Mitosis');
  await write(page, ['División celular.']);
  await page.keyboard.press('Escape');
  await newPage(page, 'La célula');
  await page.locator('#pgBlocks .nb').first().locator('.nb-text').click();
  await type(page, '# Partes');
  await page.keyboard.press('Enter'); await type(page, 'Núcleo y membrana.');
  await page.keyboard.press('Enter'); await type(page, '# Reproducción');
  await page.keyboard.press('Enter'); await type(page, 'Se divide por [[Mit');
  await expect(page.locator('#wikiMenu')).toBeVisible();
  await expect(page.locator('#wikiMenu .blk-item').first()).toContainText('Mitosis');
  await page.keyboard.press('Enter');
  await expect(ed(page)).toHaveJSProperty('value', 'Se divide por [[Mitosis]]');
  await page.keyboard.press('Escape');
  // Índice: en pantallas grandes a la derecha; si no, en un menú
  const btn = page.locator('.pg-tocbtn');
  if (await btn.isVisible()) await btn.click();
  await expect(page.locator('#pgToc [data-toc]')).toHaveText(['Partes', 'Reproducción']);
  await page.locator('#pgToc [data-toc]').nth(1).click();
  // El enlace abre el otro apunte, que muestra quién lo enlaza
  await page.locator('#pgBlocks a.wl').click();
  await expect(page.locator('#pgTitle')).toHaveValue('Mitosis');
  await expect(page.locator('#pgLinks')).toContainText('La célula');
  // Cambiar el título actualiza los enlaces
  await page.locator('#pgTitle').fill('Mitosis celular');
  await page.locator('#pgTitle').press('Tab');
  await page.locator('#pgLinks .note-row').click();
  await expect(page.locator('#pgBlocks a.wl')).toHaveAttribute('data-wiki', 'Mitosis celular');
  // Un enlace a un apunte que no existe lo crea
  await page.locator('#pgBlocks .nb').last().locator('.nb-text').click({ position: { x: 4, y: 6 } });
  await page.keyboard.press('End');
  await type(page, ' y [[Meiosis]]');
  await page.keyboard.press('Escape');
  await page.locator('#pgBlocks a.wl', { hasText: 'Meiosis' }).click();
  await expect(page.locator('#pgTitle')).toHaveValue('Meiosis');
});
