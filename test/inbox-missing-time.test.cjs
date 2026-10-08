'use strict';
// Agents write their outbox messages by hand. One without created_at made the
// thread sort throw (`undefined.localeCompare`), which took the whole Manager
// view down. It now sorts first and everything else still renders.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { buildThread, summarizeThreads } = loadTs('src/shared/inboxThreads.ts');

const msgs = [
  { id: 'a', from: 'god', to: 'jim', subject: 'later', body: 'x', created_at: '2026-10-08T10:00:00Z' },
  { id: 'b', from: 'god', to: 'jim', subject: 'no time', body: 'y' },
  { id: 'c', from: 'jim', to: 'god', subject: 'earlier', body: 'z', created_at: '2026-10-08T09:00:00Z' }
];

test('a message without created_at does not break the thread', () => {
  const t = buildThread('jim', false, msgs, [], 'god');
  assert.deepEqual(t.map((i) => i.message.id), ['b', 'c', 'a']);
});

test('the per-agent summaries still build', () => {
  const rows = summarizeThreads([{ id: 'god', isGod: true }, { id: 'jim' }], msgs, [], 'god');
  assert.equal(rows.length, 2);
});
