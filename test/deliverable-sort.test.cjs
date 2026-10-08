'use strict';
// Deliverables: sort by date, name, type, author or ticket, and a ticket key in
// the search box finds exactly that ticket.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { sortDeliverables, ticketQuery } = loadTs('src/shared/deliverableSort.ts');

const groups = [
  { kind: 'office', items: [{ name: 'z.md', ts: 50 }] },
  { kind: 'task', ticket: 'dun-12', items: [{ name: 'b.csv', ts: 10, by: 'Pam' }, { name: 'a.md', ts: 30, by: 'Jim' }] },
  { kind: 'task', ticket: 'dun-9', items: [{ name: 'c.wiki', ts: 40, by: 'Angela' }] }
];
const names = (gs) => gs.map((g) => g.items.map((i) => i.name).join(','));

test('recent first: newest task on top, newest file first, folders after tasks', () => {
  assert.deepEqual(names(sortDeliverables(groups, 'recent')), ['c.wiki', 'a.md,b.csv', 'z.md']);
});

test('oldest, name, type, author', () => {
  assert.deepEqual(names(sortDeliverables(groups, 'oldest')), ['b.csv,a.md', 'c.wiki', 'z.md']);
  assert.deepEqual(names(sortDeliverables(groups, 'name')), ['a.md,b.csv', 'c.wiki', 'z.md']);
  assert.deepEqual(names(sortDeliverables(groups, 'type')), ['b.csv,a.md', 'c.wiki', 'z.md']);
  assert.deepEqual(names(sortDeliverables(groups, 'author')), ['a.md,b.csv', 'c.wiki', 'z.md']);
});

test('ticket order is numeric and newest ticket first', () => {
  assert.deepEqual(sortDeliverables(groups, 'ticket').map((g) => g.ticket ?? g.kind), ['dun-12', 'dun-9', 'office']);
});

test('a ticket key in the search is an exact match', () => {
  assert.equal(ticketQuery(' DUN-12 '), 'dun-12');
  assert.equal(ticketQuery('report'), null);
  assert.equal(ticketQuery('dun 12'), null);
});
