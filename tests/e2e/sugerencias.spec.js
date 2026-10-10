// Sugerencias: actualizar tras cambiar el apunte, descartar, la ✨ de los bloques y los consejos
import { test, expect, openApp, nav } from './fixtures.js';

async function pastePage(page, text) {
  await nav(page, 'Apuntes');
  await page.locator('[data-act="paste-page"]').first().click();
  await page.locator('#pagePaste').fill(text);
  await page.locator('[data-act="paste-page-ok"]').click();
}

test('actualizar las sugerencias tras cambiar el apunte, conservando lo retocado; descartar', async ({ page }) => {
  await openApp(page);
  await pastePage(page, '# Célula\n\nCélula: unidad básica de la vida.\n\nLa **membrana** protege la célula.');
  await page.locator('.pg-suggest').click();
  await expect(page.locator('.sug')).toHaveCount(2);
  // Retocar una
  await page.locator('[data-sug-open]').first().click();
  await page.locator('#fld-a').fill('La unidad más pequeña de la vida');
  await page.locator('.ed-foot button[type="submit"]').click();
  await expect(page.locator('.sug').first()).toContainText('Retocada');
  // Cambiar el apunte con la ventana cerrada y actualizar: sale la nueva y la retocada se queda
  await page.locator('[data-act="close-sheet"]').first().click();
  await page.locator('#pgBlocks .nb').last().locator('.nb-text').click();
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await page.locator('[data-block-input]').pressSequentially('Mitocondria: produce la energía de la célula.');
  await page.keyboard.press('Escape');
  await page.locator('.pg-suggest').click();
  await expect(page.locator('.sug')).toHaveCount(3);
  await expect(page.locator('.sug').first()).toContainText('La unidad más pequeña de la vida');
  await page.locator('[data-act="sug-refresh"]').click();
  await expect(page.locator('#toast')).toContainText('Sin cambios');
  // Descartar: no vuelve a salir, y se puede recuperar
  await page.locator('[data-sug-hide]').last().click();
  await expect(page.locator('.sug')).toHaveCount(2);
  await page.locator('[data-act="sug-refresh"]').click();
  await expect(page.locator('.sug')).toHaveCount(2);
  await page.locator('[data-act="sug-unhide"]').click();
  await expect(page.locator('.sug')).toHaveCount(3);
});

test('la ✨ marca en el apunte lo que da tarjetas (también al escribir) y abre las de esa parte', async ({ page }) => {
  await openApp(page);
  await pastePage(page, '# Biología\n\nUn texto cualquiera sin nada especial.');
  await expect(page.locator('#pgBlocks .nb-sugdot')).toHaveCount(0);
  await page.locator('#pgBlocks .nb').last().locator('.nb-text').click();
  await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await page.locator('[data-block-input]').pressSequentially('Ribosoma: fabrica las proteínas.');
  await expect(page.locator('#pgBlocks .nb-sugdot')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.locator('#pgBlocks .nb-sugdot').click();
  await expect(page.locator('.sug-only')).toBeVisible();
  await expect(page.locator('.sug')).toHaveCount(1);
  await expect(page.locator('.sug .sug-src')).toContainText('Ribosoma: fabrica las proteínas.');
});

test('sin sugerencias: consejos según cómo está escrito el apunte y cómo se eligen', async ({ page }) => {
  await openApp(page);
  await pastePage(page, `# Tema\n\n${'Esto es una frase larga sobre el tema que no tiene nada destacado ni ninguna definición. '.repeat(4)}\n\n- uno\n- dos`);
  await page.locator('.pg-suggest').click();
  await expect(page.locator('.sug-tips')).toContainText('párrafo largo');
  await expect(page.locator('.sug-tips')).toContainText('lista');
  await expect(page.locator('.sug-how')).toHaveAttribute('open', '');
});
