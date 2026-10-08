'use strict';
// Every Claude agent started six MCP servers, four of them repeating Claude
// Code's own tools (a process tree and tool schemas per agent). They are off
// by default now, and switched off once in configs saved with the old defaults.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { MCP_CATALOG, REDUNDANT_MCP_SERVERS, trimRedundantMcp, defaultMcpDefaults } = loadTs('src/shared/mcpCatalog.ts');

test('the redundant servers are off by default; context7 and git stay', () => {
  const d = defaultMcpDefaults();
  for (const id of REDUNDANT_MCP_SERVERS) assert.equal(d[id].enabled, false, id);
  assert.equal(d.context7.enabled, true);
  assert.equal(d.git.enabled, true);
  assert.deepEqual(REDUNDANT_MCP_SERVERS.filter((id) => !MCP_CATALOG.some((e) => e.id === id)), []);
});

test('trim switches them off and leaves the rest as chosen', () => {
  const t = trimRedundantMcp({ filesystem: { enabled: true }, fetch: { enabled: true }, git: { enabled: false }, context7: { enabled: true } });
  assert.equal(t.filesystem.enabled, false);
  assert.equal(t.fetch.enabled, false);
  assert.equal(t.time.enabled, false);
  assert.equal(t.git.enabled, false);
  assert.equal(t.context7.enabled, true);
});

test('an old config is migrated once; a server switched back on afterwards stays on', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-mcp-trim-'));
  const electron = require.resolve('electron');
  require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => userData }, safeStorage: { isEncryptionAvailable: () => false } } };
  try {
    const old = Object.fromEntries(MCP_CATALOG.map((e) => [e.id, { enabled: !(e.secrets ?? []).length }]));
    fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ onboardingComplete: true, mcpDefaults: old }));
    const { readConfig, writeConfig } = loadTs('src/main/config.ts');
    const c = readConfig();
    assert.equal(c.mcpTrimmedV1, true);
    assert.equal(c.mcpDefaults.filesystem.enabled, false);
    assert.equal(c.mcpDefaults.git.enabled, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8')).mcpTrimmedV1, true, 'persisted');
    writeConfig({ mcpDefaults: { ...c.mcpDefaults, fetch: { enabled: true } } });
    assert.equal(readConfig().mcpDefaults.fetch.enabled, true, 'the human turned it back on');
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
