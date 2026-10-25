// Contraste: el texto pequeño de la cabecera de la tanda («pregunta N de M · repaso») pasa 4,5:1 sobre el azul
// (o el color) de la tanda con los 9 acentos, en claro y en oscuro
import { test, expect, openApp, nav, addBuiltinDeck, startTanda } from './fixtures.js';

const ACCENTS = ['cobalto', 'violeta', 'ciruela', 'frambuesa', 'teja', 'oliva', 'bosque', 'laguna', 'tinta'];

// Contraste WCAG de un elemento con su fondo (el color se pasa por un lienzo para resolver color-mix y la transparencia)
const ratio = el => {
  const rgba = c => { const x = document.createElement('canvas').getContext('2d'); x.fillStyle = '#000'; x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data]; };
  const bg = rgba(getComputedStyle(document.body).backgroundColor), fg = rgba(getComputedStyle(el).color);
  const a = fg[3] / 255, mix = [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a));
  const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [l1, l2] = [lum(mix), lum(bg)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

test('cabecera de la tanda: «pregunta N de M» con 4,5:1 o más con los 9 acentos, en claro y en oscuro', async ({ page }) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Turco · Armonía vocálica');
  await nav(page, 'Hoy');
  await startTanda(page);
  const left = page.locator('.studybar .sb-info .left');
  await expect(left).toContainText('pregunta 1 de');
  const bad = [];
  for (const theme of ['light', 'dark']) for (const accent of ACCENTS) {
    await page.evaluate(async ([accent, theme]) => { const { S } = await import('/js/comun.js'); const { applyLook } = await import('/js/prefs.js'); S.prefs.look.accent = accent; S.prefs.look.theme = theme; applyLook(S.prefs.look); }, [accent, theme]);
    const r = await left.evaluate(ratio);
    if (r < 4.5) bad.push(`${accent} (${theme}): ${r.toFixed(2)}`);
  }
  expect(bad).toEqual([]);
});
