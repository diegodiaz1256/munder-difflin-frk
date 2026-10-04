'use strict';
/**
 * How MCP servers reach a Claude agent.
 *
 * Claude Code does not load `mcpServers` from a --settings file (verified on
 * 2.1.286: a server listed there is never started), so the bundle goes in
 * <agent>/mcp.json behind --mcp-config. Keyed servers (Connections) never run
 * under the agent: they go through main's MCP gateway, which holds the key, and
 * the agent gets only a capability token (MD_MCP_TOKEN, expanded by Claude Code
 * from its env so it is not written into the committed hive either).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

const SECRET = 'github_pat_TEST_do_not_leak_1234567890';
const TOKEN = 'cap-token-not-a-secret';

function floor(t, { gateway = true } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-mcp-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.setMcpKeyCheck((server, env) => server === 'github-token' && env === 'GITHUB_PERSONAL_ACCESS_TOKEN');
  const grants = [];
  if (gateway) hive.setMcpGateway((agentId, ids) => { grants.push({ agentId, ids }); return { url: 'http://127.0.0.1:5555', token: TOKEN }; });
  return { home, hive, grants };
}

function walk(dir, out = []) {
  for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

test('a keyed server is reached through the gateway with a capability token, never its key', (t) => {
  const { hive, home, grants } = floor(t);
  const { servers, env } = hive.buildDefaultMcpServers(home, { 'github-token': { enabled: true } }, undefined, 'dwight');
  assert.deepEqual(servers['munder-github-token'], {
    type: 'http',
    url: 'http://127.0.0.1:5555/mcp/github-token',
    headers: { Authorization: 'Bearer ${MD_MCP_TOKEN}' }
  });
  assert.deepEqual(env, { MD_MCP_TOKEN: TOKEN }, 'the token is the only thing in the agent env');
  assert.deepEqual(grants, [{ agentId: 'dwight', ids: ['github-token'] }]);
});

test('without a gateway, keyed servers are left out rather than run with the key in env', (t) => {
  const { hive, home } = floor(t, { gateway: false });
  const { servers, env } = hive.buildDefaultMcpServers(home, { 'github-token': { enabled: true } }, undefined, 'dwight');
  assert.equal(servers['munder-github-token'], undefined);
  assert.deepEqual(env, {});
});

test('a keyed server without its key is left out (it could only fail)', (t) => {
  const { hive, home } = floor(t);
  const { servers, env } = hive.buildDefaultMcpServers(home, { notion: { enabled: true }, 'search-with-key': { enabled: true } }, undefined, 'dwight');
  assert.equal(servers['munder-notion'], undefined);
  assert.equal(servers['munder-search-with-key'], undefined);
  assert.deepEqual(env, {});
  assert.ok(servers['munder-time'], 'the safe defaults still ride along');
});

test('"Choose agents" limits a server to its list', (t) => {
  const { hive, home } = floor(t);
  const cfg = { 'github-token': { enabled: true } };
  const scopes = { 'github-token': ['dwight'] };
  assert.ok(hive.buildDefaultMcpServers(home, cfg, undefined, 'dwight', scopes).servers['munder-github-token']);
  const jim = hive.buildDefaultMcpServers(home, cfg, undefined, 'jim', scopes);
  assert.equal(jim.servers['munder-github-token'], undefined);
  assert.equal(jim.env.MD_MCP_TOKEN, undefined, 'an agent outside the scope gets no capability');
});

test('consent still gates a keyed server even when a key is stored', (t) => {
  const { hive, home } = floor(t);
  assert.equal(hive.buildDefaultMcpServers(home, {}, undefined, 'dwight').servers['munder-github-token'], undefined);
});

test('spawn: mcp.json behind --mcp-config, nothing in settings.json, neither key nor token anywhere in the hive', async (t) => {
  const { hive, home } = floor(t);
  const inj = await hive.ensureAgent(
    { id: 'dwight', name: 'Dwight', provider: 'claude', cwd: home },
    { mcpDefaults: { 'github-token': { enabled: true } } }
  );
  const i = inj.args.indexOf('--mcp-config');
  assert.ok(i >= 0, 'claude is handed the MCP config');
  assert.ok(inj.args[i + 2]?.startsWith('--'), 'the next token is an option, so nothing positional is read as a config path');
  const mcp = JSON.parse(fs.readFileSync(inj.args[i + 1], 'utf8'));
  assert.equal(mcp.mcpServers['munder-github-token'].type, 'http');
  assert.equal(inj.env.MD_MCP_TOKEN, TOKEN);
  assert.equal(inj.env.GITHUB_PERSONAL_ACCESS_TOKEN, undefined, 'the key never enters the agent env');

  const settings = JSON.parse(fs.readFileSync(inj.args[inj.args.indexOf('--settings') + 1], 'utf8'));
  assert.equal(settings.mcpServers, undefined, 'Claude Code ignores mcpServers in --settings');

  for (const file of walk(path.join(home, 'hive'))) {
    if (file.includes(`${path.sep}.git${path.sep}`)) continue;
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    assert.ok(!text.includes(SECRET), `key written to ${file}`);
    assert.ok(!text.includes(TOKEN), `capability token written to ${file}`);
  }
});

test('spawn with nothing enabled drops a stale mcp.json', async (t) => {
  const { hive, home } = floor(t);
  const meta = { id: 'jim', name: 'Jim', provider: 'claude', cwd: home };
  const first = await hive.ensureAgent(meta, { mcpDefaults: { 'github-token': { enabled: true } } });
  const mcpPath = first.args[first.args.indexOf('--mcp-config') + 1];
  assert.ok(fs.existsSync(mcpPath));
  const none = Object.fromEntries(['sequential-thinking', 'time', 'fetch', 'context7', 'filesystem', 'git'].map((id) => [id, { enabled: false }]));
  const second = await hive.ensureAgent(meta, { mcpDefaults: none });
  assert.equal(second.args.includes('--mcp-config'), false);
  assert.equal(fs.existsSync(mcpPath), false);
});

test('several connections of one service: each its own server, switch, agents and key', (t) => {
  const { hive, home } = floor(t);
  hive.setMcpInstances((service) => (service === 'github-token' ? ['github-token', 'github-token--work'] : [service]));
  hive.setMcpKeyCheck((id, env) => (id === 'github-token' || id === 'github-token--work') && env === 'GITHUB_PERSONAL_ACCESS_TOKEN');
  const cfg = { 'github-token': { enabled: true }, 'github-token--work': { enabled: true } };
  const scopes = { 'github-token--work': ['dwight'] };

  const dwight = hive.buildDefaultMcpServers(home, cfg, undefined, 'dwight', scopes).servers;
  assert.equal(dwight['munder-github-token'].url, 'http://127.0.0.1:5555/mcp/github-token');
  assert.equal(dwight['munder-github-token--work'].url, 'http://127.0.0.1:5555/mcp/github-token--work');

  const jim = hive.buildDefaultMcpServers(home, cfg, undefined, 'jim', scopes).servers;
  assert.ok(jim['munder-github-token']);
  assert.equal(jim['munder-github-token--work'], undefined, 'the work account is Dwight\'s only');

  const off = hive.buildDefaultMcpServers(home, { 'github-token': { enabled: true } }, undefined, 'dwight', scopes).servers;
  assert.equal(off['munder-github-token--work'], undefined, 'an instance has its own switch');

  const granted = hive.buildDefaultMcpServers(home, cfg, ['time'], 'dwight', scopes).servers;
  assert.equal(granted['munder-github-token'], undefined, 'a Capabilities grant without GitHub excludes all its connections');
});
