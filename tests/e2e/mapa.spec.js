// Mapa de lo que sabes: casillas, ficha, «Se te resisten», elegir varias y practicar
import { test, expect, openApp, nav, createDeck, addBasicCards, addBuiltinDeck, pasteNotes } from './fixtures.js';

const QS = [
  ['¿Qué dice el art. 14 CE?', 'Igualdad ante la ley'],
  ['¿Qué recogen los arts. 14 y 15 de la Constitución?', 'Igualdad y derecho a la vida'],
  ['¿Qué regula el art. 140?', 'La autonomía de los municipios'],
  ['¿Capital de España?', 'Madrid'],
];
async function deckWithArticles(page) {
  await openApp(page);
  await createDeck(page, 'Constitución');
  await addBasicCards(page, QS);
  await page.locator('[data-map-view="map"]').click();
}
const cell = (page, label) => page.locator('.mp-cells [data-map-cell]', { hasText: new RegExp(`^${label}$`) });

test('lista: casillas por artículo, «art. 14» no es «art. 140» y «Sin artículo»', async ({ page }) => {
  await deckWithArticles(page);
  await expect(page.locator('.mp-sh h3')).toHaveText(['Constitución', 'Artículos', 'Sin artículo']);
  await expect(page.locator('.mp-sec').nth(0).locator('.mp-cell')).toHaveText(['14', '15']);
  await expect(page.locator('.mp-sec').nth(1).locator('.mp-cell')).toHaveText(['140']);
  await expect(page.locator('.mp-sec').nth(2).locator('.mp-cell')).toHaveText(['¿Capital de España?']);
  await expect(page.locator('.mp-meta')).toHaveText('3 artículos · 4 preguntas');
  await expect(cell(page, '14')).toHaveClass(/st-new/);
  // Volver a la lista
  await page.locator('[data-map-view=""]').click();
  await expect(page.locator('#cardRows')).toBeVisible();
});

test('practicar una casilla desde su ficha: se resiste si fallas 3 de las 5 últimas', async ({ page }) => {
  await deckWithArticles(page);
  await cell(page, '14').click();
  const go = page.locator('[data-act="map-practice"]').first();
  await expect(go).toBeVisible();
  await go.click();
  await expect(page.locator('.studybar')).toBeVisible();
  await expect(page.locator('.studybar .left')).toContainText('de 2');
  // Tres fallos cada una y luego bien
  for (let i = 0; await page.locator('[data-act="reveal"]').count(); i++) {
    await page.locator('[data-act="reveal"]').click();
    await page.locator(`[data-grade="${i < 6 ? 1 : 3}"]`).click();
  }
  await page.getByRole('button', { name: 'Volver al mapa' }).click();
  await expect(cell(page, '14')).toHaveClass(/st-resiste/);
  await expect(cell(page, '15')).toHaveClass(/st-resiste/);
  await expect(cell(page, '140')).toHaveClass(/st-new/);
  await expect(page.locator('.mp-rlist .mp-rt b')).toHaveText(['Art. 14', 'Art. 15']);
  await expect(page.locator('.mp-rlist small').first()).toContainText('fallada 3 veces');
  await expect(page.locator('[data-act="map-resist"]')).toHaveText('Practicar lo que se resiste · 2');
  // La ficha: últimas respuestas y sus preguntas con cuándo vuelven
  await page.locator('.mp-rlist .mp-rrow').first().click();
  await expect(page.locator('.mp-ficha .mp-pill')).toHaveText('Se te resiste');
  await expect(page.locator('.mp-ficha .mp-dots i')).toHaveCount(7);   // las 7 últimas de sus 2 preguntas
  await expect(page.locator('.mp-ficha .mp-q')).toHaveCount(2);
});

