'use strict';
// The Windows first-run installer, RUN by cmd.exe the way the app runs it
// (`cmd /d /s /c "<one line>"`), with msiexec and npm faked first on PATH and
// the Node "download" served from a local file. On one cmd line everything
// after an `if` belongs to it, so `curl … & if errorlevel 1 exit /b 1 & …`
// skipped every step after a successful download; these cases pin the order
// and that each failure stops the line with a non-zero exit.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');
const { buildMissingCliScript } = loadTs('src/main/cliInstall.ts');

const skip = process.platform !== 'win32' && 'cmd.exe only';

function floor(t, { msiexecExit = 0, npmExit = 0, badSum = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-install-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'bin');
  const tmp = path.join(dir, 'tmp');
  fs.mkdirSync(bin); fs.mkdirSync(tmp);
  const log = path.join(dir, 'calls.log');
  fs.writeFileSync(path.join(bin, 'msiexec.bat'), `@echo msiexec>>"${log}"\r\n@exit /b ${msiexecExit}\r\n`);
  fs.writeFileSync(path.join(bin, 'npm.cmd'), `@echo npm %*>>"${log}"\r\n@exit /b ${npmExit}\r\n`);
  const msi = path.join(dir, 'node-v24.19.0-x64.msi');
  fs.writeFileSync(msi, 'not really an msi');
  const sha256 = badSum ? 'f'.repeat(64) : crypto.createHash('sha256').update(fs.readFileSync(msi)).digest('hex');
  const installer = { version: 'v24.19.0', file: 'node-v24.19.0-x64.msi', kind: 'msi', sha256, url: 'file:///' + msi.replace(/\\/g, '/') };
  const script = buildMissingCliScript('claude', 'claude', false, 'win32', installer);
  const sys = path.join(process.env.SystemRoot, 'System32');
  const r = spawnSync(process.env.ComSpec, ['/d', '/s', '/c', `"${script}"`], {
    windowsVerbatimArguments: true, encoding: 'utf8',
    env: { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec, PATHEXT: process.env.PATHEXT, PATH: [bin, sys, process.env.SystemRoot].join(';'), TEMP: tmp, APPDATA: dir }
  });
  const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split(/\r?\n/) : [];
  return { code: r.status, out: r.stdout, calls };
}

test('all goes well: Node is installed, then the CLI, and it exits 0', { skip }, (t) => {
  const r = floor(t);
  assert.deepEqual(r.calls, ['msiexec', 'npm install -g @anthropic-ai/claude-code'], r.out);
  assert.equal(r.code, 0, r.out);
});

test('a checksum mismatch stops before msiexec', { skip }, (t) => {
  const r = floor(t, { badSum: true });
  assert.deepEqual(r.calls, [], r.out);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /CHECKSUM MISMATCH/);
});

test('a cancelled Node install stops before npm, non-zero', { skip }, (t) => {
  const r = floor(t, { msiexecExit: 1602 });
  assert.deepEqual(r.calls, ['msiexec'], r.out);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /Node\.js was not installed/);
});

test('a failed CLI install exits non-zero, so the app does not relaunch a missing CLI', { skip }, (t) => {
  const r = floor(t, { npmExit: 1 });
  assert.equal(r.calls.length, 2, r.out);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /The install failed/);
});
