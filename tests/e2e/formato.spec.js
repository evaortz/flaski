// Formato del texto en los apuntes: barra de formato, Markdown al estilo de Obsidian y pegar con formato
import { test, expect, openApp, nav } from './fixtures.js';

async function newPage(page, title) {
  await nav(page, 'Apuntes');
  await page.locator('[data-act="new-page"]').click();
  await page.locator('#pgTitle').fill(title);
}
const type = (page, text) => page.locator('[data-block-input]').pressSequentially(text);
// Selecciona un trozo del bloque que se está editando (por su texto)
const selectText = (page, w) => page.locator('[data-block-input]').evaluate((t, w) => { const k = t.value.indexOf(w); t.setSelectionRange(k, k + w.length); document.dispatchEvent(new Event('selectionchange')); }, w);
const pasteInto = (page, html, text) => page.evaluate(([h, t]) => {
  const dt = new DataTransfer(); if (h) dt.setData('text/html', h); dt.setData('text/plain', t);
  document.querySelector('[data-block-input]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, [html, text]);

test('formato: negrita, color y fondo con la barra; se guarda en Markdown y las marcas solo se ven donde está el cursor', async ({ page }) => {
  await openApp(page);
  await newPage(page, 'Formato');
  await page.locator('#pgBlocks .nb').first().locator('.nb-text').click();
  await type(page, 'El locativo indica dónde está algo');
  const ed = page.locator('[data-block-input]');
  // Negrita con el botón
  await selectText(page, 'locativo');
  await expect(page.locator('#selBar')).toBeVisible();
  await page.locator('#selBar [data-nfmt="b"]').click();
  await expect(ed).toHaveJSProperty('value', 'El **locativo** indica dónde está algo');
  await expect(page.locator('#selBar [data-nfmt="b"]')).toHaveAttribute('aria-pressed', 'true');
  // Color del texto y fondo, con el menú de colores
  await selectText(page, 'dónde');
  await page.locator('#selBar [data-act="fmt-colors"]').click();
  await page.locator('#fmtColors [data-nfmt="color"][data-color="red"]').click();
  await expect(ed).toHaveJSProperty('value', 'El **locativo** indica <span style="color:red">dónde</span> está algo');
  await selectText(page, 'algo');
  await page.locator('#selBar [data-act="fmt-colors"]').click();
  await page.locator('#fmtColors [data-nfmt="bg"][data-color="yellow"]').click();
  await expect(ed).toHaveJSProperty('value', 'El **locativo** indica <span style="color:red">dónde</span> está ==algo==');
  // Atajos de teclado y deshacer
  await selectText(page, 'indica');
  await page.keyboard.press('Control+i');
  await expect(ed).toHaveJSProperty('value', 'El **locativo** *indica* <span style="color:red">dónde</span> está ==algo==');
  await page.keyboard.press('Control+z');
  await expect(ed).toHaveJSProperty('value', 'El **locativo** indica <span style="color:red">dónde</span> está ==algo==');
  // Fuera de edición: con formato y sin marcas
  await page.keyboard.press('Escape');
  const text = page.locator('#pgBlocks .nb').first().locator('.nb-text');
  await expect(text.locator('b')).toHaveText('locativo');
  await expect(text.locator('.tc-red')).toHaveText('dónde');
  await expect(text.locator('mark.hl-yellow')).toHaveText('algo');
  await expect(text).toHaveText('El locativo indica dónde está algo', { useInnerText: true });
  // Al tocar la negrita se ven sus marcas (y solo las suyas)
  await text.locator('b').click();
  await expect(page.locator('[data-block-input] .fm-b')).toHaveClass(/on/);
  await expect(page.locator('[data-block-input] .fm-b > .mk').first()).toBeVisible();
  await expect(page.locator('[data-block-input] .fm-color > .mk').first()).toBeHidden();
  // Se guarda: al recargar sigue ahí
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('#main .spin')).toHaveCount(0);
  await nav(page, 'Apuntes');
  await page.getByText('Formato').first().click();
  await expect(page.locator('#pgBlocks .nb').first().locator('b')).toHaveText('locativo');
});

test('formato: escribir Markdown a mano, saltos de línea y dar formato sin estar editando', async ({ page }) => {
  await openApp(page);
  await newPage(page, 'Markdown');
  await page.locator('#pgBlocks .nb').first().locator('.nb-text').click();
  await type(page, 'Hola **mundo** y ~~nada~~');
  await page.keyboard.press('Shift+Enter');
  await type(page, 'segunda <u>línea</u>');
  const ed = page.locator('[data-block-input]');
  await expect(ed).toHaveJSProperty('value', 'Hola **mundo** y ~~nada~~\nsegunda <u>línea</u>');
  await page.keyboard.press('Escape');
  const text = page.locator('#pgBlocks .nb').first().locator('.nb-text');
  await expect(text.locator('b')).toHaveText('mundo');
  await expect(text.locator('s')).toHaveText('nada');
  await expect(text.locator('u')).toHaveText('línea');
  await expect(page.locator('#pgBlocks .nb')).toHaveCount(1);
  // Seleccionar en un bloque sin editarlo y darle formato: se abre con lo formateado
  await text.evaluate(el => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node; while ((node = w.nextNode()) && !node.data.includes('Hola'));
    const r = document.createRange(); r.setStart(node, 0); r.setEnd(node, 4);
    getSelection().removeAllRanges(); getSelection().addRange(r);
  });
  await page.locator('#selBar [data-nfmt="u"]').click();
  await expect(ed).toHaveJSProperty('value', '<u>Hola</u> **mundo** y ~~nada~~\nsegunda <u>línea</u>');
});

test('pegar con formato (Google Docs, una web): varios bloques y se conserva el estilo', async ({ page }) => {
  await openApp(page);
  await newPage(page, 'Pegado');
  await page.locator('#pgBlocks .nb').first().locator('.nb-text').click();
  const html = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><h1 dir="ltr"><span style="font-size:20pt;font-weight:400">La célula</span></h1>
    <p dir="ltr"><span style="font-weight:400;color:#000000">Es la unidad </span><span style="font-weight:700;color:#000000">básica</span><span style="font-weight:400"> de la vida, </span><span style="color:#ff0000;font-weight:400">muy importante</span><span style="font-weight:400">.</span></p>
    <ul><li dir="ltr"><p dir="ltr"><span style="font-style:italic">Núcleo</span><span>: guarda el ADN</span></p></li><li dir="ltr"><p dir="ltr"><span style="background-color:#ffff00">Membrana</span></p></li></ul>
    <p><a href="https://es.wikipedia.org/wiki/C%C3%A9lula"><span style="color:#1155cc;text-decoration:underline">Más</span></a></p>
    <table><tr><td>Parte</td><td>Función</td></tr><tr><td>Núcleo</td><td>Control</td></tr></table></b>`;
  await pasteInto(page, html, 'La célula');
  await page.keyboard.press('Escape');
  expect(await page.locator('#pgBlocks .nb').evaluateAll(els => els.map(e => e.className.replace('nb nb-', '').split(' ')[0])))
    .toEqual(['h1', 'p', 'li', 'li', 'p', 'table', 'p']);
  const blocks = page.locator('#pgBlocks .nb');
  await expect(blocks.nth(1).locator('b')).toHaveText('básica');
  await expect(blocks.nth(1).locator('.tc-red')).toHaveText('muy importante');
  await expect(blocks.nth(2).locator('i')).toHaveText('Núcleo');
  await expect(blocks.nth(3).locator('mark.hl-yellow')).toHaveText('Membrana');
  await expect(blocks.nth(4).locator('a')).toHaveAttribute('href', 'https://es.wikipedia.org/wiki/C%C3%A9lula');
  await expect(blocks.nth(5).locator('th')).toHaveText(['Parte', 'Función']);
  // Un trozo con formato en medio de un párrafo: se queda en el mismo bloque
  await blocks.nth(0).locator('.nb-text').click();
  await page.keyboard.press('End');
  await pasteInto(page, '<span> y su </span><strong>estructura</strong>', ' y su estructura');
  await expect(page.locator('[data-block-input]')).toHaveJSProperty('value', 'La célula y su **estructura**');
});