test('elegir varias: barra con preguntas y minutos, y «Hacer una tanda» solo con esas', async ({ page }, info) => {
  await deckWithArticles(page);
  if (info.project.name === 'movil') {
    // Mantener pulsado
    await cell(page, '14').scrollIntoViewIfNeeded();
    const box = await cell(page, '14').boundingBox();
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
    await expect(cell(page, '14')).toHaveAttribute('aria-pressed', 'true');
    await cell(page, '140').click();
  } else {
    await cell(page, '14').click({ modifiers: ['Control'] });
    await cell(page, '140').click({ modifiers: ['Control'] });
  }
  await expect(page.locator('#mpBar')).toBeVisible();
  await expect(page.locator('#mpBar .mp-selt b')).toHaveText('2 elegidas');
  await expect(page.locator('#mpBar .mp-selt small')).toContainText('3 preguntas');
  await page.locator('[data-act="map-sel-go"]').click();
  await expect(page.locator('.studybar .left')).toContainText('de 3');
});

test('apunte con apartados: «Apunte | Mapa» con una casilla por apartado', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Finanzas');
  await nav(page, 'Biblioteca');
  await pasteNotes(page, '# Finanzas\n\n## Valor temporal\n\nUn euro hoy vale más que mañana.\n\n## TIR\n\nLa tasa que hace el VAN cero.');
  await page.locator('#pgDeck').selectOption({ label: 'Finanzas' });
  // Dos preguntas, cada una desde su párrafo
  for (const w of ['euro', 'tasa']) {
    await page.locator('#pgBlocks .nb', { hasText: w }).locator('.nb-text').click();
    await page.locator('[data-block-input]').evaluate((t, w) => { const k = t.value.indexOf(w); t.setSelectionRange(k, k + w.length); document.dispatchEvent(new Event('selectionchange')); }, w);
    await page.locator('#selBar [data-act="sel-card"]').click();
    await page.locator('[data-set-type="basic"]').click();
    await page.locator('.ed-foot button[type="submit"], #sheetBody button[type="submit"]').first().click();
    await expect(page.locator('#sheet')).toBeHidden();
    await page.keyboard.press('Escape');
  }
  await page.locator('[data-map-view="map"]').click();
  await expect(page.locator('#pgBlocks')).toBeHidden();
  await expect(page.locator('.mp-cells .mp-cell')).toHaveText(['Valor temporal', 'TIR']);
  await page.locator('[data-map-view=""]').click();
  await expect(page.locator('#pgBlocks')).toBeVisible();
  // «Ver en el apunte» desde la ficha: vuelve a la vista Apunte y resalta el bloque
  await page.locator('[data-map-view="map"]').click();
  await page.locator('.mp-cells .mp-cell', { hasText: 'TIR' }).click();
  if (await page.locator('#mpPop').count()) await page.locator('#mpPop [data-open-page]').click();
  else await page.locator('.mp-ficha [data-open-page]').click();
  await expect(page.locator('#pgBlocks')).toBeVisible();
  await expect(page.locator('[data-map-view=""]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#pgBlocks .nb.flash')).toContainText('tasa');
});

test('notas con varias plantillas: la casilla es la palabra (no der/die/das) y van por secciones', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Alemán · A2');
  await page.locator('[data-map-view="map"]').click();
  const labels = await page.locator('.mp-cells .mp-cell').allTextContents();
  expect(labels.length).toBeGreaterThan(10);
  expect(labels.filter(l => /^(der|die|das)$/.test(l.trim()))).toEqual([]);
  await expect(page.locator('.mp-sh h3').first()).toHaveText('Palabras');
});

test('japonés: sin furigana en crudo ni « / », y Kanji, Palabras y Frases por separado', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Japonés · Demo');
  await page.locator('[data-map-view="map"]').click();
  const labels = await page.locator('.mp-cells .mp-cell').allTextContents();
  expect(labels.filter(l => /[[\]]| \/ /.test(l))).toEqual([]);
  const secs = await page.locator('.mp-sh h3').allTextContents();
  expect(secs[0]).toBe('Kanji');
  expect(secs).toContain('Frases');
  // Ficha de un kanji: grande, con el significado al lado
  await page.locator('.mp-sec').first().locator('.mp-cell').first().click();
  if (await page.locator('#mpPop').count()) await page.locator('[data-act="map-ficha"]').click();
  await expect(page.locator('.mp-ft.is-cjk')).toBeVisible();
  expect(await page.locator('.mp-ft.is-cjk').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(50);
  await expect(page.locator('.mp-qt b').filter({ hasText: /\S \S/ }).filter({ hasNotText: '·' })).toHaveCount(0);
});

