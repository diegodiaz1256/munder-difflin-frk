'use strict';
// Model and effort per kind of agent (src/shared/roleModels.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { agentKind, effortArgs } = loadTs('src/shared/roleModels.ts');

test('the orchestrator, your agents and temps are told apart', () => {
  assert.equal(agentKind({ isGod: true }, false), 'god');
  assert.equal(agentKind({ isGod: false }, true), 'temp');
  assert.equal(agentKind({}, false), 'agent');
});

test('each kind gets its own effort; unset leaves Claude its default', () => {
  const cfg = { roleEffort: { god: 'xhigh', temp: 'low' } };
  assert.deepEqual(effortArgs([], 'god', cfg), ['--effort', 'xhigh']);
  assert.deepEqual(effortArgs([], 'temp', cfg), ['--effort', 'low']);
  assert.deepEqual(effortArgs([], 'agent', cfg), []);
});

test('an effort already in the command wins, and junk is ignored', () => {
  assert.deepEqual(effortArgs(['--effort', 'max'], 'god', { roleEffort: { god: 'low' } }), []);
  assert.deepEqual(effortArgs(['--effort=max'], 'god', { roleEffort: { god: 'low' } }), []);
  assert.deepEqual(effortArgs([], 'god', { roleEffort: { god: 'turbo; rm -rf /' } }), []);
});
