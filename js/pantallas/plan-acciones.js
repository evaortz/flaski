// Flaski · plan de estudio: a dónde va cada botón y cada control con data-p2 (clic, input y change). app.js
// solo llama a planAction; cada pantalla del plan tiene sus manejadores.
import { S } from '../comun.js';
import { p2Click, p2Input } from './plan-tiempo.js';
import { pickFix, applyFix, lateOk } from './plan-inicio.js';
import { setMode, setFlag, moveTopic, fixDateSheet, fixDateInput, fixDateSave, removeExam, removeExamOk, setAfter } from './plan-examen.js';
import { newExamSheet, newExamClick, newExamInput } from './plan-nuevo.js';
import { repartoSheet, repartoClick, shareInput, repartoAdd } from './plan-reparto.js';
import { enTuPlanSheet, sheetClick } from './plan-hojas.js';
import { settingsClick } from './plan-ajustes.js';
import { render, go } from '../app.js';

const TIEMPO = new Set(['week', 'special', 'special-save', 'special-del', 'pause', 'pause-save', 'unpause', 'today-min', 'today-set', 'today-reset', 'time', 'late-spread', 'late-all', 'late-10']);

// kind: 'click', 'input' o 'change'
export function planAction(el, kind = 'click') {
  const a = el.dataset.p2, ds = el.dataset;
  if (kind === 'input') {
    if (a === 'week') return p2Input(el);
    if (a === 'share') return shareInput(el);
    if (a === 'fd-change') return fixDateInput();
    return;
  }
  if (kind === 'change') {
    if (a === 'week') return p2Click(el);
    if (a === 'exam-flag') return setFlag(ds.k, el.checked);
    if (a.startsWith('new-')) return newExamInput(el);
    if (a === 'fd-change') return fixDateInput();
    if (a === 'rep-add') return repartoAdd(el);
    if (a === 'set-drip' || a === 'set-retlast' || a === 'set-weekly') return settingsClick(el);
    return;
  }
  if (TIEMPO.has(a)) return p2Click(el);
  if (a.startsWith('new-')) return newExamClick(el);
  if (a.startsWith('rep-')) return repartoClick(el);
  if (a.startsWith('sheet-') || a.startsWith('topic-') || a === 'free-set') return sheetClick(el);
  if (a.startsWith('set-') || a.startsWith('cap-') || a.startsWith('revcap-') || a.startsWith('stage')) return settingsClick(el);
  switch (a) {
    case 'exam-new': return newExamSheet();
    case 'exam-edit': return newExamSheet({ id: ds.id });
    case 'exam': return go('exam', { examId: ds.id, examKey: null, p2Order: null });
    case 'fix-pick': return pickFix(Number(ds.i));
    case 'fix-apply': return applyFix();
    case 'drop-apply': return applyFix(true);
    case 'late-ok': return lateOk();
    case 'mode': return setMode(ds.v);
    case 'order': S.p2Order = S.examId; return render();
    case 'order-done': S.p2Order = null; return render();
    case 'order-move': return moveTopic(ds.id, Number(ds.d));
    case 'fix-date': return fixDateSheet();
    case 'fd-save': return fixDateSave();
    case 'fd-clear': return fixDateSave(true);
    case 'topic': return enTuPlanSheet(ds.id);
    case 'exam-del': return removeExam();
    case 'exam-del-ok': return removeExamOk();
    case 'entuplan': return enTuPlanSheet(ds.key);
    case 'reparto': return repartoSheet({ examId: ds.id || '' });
    case 'after-set': return setAfter(ds.id, ds.v);
  }
}
