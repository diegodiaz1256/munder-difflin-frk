'use strict';
// The Now feed folds restarts and repeats (src/shared/officeActivity.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { groupActivity } = loadTs('src/shared/officeActivity.ts');

const it = (id, ts, kind, key, params = {}, agentId) => ({ id, ts, kind, key, params, agentId });

test('joins and leaves close together are one line; repeats get a count', () => {
  const rows = groupActivity([
    it('a', 100_000, 'join', 'joined', { name: 'Pam' }, 'pam'),
    it('b', 99_000, 'join', 'joined', { name: 'Jim' }, 'jim'),
    it('c', 98_000, 'leave', 'left', { name: 'Pam' }, 'pam'),
    it('d', 50_000, 'message', 'tells', { from: 'worker', to: 'Michael', subject: '[hire manifest rejected]' }),
    it('e', 49_000, 'message', 'tells', { from: 'worker', to: 'Michael', subject: '[hire manifest rejected]' }),
    it('f', 48_000, 'message', 'tells', { from: 'worker', to: 'Michael', subject: '[hire manifest rejected]' }),
    it('g', 47_000, 'step', 'ran', { who: 'Jim', tool: 'Bash' }, 'jim')
  ]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { kind: 'roster', ts: 100_000, joined: ['Pam', 'Jim'], left: ['Pam'] });
  assert.equal(rows[1].repeat, 3);
  assert.equal(rows[2].item.id, 'g');
});

test('a gap longer than the window starts a new roster line', () => {
  const rows = groupActivity([it('a', 500_000, 'join', 'joined', { name: 'Pam' }), it('b', 100_000, 'join', 'joined', { name: 'Jim' })]);
  assert.equal(rows.length, 2);
});
