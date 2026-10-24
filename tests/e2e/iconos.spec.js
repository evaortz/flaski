// Iconos propios a color (img/iconos): racha encendida o apagada, comodín y sugerencias; sin emojis
import { test, expect, openApp, nav, addBuiltinDeck, answer, pasteNotes } from './fixtures.js';

const loaded = loc => loc.evaluate(async i => { await i.decode(); return i.naturalWidth > 0; });

test('racha apagada y encendida, comodín y sugerencias con los iconos de la app', async ({ page }, info) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Japonés · Demo de Flaski');
  await nav(page, 'Perfil');
  const off = page.locator('.pf-who img.ic-own');
  await expect(off).toHaveAttribute('src', 'img/iconos/racha-apagada.svg');
  expect(await loaded(off)).toBe(true);
  // Con un día de racha, encendida (Hoy, Perfil y, en el ordenador, la barra lateral)
  await nav(page, 'Hoy');
  await page.locator('#main [data-start]').first().click();
  await answer(page, 3);
  await page.locator('.studybar [data-act="exit"]').click();
  await nav(page, 'Hoy');
  await expect(page.locator('.hoy-streak img.ic-own').first()).toHaveAttribute('src', 'img/iconos/racha.svg');
  const wild = page.locator('.hoy-streak .st-freeze img.ic-own');
  await expect(wild).toHaveAttribute('src', 'img/iconos/comodin.svg');
  expect(await loaded(wild)).toBe(true);
  if (info.project.name === 'escritorio') await expect(page.locator('#navMe img.ic-own')).toHaveAttribute('src', 'img/iconos/racha.svg');
  await nav(page, 'Perfil');
  await expect(page.locator('.pf-who img.ic-own')).toHaveAttribute('src', 'img/iconos/racha.svg');
  // «Sugerir preguntas» en un apunte
  await nav(page, 'Biblioteca');
  await pasteNotes(page, '# Biología\n\nLa **mitocondria** es el orgánulo que produce energía.');
  const sug = page.locator('.pg-suggest img.ic-own');
  await expect(sug).toHaveAttribute('src', 'img/iconos/sugerencia.svg');
  expect(await loaded(sug)).toBe(true);
  // Ni ✨ ni 🔥 ni ❄ en la pantalla
  expect(await page.locator('body').innerText()).not.toMatch(/[✨🔥❄]/u);
});
