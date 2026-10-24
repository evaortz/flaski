// Remates del editor de una pregunta (fase 8) y de la barra del apunte: cada uno con su prueba para que no vuelva
import { test, expect, openApp, nav, createDeck, newCard, pasteNotes } from './fixtures.js';

const NOTES = '# Por qué se te olvidan las cosas (y cómo evitarlo)\n\n## La Revolución\n\nEl Terror lo dirigió Robespierre entre 1793 y 1794.';
const ed = page => page.locator('[data-block-input]');
async function select(page, w) {
  if (!(await ed(page).count())) await page.locator('#pgBlocks .nb').nth(1).locator('.nb-text').click();
  await ed(page).evaluate((t, w) => { const k = t.value.indexOf(w); t.setSelectionRange(k, k + w.length); document.dispatchEvent(new Event('selectionchange')); }, w);
  await expect(page.locator('#selBar')).toBeVisible();
}
// Nada se sale del contenedor ni se pisa con lo de al lado
async function fits(page, sel) {
  return page.locator(sel).evaluate(el => {
    const box = el.getBoundingClientRect(), kids = [...el.children].filter(k => getComputedStyle(k).display !== 'none').map(k => k.getBoundingClientRect());
    const inside = kids.every(r => r.left >= box.left - 1 && r.right <= box.right + 1);
    const overlap = kids.some((a, i) => kids.some((b, j) => i < j && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
    return { inside, overlap, scroll: el.scrollWidth > el.clientWidth + 1 };
  });
}

test('tipo de pregunta: los segmentos caben sin pisarse con «Más tipos» y la fila no se mueve al cambiar', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Historia');
  await newCard(page);
  expect(await fits(page, '.ed-segs')).toEqual({ inside: true, overlap: false, scroll: false });
  expect(await fits(page, '#typeBar')).toEqual({ inside: true, overlap: false, scroll: false });
  const before = await page.locator('[data-set-type="basic"]').boundingBox();
  await page.locator('[data-set-type="cloze"]').click();
  await expect(page.locator('[data-set-type="basic"]')).toBeVisible();
  expect(await page.locator('[data-set-type="basic"]').boundingBox()).toEqual(before);
});

test('«Más tipos» sustituye el contenido de la hoja, con «‹» para volver', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Historia');
  await newCard(page);
  await page.locator('[data-act="pick-type"]').click();
  await expect(page.locator('.ed-top')).toBeHidden();
  await expect(page.locator('#sheet h2:visible')).toHaveText(['Elige el tipo']);
  await expect(page.locator('#typePicker [data-act="close-picker"][aria-label="Volver"]')).toBeVisible();
  await page.locator('#typePicker [data-act="close-picker"]').first().click();
  await expect(page.locator('.ed-top')).toBeVisible();
});

test('campos: en Básica la respuesta no es opcional; en Opción múltiple «opcional» sale una vez', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Historia');
  await newCard(page);
  await page.locator('[data-set-type="basic"]').click();
  await expect(page.locator('[data-ef="a"] .ef-name')).toHaveText('Respuesta');
  await page.locator('[data-set-type="choice"]').click();
  await expect(page.locator('[data-ef="w"] .ef-name')).toHaveText('Respuestas incorrectas · opcional');
  await expect(page.locator('#fld-w')).toHaveAttribute('placeholder', '');
});

test('crear desde una selección: la pregunta es la frase con el hueco', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Historia');
  await nav(page, 'Biblioteca');
  await pasteNotes(page, NOTES);
  await page.locator('#pgDeck').selectOption({ label: 'Historia' });
  await select(page, 'Robespierre');
  await page.locator('#selBar [data-act="sel-card"]').click();
  await page.locator('[data-set-type="basic"]').click();
  await expect(page.locator('#fld-q')).toHaveValue('El Terror lo dirigió ___ entre 1793 y 1794.');
  await expect(page.locator('#fld-a')).toHaveValue('Robespierre');
});

test('móvil: en la barra de lo seleccionado cabe «Hecho»', async ({ page }, info) => {
  test.skip(info.project.name !== 'movil', 'solo en el móvil');
  await openApp(page);
  await nav(page, 'Biblioteca');
  await pasteNotes(page, NOTES);
  await select(page, 'Robespierre');
  // «Hecho» sale mientras escribes con el teclado abierto: aquí se fuerza para medir que cabe todo
  await page.locator('#selBar .sb-done').evaluate(b => { b.style.display = 'inline-flex'; });
  expect(await fits(page, '#selBar')).toEqual({ inside: true, overlap: false, scroll: false });
});

test('apunte a 800 px: «Sugerir preguntas» solo con icono y la ruta cortada en palabra entera', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await openApp(page);
  await nav(page, 'Biblioteca');
  await pasteNotes(page, NOTES);
  const sug = page.locator('.pg-top .pg-suggest');
  await expect(sug).toHaveAttribute('aria-label', 'Sugerir preguntas');
  await expect(sug.locator('span')).toBeHidden();
  expect(await fits(page, '.pg-top')).toMatchObject({ overlap: false });
  const cur = page.locator('.pg-top .crumb-cur');
  const text = await cur.textContent();
  expect(['Por qué se te olvidan las cosas (y cómo evitarlo)', 'Por qué se te olvidan las cosas…']).toContain(text);
  expect(await cur.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);      // nada cortado a media palabra por el CSS
  if (text.endsWith('…')) await expect(cur).toHaveAttribute('title', 'Por qué se te olvidan las cosas (y cómo evitarlo)');
});

test('etiquetas del editor: pegatinas con ✕ y «+ etiqueta» para buscar o crear, sin la lista entera', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Historia');
  await newCard(page);
  const pick = page.locator('#tagPick');
  await expect(pick.locator('#f-newtag')).toBeHidden();
  await pick.locator('[data-act="tagpick-open"]').click();
  await page.locator('#f-newtag').fill('verbos');
  await page.locator('#f-newtag').press('Enter');
  await expect(pick.locator('.tagsel')).toHaveText(['#verbos']);
  await expect(page.locator('#f-newtag')).toBeHidden();
  await pick.locator('[data-act="tagpick-open"]').click();
  await page.locator('#f-newtag').fill('casa');
  await page.locator('[data-act="add-tag-inline"]').click();
  await expect(pick.locator('.tagsel')).toHaveText(['#verbos', '#casa']);
  // Quitar con ✕: vuelve a salir al buscar; Esc cierra el buscador sin cerrar el editor
  await pick.locator('[data-act="untag"][aria-label="Quitar #verbos"]').click();
  await expect(pick.locator('.tagsel')).toHaveText(['#casa']);
  await pick.locator('[data-act="tagpick-open"]').click();
  await expect(pick.locator('.tagopt:visible')).toHaveText(['#verbos']);
  await page.locator('#f-newtag').fill('cas');
  await expect(pick.locator('.tagopt:visible')).toHaveCount(0);
  await expect(pick.locator('.tag-create')).toBeVisible();
  await page.locator('#f-newtag').press('Escape');
  await expect(page.locator('#f-newtag')).toBeHidden();
  await expect(page.locator('#sheet')).toBeVisible();
  await page.locator('#fld-q').fill('¿Quién dirigió el Terror?');
  await page.locator('#fld-a').fill('Robespierre');
  await page.locator('.ed-foot button[type="submit"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#main')).toContainText('#casa');
  await expect(page.locator('#main')).not.toContainText('#verbos');
});
