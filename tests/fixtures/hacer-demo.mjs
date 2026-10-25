// Genera tests/fixtures/demo.json: los datos de ejemplo del modo pruebas (?local → «Cargar datos de ejemplo»),
// tal como quedan en la app, para las pruebas del motor del plan. Desde tests/: node fixtures/hacer-demo.mjs
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PORT = process.env.PORT || '8124';
const srv = spawn(process.execPath, ['serve.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT } });
await new Promise(ok => srv.stdout.once('data', ok));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ locale: 'es-ES', timezoneId: 'Europe/Madrid', serviceWorkers: 'block' });
  await page.route(/cdn\.jsdelivr\.net/, r => r.abort());
  await page.goto(`http://localhost:${PORT}/?local`);
  await page.getByRole('button', { name: 'Cargar datos de ejemplo' }).click();
  await page.locator('#toast', { hasText: 'Datos de ejemplo cargados' }).waitFor({ timeout: 60000 });
  const data = await page.evaluate(async () => {
    const { S, counts } = await import('/js/comun.js');
    const { dayKey } = await import('/js/plan.js');
    const c = counts('all');
    return {
      today: dayKey(), now: Date.now(), newPerDay: S.newPerDay, tandaMin: S.prefs.study.tandaMin, plan: S.prefs.plan,
      decks: [...S.decks.values()].map(d => ({ id: d.id, name: d.name, folder_id: d.folder_id || null, archived: !!d.archived, options: d.options || {} })),
      folders: [...S.folders.values()].map(f => ({ id: f.id, name: f.name, parent_id: f.parent_id || null, position: f.position || 0 })),
      pages: [...S.pages.values()].map(p => ({ id: p.id, deck_id: p.deck_id || null })),
      cards: [...S.cards.values()].map(x => ({ id: x.id, deck_id: x.deck_id })),
      progress: [...S.progress].map(([id, p]) => ({ card_id: id, ...p })),
      events: S.events.map(e => ({ card_id: e.card_id, deck_id: e.deck_id, ts: e.ts, state: e.state, grade: e.grade, ms: e.ms })),
      old: { hoy: { due: c.due, newToday: c.newToday } },
    };
  });
  writeFileSync(new URL('./demo.json', import.meta.url), JSON.stringify(data));
  console.log(`demo.json: ${data.decks.length} listas, ${data.cards.length} preguntas, ${data.progress.length} vistas, ${data.events.length} respuestas (${data.today})`);
} finally {
  await browser.close();
  srv.kill();
}
