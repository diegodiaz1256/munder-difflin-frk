'use strict';
// The freeze log (src/main/freezeLog.ts) notices a main-thread stall by itself
// and names what was running; the window's own long tasks land in it too.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { FreezeMonitor, instrumentIpc, instrumentTimers, callbackLabel } = loadTs('src/main/freezeLog.ts');

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-freeze-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let clock = 1000;
  const m = new FreezeMonitor({ file: path.join(dir, 'logs', 'freezes.jsonl'), now: () => clock, extra: () => ({ agents: 3 }) });
  m.start(); m.stop(); // sets the first beat at clock
  return { m, advance: (ms) => { clock += ms; }, dir };
}

test('a late heartbeat is a freeze, blamed on the slow work that ended inside it', (t) => {
  const { m, advance } = setup(t);
  advance(100); m.beat();                                  // on time: nothing
  advance(20); m.noteOp('ipc fast', 10);                   // under 30 ms: not remembered
  advance(400); m.noteOp('ipc hive:send', 390);            // the culprit
  m.noteOp('timeout routeTick', 45);
  advance(80); m.beat();                                   // 500 ms after the last beat → 400 late
  const [e] = m.recent();
  assert.equal(e.where, 'main');
  assert.equal(e.ms, 400);
  assert.deepEqual(e.during, [{ label: 'ipc hive:send', ms: 390 }, { label: 'timeout routeTick', ms: 45 }]);
  assert.deepEqual(e.extra, { agents: 3 });
  assert.ok(e.rssMb > 0);
  assert.equal(m.recent().length, 1);
});

test('the same work many times over is one line, with how many times', (t) => {
  const { m, advance } = setup(t);
  advance(300);
  for (let i = 0; i < 6; i++) m.noteOp('ipc pty:spawn (async)', 60 + i);
  m.noteOp('event Socket.data', 90);
  advance(150); m.beat();
  assert.deepEqual(m.recent()[0].during, [{ label: 'ipc pty:spawn (async)', ms: 65, times: 6 }, { label: 'event Socket.data', ms: 90 }]);
});

test('short hiccups are not logged', (t) => {
  const { m, advance } = setup(t);
  advance(250); m.beat(); // 150 ms late: under the 200 ms line
  assert.deepEqual(m.recent(), []);
});

test('IPC handlers and timers are timed without changing what they return or throw', async (t) => {
  const { m } = setup(t);
  const handlers = {};
  const ipc = { handle: (c, fn) => { handlers[c] = fn; }, on: (c, fn) => { handlers['on:' + c] = fn; } };
  instrumentIpc(ipc, m);
  ipc.handle('a', (_e, x) => x * 2);
  ipc.handle('b', () => { throw new Error('boom'); });
  assert.equal(handlers.a({}, 21), 42);
  assert.throws(() => handlers.b({}), /boom/);

  const g = { setTimeout, setInterval };
  instrumentTimers(m, g);
  const v = await new Promise((r) => g.setTimeout((x) => r(x), 1, 'ok'));
  assert.equal(v, 'ok');
  assert.equal(typeof g.setTimeout[require('node:util').promisify.custom], 'function', 'promisify(setTimeout) still works');
});

test('a slow callback is named by its function, or the start of its source', () => {
  function routeInbox() {}
  assert.equal(callbackLabel('interval', routeInbox), 'interval routeInbox');
  assert.match(callbackLabel('timeout', () => { void 0; }), /^timeout \(\) => \{ void 0; \}/);
});

test('the window\'s long tasks are logged with the screen it was on', (t) => {
  const { m } = setup(t);
  m.record({ where: 'renderer', ms: 640, screen: 'tasks' });
  assert.deepEqual(Object.assign({}, m.recent()[0], { at: 'x', rssMb: 0 }), { at: 'x', where: 'renderer', ms: 640, screen: 'tasks', rssMb: 0, extra: { agents: 3 } });
});
