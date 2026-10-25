// Dos dispositivos con la misma cuenta: uno con la versión vieja de la app (plan v1) y otro con la nueva (v2), con la
// nube simulada. El plan nuevo nunca se pierde ni vuelve al v1: lo que escribe la vieja se junta con él
import { test, expect } from './fixtures.js';
import { mockCloud, openCloud } from './nube.js';

const DECK = 'd0000000-0000-4000-8000-000000000001';
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// Lo que hace la versión vieja: al cargar, solo las claves del plan que conoce (y sim entero); al guardar, su plan
// con los días especiales y las etapas unidos por id con los de la nube
const OLD = { nodes: {}, week: null, special: [], stages: [], simGoal: {}, sim: {}, startDone: false, lateOk: '' };
const oldLoad = plan => Object.fromEntries(Object.keys(OLD).map(k => [k, plan?.[k] !== undefined ? structuredClone(plan[k]) : structuredClone(OLD[k])]));
const union = (a = [], b = []) => { const m = new Map(); for (const x of [...a, ...b]) { const o = m.get(x.id); if (!o || (x.at || 0) >= (o.at || 0)) m.set(x.id, x); } return [...m.values()]; };
const oldSave = (srv, edit) => {
  const cloud = srv.settings.prefs.plan, mine = oldLoad(cloud);
  edit(mine);
  srv.settings = { ...srv.settings, prefs: { ...srv.settings.prefs, plan: { ...mine, special: union(cloud?.special, mine.special), stages: union(cloud?.stages, mine.stages) } } };
};
const WEEK = { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 30, sun: 30 };
const planOf = page => page.evaluate(() => import('/js/plan2-app.js').then(m => m.plan2()));
const saved = async (srv, test) => expect.poll(() => { const p = srv.settings?.prefs?.plan; return !!p && test(p); }, { timeout: 15000 }).toBe(true);
const save = page => page.evaluate(async () => { const { savePrefsSoon } = await import('/js/pantallas/perfil.js'); savePrefsSoon(); });

test('la vieja guarda primero, la nueva migra; después la vieja guarda encima y la nueva lo junta sin perder nada', async ({ page }) => {
  const srv = await mockCloud(page);
  // La versión vieja dejó su plan: un examen en la lista y su semana
  srv.settings = { new_per_day: 15, prefs: { plan: { ...OLD, nodes: { [DECK]: { exam: day(40), lastWeek: true } }, week: WEEK } } };
  await openCloud(page);
  // La nueva lo migra al entrar y lo guarda: v2, con su espejo en v1 para la vieja
  await saved(srv, p => p.v === 2 && p.nodes?.[DECK]?.exam === day(40));
  expect((await planOf(page)).exams.map(e => e.date)).toEqual([day(40)]);
  // Algo que solo sabe el plan nuevo: un tope en Ajustes del plan
  await page.evaluate(async () => { const { editPlan2 } = await import('/js/plan2-app.js'); editPlan2().caps = { ...editPlan2().caps, newPerDay: 9 }; });
  await save(page);
  await saved(srv, p => p.caps?.newPerDay === 9);
  // La vieja cambia la fecha y los lunes, y guarda su v1 encima
  oldSave(srv, p => { p.nodes[DECK].exam = day(50); p.week = { ...p.week, mon: 60 }; });
  expect(srv.settings.prefs.plan.v).toBe(undefined);
  // La nueva vuelve a entrar: lo de la vieja (fecha y lunes) y lo suyo (el tope) juntos, y sigue en v2
  await page.reload();
  await expect(page.locator('#main :is(.spin, .skel)')).toHaveCount(0);
  const p = await planOf(page);
  expect(p.v).toBe(2);
  expect(p.exams.filter(e => !e.deleted).map(e => e.date)).toEqual([day(50)]);
  expect(p.time.week.mon).toBe(60);
  expect(p.caps.newPerDay).toBe(9);
  await saved(srv, q => q.v === 2 && q.caps?.newPerDay === 9 && q.nodes?.[DECK]?.exam === day(50));
});

test('la nueva tiene el plan abierto cuando la vieja guarda; al guardar la nueva, se queda lo de las dos', async ({ page }) => {
  const srv = await mockCloud(page);
  srv.settings = { new_per_day: 15, prefs: { plan: { ...OLD, nodes: { [DECK]: { exam: day(40) } }, week: WEEK } } };
  await openCloud(page);
  await saved(srv, p => p.v === 2);
  // La vieja añade un día especial y quita la semana de los martes
  oldSave(srv, p => { p.special = [...p.special, { id: 'puente', label: 'Puente', from: day(5), to: day(6), minutes: 0, at: Date.now() }]; p.week = { ...p.week, tue: 0 }; });
  // La nueva (sin volver a entrar) cambia otra cosa y guarda
  await page.evaluate(async () => { const { editPlan2 } = await import('/js/plan2-app.js'); editPlan2().caps = { ...editPlan2().caps, newPerDay: 7 }; });
  await save(page);
  await saved(srv, p => p.v === 2 && p.caps?.newPerDay === 7);
  const p = srv.settings.prefs.plan;
  expect(p.time.special.map(s => s.id)).toContain('puente');
  expect(p.time.week.tue).toBe(0);
  expect(p.exams.filter(e => !e.deleted).map(e => e.date)).toEqual([day(40)]);
});