test('artículo del título del apartado, «Sin artículo» solo con lo demás y cabecera con los artículos', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Constitución');
  await nav(page, 'Biblioteca');
  await pasteNotes(page, '# La Constitución\n\n## Artículo 1 · El Estado y sus valores\n\nEspaña es un Estado social.\n\n## Artículo 3 · Las lenguas\n\nEl castellano es la lengua oficial.\n\n## Datos clave\n\nSe aprobó en 1978.');
  await page.locator('#pgDeck').selectOption({ label: 'Constitución' });
  for (const w of ['social', 'castellano', '1978']) {
    await page.locator('#pgBlocks .nb', { hasText: w }).locator('.nb-text').click();
    await page.locator('[data-block-input]').evaluate((t, w) => { const k = t.value.indexOf(w); t.setSelectionRange(k, k + w.length); document.dispatchEvent(new Event('selectionchange')); }, w);
    await page.locator('#selBar [data-act="sel-card"]').click();
    await page.locator('[data-set-type="basic"]').click();
    await page.locator('.ed-foot button[type="submit"], #sheetBody button[type="submit"]').first().click();
    await expect(page.locator('#sheet')).toBeHidden();
    await page.keyboard.press('Escape');
  }
  await page.locator('[data-map-view="map"]').click();
  await expect(page.locator('.mp-sh h3')).toHaveText(['Artículos', 'Sin artículo']);
  await expect(page.locator('.mp-sec').nth(0).locator('.mp-cell')).toHaveText(['1', '3']);
  await expect(page.locator('.mp-sec').nth(1).locator('.mp-cell')).toHaveText(['Datos clave']);
  await expect(page.locator('.mp-meta')).toHaveText('2 artículos · 3 preguntas');
  await expect(page.locator('.mp-main')).not.toContainText(/lo estás dando|al día|toca repasar|sin estudiar/);
  // Ficha: arriba solo «Art. 1»; debajo, el título del apartado; «Practicar · 1»
  await page.locator('.mp-cells .mp-cell', { hasText: /^1$/ }).click();
  if (await page.locator('#mpPop').count()) await page.locator('[data-act="map-ficha"]').click();
  await expect(page.locator('.mp-ft')).toHaveText('Art. 1');
  await expect(page.locator('.mp-fsub')).toHaveText('El Estado y sus valores');
  await expect(page.locator('.mp-fgo [data-act="map-practice"]')).toHaveText('Practicar · 1');
  const h = await page.locator('.mp-fgo [data-act="map-practice"]').evaluate(el => el.getBoundingClientRect().height);
  expect(h).toBeLessThan(70);
});

test('una casilla por pregunta: la cabecera dice solo «N preguntas»', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Sueltas');
  await addBasicCards(page, [['uno', '1'], ['dos', '2'], ['tres', '3']]);
  await page.locator('[data-map-view="map"]').click();
  await expect(page.locator('.mp-meta')).toHaveText('3 preguntas');
});

test('«Practicar lo que se resiste» cuenta las preguntas que salen y al salir vuelve al mapa', async ({ page }) => {
  await deckWithArticles(page);
  await cell(page, '14').click();
  await page.locator('[data-act="map-practice"]').first().click();
  for (let i = 0; await page.locator('[data-act="reveal"]').count(); i++) {
    await page.locator('[data-act="reveal"]').click();
    await page.locator(`[data-grade="${i < 6 ? 1 : 3}"]`).click();
  }
  await page.getByRole('button', { name: 'Volver al mapa' }).click();
  // Dos casillas (14 y 15) con 2 preguntas distintas
  await expect(page.locator('[data-act="map-resist"]')).toHaveText('Practicar lo que se resiste · 2');
  await page.locator('[data-act="map-resist"]').click();
  await expect(page.locator('.studybar .left')).toContainText('de 2');
  await page.locator('.studybar [data-act="exit"]').click();
  await expect(page.locator('.mp')).toBeVisible();
  await expect(page.locator('[data-map-view="map"]')).toHaveAttribute('aria-pressed', 'true');
});

