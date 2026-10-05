'use strict';
// The orchestrator's hand-offs, from the hive message log (src/shared/delegations.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { delegations, envelopeReturning, ENVELOPE_MS, RETURNED_SHOWN_MS } = loadTs('src/shared/delegations.ts');

const T = 1_791_216_000_000;
const msg = (ts, from, to, act, subject) => ({ ts, kind: 'message', from, to, act, subject });

test('a request goes out, the agent works, the answer comes back', () => {
  const log = [msg(T, 'god', 'worker-w40k-wiki', 'request', 'Factions by popularity')];
  assert.equal(delegations(log, 'god', T + 1000)[0].phase, 'sent');
  assert.equal(delegations(log, 'god', T + ENVELOPE_MS + 1)[0].phase, 'working');
  log.push(msg(T + 300_000, 'worker-w40k-wiki', 'god', 'done', 'Deliverable ready'));
  const [d] = delegations(log, 'god', T + 301_000);
  assert.equal(d.phase, 'returned');
  assert.equal(d.reply, 'Deliverable ready');
  assert.equal(envelopeReturning(d, T + 301_000), true);
  assert.equal(envelopeReturning(d, T + 300_000 + ENVELOPE_MS + 1), false);
  assert.deepEqual(delegations(log, 'god', T + 300_000 + RETURNED_SHOWN_MS + 1), [], 'answered ones leave the map');
});

test('a second request reopens it; a reply from before it does not count', () => {
  const log = [
    msg(T, 'god', 'lexi', 'request', 'one'),
    msg(T + 10, 'lexi', 'god', 'done', 'one done'),
    msg(T + 20, 'god', 'lexi', 'request', 'two')
  ];
  const [d] = delegations(log, 'god', T + ENVELOPE_MS + 30);
  assert.equal(d.subject, 'two');
  assert.equal(d.phase, 'working');
});

test('only the orchestrator\'s requests to agents count', () => {
  const log = [
    msg(T, 'scheduler', 'god', 'request', 'standup'),
    msg(T, 'god', 'human', 'request', 'question for you'),
    msg(T, 'god', 'pam', 'inform', 'fyi'),
    { ts: T, kind: 'spawn', agentId: 'pam' }
  ];
  assert.deepEqual(delegations(log, 'god', T + 1), []);
});
