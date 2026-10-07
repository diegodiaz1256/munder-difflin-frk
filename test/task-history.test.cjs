'use strict';
// Task history from successive reads of tasks.json (src/shared/taskHistory.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { diffTasks, snapshotOf, statusSince } = loadTs('src/shared/taskHistory.ts');

const T0 = '2026-10-07T10:00:00Z';
const T1 = '2026-10-07T11:00:00Z';

test('the first read records every card as created', () => {
  const ev = diffTasks(null, [{ id: 'a', title: 'A', status: 'todo' }], T0);
  assert.deepEqual(ev.map((e) => e.kind), ['created']);
});

test('assignment, status, questions, answers and results become events', () => {
  const prev = [{ id: 'a', title: 'A', status: 'todo' }, { id: 'gone', title: 'G' }];
  const next = [{
    id: 'a', title: 'A', status: 'blocked', assignee: 'jim', result: 'shipped',
    humanQA: [{ q: 'Which DB?' }]
  }, { id: 'new', title: 'N', status: 'todo' }];
  const ev = diffTasks(prev, next, T1);
  assert.deepEqual(ev.map((e) => `${e.taskId}:${e.kind}`),
    ['a:assigned', 'a:status', 'a:asked', 'a:result', 'new:created', 'gone:removed']);
  assert.equal(ev[1].from, 'todo');
  assert.equal(ev[1].to, 'blocked');

  const answered = diffTasks(next, [{ ...next[0], humanQA: [{ q: 'Which DB?', a: 'Postgres' }] }, next[1]], T1);
  assert.deepEqual(answered.map((e) => e.kind), ['answered']);
  assert.equal(answered[0].a, 'Postgres');
});

test('an unchanged ledger produces nothing', () => {
  const t = [{ id: 'a', title: 'A', status: 'doing', humanQA: [{ q: 'x', a: 'y' }] }];
  assert.deepEqual(diffTasks(t, t, T1), []);
});

test('snapshotOf ignores malformed entries and statusSince finds the last move', () => {
  assert.equal(snapshotOf(null), null);
  assert.equal(snapshotOf({ title: 'no id' }), null);
  assert.deepEqual(snapshotOf({ id: 'a', status: 'doing', humanQA: [null, { q: 'q' }] }).humanQA, [{ q: 'q', a: undefined, dismissedAt: undefined }]);
  const since = statusSince([
    { ts: T0, taskId: 'a', title: 'A', kind: 'created' },
    { ts: T1, taskId: 'a', title: 'A', kind: 'status', from: 'todo', to: 'doing' },
    { ts: T1, taskId: 'a', title: 'A', kind: 'asked', q: 'q' }
  ]);
  assert.equal(since.get('a'), T1);
});