test('«Se te resisten»: la casilla a la izquierda y el significado a la derecha, sin repetir', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Kanji sueltos');
  await addBasicCards(page, [['水[みず]', 'agua'], ['火', 'fuego']]);
  await page.locator('[data-map-view="map"]').click();
  await cell(page, '水').click();
  if (await page.locator('#mpPop').count()) await page.locator('#mpPop [data-act="map-practice"]').click();
  else await page.locator('[data-act="map-practice"]').click();
  for (let i = 0; await page.locator('[data-act="reveal"]').count(); i++) {
    await page.locator('[data-act="reveal"]').click();
    await page.locator(`[data-grade="${i < 3 ? 1 : 3}"]`).click();
  }
  await page.getByRole('button', { name: 'Volver al mapa' }).click();
  await expect(page.locator('.mp-rrow .mp-cell')).toHaveText(['水']);
  await expect(page.locator('.mp-rrow .mp-rt b')).toHaveText(['agua']);
});

test('escritorio: el mapa ocupa todo el ancho de la columna', async ({ page }, info) => {
  test.skip(info.project.name !== 'escritorio', 'solo en el ordenador');
  await page.setViewportSize({ width: 1310, height: 900 });
  await deckWithArticles(page);
  const [w, col] = await page.locator('.mp-main').evaluate(el => [el.getBoundingClientRect().width, el.closest('.mp-c').getBoundingClientRect().width]);
  expect(w).toBeGreaterThan(col - 2);
});

test('móvil: la barra de lo elegido cabe en una línea («· N min» fuera)', async ({ page }, info) => {
  test.skip(info.project.name !== 'movil', 'solo en el móvil');
  await deckWithArticles(page);
  await cell(page, '14').scrollIntoViewIfNeeded();
  const box = await cell(page, '14').boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
  await expect(page.locator('#mpBar .mp-min')).toBeHidden();
  const h = await page.locator('#mpBar .mp-selt small').evaluate(el => el.getBoundingClientRect().height);
  expect(h).toBeLessThan(24);
});

test('artículo: subtítulo del apartado que lo nombra y «Ver en el apunte» lleva hasta el bloque', async ({ page }) => {
  await openApp(page);
  await createDeck(page, 'Constitución');
  await nav(page, 'Biblioteca');
  const filler = Array.from({ length: 40 }, (_, i) => `Párrafo de relleno número ${i + 1}.`).join('\n\n');
  await pasteNotes(page, `# La Constitución\n\n## Artículo 1 · El Estado y sus valores\n\nEspaña es un Estado social (ver art. 6).\n\n${filler}\n\n## Artículo 6 · Los partidos políticos\n\nLos partidos expresan el pluralismo.`);
  await page.locator('#pgDeck').selectOption({ label: 'Constitución' });
  for (const w of ['social', 'pluralismo']) {
    await page.locator('#pgBlocks .nb', { hasText: w }).locator('.nb-text').click();
    await page.locator('[data-block-input]').evaluate((t, w) => { const k = t.value.indexOf(w); t.setSelectionRange(k, k + w.length); document.dispatchEvent(new Event('selectionchange')); }, w);
    await page.locator('#selBar [data-act="sel-card"]').click();
    await page.locator('[data-set-type="basic"]').click();
    await page.locator('.ed-foot button[type="submit"], #sheetBody button[type="submit"]').first().click();
    await expect(page.locator('#sheet')).toBeHidden();
    await page.keyboard.press('Escape');
  }
  await page.locator('[data-map-view="map"]').click();
  await page.locator('.mp-cells .mp-cell', { hasText: /^6$/ }).click();
  if (await page.locator('#mpPop').count()) await page.locator('[data-act="map-ficha"]').click();
  await expect(page.locator('.mp-ft')).toHaveText('Art. 6');
  await expect(page.locator('.mp-fsub')).toHaveText('Los partidos políticos');
  await page.locator('.mp-ficha [data-open-page]').click();
  const block = page.locator('#pgBlocks .nb.flash');
  await expect(block).toContainText('pluralismo');
  await expect.poll(async () => { const r = await block.boundingBox(); return r.y >= 0 && r.y + r.height <= page.viewportSize().height; }).toBe(true);
});
