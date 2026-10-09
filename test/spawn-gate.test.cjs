'use strict';
// Agents start one after another (src/main/spawnGate.ts): six at once used to
// block the main thread ~0.4 s on launch. A slow one gives up its turn.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { makeSpawnGate } = loadTs('src/main/spawnGate.ts');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('spawns run one at a time, in order, with the event loop free between them', async () => {
  const gate = makeSpawnGate(5000);
  const log = [];
  let running = 0;
  let maxRunning = 0;
  let ticks = 0;
  const timer = setInterval(() => { ticks++; }, 1);
  const job = (n) => gate(async () => {
    running++; maxRunning = Math.max(maxRunning, running);
    log.push(`start ${n}`);
    const t = Date.now(); while (Date.now() - t < 15) { /* sync work, like a spawn */ }
    await sleep(5);
    log.push(`end ${n}`);
    running--;
    return n;
  });
  const results = await Promise.all([1, 2, 3, 4].map(job));
  clearInterval(timer);
  assert.deepEqual(results, [1, 2, 3, 4]);
  assert.equal(maxRunning, 1);
  assert.deepEqual(log, ['start 1', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3', 'start 4', 'end 4']);
  assert.ok(ticks >= 3, 'timers ran in between');
});

test('a slow spawn gives up its turn; a failed one does not block the next', async () => {
  const gate = makeSpawnGate(30);
  const order = [];
  const slow = gate(async () => { order.push('slow start'); await sleep(200); order.push('slow end'); });
  const failing = gate(async () => { order.push('fail'); throw new Error('boom'); });
  const next = gate(async () => { order.push('next'); });
  await assert.rejects(failing, /boom/);
  await next;
  assert.deepEqual(order.slice(0, 3), ['slow start', 'fail', 'next']);
  await slow;
});
