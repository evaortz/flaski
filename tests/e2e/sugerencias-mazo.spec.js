// Revisar las sugerencias de una en una en el móvil (un mazo): deslizar, botones, teclado, «Deshacer», fin de apartado;
// en el ordenador, la lista de siempre
import { test, expect, openApp, openPage } from './fixtures.js';

test.use({ sugView: 'mazo' });

// Dos apartados con 3 y 2 definiciones (todas salen marcadas) y una frase menos segura
const DOS = '# Célula\n\n## Orgánulos\n\nRibosoma: fabrica las proteínas de la célula.\n\nLisosoma: digiere lo que la célula ya no necesita.\n\nMitocondria: produce la energía de la célula.\n\n## Núcleo\n\nNucléolo: fabrica los ribosomas dentro del núcleo.\n\nCromatina: el ADN con sus proteínas, dentro del núcleo.\n\nLa célula es la unidad básica de la vida.';
async function openDeck(page, seed, md = DOS) {
  await seed({ pages: [{ md }] });
  await openApp(page);
  await openPage(page, /^# (.+)/.exec(md)[1]);
  await page.locator('.pg-suggest').click();
  await expect(page.locator('[data-sd-card]')).toBeVisible();
}
// Arrastra la tarjeta con el dedo (dx, dy); con drop, la suelta
const drag = (page, dx, dy, drop = true) => page.locator('[data-sd-card]').evaluate((el, [dx, dy, drop]) => {
  const r = el.getBoundingClientRect(), x0 = r.x + r.width / 2, y0 = r.y + 60;
  const ev = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', isPrimary: true, pointerId: 5, clientX: x, clientY: y }));
  ev('pointerdown', x0, y0);
  for (let k = 1; k <= 10; k++) ev('pointermove', x0 + (dx * k) / 10, y0 + (dy * k) / 10);
  if (drop) ev('pointerup', x0 + dx, y0 + dy);
}, [dx, dy, drop]);
const title = page => page.locator('.sd-title');
const front = page => page.locator('.sd-q');
// Color de fondo de la pastilla (::before) de la tarjeta
const pill = page => page.locator('[data-sd-card]').evaluate(el => { const s = getComputedStyle(el, '::before'); return { text: s.content, bg: s.backgroundColor, color: s.color, opacity: +s.opacity }; });

test('el mazo: arriba el apartado y «1 de 3», la pregunta con su tipo y de dónde sale, y debajo «Se añaden a…»', async ({ page, seed }) => {
  await openDeck(page, seed);
  await expect(title(page)).toHaveText('Célula · 1 de 3');
  await expect(page.locator('.sd-sub')).toHaveText('apartado 1 de 2 · Orgánulos');
  await expect(page.locator('.sd-bar i')).toHaveCount(3);
  await expect(page.locator('.sd-chip')).toContainText('Básica');
  await expect(front(page)).toHaveText('¿Qué es el ribosoma?');
  await expect(page.locator('.sd-a')).toContainText('Fabrica las proteínas de la célula');
  await expect(page.locator('.sd-foot')).toContainText('de: Orgánulos · párrafo 1');
  await expect(page.locator('.sd-foot [data-sd="see"]')).toHaveText('Ver en el apunte');
  await expect(page.locator('.sd-to')).toContainText('Se añaden a una lista nueva: «Célula»');
  for (const b of ['drop', 'edit', 'add']) await expect(page.locator(`[data-sd="${b}"]`)).toBeVisible();
});

test('deslizar: a la derecha añade, a la izquierda descarta (con «Deshacer») y arriba edita; al arrastrar, la pastilla de su color y su botón se ilumina', async ({ page, seed }) => {
  await openDeck(page, seed);
  // Derecha, sin soltar: «Añadir» en menta con texto oscuro; el botón de añadir crece con su anillo y los demás se apagan
  await drag(page, 160, 0, false);
  expect(await pill(page)).toMatchObject({ text: '"Añadir"', bg: 'rgb(142, 227, 181)', color: 'rgb(22, 24, 58)', opacity: 1 });
  // (el botón cambia con una transición corta: se espera a que acabe)
  await expect.poll(() => page.locator('.sd-add').evaluate(el => getComputedStyle(el).boxShadow)).toContain('rgb(142, 227, 181)');
  expect(await page.locator('.sd-add').evaluate(el => getComputedStyle(el).transform)).not.toBe('none');
  await expect.poll(() => page.locator('.sd-drop').evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(0.5);
  // Ni marco ni capa de color en la tarjeta
  expect(await page.locator('[data-sd-card]').evaluate(el => getComputedStyle(el).boxShadow)).not.toContain('142, 227, 181');
  await page.locator('[data-sd-card]').evaluate(el => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true, pointerId: 5, clientX: 400, clientY: 200 })));
  await expect(title(page)).toHaveText('Célula · 2 de 3');
  // Izquierda: «Descartar» en coral; al soltar, «Descartada · Deshacer»
  await drag(page, -160, 0, false);
  expect(await pill(page)).toMatchObject({ text: '"Descartar"', bg: 'rgb(255, 159, 146)' });
  await page.locator('[data-sd-card]').evaluate(el => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true, pointerId: 5, clientX: 0, clientY: 200 })));
  await expect(title(page)).toHaveText('Célula · 3 de 3');
  await expect(page.locator('#toast')).toContainText('Descartada');
  await page.locator('#toast .ta-btn').click();
  await expect(title(page)).toHaveText('Célula · 2 de 3');
  await expect(front(page)).toHaveText('¿Qué es el lisosoma?');
  // Arriba: «Editar» en azul claro, y se abre el editor
  await drag(page, 0, -170, false);
  expect(await pill(page)).toMatchObject({ text: '"Editar"', bg: 'rgb(158, 212, 255)' });
  await page.locator('[data-sd-card]').evaluate(el => el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true, pointerId: 5, clientX: 180, clientY: 0 })));
  await expect(page.locator('.ed-title')).toContainText('Editar sugerencia');
  // Al guardar lo retocado, cuenta como añadida y sigue con la siguiente
  await page.locator('#fld-a').fill('Digiere lo que sobra');
  await page.locator('.ed-foot button[type="submit"]').click();
  await expect(title(page)).toHaveText('Célula · 3 de 3');
});

