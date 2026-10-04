'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { applyMissionRequest, parseEvery, parseWeekly } = loadTs('src/shared/missionRequests.ts');

const AGENTS = new Set(['god', 'angela', 'oscar']);
const STANDUP = { id: 'ops-standup', label: 'Hourly ops standup', intervalMs: 3_600_000, to: 'god', body: 'b', enabled: true };

test('parses durations and weekly schedules', () => {
  assert.equal(parseEvery('30m'), 1_800_000);
  assert.equal(parseEvery('2h'), 7_200_000);
  assert.equal(parseEvery('1d'), 86_400_000);
  assert.equal(parseEvery('soon'), null);
  assert.deepEqual(parseWeekly({ days: ['mon', 'Friday'], time: '09:30' }), { days: [1, 5], minute: 570 });
  assert.equal(parseWeekly({ days: ['mon'], time: '25:00' }), null);
});

test('create adds a mission addressed to a real agent', () => {
  const r = applyMissionRequest([STANDUP], { op: 'create', label: 'Nightly regression', to: 'angela', body: 'Run the suite.', every: '1d' }, AGENTS);
  assert.equal(r.ok, true, r.message);
  const m = r.missions.at(-1);
  assert.equal(m.id, 'agent-nightly-regression');
  assert.equal(m.intervalMs, 86_400_000);
  assert.equal(m.enabled, true);
  // a second one with the same label gets its own id
  const again = applyMissionRequest(r.missions, { op: 'create', label: 'Nightly regression', to: 'oscar', body: 'x', weekly: { days: ['mon'], time: '08:00' } }, AGENTS);
  assert.equal(again.missions.at(-1).id, 'agent-nightly-regression-2');
  assert.deepEqual(again.missions.at(-1).weekly, { days: [1], minute: 480 });
});

test('create refuses bad requests with a reason', () => {
  const bad = (req) => applyMissionRequest([], req, AGENTS);
  assert.match(bad({ op: 'create', label: 'x', to: 'kevin', body: 'b', every: '1h' }).message, /agent on the floor/);
  assert.match(bad({ op: 'create', label: 'x', to: 'angela', body: 'b', every: '1m' }).message, /every 5 minutes/);
  assert.match(bad({ op: 'create', label: 'x', to: 'angela', body: 'b' }).message, /"every"/);
  assert.match(bad({ op: 'create', to: 'angela', body: 'b', every: '1h' }).message, /label/);
  assert.match(bad({ op: 'nuke' }).message, /"op"/);
  assert.match(bad('nope').message, /JSON object/);
});

test('update edits fields and timing; built-ins only toggle and re-time', () => {
  const created = applyMissionRequest([STANDUP], { op: 'create', label: 'Report', to: 'oscar', body: 'b', every: '1d' }, AGENTS).missions;
  const r = applyMissionRequest(created, { op: 'update', id: 'agent-report', body: 'new body', every: '12h', enabled: false }, AGENTS);
  assert.equal(r.ok, true, r.message);
  const m = r.missions.find((x) => x.id === 'agent-report');
  assert.deepEqual([m.body, m.intervalMs, m.enabled], ['new body', 43_200_000, false]);

  const off = applyMissionRequest([STANDUP], { op: 'update', id: 'ops-standup', enabled: false, every: '2h' }, AGENTS);
  assert.equal(off.ok, true);
  assert.deepEqual([off.missions[0].enabled, off.missions[0].intervalMs], [false, 7_200_000]);
  assert.match(applyMissionRequest([STANDUP], { op: 'update', id: 'ops-standup', body: 'hijack' }, AGENTS).message, /built in/);
});

test('delete removes agent missions but never a built-in', () => {
  const created = applyMissionRequest([STANDUP], { op: 'create', label: 'Temp', to: 'god', body: 'b', every: '1h' }, AGENTS).missions;
  const r = applyMissionRequest(created, { op: 'delete', id: 'agent-temp' }, AGENTS);
  assert.equal(r.ok, true);
  assert.equal(r.missions.length, 1);
  assert.match(applyMissionRequest([STANDUP], { op: 'delete', id: 'ops-standup' }, AGENTS).message, /switch it off/);
  assert.match(applyMissionRequest([STANDUP], { op: 'delete', id: 'ghost' }, AGENTS).message, /No mission/);
});
