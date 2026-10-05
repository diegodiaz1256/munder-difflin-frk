'use strict';
// The hive's English action markers, shown in the app language (scene/office/actionLabel.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { actionLabel } = loadTs('src/renderer/src/scene/office/actionLabel.ts');
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