test('los botones y el teclado (→ añade, ← descarta, E edita) hacen lo mismo; lo descartado no vuelve a salir', async ({ page, seed }) => {
  await openDeck(page, seed);
  await page.locator('[data-sd="add"]').click();
  await expect(title(page)).toHaveText('Célula · 2 de 3');
  await page.locator('[data-sd="drop"]').click();
  await expect(title(page)).toHaveText('Célula · 3 de 3');
  await page.keyboard.press('e');
  await expect(page.locator('.ed-title')).toContainText('Editar sugerencia');
  await page.locator('.ed-x').click();
  await expect(title(page)).toHaveText('Célula · 3 de 3');
  await page.keyboard.press('ArrowRight');
  // Fin del apartado: 3 en 1 min · 2 añadidas · 1 descartada
  await expect(page.locator('.sd-end-h')).toHaveText('Orgánulos, revisado');
  await expect(page.locator('.sd-c-add')).toHaveText('2 añadidas');
  await expect(page.locator('.sd-c-drop')).toHaveText('1 descartada');
  // El descartado ya no sale (flaski-sug-hidden)
  const hidden = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('flaski-sug-hidden') || '{}')).flat());
  expect(hidden.length).toBe(1);
  await page.locator('.sd-end-acts [data-sd="stop"]').click();
  await page.locator('.pg-suggest').click();
  await expect(page.locator('.sd-q')).not.toHaveText('¿Qué es el lisosoma?');
});

