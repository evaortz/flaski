// Sugerencias: actualizar tras cambiar el apunte, descartar, la ✨ de los bloques y los consejos
import { readFileSync } from 'node:fs';
import { test, expect, openApp, openPage } from './fixtures.js';

// Un apunte ya hecho (el primer «# » es su título), abierto
async function withPage(page, seed, md) {
  await seed({ pages: [{ md }] });
  await openApp(page);
  await openPage(page, /^# (.+)/.exec(md)[1]);
}

test('actualizar las sugerencias tras cambiar el apunte, conservando lo retocado; descartar', async ({ page, seed }) => {
  await withPage(page, seed, '# Célula\n\nCélula: unidad básica de la vida.\n\nLa **membrana** protege la célula.');
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

test('la ✨ marca en el apunte lo que da tarjetas (también al escribir) y abre las de esa parte', async ({ page, seed }) => {
  await withPage(page, seed, '# Biología\n\nUn texto cualquiera sin nada especial.');
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

test('sin sugerencias: consejos según cómo está escrito el apunte y cómo se eligen', async ({ page, seed }) => {
  await withPage(page, seed, `# Tema\n\n${'Esto es una frase larga sobre el tema que no tiene nada destacado ni ninguna definición. '.repeat(4)}\n\n- uno\n- dos`);
  await page.locator('.pg-suggest').click();
  await expect(page.locator('.sug-tips')).toContainText('párrafo largo');
  await expect(page.locator('.sug-tips')).toContainText('viñetas');
  await expect(page.locator('.sug-how')).toHaveAttribute('open', '');
});

test('el género de las palabras se carga al abrir las sugerencias: «¿Cuántas legiones…?», no «¿Cuántos…?»', async ({ page, seed }) => {
  await withPage(page, seed, '# Roma\n\nEl ejército tiene seis legiones.');
  await page.locator('.pg-suggest').click();
  await expect(page.locator('.sug .f')).toHaveText(['¿Cuántas legiones tiene el ejército?']);
});

test('la hoja pregunta los términos («¿Qué es el efecto de espaciado?») y la tabla «Pregunta | Respuesta» sin «→ respuesta»', async ({ page, seed }) => {
  await withPage(page, seed, '# Memoria\n\n**Efecto de espaciado:** se recuerda mejor lo que se repasa repartido en el tiempo.\n\n| Pregunta | Respuesta |\n|---|---|\n| ¿Quién estudió la curva del olvido? | Ebbinghaus |');
  await page.locator('.pg-suggest').click();
  await expect(page.locator('.sug .f')).toHaveText(['¿Qué es el efecto de espaciado?', '¿Quién estudió la curva del olvido?']);
});

test('una sugerencia por dato: las otras formas de preguntarlo van plegadas y se cambia a una con un toque', async ({ page, seed }) => {
  await withPage(page, seed, '# Constitución\n\nLa forma política del Estado español es la **Monarquía parlamentaria**.\n\n| Pregunta | Respuesta |\n|---|---|\n| ¿Cuál es la forma política del Estado? | La Monarquía parlamentaria |');
  await page.locator('.pg-suggest').click();
  await expect(page.locator('.sug')).toHaveCount(1);
  const alts = page.locator('.sug-alts');
  await expect(alts.locator('summary')).toHaveText('Otras formas de preguntarlo (1)');
  await expect(alts.locator('.sug-alt')).toBeHidden();
  // En los huecos, la línea de debajo es solo lo que falta
  await expect(page.locator('.sug > .row .b')).toHaveText('Monarquía parlamentaria');
  await alts.locator('summary').click();
  await expect(alts.locator('.sug-alt')).toContainText('¿Cuál es la forma política del Estado?');
  const use = alts.locator('.sug-use');
  await expect(use).toHaveText('Usar esta');
  const box = await use.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  await use.click();
  await expect(page.locator('.sug > .row .f')).toHaveText('¿Cuál es la forma política del Estado?');
  await expect(page.locator('.sug-alts .sug-alt')).toContainText('La forma política del Estado español es la […].');
  // «Cambiada», con «Deshacer»
  await expect(page.locator('#toast')).toContainText('Cambiada');
  await page.locator('#toast .ta-btn').click();
  await expect(page.locator('.sug > .row .f')).toHaveText('La forma política del Estado español es la […].');
  await page.locator('.sug-alts .sug-use').click();
  // Al actualizar se queda la forma elegida
  await page.locator('[data-act="sug-refresh"]').click();
  await expect(page.locator('.sug > .row .f')).toHaveText('¿Cuál es la forma política del Estado?');
});

test('huecos cortos: la hoja enseña solo el trozo de la frase con el hueco, y ningún hueco en un verbo', async ({ page, seed }) => {
  await withPage(page, seed, '# Constitución\n\nLa Constitución se fundamenta en la unidad de la Nación española, patria común e indivisible de todos los españoles, y reconoce y garantiza el **derecho a la autonomía** de las nacionalidades y regiones.\n\nMientras duermes, el cerebro **consolida** lo que has aprendido.');
  await page.locator('.pg-suggest').click();
  await expect(page.locator('.sug .f')).toHaveText(['La Constitución reconoce y garantiza el […] de las nacionalidades y regiones.']);
});

test('una lista de 5 o más: un hueco por elemento y «¿Cuántos…?», con la lista entera plegada debajo', async ({ page, seed }) => {
  await withPage(page, seed, '# Principios\n\nLa Constitución garantiza:\n\n- el principio de legalidad\n- la jerarquía normativa\n- la publicidad de las normas\n- la seguridad jurídica\n- la responsabilidad');
  await page.locator('.pg-suggest').click();
  await expect(page.locator('.sug .f').filter({ hasText: '¿Cuántos principios garantiza la Constitución?' })).toHaveCount(1);
  await expect(page.locator('.sug .f').filter({ hasText: 'La Constitución garantiza: el principio de legalidad, la jerarquía normativa, […]' })).toHaveCount(1);
  const count = page.locator('.sug').filter({ hasText: '¿Cuántos principios' });
  await count.locator('.sug-alts summary').click();
  await expect(count.locator('.sug-alt')).toContainText('¿Qué garantiza la Constitución?');
});

test('la hoja marca como mucho 15 de entrada, con el lápiz a la vista y «Si la escribes con tus palabras, la recordarás mejor»', async ({ page, seed }) => {
  await withPage(page, seed, '# Muchas\n\n' + Array.from({ length: 20 }, (_, i) => `Término ${i + 1}: definición número ${i + 1} del tema.`).join('\n\n'));
  await page.locator('.pg-suggest').click();
  await expect(page.locator('.sug')).toHaveCount(15);
  await page.locator('[data-act="sug-more"]').click();
  await expect(page.locator('.sug')).toHaveCount(20);
  await expect(page.locator('.sug.on')).toHaveCount(15);
  await expect(page.locator('#sugCount')).toHaveText('15 marcadas');
  await expect(page.locator('.sug-own')).toHaveText('Si la escribes con tus palabras, la recordarás mejor.');
  await expect(page.locator('.sug').first().locator('.sug-ed')).toBeVisible();
  await page.locator('.sug').first().locator('.sug-ed').click();
  await expect(page.locator('.ed-title')).toContainText('Editar sugerencia');
});

test('el texto de donde sale una sugerencia acaba en «…» cuando no cabe @ambos', async ({ page, seed }) => {
  await withPage(page, seed, '# Constitución\n\n- **Aprobación por las Cortes:** 31 de octubre de 1978, tras un largo debate parlamentario en el Congreso y en el Senado de aquella legislatura.');
  await page.locator('.pg-suggest').click();
  const q = page.locator('.sug-src q').first();
  await expect(q).toBeVisible();
  // O no cabe y la línea lo corta con «…», o cabe y ya acaba en «…» (el texto se corta a 90 letras)
  const [overflow, cut, text] = await q.evaluate(el => [getComputedStyle(el).textOverflow, el.scrollWidth > el.clientWidth, el.textContent]);
  expect(overflow).toBe('ellipsis');
  expect(cut || text.endsWith('…')).toBe(true);
});

/* Remates de la parte 1 (revisados en el navegador), con el apunte de la Constitución */
const CONSTITUCION = readFileSync(new URL('../../docs/rediseno/sugerencias/apuntes/constitucion-titulo-preliminar.md', import.meta.url), 'utf8');
const openConstitucion = async (page, seed) => {
  await withPage(page, seed, CONSTITUCION);
  await page.locator('.pg-suggest').click();
  await page.locator('[data-act="sug-more"]').click();
};

test('«Usar esta» en una fila de abajo: la lista no vuelve arriba y la fila sigue a la vista con sus otras formas abiertas @ambos', async ({ page, seed }) => {
  await openConstitucion(page, seed);
  const row = page.locator('.sug').filter({ has: page.locator('.sug-alts') }).last();
  await row.scrollIntoViewIfNeeded();
  await row.locator('.sug-alts summary').click();
  const before = await page.locator('#sugMain').evaluate(el => el.scrollTop);
  expect(before).toBeGreaterThan(200);
  await row.locator('.sug-use').first().click();
  await expect(page.locator('#toast')).toContainText('Cambiada');
  const changed = page.locator('.sug').filter({ has: page.locator('.sug-alts[open]') });
  await expect(changed).toHaveCount(1);
  await expect(changed).toBeInViewport();
  expect(await page.locator('#sugMain').evaluate(el => el.scrollTop)).toBeGreaterThan(200);
});

test('el texto de origen: de una tabla, solo la fila de la pregunta; de un párrafo, desde la frase de la pregunta', async ({ page, seed }) => {
  await openConstitucion(page, seed);
  const lengua = page.locator('.sug').filter({ hasText: '¿Qué lengua es oficial en todo el Estado?' });
  await expect(lengua.locator('.sug-src q')).toHaveText('¿Qué lengua es oficial en todo el Estado? · El castellano (art. 3.1)');
  const autonomia = page.locator('.sug').filter({ hasText: 'La Constitución reconoce y garantiza el […]' });
  await expect(autonomia.locator('.sug-src q')).toHaveText(/^…y reconoce y garantiza el derecho a la autonomía/);
  const deber = page.locator('.sug').filter({ hasText: 'Todos los españoles tienen el […]' });
  await expect(deber.locator('.sug-src q')).toHaveText(/^…Todos los españoles tienen el deber de conocerla/);
  // Nunca el Markdown de la tabla
  await expect(page.locator('.sug-src q').filter({ hasText: '|---|' })).toHaveCount(0);
});

test('en el móvil, ningún «·» suelto al principio de una línea de la fila (el apartado va en su propia línea)', async ({ page, seed }) => {
  await openConstitucion(page, seed);
  const bad = await page.locator('.sug .rmeta').evaluateAll(els => els.filter(m => {
    const kids = [...m.children];
    return kids.some((k, j) => j > 0 && /^·/.test(k.textContent.trim()) && k.getBoundingClientRect().top > kids[j - 1].getBoundingClientRect().top + 4);
  }).length);
  expect(bad).toBe(0);
  await expect(page.locator('.sug .sug-where').first()).toBeVisible();
});

