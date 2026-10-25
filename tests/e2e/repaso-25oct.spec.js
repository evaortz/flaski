// Remates del repaso del 25 oct (docs/rediseno/REPASO-25oct.md): maquetación, Novedades y accesibilidad
import { test, expect, openApp, nav } from './fixtures.js';

const box = (page, sel) => page.locator(sel).first().evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, mid: r.top + r.height / 2 }; });

test('Biblioteca en el móvil: 16 px entre el título y los botones, y el «+» centrado con el título', async ({ page }) => {
  await openApp(page);
  await nav(page, 'Biblioteca');
  const [head, quick, h1, plus] = await Promise.all(['.lib-head', '.lib-quick', '.lib-head h1', '.lib-head .add-round'].map(s => box(page, s)));
  expect(Math.round(quick.top - head.bottom)).toBe(16);
  // El «+» con su sombra (4 px) queda centrado con la letra del título, que llena la parte alta de su caja
  expect(Math.abs(plus.mid + 2 - (h1.mid - 3))).toBeLessThanOrEqual(3);
});

test('apunte: la insignia de preguntas no toca el texto y «Estudiar N» del apartado es un botón separado de ella @ambos', async ({ page, seed }) => {
  const long = 'La Constitución se aprobó en referéndum el 6 de diciembre y se publicó en el BOE el 29 de diciembre de 1978, el 31 de octubre';
  await seed({ decks: [{ name: 'Const' }], pages: [{ md: `# Constitución\n\n## Aprobación\n\n${long}`, deck: 'Const' }] });
  await openApp(page);
  // Dos preguntas unidas al párrafo (insignia en el párrafo y «Estudiar 2» en el apartado)
  await page.evaluate(async () => {
    const api = await import('/js/api.js'); const { S } = await import('/js/comun.js');
    const p = [...S.pages.values()][0], b = p.blocks.find(x => x.type === 'p'), d = [...S.decks.values()][0];
    for (const c of await api.createCards(['a', 'b'].map(q => ({ deck_id: d.id, owner: S.uid, front: q, back: 'r', type_id: 'basic', template: 't1', fields: { q, a: 'r' }, page_id: p.id, block_id: b.id })))) S.cards.set(c.id, c);
  });
  await nav(page, 'Biblioteca');
  await page.locator('#main [data-page]').filter({ hasText: 'Constitución' }).click();
  const para = page.locator('#pgBlocks .nb-p').filter({ has: page.locator('.nb-cards') });
  const [text, badge] = await Promise.all([box(page, '#pgBlocks .nb-p:has(.nb-cards) .nb-text'), box(page, '#pgBlocks .nb-p .nb-cards')]);
  expect(text.right).toBeLessThanOrEqual(badge.left - 6);
  await expect(para.locator('.nb-cards')).toBeVisible();
  const sec = page.locator('#pgBlocks .nb-sec');
  await expect(sec).toHaveText('Estudiar 2');
  // Botón secundario: con borde, fondo de la página y texto normal (no gris de desactivado)
  const [border, color, fg] = await sec.evaluate(el => [getComputedStyle(el).borderTopWidth, getComputedStyle(el).color, getComputedStyle(document.body).color]);
  expect(border).toBe('1px');
  expect(color).toBe(fg);
  // Y lejos de la insignia del título, si la tiene, y del texto del título
  const [h, s] = await Promise.all([box(page, '#pgBlocks .nb-h2 .nb-text'), box(page, '#pgBlocks .nb-sec')]);
  expect(h.right).toBeLessThanOrEqual(s.left);
});
