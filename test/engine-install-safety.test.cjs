'use strict';
// Two install hazards seen live on Windows:
// - a shim whose package was half removed counted as "installed": the spawn fell
//   back to cmd.exe ("the command line is too long") and the agent died instead
//   of the CLI being reinstalled;
// - several agents of a missing CLI started at once each ran their own global
//   install, overwriting each other (an opencode-ai with an empty bin/ was left).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { shimPointsNowhere } = loadTs('src/main/pty.ts');

const SHIM = [
  '@ECHO off', 'GOTO start', ':find_dp0', 'SET dp0=%~dp0', 'EXIT /b', ':start', 'SETLOCAL', 'CALL :find_dp0',
  String.raw`"%dp0%\node_modules\opencode-ai\bin\opencode.exe"   %*`
].join('\r\n') + '\r\n';

test('a shim whose target is gone is not an installed CLI', () => {
  const read = () => SHIM;
  const base = String.raw`C:\Users\u\AppData\Roaming\npm\opencode`;
  assert.equal(shimPointsNowhere(base, (p) => p.endsWith('.cmd'), read), true, 'exe missing');
  assert.equal(shimPointsNowhere(base, () => true, read), false, 'exe present');
  assert.equal(shimPointsNowhere(String.raw`C:\tools\claude.exe`, () => false, read), false, 'not a shim');
});

test('one install per CLI: the slot is taken before any await, freed when the installer ends', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/index.ts'), 'utf8');
  const branch = src.slice(src.indexOf('const inFlight = bin && !opts.noAutoInstall'), src.indexOf('const nodeInstaller = npmAvailable ? null : await resolveNodeInstaller();'));
  assert.match(branch, /if \(inFlight\) \{[\s\S]*await inFlight\.done;/);
  assert.match(branch, /claimInstall\(bin\);/, 'claimed in the same synchronous run as the check');
  assert.match(src, /pendingInstallRelaunch\.delete\(id\);\s*\/\/[^\n]*\n\s*finishInstall\(pending\.bin\);/);
});
