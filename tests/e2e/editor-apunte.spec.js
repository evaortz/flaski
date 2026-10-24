// Editor de apuntes: barra de lo seleccionado (cobalto), panel «Nueva pregunta» y estado en el margen
import { test, expect, openApp, nav, createDeck, pasteNotes } from './fixtures.js';

const NOTES = '# Política monetaria\n\n## La cadena\n\nSi suben los tipos, el crédito sale más caro.\n\n## Otra parte\n\nNada que preguntar aquí.';
const ed = page => page.locator('[data-block-input]');
const block = (page, i) => page.locator('#pgBlocks .nb').nth(i);
// Edita el bloque i y selecciona la palabra w (como al arrastrar el dedo o el ratón)
async function select(page, i, w) {
  if (!(await ed(page).count())) await block(page, i).locator('.nb-text').click();
  await ed(page).evaluate((t, w) => { const k = t.value.indexOf(w); t.setSelectionRange(k, k + w.length); document.dispatchEvent(new Event('selectionchange')); }, w);
  await expect(page.locator('#selBar')).toBeVisible();
}
async function setup(page) {
  await openApp(page);
  await createDeck(page, 'Economía');
  await nav(page, 'Biblioteca');
  await pasteNotes(page, NOTES);
  await page.locator('#pgDeck').selectOption({ label: 'Economía' });
}

test('barra de lo seleccionado: cobalto; pulsarla no quita la selección y se puede deshacer', async ({ page }, info) => {
  await setup(page);
  await select(page, 1, 'crédito');
  const bar = page.locator('#selBar');
  await expect(bar).toHaveCSS('background-color', 'rgb(47, 61, 181)');
  await expect(bar.locator('.sb-card')).toHaveText('＋ Crear pregunta');
  await expect(bar.locator('.sb-cloze')).toHaveText('Hueco');
  if (info.project.name === 'escritorio') {
    for (const k of ['b', 'i', 'u', 's', 'code']) await expect(bar.locator(`[data-nfmt="${k}"]`)).toBeVisible();
    await expect(bar.locator('[data-act="fmt-colors"]')).toBeVisible();
    await expect(bar.locator('[data-act="fmt-more"]')).toBeHidden();
  } else {
    // En el móvil, lo que no cabe va en «…» (y sigue funcionando sin perder la selección)
    await expect(bar.locator('[data-nfmt="u"]')).toBeHidden();
    await bar.locator('[data-act="fmt-more"]').click();
    await page.locator('#fmtMore [data-nfmt="u"]').click();
    await expect(ed(page)).toHaveJSProperty('value', 'Si suben los tipos, el <u>crédito</u> sale más caro.');
    await expect(ed(page)).toBeFocused();
    await page.keyboard.press('Control+z');
    await expect(ed(page)).toHaveJSProperty('value', 'Si suben los tipos, el crédito sale más caro.');
    await select(page, 1, 'crédito');
  }
  // Negrita con un clic de verdad: el editor sigue activo y con lo mismo seleccionado
  await bar.locator('[data-nfmt="b"]').click();
  await expect(ed(page)).toHaveJSProperty('value', 'Si suben los tipos, el **crédito** sale más caro.');
  await expect(ed(page)).toBeFocused();
  expect(await ed(page).evaluate(t => t.value.slice(t.selectionStart, t.selectionEnd))).toBe('crédito');
  // Otro botón seguido, sobre la misma selección
  await bar.locator('[data-nfmt="i"]').click();
  await expect(ed(page)).toHaveJSProperty('value', 'Si suben los tipos, el ***crédito*** sale más caro.');
  // Deshacer paso a paso
  await page.keyboard.press('Control+z');
  await expect(ed(page)).toHaveJSProperty('value', 'Si suben los tipos, el **crédito** sale más caro.');
  await page.keyboard.press('Control+z');
  await expect(ed(page)).toHaveJSProperty('value', 'Si suben los tipos, el crédito sale más caro.');
});

