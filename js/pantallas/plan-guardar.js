// Flaski · plan de estudio: guardar un cambio. Cada cambio queda en el historial (los 20 últimos, con lo que había
// antes) y sale un aviso con «Deshacer». Así todo se puede probar sin miedo.
import { toast, toastAction } from '../comun.js';
import { editPlan2 } from '../plan2-app.js';
import { savePrefsSoon } from './perfil.js';
import { render } from '../app.js';

export const HISTORY = 20;
const clone = o => JSON.parse(JSON.stringify(o));
// Lo que se guarda de antes: el plan sin su historial ni la copia del plan viejo
const snapshot = p => { const { history, v1, ...rest } = p; return clone(rest); };

// what: el texto del aviso y del historial; change(plan): cambia el plan (el de verdad, no una copia)
export function commitPlan(what, change, { quiet = false, redraw = true } = {}) {
  const p = editPlan2(), before = snapshot(p), at = Date.now();
  change(p);
  // Cada examen, la semana y el reparto llevan su updated_at: al juntar dos dispositivos gana el más reciente
  for (const e of p.exams || []) if (JSON.stringify(e) !== JSON.stringify((before.exams || []).find(x => x.id === e.id))) e.updated_at = at;
  if (p.time && JSON.stringify(p.time) !== JSON.stringify(before.time)) p.time.updated_at = at;
  if (p.split && JSON.stringify(p.split) !== JSON.stringify(before.split)) p.split.updated_at = at;
  p.history = [{ at, what, before }, ...(p.history || [])].slice(0, HISTORY);
  savePrefsSoon();
  if (redraw) render();
  if (!quiet) toastAction(what, 'Deshacer', () => undoTo(at));
}
// Vuelve a como estaba antes del cambio «at» (y quita ese cambio del historial)
export function undoTo(at) {
  const p = editPlan2(), i = (p.history || []).findIndex(h => h.at === at);
  if (i < 0) return;
  const { before } = p.history[i], now = Date.now();
  for (const k of Object.keys(p)) if (!['history', 'v1'].includes(k)) delete p[k];
  Object.assign(p, clone(before));
  for (const e of p.exams || []) e.updated_at = now;
  if (p.time) p.time.updated_at = now;
  if (p.split) p.split.updated_at = now;
  p.history = p.history.slice(i + 1);
  savePrefsSoon();
  render();
  toast('Deshecho');
}
