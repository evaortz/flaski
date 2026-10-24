import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stem, ideaHit, ideasOf, ideasFromAnswer, suggestGrade, verdictText, parseEffects } from '../../js/entender.js';

test('raíces: plural y femenino cuentan igual; sin tildes ni mayúsculas', () => {
  assert.equal(stem('célula'), stem('células'));
  assert.equal(stem('Bajo'), stem('baja'));
  assert.equal(stem('inflación'), stem('INFLACIONES'));
  assert.equal(stem('crédito'), stem('creditos'));
});

test('una idea sale si está al menos la mitad de sus palabras importantes', () => {
  assert.equal(ideaHit('Encarece el crédito', 'pues los creditos se encarecen'), true);
  assert.equal(ideaHit('Baja la inversión y el consumo', 'la gente invierte menos, baja la inversion'), true);
  assert.equal(ideaHit('Cae la demanda agregada', 'suben los precios'), false);
  assert.equal(ideaHit('Menos presión sobre los precios', 'menos PRESION sobre el precio'), true);
});

test('ideas clave: una por línea; de una respuesta en prosa, por «;» y «pero»', () => {
  assert.deepEqual(ideasOf('- Encarece el crédito\n• Baja la inversión\n\n2. Cae la demanda'), ['Encarece el crédito', 'Baja la inversión', 'Cae la demanda']);
  assert.deepEqual(ideasFromAnswer('Antes es perder el tiempo; después hay que volver a aprenderlo'), ['Antes es perder el tiempo', 'Después hay que volver a aprenderlo']);
  assert.deepEqual(ideasFromAnswer('Releer hace que el texto te suene, pero eso no significa que puedas sacarlo de memoria sin verlo'), ['Releer hace que el texto te suene', 'Eso no significa que puedas sacarlo de memoria sin verlo']);
});

test('botón propuesto: todas, la mitad o más, menos', () => {
  assert.equal(suggestGrade(4, 4), 3);
  assert.equal(suggestGrade(3, 4), 2);
  assert.equal(suggestGrade(2, 4), 2);
  assert.equal(suggestGrade(1, 4), 1);
  assert.equal(verdictText(3, 4), '3 de 4 → a medias');
});

test('efectos ↑ = ↓', () => {
  assert.deepEqual(parseEffects('Inversión: baja\nConsumo ↓\nAhorro: sube\nInflación = \nEmpleo: no cambia\nnada que ver'), [
    { name: 'Inversión', dir: 'down' }, { name: 'Consumo', dir: 'down' }, { name: 'Ahorro', dir: 'up' }, { name: 'Inflación', dir: 'eq' }, { name: 'Empleo', dir: 'eq' }]);
});
