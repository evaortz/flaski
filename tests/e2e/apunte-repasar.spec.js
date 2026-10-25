// Apunte: modo «Repasar» (tapa negritas y huecos; 1–4 como en la tanda) y atajo «a >> b» / «a <> b» al escribir
import { test, expect, openApp, nav, createDeck, pasteNotes } from './fixtures.js';

const stored = page => page.evaluate(() => { const db = JSON.parse(localStorage.getItem('flaski-local-v1')); return { cards: db.cards, progress: db.progress }; });
async function notes(page, text) {
  await openApp(page);
  await createDeck(page, 'Macro');
  await nav(page, 'Biblioteca');
  await pasteNotes(page, text);
  await page.locator('#pgDeck').selectOption({ label: 'Macro' });
}

test('Repasar: tapa las negritas, 1–4 como en la tanda y propone «Hueco» con lo que falla @ambos', async ({ page }) => {
  await notes(page, '# Política monetaria\n\nEl BCE sube los **tipos de interés** y así baja la **inflación**.');
  // «tipos de interés» ya es pregunta
  await page.locator('#pgBlocks .nb', { hasText: 'BCE' }).locator('.nb-text').click();
  await page.locator('[data-block-input]').evaluate(t => { const w = 'tipos de interés', k = t.value.indexOf(w); t.setSelectionRange(k, k + w.length); document.dispatchEvent(new Event('selectionchange')); });
  await page.locator('#selBar [data-act="sel-card"]').click();
  await page.locator('[data-set-type="basic"]').click();
  await page.locator('.ed-foot button[type="submit"], #sheetBody button[type="submit"]').first().click();
  await expect(page.locator('#sheet')).toBeHidden();
  await page.keyboard.press('Escape');

  await page.locator('[data-act="pg-mode"][data-mode="review"]').click();
  await expect(page.locator('.rv-intro')).toBeVisible();
  const gaps = page.locator('#pgBlocks .rv-gap');
  await expect(gaps).toHaveCount(2);
  await expect(gaps.nth(0)).toHaveText('');
  await expect(gaps.nth(0)).toHaveClass(/is-cur/);
  await expect(page.locator('#pgBlocks [data-edit-block]')).toHaveCount(0);   // no se edita
  // Destapar y «Bien»: cuenta como repaso de la pregunta
  await gaps.nth(0).click();
  await expect(gaps.nth(0)).toHaveText('tipos de interés');
  await page.locator('[data-rv-grade="3"]:visible').click();
  await expect(gaps.nth(0)).toHaveClass(/g3/);
  await expect.poll(async () => (await stored(page)).progress.length).toBe(1);
  // La siguiente: «Otra vez»
  await expect(gaps.nth(1)).toHaveClass(/is-cur/);
  await gaps.nth(1).click();
  await page.locator('[data-rv-grade="1"]:visible').click();
  await expect(page.locator('#rvPanel')).toContainText('Repaso hecho');
  await expect(page.locator('#rvPanel .rv-bad li')).toHaveText(['inflación']);
  await page.locator('[data-act="rv-make"]').click();
  await expect.poll(async () => (await stored(page)).cards.filter(c => c.type_id === 'cloze').map(c => c.fields.x)).toEqual(['El BCE sube los tipos de interés y así baja la {{inflación}}.']);
  // Volver a escribir
  await page.locator('[data-act="pg-mode"][data-mode="write"]').first().click();
  await expect(page.locator('#pgBlocks .rv-gap')).toHaveCount(0);
  await expect(page.locator('#pgBlocks [data-edit-block]').first()).toBeAttached();
});

test('Repasar con el teclado: Espacio destapa, 1–4 valoran y Esc vuelve a escribir @ambos', async ({ page }, info) => {
  test.skip(info.project.name === 'movil', 'teclado en el ordenador');
  await notes(page, '# Tema\n\nLa capital es **Madrid** y el río es el **Manzanares**.');
  await page.locator('[data-act="pg-mode"][data-mode="review"]').click();
  await page.keyboard.press('Space');
  await expect(page.locator('.rv-gap').first()).toHaveText('Madrid');
  await expect(page.locator('.rv-float [data-rv-grade]')).toHaveCount(4);
  await page.keyboard.press('4');
  await expect(page.locator('.rv-gap').first()).toHaveClass(/g4/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.rv-gap')).toHaveCount(0);
});

test('atajo «a >> b»: Enter crea la pregunta unida a su línea; «<>» crea las dos; Esc lo deja como texto @ambos', async ({ page }) => {
  await notes(page, '# En la ciudad\n\nSitios');
  const line = async text => {
    await page.locator('#pgBlocks .nb').last().locator('.nb-text, [data-block-input]').first().click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(text);
  };
  await line('kitap >> libro');
  await expect(page.locator('#qsHint')).toContainText('kitap → libro');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await stored(page)).cards.map(c => [c.type_id, c.front, c.back])).toEqual([['basic', 'kitap', 'libro']]);
  await page.keyboard.type('ev <> casa');
  await expect(page.locator('#qsHint')).toContainText('ev ↔ casa');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await stored(page)).cards.length).toBe(3);
  await page.keyboard.type('uno >> dos');
  await expect(page.locator('#qsHint')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#qsHint')).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect((await stored(page)).cards.length).toBe(3);
  // Las líneas que ya son pregunta se ven como «a → b»; la que se quedó como texto, tal cual
  await expect(page.locator('#pgBlocks .nb-qs')).toHaveCount(2);
  await expect(page.locator('#pgBlocks .nb-qs').first()).toContainText('→');
  await expect(page.locator('#pgBlocks .nb', { hasText: 'uno >> dos' })).toHaveCount(1);
  // Si cambias la línea, cambia la pregunta
  await page.locator('#pgBlocks .nb-qs').first().locator('.nb-text').click();
  await page.keyboard.press('End');
  await page.keyboard.type('s');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await stored(page)).cards.filter(c => c.type_id === 'basic').map(c => c.back)).toEqual(['libros']);
});

