'use strict';
// Two agents starting at once both ask the WSL bridge for the same listener
// (the gateway): both must get it. One used to wait forever, and the
// orchestrator never started (src/main/wslBridge.ts). Needs WSL with node.
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

test('two agents asking for the same listener at once both get it', { timeout: 120000 }, async (t) => {
  const distro = distroWithNode();
  if (!distro) { t.skip('no WSL distro with node'); return; }
  const { WslBridge } = loadTs('src/main/wslBridge.ts');
  const target = net.createServer((s) => s.end('ok')).listen(0, '127.0.0.1');
  await new Promise((r) => target.once('listening', r));
  t.after(() => target.close());
  const port = target.address().port;
  const bridge = new WslBridge(distro, [], () => {});
  t.after(() => bridge.stop());
  // Both start with the hooks listener, then race for the gateway, as the
  // orchestrator and a restored worker do.
  const hooks = { name: 'hooks', port: 0, target: { port } };
  const gw = { name: `gateway:${port}`, port: 0, target: { port } };
  const agent = async () => { await bridge.ensure(hooks); return bridge.ensure(gw); };
  const timeout = new Promise((r) => setTimeout(() => r('hung'), 30000));
  const [a, b] = await Promise.all([Promise.race([agent(), timeout]), Promise.race([agent(), timeout])]);
  assert.equal(typeof a, 'number', `first agent got ${a}`);
  assert.equal(typeof b, 'number', `second agent got ${b}`);
  assert.equal(a, b);
});
