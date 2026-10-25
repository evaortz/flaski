// Flaski · plan de estudio: lo que queda del plan de antes para Simulacro (claves de examen «f:carpeta» o id de
// lista, fechas cortas). Las pantallas del plan están en plan-inicio.js, plan-examen.js, plan-nuevo.js,
// plan-reparto.js, plan-ajustes.js, plan-hojas.js y plan-tiempo.js; las cuentas, en el motor (plan2.js).
import { decksUnder } from '../plan.js';
import { S } from '../comun.js';
import { shortDay, longDay } from './plan-ui.js';
import { renderPlanExam } from './plan-examen.js';

export const shortDate = shortDay;
export const longDate = longDay;
export const keyExists = key => (key.startsWith('f:') ? S.folders.has(key.slice(2)) : S.decks.has(key));
export const keyDecks = key => (key.startsWith('f:') ? (S.folders.has(key.slice(2)) ? decksUnder(key.slice(2), S.decks, S.folders) : [])
  : S.decks.has(key) && !S.decks.get(key).archived ? [S.decks.get(key)] : []);
export const keyName = key => (key.startsWith('f:') ? S.folders.get(key.slice(2))?.name || 'Carpeta' : S.decks.get(key)?.name || 'Lista');
export const renderExam = renderPlanExam;
