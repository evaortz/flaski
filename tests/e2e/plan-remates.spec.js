// Remates del Plan nuevo vistos en el iPhone de Eva: el camino con temas hechos (la clase «done» chocaba con la del
// final de la tanda) y la barra de cada examen dentro de un botón (en Safari no se estiraba y sus etiquetas se montaban)
import { test, expect } from './fixtures.js';
import { LARGO, setup, checkBars } from './plan-remates-datos.js';

test('el camino de un examen: un tema hecho («ya lo sabes») mide lo mismo que uno por ver y su título no se sale @ambos', async ({ page, seed }) => {
  await setup(page, seed);
  await page.locator('#main .p2-exrow', { hasText: 'Turco A1' }).click();
  const done = page.locator('.p2-step', { hasText: LARGO }), todo = page.locator('.p2-step', { hasText: 'Turco · Lecturas' });
  await expect(done).toContainText('ya lo sabes');
  const [hd, ht] = [await done.evaluate(el => el.getBoundingClientRect().height), await todo.evaluate(el => el.getBoundingClientRect().height)];
  expect(Math.abs(hd - ht)).toBeLessThanOrEqual(24);   // (el título largo puede ocupar una línea más)
  // Ni borde ni caja: no hereda nada de «.done» (el final de la tanda)
  expect(await done.evaluate(el => [getComputedStyle(el).borderTopWidth, getComputedStyle(el).textAlign])).toEqual(['0px', 'start']);
  const fits = await done.locator('b').evaluate(b => { const r = b.getBoundingClientRect(), li = b.closest('.p2-step').getBoundingClientRect(); return r.right <= li.right + 1 && b.scrollWidth <= b.clientWidth + 1; });
  expect(fits).toBe(true);
});

test('la barra de cada examen en el Plan ocupa el ancho de la fila y sus etiquetas no se montan @ambos', async ({ page, seed }) => {
  await setup(page, seed);
  await checkBars(page, '#main .p2-exrow');
});
