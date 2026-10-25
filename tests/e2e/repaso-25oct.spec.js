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
