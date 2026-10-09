'use strict';
// A temp reported its answer as "result": "…" and the orchestrator got an
// empty done message, then redid the job itself.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { messageBody } = loadTs('src/shared/messageBody.ts');

test('body wins when it has text', () => {
  assert.equal(messageBody({ body: 'all good', result: 'ignored' }), 'all good');
});

test('an empty body falls back to the field the agent used', () => {
  assert.equal(messageBody({ act: 'done', result: 'invoices.js has 4 lines' }), 'invoices.js has 4 lines');
  assert.equal(messageBody({ body: '  ', summary: 'Merged ACME-101' }), 'Merged ACME-101');
});

test('a structured answer is kept as JSON, not dropped', () => {
  assert.equal(messageBody({ result: { lines: 4 } }), '{\n  "lines": 4\n}');
});

test('nothing to say stays empty', () => {
  assert.equal(messageBody({ act: 'done' }), '');
});

test('the router delivers a done written with "result" with its text', (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { HiveManager } = loadTs('src/main/hive.ts');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-msg-body-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  const msg = hive.send({ to: 'god', act: 'done', result: 'invoices.js has 4 lines' }, 'worker-a');
  assert.equal(msg.body, 'invoices.js has 4 lines');
});
