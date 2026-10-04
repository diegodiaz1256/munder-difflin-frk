'use strict';
/**
 * How MCP servers reach a Claude agent.
 *
 * Claude Code does not load `mcpServers` from a --settings file (verified on
 * 2.1.286: a server listed there is never started), so the bundle now goes in
 * <agent>/mcp.json behind --mcp-config. Keyed servers (Connections) get `${ENV}`
 * in that file and the real value only in the agent's process env: the hive is
 * a git repo main commits, so a secret written into it would be permanent.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

const SECRET = 'github_pat_TEST_do_not_leak_1234567890';

function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-mcp-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.setMcpSecretResolver((server, env) => (server === 'github-token' && env === 'GITHUB_PERSONAL_ACCESS_TOKEN' ? SECRET : undefined));
  return { home, hive };
}

function walk(dir, out = []) {
  for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

test('a keyed server with a stored key gets ${ENV} in its config and the value in env', (t) => {
  const { hive, home } = floor(t);
  const { servers, env } = hive.buildDefaultMcpServers(home, { 'github-token': { enabled: true } });
  assert.deepEqual(servers['munder-github-token'].env, { GITHUB_PERSONAL_ACCESS_TOKEN: '${GITHUB_PERSONAL_ACCESS_TOKEN}' });
  assert.equal(env.GITHUB_PERSONAL_ACCESS_TOKEN, SECRET);
});

test('a keyed server without its key is left out (it could only fail)', (t) => {
  const { hive, home } = floor(t);
  const { servers, env } = hive.buildDefaultMcpServers(home, { notion: { enabled: true }, 'search-with-key': { enabled: true } });
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
  assert.equal(jim.env.GITHUB_PERSONAL_ACCESS_TOKEN, undefined, 'an agent outside the scope never sees the key');
});

test('consent still gates a keyed server even when a key is stored', (t) => {
  const { hive, home } = floor(t);
  assert.equal(hive.buildDefaultMcpServers(home, {}).servers['munder-github-token'], undefined);
});

test('spawn: mcp.json behind --mcp-config, nothing in settings.json, no secret anywhere in the hive', async (t) => {
  const { hive, home } = floor(t);
  const inj = await hive.ensureAgent(
    { id: 'dwight', name: 'Dwight', provider: 'claude', cwd: home },
    { mcpDefaults: { 'github-token': { enabled: true } } }
  );
  const i = inj.args.indexOf('--mcp-config');
  assert.ok(i >= 0, 'claude is handed the MCP config');
  const mcpPath = inj.args[i + 1];
  assert.ok(inj.args[i + 2]?.startsWith('--'), 'the next token is an option, so nothing positional is read as a config path');
  const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
  assert.ok(mcp.mcpServers['munder-github-token']);
  assert.equal(inj.env.GITHUB_PERSONAL_ACCESS_TOKEN, SECRET);

  const settings = JSON.parse(fs.readFileSync(inj.args[inj.args.indexOf('--settings') + 1], 'utf8'));
  assert.equal(settings.mcpServers, undefined, 'Claude Code ignores mcpServers in --settings');

  for (const file of walk(path.join(home, 'hive'))) {
    if (file.includes(`${path.sep}.git${path.sep}`)) continue;
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    assert.ok(!text.includes(SECRET), `secret written to ${file}`);
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
