'use strict';
// Token diet: Scranton Branch runs on Pro and other limited subscriptions.
// - The orchestrator's roster rode on every prompt, unchanged or not.
// - The hourly standup fired on a floor where nothing had happened.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { rosterSignature, floorActiveSince } = loadTs('src/shared/tokenDiet.ts');

const roster = (bits) => `[LIVE ROSTER — auto-injected from /o/hive/fleet.json, snapshot ${bits.age}] 2 ACTIVE agent(s): god "Michael" (orchestrator, active ${bits.a}, ${bits.k}k tok, $${bits.usd}, you, ctx ${bits.ctx}%); worker-x "Pam" (painter, active 3m ago${bits.inbox ? ', inbox 1' : ''}).`;

test('the roster signature ignores what changes every minute', () => {
  const a = rosterSignature(roster({ age: '4s ago', a: '10s ago', k: 120, usd: '0.40', ctx: 31 }));
  const b = rosterSignature(roster({ age: '1m ago', a: '2m ago', k: 180, usd: '0.71', ctx: 44 }));
  assert.equal(a, b);
});

test('…but not what matters for routing', () => {
  const base = rosterSignature(roster({ age: '4s ago', a: '10s ago', k: 1, usd: '0.10', ctx: 31 }));
  assert.notEqual(rosterSignature(roster({ age: '4s ago', a: '10s ago', k: 1, usd: '0.10', ctx: 31, inbox: true })), base, 'a waiting message');
  assert.notEqual(rosterSignature(roster({ age: '4s ago', a: '10s ago', k: 1, usd: '0.10', ctx: 85 })), base, 'a nearly full context');
  assert.notEqual(rosterSignature(roster({ age: '4s ago', a: '10s ago', k: 1, usd: '0.10', ctx: 31 }).replace('Pam', 'Jim')), base, 'who is on the floor');
});

test('a floor is idle when only the scheduler spoke', () => {
  const since = 1000;
  const line = (o) => JSON.stringify(o);
  assert.equal(floorActiveSince([line({ ts: 500, kind: 'message', from: 'worker-a' }), line({ ts: 1500, kind: 'message', from: 'scheduler', to: 'god' }), line({ ts: 1600, kind: 'app-start' })], since), false);
  assert.equal(floorActiveSince([line({ ts: 1500, kind: 'message', from: 'worker-a', to: 'god' })], since), true);
  assert.equal(floorActiveSince([line({ ts: 1500, kind: 'spawn', agentId: 'worker-b' })], since), true);
  assert.equal(floorActiveSince([], since), false);
});

test('the hook and the scheduler use them', () => {
  const hooks = fs.readFileSync(path.join(__dirname, '..', 'src/main/hooks.ts'), 'utf8');
  assert.match(hooks, /last\.sig === sig\) roster = null/);
  const index = fs.readFileSync(path.join(__dirname, '..', 'src/main/index.ts'), 'utf8');
  assert.match(index, /const idleStandup = m\.id === 'ops-standup' && !floorBusySince\(m\.lastFiredAt \?\? 0\);/);
});
