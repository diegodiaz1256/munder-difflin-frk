'use strict';
// The bridge answers a repeated listen with the port it already holds, instead
// of EADDRINUSE ("direct"), which the app read as another program holding the
// port and refused to start the orchestrator (src/main/wslBridge.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const loadTs = require('./load-ts.cjs');
const { BRIDGE_SCRIPT } = loadTs('src/main/wslBridge.ts');

test('listening again on a port the bridge holds returns that port', async (t) => {
  const free = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  const p = spawn(process.execPath, ['-e', BRIDGE_SCRIPT, JSON.stringify([{ name: `gateway:${free}`, port: free }])], { stdio: ['pipe', 'pipe', 'inherit'] });
  t.after(() => p.kill());
  const lines = createInterface({ input: p.stdout });
  const next = (pred) => new Promise((r) => { const on = (l) => { const m = JSON.parse(l); if (pred(m)) { lines.off('line', on); r(m); } }; lines.on('line', on); });
  const ready = await next((m) => m.t === 'ready');
  assert.equal(ready.ports[`gateway:${free}`], free);
  // Same name again, and the same port under another name.
  p.stdin.write(JSON.stringify({ t: 'listen', name: `gateway:${free}`, port: free }) + '\n');
  assert.equal((await next((m) => m.t === 'listening')).p, free);
  p.stdin.write(JSON.stringify({ t: 'listen', name: 'gateway-again', port: free }) + '\n');
  assert.equal((await next((m) => m.t === 'listening')).p, free);
});
