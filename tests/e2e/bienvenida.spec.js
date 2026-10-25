// La primera vez (primera-vez.js) y la presentación que se puede ver desde Perfil
import { test, expect, nav } from './fixtures.js';

test.use({ intro: true });

const open = async page => { await page.goto('/'); await expect(page.locator('.ob.fr')).toBeVisible(); };

test('oposición con tema de ejemplo: carpeta con examen, primera tanda y su final', async ({ page }) => {
  await open(page);
  await expect(page.locator('.fr h1')).toHaveText('¿Qué quieres estudiar?');
  await page.locator('[data-fr-what="opo"]').click();
  await expect(page.locator('.fr h1')).toHaveText('Tu oposición');
  await page.locator('[data-fr-go="examen"]').click();                     // sin nombre no sigue
  await expect(page.locator('#frName')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#frNameErr')).toHaveText('Escribe el nombre de tu oposición');
  await page.locator('#frName').fill('Auxiliar Administrativo');
  await expect(page.locator('#frNameErr')).toBeHidden();
  await expect(page.locator('#frHeroName')).toHaveText('Auxiliar Administrativo');
  await expect(page.locator('#frName')).toHaveAttribute('placeholder', 'Ej.: Auxiliar Administrativo del Estado');
  await page.locator('#frExam').click();                                    // selector propio: 12 meses desde el actual
  const now = new Date(), cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  await expect(page.locator('.fr-cal-m button')).toHaveCount(12);
  await expect(page.locator('.fr-cal-m button').first()).toHaveAttribute('data-fr-month', cur);
  await expect(page.locator('.fr-cal-m button:disabled')).toHaveCount(0);
  await expect(page.locator('[data-fr-year="-1"]')).toBeDisabled();
  // Las flechas pasan a los 12 siguientes (y vuelven)
  await page.locator('[data-fr-year="1"]').click();
  const next = `${now.getFullYear() + 1}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  await expect(page.locator('.fr-cal-m button').first()).toHaveAttribute('data-fr-month', next);
  await page.locator('[data-fr-year="-1"]').click();
  while (!(await page.locator('[data-fr-month="2027-05"]').count())) await page.locator('[data-fr-year="1"]').click();
  await page.locator('[data-fr-month="2027-05"]').click();
  await expect(page.locator('.fr-cal')).toHaveCount(0);
  await expect(page.locator('#frExam')).toHaveText('mayo de 2027');
  await expect(page.locator('#frHeroWhen')).toHaveText('examen en mayo de 2027');
  await page.locator('[data-fr-go="examen"]').click();
  await expect(page.locator('.fr h1')).toHaveText('Trae tu tema');
  await page.getByRole('button', { name: 'Prueba con un tema de ejemplo' }).click();
  await page.locator('[data-fr-tema="0"]').click();
  await expect(page.locator('.fr-file')).toContainText('La Constitución · Título Preliminar');
  await expect(page.locator('.fr-secs li').first()).toContainText('empiezas aquí');
  await expect(page.locator('.fr-sug h2')).toContainText('preguntas posibles');
  await page.locator('[data-fr-go="tanda"]').click();

  // La primera tanda, con el bocadillo al ver la primera respuesta
  await expect(page.locator('.ob')).toHaveCount(0);
  await expect(page.locator('.studybar .left')).toContainText('pregunta 1 de 5');
  await page.locator('[data-act="reveal"]').click();
  await expect(page.locator('.first-tip')).toContainText('¿Cómo te ha ido?');
  for (let i = 0; i < 5; i++) {
    if (i) await page.locator('[data-act="reveal"]').click();
    await page.locator('[data-grade="3"]').click();
  }
  await expect(page.locator('.done h2')).toHaveText('¡Primera tanda hecha!');
  await page.locator('.first-opts [data-tanda-min="15"]').click();
  await expect(page.locator('.first-opts [data-tanda-min="15"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-act="first-done"]').click();
  await expect(page.locator('#main .hero-done')).toContainText('estás al día');   // Hoy, sin nada más para hoy

  // La carpeta, con el apunte y su lista, y el examen en el Plan de estudio
  await nav(page, 'Biblioteca');
  await expect(page.locator('#main .lfold')).toContainText('Auxiliar Administrativo');
  await page.locator('#main .lfold').click();
  await expect(page.locator('#main .fhero')).toContainText('examen el 1 may');

  // No vuelve a salir
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
  await expect(page.locator('.ob:not(.news)')).toHaveCount(0);
});

test('un idioma: crea la lista o abre una ya hecha', async ({ page }) => {
  await open(page);
  await page.locator('[data-fr-what="idioma"]').click();
  await page.locator('#frLang').selectOption('ja-JP');
  await expect(page.locator('[data-fr-example="japones-demo.json"]')).toBeVisible();
  await page.locator('#frLang').selectOption('de-DE');
  await page.locator('[data-fr-go="lang"]').click();
  await expect(page.locator('.ob')).toHaveCount(0);
  await expect(page.locator('.ed-typesel')).toContainText('Sustantivo alemán');   // ya en el editor de la lista nueva
});

test('pegar el texto y ver las preguntas antes de empezar', async ({ page }) => {
  await open(page);
  await page.locator('[data-fr-what="otra"]').click();
  await expect(page.locator('.fr h1')).toHaveText('Trae tus apuntes');
  await page.locator('[data-fr-step="pegar"]').click();
  await page.locator('#frText').fill('# La célula\n\n## Partes\n\nEl **núcleo** guarda el ADN.\n\nLa **membrana** protege la célula.\n\n## Tipos\n\nLas **procariotas** no tienen núcleo.');
  await page.locator('[data-fr-go="pegar"]').click();
  await expect(page.locator('.fr-secs li')).toHaveCount(2);
  await expect(page.locator('[data-fr-go="review"]')).toHaveText('Ver las 3 antes');
  await page.locator('[data-fr-go="review"]').click();
  await expect(page.locator('#pgTitle')).toHaveValue('La célula');
  await expect(page.locator('#sheetBody .sug-check input:checked')).toHaveCount(3);
});

test('subir un archivo de Markdown y «cambiar de archivo»', async ({ page }) => {
  await open(page);
  await page.locator('[data-fr-what="uni"]').click();
  await page.locator('#frName').fill('Biología');
  await page.locator('[data-fr-noexam]').click();
  await expect(page.locator('#frHeroWhen')).toHaveText('sin fecha de examen');
  await page.locator('[data-fr-go="examen"]').click();
  await page.locator('#frFile').setInputFiles({ name: 'tema-1.md', mimeType: 'text/markdown', buffer: Buffer.from('# Tema 1\n\nLa **mitosis** produce dos células iguales.\n') });
  await expect(page.locator('.fr-file')).toContainText('tema-1.md');
  await expect(page.locator('.fr-file-k')).toHaveText('MD');
  await page.locator('.fr-links [data-fr-back]').click();
  await expect(page.locator('.fr h1')).toHaveText('Trae tus apuntes');
  await page.locator('[data-fr-back]').first().click();
  await expect(page.locator('#frName')).toHaveValue('Biología');
});

test('«ir a Hoy» la cierra y la presentación se puede ver desde Perfil', async ({ page }) => {
  await open(page);
  await page.locator('[data-fr-done]').click();
  await expect(page.locator('.ob')).toHaveCount(0);
  await nav(page, 'Perfil');
  await page.locator('[data-act="intro"]').click();
  await expect(page.locator('.ob h1')).toHaveText('Te damos la bienvenida a Flaski');
  await page.locator('.ob-skip').click();
  await page.locator('[data-ob-pick="ia"]').click();
  await expect(page.getByRole('heading', { name: 'Pegar una lista' })).toBeVisible();
});

test('oposición: «del tema 1» no se parte al final de la línea y los iconos de «¿Cómo empiezas?» no salen en blanco', async ({ page }) => {
  await open(page);
  await page.locator('[data-fr-what="opo"]').click();
  await expect(page.locator('.fr-how', { hasText: 'Subo mis apuntes' }).locator('small')).toHaveText('PDF, Word… lo que tengas del tema 1');
  // Cada opción con su dibujo (un icono que no existe sale vacío)
  const empty = await page.locator('.fr-how-ic').evaluateAll(els => els.filter(e => !e.querySelector('svg, img')).length);
  expect(empty).toBe(0);
});

// El tema de ejemplo se abre por el apunte (arriba del todo, con sus preguntas), no con una primera tanda;
// tus apuntes pegados siguen empezando con la primera tanda
test('el tema de ejemplo se abre por el apunte; lo que pegas sigue empezando la tanda', async ({ page }) => {
  await open(page);
  await page.locator('[data-fr-what="otra"]').click();
  await page.getByRole('button', { name: 'Prueba con un tema de ejemplo' }).click();
  await page.locator('[data-fr-tema="1"]').click();
  await expect(page.locator('.fr-file')).toContainText('Por qué se te olvidan las cosas');
  await expect(page.locator('[data-fr-go="tanda"]')).toHaveCount(0);
  await page.locator('[data-fr-go="open"]').click();
  await expect(page.locator('.ob')).toHaveCount(0);
  await expect(page.locator('#pgTitle')).toHaveValue('Por qué se te olvidan las cosas (y cómo evitarlo)');
  const r = await page.evaluate(async () => { const { S } = await import('/js/comun.js'); return { cards: S.cards.size, session: !!S.session, y: scrollY }; });
  expect(r).toEqual({ cards: 17, session: false, y: 0 });
  await expect(page.locator('#pgBlocks .nb-sec').first()).toContainText('Estudiar');
});