test('móvil: el botón «pregunta» de la barra sobre el teclado escribe « >> »', async ({ page }) => {
  await notes(page, '# Ciudad\n\nokul');
  await page.locator('#pgBlocks .nb', { hasText: 'okul' }).locator('.nb-text').click();
  await page.keyboard.press('End');
  await page.evaluate(() => document.querySelector('[data-act="qs-insert"]').click());
  await page.keyboard.type('escuela');
  await expect(page.locator('[data-block-input]')).toHaveText('okul >> escuela');
  await expect(page.locator('#qsHint')).toContainText('okul → escuela');
});

test('Repasar no tapa las negritas que acaban en «:» y la pregunta de abajo no lleva los «:» del final', async ({ page }) => {
  await notes(page, '# Tema\n\n**Referéndum:** se aprobó en **1978**.\n\nEstructura: tres poderes.');
  // Un hueco que acaba en «:» (como los de los temas de ejemplo)
  await page.locator('#pgBlocks .nb', { hasText: 'tres poderes' }).locator('.nb-text').click();
  await page.locator('[data-block-input]').evaluate(t => { const w = 'Estructura:', k = t.value.indexOf(w); t.setSelectionRange(k, k + w.length); document.dispatchEvent(new Event('selectionchange')); });
  await page.locator('#selBar [data-act="sel-cloze"]').click();
  await page.locator('.ed-foot button[type="submit"], #sheetBody button[type="submit"]').first().click();
  await expect(page.locator('#sheet')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.locator('[data-act="pg-mode"][data-mode="review"]').click();
  await expect(page.locator('#pgBlocks .rv-gap')).toHaveCount(2);                       // «1978» y el hueco; «Referéndum:» no
  await expect(page.locator('#pgBlocks .nb', { hasText: 'Referéndum' })).toContainText('Referéndum:');
  await page.locator('#pgBlocks .rv-gap').nth(1).click();
  await expect(page.locator('#rvFoot .rv-ask')).toHaveText('¿Cómo te ha salido «Estructura»?');
});

test('salir de Repasar a mitad con fallos que no son pregunta: se proponen como «Hueco» @ambos', async ({ page }) => {
  await notes(page, '# Tema\n\nLa capital es **Madrid** y el río es el **Manzanares**.');
  await page.locator('[data-act="pg-mode"][data-mode="review"]').click();
  await page.locator('.rv-gap').first().click();
  await page.locator('[data-rv-grade="1"]:visible').click();
  await page.locator('[data-act="pg-mode"][data-mode="write"]').first().click();
  await expect(page.locator('#sheetBody')).toContainText('¿Las creo como preguntas?');
  await expect(page.locator('#sheetBody')).toContainText('«Madrid»');
  await page.locator('[data-act="rv-make-pending"]').click();
  await expect.poll(async () => (await stored(page)).cards.filter(c => c.type_id === 'cloze').map(c => c.fields.x)).toEqual(['La capital es {{Madrid}} y el río es el Manzanares.']);
  // Irse del apunte a mitad también lo propone
  await page.locator('[data-act="pg-mode"][data-mode="review"]').click();
  await page.locator('.rv-gap').nth(1).click();
  await page.locator('[data-rv-grade="1"]:visible').click();
  await nav(page, 'Hoy');
  await expect(page.locator('#sheetBody')).toContainText('«Manzanares»');
});

test('Repasar: se sale con «✕ Salir de repasar», con el botón atrás y la barra «Escribir | Repasar» sigue a la vista al bajar @ambos', async ({ page }) => {
  const long = Array.from({ length: 40 }, (_, i) => `Frase ${i + 1} con **dato ${i + 1}** para repasar.`).join('\n\n');
  await notes(page, `# Largo\n\n${long}`);
  const write = page.locator('.pg-top [data-act="pg-mode"][data-mode="write"]');
  // ✕ Salir de repasar (en el panel de «Destapar» en el móvil; en el panel de al lado en el ordenador)
  await page.locator('[data-act="pg-mode"][data-mode="review"]').click();
  await page.locator('.rv-quit:visible').click();
  await expect(page.locator('.rv-gap')).toHaveCount(0);
  await expect(page.locator('#pgBlocks [data-edit-block]').first()).toBeAttached();
  // Al bajar por el apunte, la barra sigue arriba
  await page.locator('[data-act="pg-mode"][data-mode="review"]').click();
  await expect(page.locator('.rv-gap')).toHaveCount(40);
  await page.locator('.rv-gap').last().scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(400);
  await expect(write).toBeInViewport();
  await expect(page.locator('.rv-quit:visible')).toBeInViewport();
  // El botón atrás sale de Repasar y se queda en el apunte
  await page.goBack();
  await expect(page.locator('.rv-gap')).toHaveCount(0);
  await expect(page.locator('#pgTitle')).toHaveValue('Largo');
  // Salir con el botón no deja una entrada de más: atrás ya no vuelve a Repasar
  await page.locator('[data-act="pg-mode"][data-mode="review"]').click();
  await write.click();
  await expect.poll(() => page.evaluate(() => history.state?.flaskiRv ?? null)).toBeNull();
});
