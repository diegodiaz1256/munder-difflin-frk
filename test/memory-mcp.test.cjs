'use strict';
// Agents get the office memory as an MCP tool (munder-memory) while semantic
// memory is on, so recall is a tool call rather than a shell command.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { HiveManager } = loadTs('src/main/hive.ts');

function hive(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-memmcp-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return { h: new HiveManager(() => home), home };
}

test('memory on: every agent gets munder-memory, read-only and offline', (t) => {
  const { h, home } = hive(t);
  const entry = { command: '/home/u/.local/bin/mempalace-mcp', args: ['--palace', '/home/u/o/palace', '--read-only'], env: { HF_HUB_OFFLINE: '1' } };
  h.setMemoryMcp(() => entry);
  const { servers } = h.buildDefaultMcpServers(home, {}, undefined, 'pam');
  assert.deepEqual(servers['munder-memory'], entry);
  assert.ok(servers['munder-memory'].args.includes('--read-only'));
});

test('memory off: no memory server', (t) => {
  const { h, home } = hive(t);
  h.setMemoryMcp(() => null);
  assert.equal(h.buildDefaultMcpServers(home, {}, undefined, 'pam').servers['munder-memory'], undefined);
});
