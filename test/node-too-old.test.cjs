'use strict';
// A CLI that is installed but needs a newer Node than the machine has (Pi 1.x
// needs 22.19; on Node 20 it died at startup with a SyntaxError and the worker
// was archived with only a stack trace). The spawn now upgrades Node in the
// agent's terminal and relaunches, the same way it handles a missing Node.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');
const { buildMissingCliScript } = loadTs('src/main/cliInstall.ts');
const { nodeAtLeast } = loadTs('src/main/nodeInstall.ts');
const { providerPreset } = loadTs('src/shared/agentProvider.ts');

test('nodeAtLeast compares the full version', () => {
  assert.equal(nodeAtLeast('v20.9.0', '22.19.0'), false);
  assert.equal(nodeAtLeast('v22.18.9', '22.19.0'), false);
  assert.equal(nodeAtLeast('v22.19.0', '22.19.0'), true);
  assert.equal(nodeAtLeast('v24.1.0', '22.19.0'), true);
  assert.equal(nodeAtLeast('v100.0.0', '22.19.0'), true);
  assert.equal(nodeAtLeast(null, '22.19.0'), false);
});

test('Pi declares the Node it needs', () => {
  assert.equal(providerPreset('pi').minNode, '22.19.0');
});

test('the banner says Node is too old, not that the CLI is missing', () => {
  const inst = { version: 'v24.21.0', file: 'node-v24.21.0-x64.msi', kind: 'msi', sha256: 'a'.repeat(64), url: 'https://nodejs.org/x.msi' };
  for (const platform of ['win32', 'linux']) {
    const s = buildMissingCliScript('pi', 'pi', false, platform, platform === 'win32' ? inst : { ...inst, kind: 'tar', file: 'node.tar.xz' }, { have: 'v20.9.0', need: '22.19.0' });
    assert.match(s, /needs Node\.js 22\.19\.0 or newer; this machine has v20\.9\.0/, platform);
    assert.doesNotMatch(s, /Engine CLI not found|Node\.js is not installed/, platform);
    assert.match(s, /Updating it: Installing Node v24\.21\.0/, platform);
  }
});

test('the spawn checks the Node version before starting a CLI that needs more', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/index.ts'), 'utf8');
  assert.match(src, /const minNode = providerPreset\(provider\)\.minNode;/);
  assert.match(src, /if \(have && !nodeAtLeast\(have, minNode\)\)/);
  assert.match(src, /buildMissingCliScript\(bin, provider, false, process\.platform, nodeInstaller, \{ have, need: minNode \}\)/);
});

test('run by cmd.exe: Node is upgraded, then the CLI reinstalled, exit 0', { skip: process.platform !== 'win32' && 'cmd.exe only' }, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-oldnode-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'bin'); const tmp = path.join(dir, 'tmp');
  fs.mkdirSync(bin); fs.mkdirSync(tmp);
  const log = path.join(dir, 'calls.log');
  fs.writeFileSync(path.join(bin, 'msiexec.bat'), `@echo msiexec>>"${log}"\r\n@exit /b 0\r\n`);
  fs.writeFileSync(path.join(bin, 'npm.cmd'), `@echo npm %*>>"${log}"\r\n@exit /b 0\r\n`);
  const msi = path.join(dir, 'node-v24.21.0-x64.msi');
  fs.writeFileSync(msi, 'not really an msi');
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(msi)).digest('hex');
  const installer = { version: 'v24.21.0', file: 'node-v24.21.0-x64.msi', kind: 'msi', sha256, url: 'file:///' + msi.replace(/\\/g, '/') };
  const script = buildMissingCliScript('pi', 'pi', false, 'win32', installer, { have: 'v20.9.0', need: '22.19.0' });
  const sys = path.join(process.env.SystemRoot, 'System32');
  const r = spawnSync(process.env.ComSpec, ['/d', '/s', '/c', `"${script}"`], {
    windowsVerbatimArguments: true, encoding: 'utf8',
    env: { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec, PATHEXT: process.env.PATHEXT, PATH: [bin, sys, process.env.SystemRoot].join(';'), TEMP: tmp, APPDATA: dir }
  });
  const calls = fs.readFileSync(log, 'utf8').trim().split(/\r?\n/);
  assert.deepEqual(calls, ['msiexec', 'npm install -g --ignore-scripts @earendil-works/pi-coding-agent'], r.stdout);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /needs Node\.js 22\.19\.0 or newer; this machine has v20\.9\.0/);
});
