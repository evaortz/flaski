// «Tu progreso» en Inicio: cuántas tarjetas te sabes, cómo ha crecido y la cabecera que cuenta el día que señalas
import { test, expect, openApp } from './fixtures.js';
import { seedHistory } from './historial.js';

test('tu progreso: lo que te sabes, periodos, notas y la cabecera al recorrer los días', async ({ page }, info) => {
  const db = await seedHistory(page);
  await openApp(page);
  const card = page.locator('#pgHost');
  await expect(card.locator('.lv-k')).toContainText('Tu progreso · hoy');
  await expect(card.locator('.lv-of')).toContainText(`de ${db.cards.length} tarjetas te las sabes`);
  const n = Number((await card.locator('.lv-n').textContent()).replace(/\./g, ''));
  expect(n).toBeGreaterThan(50);
  expect(n).toBeLessThanOrEqual(db.cards.length);
  await expect(card.locator('.lv-sub')).toContainText('desde el');
  // Las franjas, con su nombre a la derecha, y la nota del mazo que llegó a mitad del periodo
  await expect(card.locator('.pg-b3')).toHaveCount(1);
  await expect(card.locator('.pg-lab-m3')).toContainText('Consolidadas');
  await expect(card.locator('.pg-note').first()).toContainText('+70 de Biología');
  await expect(card.locator('.pg-next')).toContainText('Mañana');
  // Al recorrer los días con el teclado, la cabecera cuenta ese día
  await card.locator('.pg-hit').focus();
  await page.keyboard.press('Home');
  await expect(card.locator('.lv-day')).not.toContainText('hoy');
  await expect(card.locator('.lv-of')).toContainText('te las sabías');
  const first = Number((await card.locator('.lv-n').textContent()).replace(/\./g, ''));
  expect(first).toBeLessThan(n);
  await page.keyboard.press('End');
  await expect(card.locator('.lv-day')).toContainText('hoy');
  // Con el ratón, igual
  const box = await card.locator('.pg-hit').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
  await expect(card.locator('.pg-svg')).toHaveClass(/is-hover/);
  await expect(card.locator('.lv-sub')).toContainText('consolidadas');
  if (process.env.SHOT) await card.screenshot({ path: `${process.env.SHOT}/progreso-${info.project.name}.png` });
  await page.mouse.move(0, 0);
  await expect(card.locator('.lv-day')).toContainText('hoy');
  // Periodos: todo el historial y se recuerda
  await card.locator('[data-seg="home.progressPeriod"] [data-v="all"]').click();
  await expect(card.locator('[data-v="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('.lv-sub')).toContainText('desde el');
  await card.locator('[data-v="m1"]').click();
  await expect(card.locator('[data-v="m1"]')).toBeFocused();
  if (process.env.SHOT) await page.locator('section[aria-labelledby="h-act"]').screenshot({ path: `${process.env.SHOT}/actividad-${info.project.name}.png` });
});

test('actividad: la racha grande y, al pasar por un día, la cabecera lo cuenta', async ({ page }) => {
  await seedHistory(page);
  await openApp(page);
  const card = page.locator('section[aria-labelledby="h-act"]');
  await expect(card.locator('.lv-of')).toContainText('de racha');
  await expect(card.locator('#hmSum')).toContainText('Mejor racha');
  await card.locator('[data-v="m1"]').click();
  await expect(card.locator('#hmSum')).toContainText('el último mes');
  await card.locator('rect.hm-today').focus();
  await expect(card.locator('.lv-day')).toContainText(' · ');
  await expect(card.locator('.lv-of')).toContainText('repaso');
  await expect(page.locator('.chart-tip')).toBeHidden();
  await card.locator('rect.hm-today').blur();
  await expect(card.locator('.lv-of')).toContainText('de racha');
});

test('estadísticas: cada tarjeta con su cifra, en tonos del tema, y la cabecera cuenta lo que señalas', async ({ page }, info) => {
  await seedHistory(page);
  await openApp(page);
  await page.goto('/#stats');
  await page.locator('#nav').getByRole('button', { name: 'Perfil' }).click();
  await page.locator('[data-nav="stats"]').click();
  await page.locator('[data-stp="90"]').click();
  const rev = page.locator('section[aria-labelledby="st-rev"]');
  await expect(rev.locator('.lv-of')).toHaveText('respuestas');
  await expect(rev.locator('.st-svg .grid')).toHaveCount(0);                 // sin rejilla
  await expect(rev.locator('.st-bar.bar-strong')).toHaveCount(1);            // hoy, en tono oscuro
  const total = await rev.locator('.lv-n').textContent();
  await rev.locator('.hit').last().focus();
  await expect(rev.locator('.lv-day')).toContainText(' · ');
  await expect(rev.locator('.lv-n')).not.toHaveText(total);
  await rev.locator('.hit').last().blur();
  await expect(rev.locator('.lv-n')).toHaveText(total);
  await expect(page.locator('#stPg .lv-k')).toContainText('Tu progreso');
  await expect(page.locator('section[aria-labelledby="st-hour"] .lv-of')).toHaveText('tu mejor hora');
  await expect(page.locator('section[aria-labelledby="st-ivl"] .lv-sub')).toContainText('La mitad de tus tarjetas');
  await expect(page.locator('.hard-bar').first()).toBeVisible();
  if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/stats-${info.project.name}.png`, fullPage: true });
});
