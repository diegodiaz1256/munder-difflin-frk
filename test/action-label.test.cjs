'use strict';
// The hive's English action markers, shown in the app language (scene/office/actionLabel.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { actionLabel, reconnectedAction, RECONNECTING } = loadTs('src/renderer/src/scene/office/actionLabel.ts');
const es = require('../src/renderer/src/i18n/locales/es.json');
const t = (k, o = {}) => k.split('.').reduce((n, p) => n[p], es).replace(/\{\{(\w+)\}\}/g, (_, v) => o[v]);

test('markers are translated, with their argument', () => {
  assert.equal(actionLabel('idle', t), 'libre');
  assert.equal(actionLabel('using Read', t), 'usando Read');
  assert.equal(actionLabel('heading to kitchen', t), 'yendo a kitchen');
});

test("an agent's own words pass through", () => {
  assert.equal(actionLabel('Reviewing the checkout flow', t), 'Reviewing the checkout flow');
});

test('a restored agent stops saying reconnecting once its terminal is live', () => {
  assert.equal(actionLabel(RECONNECTING, t), 'reconectando…');
  assert.equal(reconnectedAction(RECONNECTING, true, true), 'running the floor');
  assert.equal(reconnectedAction(RECONNECTING, false, true), 'idle');
  assert.equal(reconnectedAction(RECONNECTING, false, false), null, 'no PTY yet: still reconnecting');
  assert.equal(reconnectedAction('using Read', false, true), null, 'a real action is left alone');
});
