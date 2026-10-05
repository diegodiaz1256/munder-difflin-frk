'use strict';
// The Linux half of the WSL bridge (src/main/wslBridge.ts BRIDGE_SCRIPT) is
// plain Node, so it runs here as is: listeners from argv, more added later
// over stdin ({t:'listen'}), connections relayed as JSON lines.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { createInterface } = require('node:readline');
const loadTs = require('./load-ts.cjs');

const { BRIDGE_SCRIPT } = loadTs('src/main/wslBridge.ts');

test('the bridge adds a listener on request and relays a connection to it', async () => {
  const p = spawn(process.execPath, ['-e', BRIDGE_SCRIPT, JSON.stringify([{ name: 'hooks', port: 0 }])], { stdio: ['pipe', 'pipe', 'inherit'] });
  const msgs = [];
  const waiters = [];
  createInterface({ input: p.stdout }).on('line', (l) => {
    const m = JSON.parse(l);
    msgs.push(m);
    for (const w of waiters.splice(0)) w();
  });
  const next = async (pred) => {
    for (;;) {
      const m = msgs.find(pred);
      if (m) return m;
      await new Promise((r) => waiters.push(r));
    }
  };
  try {
    const ready = await next((m) => m.t === 'ready');
    assert.equal(typeof ready.ports.hooks, 'number');

    p.stdin.write(JSON.stringify({ t: 'listen', name: 'proxy:1', port: 0 }) + '\n');
    const listening = await next((m) => m.t === 'listening' && m.n === 'proxy:1');
    assert.equal(typeof listening.p, 'number');

    const sock = net.connect(listening.p, '127.0.0.1');
    await new Promise((r) => sock.once('connect', r));
    sock.write('hi');
    const open = await next((m) => m.t === 'o' && m.n === 'proxy:1');
    const data = await next((m) => m.t === 'd' && m.c === open.c);
    assert.equal(Buffer.from(data.b, 'base64').toString(), 'hi');

    const got = new Promise((r) => sock.once('data', (d) => r(String(d))));
    p.stdin.write(JSON.stringify({ t: 'd', c: open.c, b: Buffer.from('back').toString('base64') }) + '\n');
    assert.equal(await got, 'back');
    sock.destroy();
  } finally {
    p.stdin.end();
    await new Promise((r) => p.once('exit', r));
  }
});
