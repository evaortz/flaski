// Iconos propios a color (en línea, dibujos.js): racha encendida o apagada, comodín y sugerencias; sin emojis
import { test, expect, openApp, nav, addBuiltinDeck, answer, pasteNotes, startTanda } from './fixtures.js';

const loaded = loc => loc.evaluate(i => i.getBoundingClientRect().width > 0);

test('racha apagada y encendida, comodín y sugerencias con los iconos de la app @ambos', async ({ page }, info) => {
  await openApp(page);
  await addBuiltinDeck(page, 'Japonés · Demo de Flaski');
  await nav(page, 'Perfil');
  const off = page.locator('.pf-who svg.ic-own');
  await expect(off).toHaveAttribute('data-ic', 'racha-apagada');
  expect(await loaded(off)).toBe(true);
  // Con un día de racha, encendida (Hoy, Perfil y, en el ordenador, la barra lateral)
  await nav(page, 'Hoy');
  await startTanda(page);
  await answer(page, 3);
  await page.locator('.studybar [data-act="exit"]').click();
  await nav(page, 'Hoy');
  await expect(page.locator('.hoy-streak svg.ic-own').first()).toHaveAttribute('data-ic', 'racha');
  const wild = page.locator('.hoy-streak .st-freeze svg.ic-own');
  await expect(wild).toHaveAttribute('data-ic', 'comodin');
  expect(await loaded(wild)).toBe(true);
  if (info.project.name === 'escritorio') await expect(page.locator('#navMe svg.ic-own')).toHaveAttribute('data-ic', 'racha');
  await nav(page, 'Perfil');
  await expect(page.locator('.pf-who svg.ic-own')).toHaveAttribute('data-ic', 'racha');
  // «Sugerir preguntas» en un apunte
  await nav(page, 'Biblioteca');
  await pasteNotes(page, '# Biología\n\nLa **mitocondria** es el orgánulo que produce energía.');
  const sug = page.locator('.pg-suggest svg.ic-own');
  await expect(sug).toHaveAttribute('data-ic', 'sugerencia');
  expect(await loaded(sug)).toBe(true);
  // Ni ✨ ni 🔥 ni ❄ en la pantalla
  expect(await page.locator('body').innerText()).not.toMatch(/[✨🔥❄]/u);
});
