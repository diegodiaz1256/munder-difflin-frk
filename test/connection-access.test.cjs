'use strict';
/**
 * What an agent may DO with a connection: the connection's ceiling and the
 * agent's role meet at the lower of the two, and the MCP gateway enforces it on
 * every tool call. A tool we cannot recognise as read-only counts as a write.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { effectiveAccess, minAccess, isReadTool, filterTools, cleanAccessMap } = loadTs('src/shared/connectionAccess.ts');
const { cleanCustomBundles } = loadTs('src/shared/roleBundles.ts');
const { McpGateway } = loadTs('src/main/mcpGateway.ts');

test('the lower of ceiling and role wins', () => {
  assert.equal(minAccess('read', 'readwrite'), 'read');
  assert.equal(effectiveAccess('readwrite', { github: 'read' }, 'github'), 'read');
  assert.equal(effectiveAccess('read', { github: 'readwrite' }, 'github'), 'read');
  assert.equal(effectiveAccess('readwrite', { github: 'readwrite' }, 'github'), 'readwrite');
  assert.equal(effectiveAccess('none', { github: 'readwrite' }, 'github'), 'none');
});

test('no ceiling set → read-only; no role record → read-only; role without the service → none', () => {
  assert.equal(effectiveAccess(undefined, { github: 'readwrite' }, 'github'), 'read');
  assert.equal(effectiveAccess('readwrite', undefined, 'github'), 'read');
  assert.equal(effectiveAccess('readwrite', { notion: 'readwrite' }, 'github'), 'none');
});

test('read-only tools: by annotation, by name, by service rule; everything else is a write', () => {
  assert.equal(isReadTool('github-token', 'get_file_contents'), true);
  assert.equal(isReadTool('github-token', 'search_issues'), true);
  assert.equal(isReadTool('github-token', 'create_pull_request'), false);
  assert.equal(isReadTool('github-token', 'merge_pull_request'), false);
  assert.equal(isReadTool('github-token', 'something_new', { readOnlyHint: true }), true);
  assert.equal(isReadTool('github-token', 'get_thing', { destructiveHint: true }), false);
  assert.equal(isReadTool('search-with-key', 'brave_web_search'), true);
  assert.equal(isReadTool('notion', 'API-post-search'), true);
  assert.equal(isReadTool('notion', 'API-patch-page'), false);
  assert.equal(isReadTool('db', 'execute_sql'), true);
  assert.equal(isReadTool('github-token', 'delete_branch'), false);
  assert.equal(isReadTool('github-token', 'get'), true);
  assert.equal(isReadTool('github-token', 'getaway_car'), false);
});

test('filterTools by level', () => {
  const tools = [{ name: 'list_issues' }, { name: 'create_issue' }];
  assert.deepEqual(filterTools('github-token', tools, 'read').map((t) => t.name), ['list_issues']);
  assert.equal(filterTools('github-token', tools, 'readwrite').length, 2);
  assert.equal(filterTools('github-token', tools, 'none').length, 0);
});

test('cleanAccessMap drops unknown levels and services', () => {
  assert.deepEqual(cleanAccessMap({ a: 'read', b: 'root', c: 'readwrite' }, new Set(['a', 'b'])), { a: 'read' });
});

test('role bundles keep a validated access map for their servers only', () => {
  const [b] = cleanCustomBundles([{ label: 'Dev', icon: 'code', servers: ['github-token', 'git'], access: { 'github-token': 'readwrite', notion: 'readwrite', git: 'banana' } }]);
  assert.deepEqual(b.access, { 'github-token': 'readwrite' });
});

// ─── the gateway enforces it ────────────────────────────────────────────────

const SERVER = `
let buf = '';
process.stdin.on('data', (d) => {
  buf += d; let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.id === undefined) continue;
    let result;
    if (m.method === 'initialize') result = { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1' } };
    else if (m.method === 'tools/list') result = { tools: [{ name: 'list_issues' }, { name: 'create_issue' }, { name: 'odd_but_safe', annotations: { readOnlyHint: true } }] };
    else if (m.method === 'tools/call') result = { content: [{ type: 'text', text: 'ran ' + m.params.name }] };
    else continue;
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\\n');
  }
});
`;

async function setup(t, access) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-acc-'));
  const script = path.join(dir, 'server.cjs');
  fs.writeFileSync(script, SERVER);
  const gw = new McpGateway({
    resolveSpec: (id) => (id === 'github-token' ? { command: process.execPath, args: [script], env: {} } : null),
    serviceOf: (id) => id.split('--')[0],
    requestTimeoutMs: 5000
  });
  assert.equal((await gw.start()).ok, true);
  t.after(() => { gw.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  const token = gw.grant('agent-1', ['github-token'], access);
  const rpc = async (method, params, id) => {
    const res = await fetch(`${gw.url()}/mcp/github-token`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
    return res.json();
  };
  await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } }, 1);
  return rpc;
}

test('gateway: read-only hides write tools and refuses them', async (t) => {
  const rpc = await setup(t, { 'github-token': 'read' });
  const list = await rpc('tools/list', {}, 2);
  assert.deepEqual(list.result.tools.map((x) => x.name), ['list_issues', 'odd_but_safe']);
  const ok = await rpc('tools/call', { name: 'list_issues', arguments: {} }, 3);
  assert.match(ok.result.content[0].text, /ran list_issues/);
  const denied = await rpc('tools/call', { name: 'create_issue', arguments: {} }, 4);
  assert.equal(denied.result.isError, true);
  assert.match(denied.result.content[0].text, /read-only/);
  const hinted = await rpc('tools/call', { name: 'odd_but_safe', arguments: {} }, 5);
  assert.match(hinted.result.content[0].text, /ran odd_but_safe/);
});

test('gateway: read & write, none, and a grant without access levels', async (t) => {
  const rw = await setup(t, { 'github-token': 'readwrite' });
  assert.equal((await rw('tools/list', {}, 2)).result.tools.length, 3);
  assert.match((await rw('tools/call', { name: 'create_issue' }, 3)).result.content[0].text, /ran create_issue/);

  const none = await setup(t, { 'github-token': 'none' });
  assert.equal((await none('tools/list', {}, 2)).result.tools.length, 0);
  assert.equal((await none('tools/call', { name: 'list_issues' }, 3)).result.isError, true);

  const legacy = await setup(t, undefined); // callers that predate access levels stay unrestricted
  assert.match((await legacy('tools/call', { name: 'create_issue' }, 3)).result.content[0].text, /ran create_issue/);
});
