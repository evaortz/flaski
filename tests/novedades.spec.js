// Fotografía las pantallas de las novedades (img/novedades), en claro y en oscuro. Se regeneran con «npm run capturas».
import { test, expect, openApp, nav, addBuiltinDeck, pasteNotes } from './e2e/fixtures.js';

const OUT = new URL('../img/novedades/', import.meta.url);
const shot = async (page, name, scheme) => {
  await page.locator('#toast').evaluate(t => { t.hidden = true; }).catch(() => {});
  await page.waitForTimeout(250);
  await page.screenshot({ path: new URL(`${name}-${scheme}.jpg`, OUT).pathname.replace(/^\/([A-Z]:)/, '$1'), type: 'jpeg', quality: 82 });
};
const select = (page, w) => page.locator('[data-block-input]').evaluate((t, w) => { const k = t.value.indexOf(w); t.setSelectionRange(k, k + w.length); document.dispatchEvent(new Event('selectionchange')); }, w);

for (const scheme of ['light', 'dark']) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });

    test('formato', async ({ page }) => {
      await openApp(page);
      await nav(page, 'Apuntes');
      await pasteNotes(page, '# La célula\n\nLa **célula** es la <u>unidad básica</u> de la vida: todos los seres vivos están formados por ==células==.\n\n<span style="color:red">Importante</span>: algunas, como las *bacterias*, son una sola célula.\n\n## Partes\n\n- **Núcleo**: guarda el ADN.\n- <span style="color:blue">Membrana</span>: protege la célula.');
      await page.locator('#pgBlocks .nb').nth(0).locator('.nb-text').click({ position: { x: 5, y: 5 } });
      await select(page, 'seres vivos');
      await page.evaluate(() => scrollTo(0, document.querySelector('#pgBlocks').getBoundingClientRect().top + scrollY - 120));
      await page.waitForTimeout(150);
      await select(page, 'seres vivos');
      await shot(page, 'formato', scheme);
    });

    test('organizar', async ({ page }) => {
      await openApp(page);
      await nav(page, 'Apuntes');
      await pasteNotes(page, '# Revolución francesa\n\n## Causas\n\n- Crisis económica\n  - Malas cosechas\n  - Deuda del Estado\n- Ideas de la Ilustración\n\n## Etapas\n\n1. Monarquía constitucional\n2. República\n3. Imperio napoleónico\n\nVer también [[La Ilustración]].');
      await page.evaluate(() => scrollTo(0, 300));
      await page.locator('#pgBlocks .nb').nth(1).locator('.nb-text').click();
      await page.locator('#pgBlocks .nb').nth(1).locator('.nb-grip').click({ force: true });
      await expect(page.locator('#blkOps')).toBeVisible();
      await shot(page, 'organizar', scheme);
    });

    test('tablas', async ({ page }) => {
      await openApp(page);
      await nav(page, 'Apuntes');
      await page.locator('[data-act="new-page"]').first().click();
      await page.locator('#pgTitle').fill('Casos del turco');
      await page.locator('[data-act="block-menu"]').click();
      await page.locator('#blockMenu [data-block-type="table"]').click();
      const cell = (r, c) => page.locator(`.tc[data-r="${r}"][data-c="${c}"]`);
      await cell('h', 0).fill('Caso'); await cell('h', 1).fill('Sufijo');
      await cell(0, 0).fill('Locativo'); await cell(0, 1).fill('-de / -da');
      await cell(1, 0).fill('Ablativo'); await cell(1, 1).fill('-den / -dan');
      await page.locator('[data-tbl="row-end"]').click();
      await cell(2, 0).fill('Dativo'); await cell(2, 1).fill('-e / -a');
      await cell(1, 1).click();
      await page.evaluate(() => scrollTo(0, 330));
      await page.locator('.tbl-colbtn.cur').click();
      await shot(page, 'tablas', scheme);
    });

    test('sugerencias', async ({ page }) => {
      await openApp(page);
      await nav(page, 'Apuntes');
      await pasteNotes(page, '# Biología celular\n\nCélula: unidad básica de la vida.\n\nLa **membrana** protege la célula y regula lo que entra.\n\n## Orgánulos\n\n- Núcleo\n  - ADN\n  - Nucléolo\n- Mitocondria: produce la energía de la célula.\n\nRobert Hooke describió la célula en 1665.');
      await page.locator('.pg-suggest').click();
      await expect(page.locator('.sug').first()).toBeVisible();
      await shot(page, 'sugerencias', scheme);
    });

    test('tipos', async ({ page }) => {
      await openApp(page);
      await nav(page, 'Mis mazos');
      await page.locator('#main [data-act="new-deck"]').click();
      await page.locator('#d-name').fill('Geografía');
      await page.locator('[data-kind="other"]').click();
      await page.locator('#sheetBody').getByRole('button', { name: 'Guardar' }).click();
      await page.locator('#main [data-act="new-card"]').click();
      await page.locator('[data-act="pick-type"]').click();
      await page.evaluate(() => { for (const el of document.querySelectorAll('#sheet *')) if (el.scrollHeight > el.clientHeight + 20 && getComputedStyle(el).overflowY !== 'visible') el.scrollTop = el.scrollHeight - el.clientHeight - 150; });
      await shot(page, 'tipos', scheme);
    });

    test('estudio', async ({ page }) => {
      await openApp(page);
      await addBuiltinDeck(page, 'Japonés · Demo de Flaski');
      await page.locator('#main [data-start]').click();
      await page.locator('[data-act="reveal"]').click();
      await expect(page.locator('[data-grade="3"]')).toBeVisible();
      await shot(page, 'estudio', scheme);
    });

    test('importar', async ({ page }) => {
      await openApp(page);
      await nav(page, 'Apuntes');
      await pasteNotes(page, '# Revolución francesa\n\nEmpezó en 1789 con la toma de la Bastilla.');
      await page.locator('[data-act="page-menu"]').click();
      await page.locator('[data-act="export-page"]').click();
      await page.mouse.move(1, 1);
      await shot(page, 'importar', scheme);
    });

    test('letra', async ({ page }) => {
      await openApp(page);
      await nav(page, 'Apuntes');
      await page.locator('[data-act="new-page"]').first().click();
      await page.locator('[data-act="notes-help"]').click();
      await shot(page, 'letra', scheme);
    });
  });
}
