'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  EMPTY_TASK_KEY_LEDGER, assignTaskKeys, formatTaskKey, normalizeTaskKeyLedger, taskKeyPrefix
} = loadTs('src/shared/taskKeys.ts');

test('the prefix is the first three letters or digits of the hive folder', () => {
  assert.equal(taskKeyPrefix('Big Mountain Tech'), 'big');
  assert.equal(taskKeyPrefix('acme'), 'acm');
  assert.equal(taskKeyPrefix('--'), 'md');
  assert.equal(taskKeyPrefix(null), 'md');
});

test('new tasks are numbered oldest first', () => {
  const { ledger, changed } = assignTaskKeys(EMPTY_TASK_KEY_LEDGER, [
    { id: 'b', createdAt: '2026-10-02T00:00:00Z' },
    { id: 'a', createdAt: '2026-10-01T00:00:00Z' }
  ]);
  assert.equal(changed, true);
  assert.deepEqual(ledger.keys, { a: 1, b: 2 });
  assert.equal(ledger.next, 3);
});

test('existing keys never move, and a deleted task keeps its number', () => {
  const first = assignTaskKeys(EMPTY_TASK_KEY_LEDGER, [{ id: 'a' }, { id: 'b' }]).ledger;
  // "a" was deleted from tasks.json and "c" was added.
  const { ledger, changed } = assignTaskKeys(first, [{ id: 'b' }, { id: 'c' }]);
  assert.equal(changed, true);
  assert.deepEqual(ledger.keys, { a: 1, b: 2, c: 3 });
  assert.equal(assignTaskKeys(ledger, [{ id: 'b' }, { id: 'c' }]).changed, false);
});

test('a damaged ledger file is repaired without reusing numbers', () => {
  const ledger = normalizeTaskKeyLedger({ next: 1, keys: { a: 4, b: 'x', c: -1 } });
  assert.deepEqual(ledger.keys, { a: 4 });
  assert.equal(ledger.next, 5);
  assert.deepEqual(normalizeTaskKeyLedger(null), { next: 1, keys: {} });
});

test('keys format as prefix-number', () => {
  assert.equal(formatTaskKey('bmt', 12), 'bmt-12');
  assert.equal(formatTaskKey('bmt', undefined), undefined);
});