test('fin de apartado: cuántas en cuánto, añadidas y descartadas, cuándo entran, el siguiente apartado y «Por hoy vale»; las menos seguras, al final y con aviso', async ({ page, seed }) => {
  await openDeck(page, seed);
  for (let k = 0; k < 3; k++) await page.locator('[data-sd="add"]').click();
  await expect(page.locator('.sd-end-t')).toHaveText('3 sugerencias en 1 min');
  await expect(page.locator('.sd-when')).toContainText('Las 3 nuevas entran en tus tandas');
  await expect(page.locator('.sd-next')).toContainText('Núcleo');
  await expect(page.locator('.sd-next')).toContainText('2 sugerencias · menos de 1 min');
  await expect(page.locator('.sd-left')).toContainText('Quedan 1 apartado y las menos seguras · 3 sugerencias');
  await expect(page.locator('[data-sd="next"]')).toHaveText('Seguir con el apartado 2');
  await expect(page.locator('[data-sd="stop"]').last()).toHaveText('Por hoy vale');
  // Las añadidas ya son preguntas de la lista nueva
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('flaski-local-v1')).cards.length)).toBe(3);
  await page.locator('[data-sd="next"]').click();
  await expect(page.locator('.sd-sub')).toHaveText('apartado 2 de 2 · Núcleo');
  await page.locator('[data-sd="add"]').click();
  await page.locator('[data-sd="drop"]').click();
  await page.locator('[data-sd="next"]').click();
  // Las que no salían marcadas, al final y con su aviso
  await expect(page.locator('.sd-sub')).toHaveText('Estas son menos seguras');
  await expect(page.locator('.sd-weak')).toBeVisible();
  await page.locator('[data-sd="stop"], [data-sd="exit"]').first().click();
  await expect(page.locator('#sheet')).toBeHidden();
});

test('con 1 o 2 sugerencias no hay pantalla de fin: se crean y vuelves al apunte', async ({ page, seed }) => {
  await openDeck(page, seed, '# Dos\n\nRibosoma: fabrica las proteínas de la célula.\n\nLisosoma: digiere lo que la célula ya no necesita.');
  await expect(title(page)).toHaveText('Sugerencias · 1 de 2');
  await expect(page.locator('.sd-sub')).toHaveText('de tu apunte «Dos»');
  await page.locator('[data-sd="add"]').click();
  await page.locator('[data-sd="add"]').click();
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#toast')).toContainText('2 preguntas creadas');
});

test('«Otras formas de preguntarlo» en una tarjeta la cambia sin salir del mazo', async ({ page, seed }) => {
  await openDeck(page, seed, '# Constitución\n\nLa forma política del Estado español es la **Monarquía parlamentaria**.\n\n| Pregunta | Respuesta |\n|---|---|\n| ¿Cuál es la forma política del Estado? | La Monarquía parlamentaria |\n\nLa capital del Estado es la **villa de Madrid**.');
  await page.locator('.sd-alts summary').click();
  await page.locator('.sd-alts .sug-use').click();
  await expect(front(page)).toHaveText('¿Cuál es la forma política del Estado?');
  await expect(page.locator('[data-sd-card]')).toBeVisible();
  await expect(page.locator('#toast')).toContainText('Cambiada');
});

test('en el ordenador sale la lista de siempre; en el móvil, el mazo @ambos', async ({ page, seed }, info) => {
  await seed({ pages: [{ md: DOS }] });
  await openApp(page);
  await openPage(page, 'Célula');
  await page.locator('.pg-suggest').click();
  if (info.project.name === 'escritorio') {
    await expect(page.locator('.sug').first()).toBeVisible();
    await expect(page.locator('[data-sd-card]')).toHaveCount(0);
  } else {
    await expect(page.locator('[data-sd-card]')).toBeVisible();
    await expect(page.locator('.sug')).toHaveCount(0);
  }
});

test('en el móvil se pasa a la lista con «Ver en lista» y se vuelve con «De una en una»; se recuerda', async ({ page, seed }) => {
  await openDeck(page, seed);
  await page.locator('[data-sd="list"]').click();
  await expect(page.locator('.sug').first()).toBeVisible();
  await page.locator('[data-act="close-sheet"]').first().click();
  await page.locator('.pg-suggest').click();
  await expect(page.locator('.sug').first()).toBeVisible();
  await page.locator('[data-sd-mazo]').click();
  await expect(page.locator('[data-sd-card]')).toBeVisible();
});
