'use strict';
// Name tags on a factory floor stay short enough not to collide.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { tagFor } = loadTs('src/renderer/src/scene/office/factoryTags.ts');

const floor = ['Arquitecto', 'Planificador', 'Dev', 'Dev Backend', 'Dev Frontend 2', 'Dev Frontend 3', 'Revisor Seguridad', 'Revisor Diseño', 'Revisor Rendimiento', 'Jefe', 'Secretario', 'Secretario 2'].map((name) => ({ name }));

test('tags drop a shared first word, keep the instance number, stay short', () => {
  const tags = floor.map((a) => tagFor(a, floor));
  assert.deepEqual(tags, ['Arquitecto', 'Planificad…', 'Dev', 'Backend', 'Frontend 2', 'Frontend 3', 'Seguridad', 'Diseño', 'Rendimiento', 'Jefe', 'Secretario', 'Secretar… 2']);
  for (const t of tags) assert.ok(t.length <= 12, t);
});

test('a first name wins when the factory gives one', () => {
  assert.equal(tagFor({ name: 'Dev Frontend 2', display_name: 'Sofía' }, floor), 'Sofía');
  assert.equal(tagFor({ name: 'X', display_name: 'Maximiliano José' }), 'Maximilian…');
});
