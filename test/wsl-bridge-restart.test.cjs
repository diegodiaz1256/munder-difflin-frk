'use strict';
// A WSL bridge that dies is started again with every listener bound, so an
// agent starting afterwards is never refused with "failed:unknown"
// (src/main/wslBridge.ts). Needs WSL with node inside; skipped otherwise.
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

function distroWithNode() {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync('wsl.exe', ['-l', '-q'], { timeout: 15000 });
    const d = out.toString('utf16le').replace(/\0/g, '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !/^docker/i.test(s))[0];
    if (!d) return null;
    execFileSync('wsl.exe', ['-d', d, '--exec', 'bash', '-lc', '[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"; command -v node'], { timeout: 20000 });
    return d;
  } catch { return null; }
}

test('after the bridge dies, every listener is bound again', { timeout: 120000 }, async (t) => {
  const distro = distroWithNode();
  if (!distro) { t.skip('no WSL distro with node'); return; }
  const { WslBridge } = loadTs('src/main/wslBridge.ts');
  const target = net.createServer((s) => s.end('ok')).listen(0, '127.0.0.1');
  await new Promise((r) => target.once('listening', r));
  t.after(() => target.close());
  const port = target.address().port;
  const bridge = new WslBridge(distro, [{ name: 'hooks', port: 0, target: { port } }], () => {});
  t.after(() => bridge.stop());
  assert.equal(typeof (await bridge.ensure({ name: 'hooks', port: 0, target: { port } })), 'number');
  assert.equal(typeof (await bridge.ensure({ name: 'gateway', port: 0, target: { port } })), 'number');
  // The bridge dies (killed, distro restarted…).
  bridge.proc.kill();
  await new Promise((r) => setTimeout(r, 1500));
  const again = await bridge.ensure({ name: 'gateway', port: 0, target: { port } });
  assert.equal(typeof again, 'number', `gateway after restart: ${again}`);
  assert.equal(typeof (await bridge.ensure({ name: 'hooks', port: 0, target: { port } })), 'number');
});