test('crear pregunta: panel a la derecha en el ordenador, hoja desde abajo en el móvil; el apunte sigue a la vista', async ({ page }, info) => {
  await setup(page);
  await select(page, 1, 'crédito');
  await page.locator('#selBar [data-act="sel-cloze"]').click();
  // «Hueco» hace lo de siempre: el hueco en el texto del bloque
  await expect(page.locator('#fld-x')).toHaveValue('Si suben los tipos, el {{crédito}} sale más caro.');
  const sheet = page.locator('#sheet');
  await expect(sheet).toHaveClass(/sheet-side/);
  await expect(page.locator('.ed-title > span')).toHaveText('Nueva pregunta');
  await expect(page.locator('.ed-from')).toHaveText('de: La cadena');
  await expect(block(page, 1)).toHaveClass(/is-src/);
  const vw = await page.evaluate(() => ({ width: document.documentElement.clientWidth, height: innerHeight }));
  const box = await page.locator('#sheetBody').boundingBox();
  if (info.project.name === 'escritorio') {
    expect(box.x).toBeGreaterThan(vw.width / 2);
    expect(box.x + box.width).toBeGreaterThan(vw.width - 20);   // hasta el borde (o la barra de desplazamiento)
    expect(box.height).toBeGreaterThan(vw.height - 2);
    // El apunte no queda tapado: su texto sigue a la izquierda del panel
    const txt = await block(page, 1).boundingBox();
    expect(txt.x + txt.width).toBeLessThanOrEqual(box.x + 1);
  } else {
    expect(Math.round(box.y + box.height)).toBe(vw.height);
    expect(box.y).toBeGreaterThan(vw.height * 0.2);
  }
  // «Crear y otra»: la siguiente sale de la misma parte
  await page.locator('.ed-foot [data-act="save-card-more"]').click();
  await expect(page.locator('.ed-from')).toHaveText('de: La cadena');
  await expect(block(page, 1).locator('.nb-cards')).toHaveText('1');
  await page.locator('#fld-x').fill('Si suben los {{tipos}}, el crédito sale más caro.');
  await page.locator('.ed-foot button[type="submit"]').click();
  await expect(sheet).toBeHidden();
  await expect(block(page, 1).locator('.nb-cards')).toHaveText('2');
  await expect(block(page, 1)).not.toHaveClass(/is-src/);
});

test('margen: cada bloque lleva el estado de las preguntas de su apartado', async ({ page }) => {
  await setup(page);
  await select(page, 1, 'crédito');
  await page.locator('#selBar [data-act="sel-cloze"]').click();
  await page.locator('.ed-foot button[type="submit"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
  // El título y su párrafo, sin estudiar; «Otra parte» no tiene preguntas
  await expect(block(page, 0).locator('.nb-bar')).toHaveClass(/st-new/);
  await expect(block(page, 1).locator('.nb-bar')).toHaveClass(/st-new/);
  await expect(block(page, 2).locator('.nb-bar')).toHaveCount(0);
  await expect(block(page, 3).locator('.nb-bar')).toHaveCount(0);
  await expect(block(page, 1).locator('.nb-cards i')).toHaveCount(1);
});

test('móvil: si el navegador no dice dónde está el teclado, la barra se queda abajo a la vista', async ({ page }, info) => {
  test.skip(info.project.name === 'escritorio', 'solo en el móvil');
  await page.addInitScript(() => { Object.defineProperty(window, 'visualViewport', { configurable: true, get() { throw new Error('sin visualViewport'); } }); });
  await setup(page);
  await select(page, 1, 'crédito');
  const vh = page.viewportSize().height, box = await page.locator('#selBar').boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(vh);
  expect(box.y).toBeGreaterThan(vh / 2);
  await expect(page.locator('#selBar .sb-done')).toBeVisible();
  await page.locator('#selBar .sb-done').click();
  await expect(page.locator('#selBar')).toBeHidden();
});

test('entre 700 y 960 px, «Nueva pregunta» sale como hoja desde abajo', async ({ page }, info) => {
  test.skip(info.project.name !== 'escritorio', 'solo con ratón y pantalla mediana');
  await page.setViewportSize({ width: 820, height: 900 });
  await setup(page);
  await select(page, 1, 'crédito');
  await page.locator('#selBar [data-act="sel-card"]').click();
  const box = await page.locator('#sheetBody').boundingBox();
  expect(Math.round(box.y + box.height)).toBe(900);
  expect(box.y).toBeGreaterThan(900 * 0.2);
});
