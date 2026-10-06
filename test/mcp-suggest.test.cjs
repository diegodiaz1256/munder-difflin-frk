'use strict';
/** A server found on this machine is matched to a Connection when it is one. */
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { suggestFor } = loadTs('src/shared/mcpSuggest.ts');
const { McpServers } = loadTs('src/main/mcpServers.ts');

const stdio = (command, args) => ({ kind: 'stdio', command, args });

test('a GitHub server is the GitHub Connection, with or without a pinned version', () => {
  assert.deepEqual(suggestFor(stdio('npx', ['-y', '@modelcontextprotocol/server-github']), ['GITHUB_PERSONAL_ACCESS_TOKEN']), { kind: 'connection', id: 'github-token', label: 'GitHub' });
  assert.equal(suggestFor(stdio('npx', ['-y', '@modelcontextprotocol/server-github@2025.4.8']), []).id, 'github-token');
});

test('Postgres, Brave, Notion and Sentry servers map to their Connections', () => {
  assert.equal(suggestFor(stdio('uvx', ['postgres-mcp']), ['DATABASE_URI']).id, 'db');
  assert.equal(suggestFor(stdio('npx', ['-y', '@modelcontextprotocol/server-brave-search']), ['BRAVE_API_KEY'])?.kind, 'connection');
});

test('a shipped keyless server is "built in"; unknown and remote ones are not matched', () => {
  assert.equal(suggestFor(stdio('npx', ['-y', '@modelcontextprotocol/server-sequential-thinking']), []).kind, 'builtin');
  assert.equal(suggestFor(stdio('node', ['my-own-server.js']), []), null);
  assert.equal(suggestFor({ kind: 'http', url: 'https://x/mcp' }, []), null);
});

test('what an agent set up in its own folder is found, with its name', () => {
  const files = {
    '/w/pam/.mcp.json': JSON.stringify({ mcpServers: { gh: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'x' } } } }),
    '/hive/agents/jim/.codex/config.toml': '[mcp_servers.thing]\ncommand = "node"\nargs = ["s.js"]\n'
  };
  const s = new McpServers({
    readFile: (p) => files[p.replace(/\\/g, '/')] ?? null, home: '/h', appData: () => '/a',
    readCustom: () => [], writeCustom: () => {}, getSecret: () => undefined, setSecret: () => ({ ok: true }), deleteSecret: () => {},
    agentPlaces: () => [{ name: 'Pam', cwd: '/w/pam' }, { name: 'Jim', cwd: '/w/jim', codexHome: '/hive/agents/jim/.codex' }]
  });
  const found = s.scanForUi().filter((f) => f.agent);
  assert.deepEqual(found.map((f) => [f.agent, f.name]).sort(), [['Jim', 'thing'], ['Pam', 'gh']]);
  assert.equal(found.find((f) => f.name === 'gh').suggest.id, 'github-token');
  assert.equal(found.find((f) => f.name === 'gh').env[0].secret, true);
});

test('a WSL floor: servers in the distro home (where its agents\' Claude Code keeps them) are found too', () => {
  const H = '\\\\wsl.localhost\\Ubuntu\\home\\me';
  const files = {
    [`${H}/.claude.json`.replace(/\\/g, '/')]: JSON.stringify({ mcpServers: { gh: { command: 'npx', args: ['@modelcontextprotocol/server-github'] } } }),
    [`${H}/.codex/config.toml`.replace(/\\/g, '/')]: '[mcp_servers.x]\ncommand = "node"\n'
  };
  const s = new McpServers({
    readFile: (p) => files[p.replace(/\\/g, '/')] ?? null, home: '/h', appData: () => '/a',
    readCustom: () => [], writeCustom: () => {}, getSecret: () => undefined, setSecret: () => ({ ok: true }), deleteSecret: () => {},
    extraHomes: () => [{ label: 'WSL Ubuntu', home: H }]
  });
  const found = s.scanForUi().map((f) => [f.source, f.name]);
  assert.deepEqual(found.sort(), [['Claude Code (WSL Ubuntu)', 'gh'], ['Codex (WSL Ubuntu)', 'x']]);
});
