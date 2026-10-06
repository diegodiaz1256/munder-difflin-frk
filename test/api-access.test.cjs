'use strict';
/**
 * REST APIs (Jira, Linear, Notion…) have the same access levels as connections:
 * a limit per API and the agent's role, and the key broker lets a read-only
 * agent read and search but never change anything — before the request leaves.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const loadTs = require('./load-ts.cjs');

const { isReadRequest, effectiveApiAccess } = loadTs('src/shared/connectionAccess.ts');
const { IntegrationBroker } = loadTs('src/main/integrationBroker.ts');
const { cleanCustomBundles } = loadTs('src/shared/roleBundles.ts');

test('what counts as a read', () => {
  assert.equal(isReadRequest('GET', '/rest/api/3/issue/X-1'), true);
  assert.equal(isReadRequest('HEAD', 'x'), true);
  assert.equal(isReadRequest('POST', '/rest/api/3/search', '{"jql":"project=X"}'), true);       // Jira JQL
  assert.equal(isReadRequest('POST', '/rest/api/3/search/jql', '{"jql":"x"}'), true);
  assert.equal(isReadRequest('POST', '/v1/databases/abc/query', '{}'), true);                    // Notion
  assert.equal(isReadRequest('POST', '/graphql', '{"query":"{ viewer { id } }"}'), true);       // Linear query
  assert.equal(isReadRequest('POST', 'graphql', '{"query":"mutation { issueCreate(input:{}) { success } }"}'), false);
  assert.equal(isReadRequest('POST', '/graphql', '{"query":"  # c\\nmutation X { a }"}'), false);
  assert.equal(isReadRequest('POST', '/rest/api/3/issue', '{"fields":{}}'), false);
  assert.equal(isReadRequest('PUT', 'rest/api/3/issue/X-1', '{}'), false);
  assert.equal(isReadRequest('DELETE', 'rest/api/3/issue/X-1'), false);
});

test('API access: limit, role, and no role = read-only', () => {
  assert.equal(effectiveApiAccess(undefined, undefined, 'jira'), 'read');
  assert.equal(effectiveApiAccess('readwrite', { 'api:jira': 'readwrite' }, 'jira'), 'readwrite');
  assert.equal(effectiveApiAccess('readwrite', { 'github-token': 'readwrite' }, 'jira'), 'read');  // role predating APIs
  assert.equal(effectiveApiAccess('read', { 'api:jira': 'readwrite' }, 'jira'), 'read');
  assert.equal(effectiveApiAccess('readwrite', { 'api:jira': 'none' }, 'jira'), 'none');
  assert.equal(effectiveApiAccess('none', { 'api:jira': 'readwrite' }, 'jira'), 'none');
});

test('roles keep their API levels', () => {
  const [b] = cleanCustomBundles([{ label: 'PM', icon: 'ledger', servers: [], access: { 'api:jira': 'readwrite', 'api:Bad Id': 'read', 'api:linear': 'nope' } }]);
  assert.deepEqual(b.access, { 'api:jira': 'readwrite' });
});

async function setup(t, access) {
  const hits = [];
  const upstream = http.createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { hits.push(`${req.method} ${req.url}`); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); }); });
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
  t.after(() => upstream.close());
  const record = { id: 'jira', label: 'Jira', kind: 'custom-rest', baseUrl: `http://127.0.0.1:${upstream.address().port}/rest/api/3`, authType: 'none', enabled: true, createdAt: 0, updatedAt: 0 };
  const broker = new IntegrationBroker({ getRecord: (id) => (id === 'jira' ? record : undefined), getSecret: () => undefined });
  assert.equal((await broker.start()).ok, true);
  t.after(() => broker.stop());
  const token = broker.grant('w1', access === 'none' ? [] : ['jira'], { jira: access });
  const call = (method, path, body) => fetch(`${broker.url()}/i/jira/${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body });
  return { hits, call };
}

test('broker, read-only: GET and JQL search pass; creating an issue is refused before it leaves', async (t) => {
  const { hits, call } = await setup(t, 'read');
  assert.equal((await call('GET', 'myself')).status, 200);
  assert.equal((await call('POST', 'search', '{"jql":"project=X"}')).status, 200);
  const r = await call('POST', 'issue', '{"fields":{}}');
  assert.equal(r.status, 403);
  assert.match((await r.json()).error, /read-only/);
  assert.deepEqual(hits, ['GET /rest/api/3/myself', 'POST /rest/api/3/search']);
});

test('broker: a GraphQL API whose base is the endpoint (Linear) — query passes, mutation refused', async (t) => {
  const hits = [];
  const up = http.createServer((req, res) => { req.resume(); req.on('end', () => { hits.push(req.method); res.end('{}'); }); });
  await new Promise((r) => up.listen(0, '127.0.0.1', r));
  t.after(() => up.close());
  const record = { id: 'linear', label: 'Linear', kind: 'custom-rest', baseUrl: `http://127.0.0.1:${up.address().port}/graphql`, authType: 'none', enabled: true, createdAt: 0, updatedAt: 0 };
  const broker = new IntegrationBroker({ getRecord: () => record, getSecret: () => undefined });
  await broker.start();
  t.after(() => broker.stop());
  const token = broker.grant('w', ['linear'], { linear: 'read' });
  const post = (q) => fetch(`${broker.url()}/i/linear/`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ query: q }) });
  assert.equal((await post('{ viewer { id } }')).status, 200);
  assert.equal((await post('mutation { issueCreate(input: {}) { success } }')).status, 403);
  assert.deepEqual(hits, ['POST']);
});

test('broker, read & write: writes pass; none: nothing passes', async (t) => {
  const rw = await setup(t, 'readwrite');
  assert.equal((await rw.call('POST', 'issue', '{}')).status, 200);
  const none = await setup(t, 'none');
  assert.equal((await none.call('GET', 'myself')).status, 403);
  assert.deepEqual(none.hits, []);
});

// ─── the report: an agent started before Jira was usable never got it ──────

test('live capability: an API enabled after the agent started works at once; refusals say why', async (t) => {
  const up = http.createServer((req, res) => { req.resume(); req.on('end', () => res.end('{"me":1}')); });
  await new Promise((r) => up.listen(0, '127.0.0.1', r));
  t.after(() => up.close());
  const record = { id: 'jira', label: 'Jira', kind: 'custom-rest', baseUrl: `http://127.0.0.1:${up.address().port}/rest/api/2`, authType: 'none', enabled: true, createdAt: 0, updatedAt: 0 };
  let usable = false;                                         // the human has not finished saving Jira yet
  const broker = new IntegrationBroker({
    getRecord: (id) => (id === 'jira' ? record : undefined), getSecret: () => undefined,
    live: () => (usable ? { ids: ['jira'], access: { jira: 'read' } } : { ids: [], access: {} }),
    whyNot: () => (usable ? undefined : 'its key has not been saved in Connections → REST APIs')
  });
  await broker.start();
  t.after(() => broker.stop());
  const token = broker.grant('pty-1', [], {}, 'jim-4');      // spawned while Jira was not usable
  const h = { authorization: `Bearer ${token}` };

  const before = await fetch(`${broker.url()}/i/jira/myself`, { headers: h });
  assert.equal(before.status, 403);
  assert.match((await before.json()).error, /its key has not been saved.*no restart needed/);
  assert.deepEqual((await (await fetch(`${broker.url()}/i`, { headers: h })).json()).apis, []);

  usable = true;                                              // the human saves the key — no respawn
  const after = await fetch(`${broker.url()}/i/jira/myself`, { headers: h });
  assert.equal(after.status, 200);
  assert.deepEqual((await (await fetch(`${broker.url()}/i`, { headers: h })).json()).apis, [{ id: 'jira', label: 'Jira', access: 'read' }]);
  // ...and the level is live too: read-only refuses a write.
  assert.equal((await fetch(`${broker.url()}/i/jira/issue`, { method: 'POST', headers: h, body: '{}' })).status, 403);
});

test('a grant without an agent id keeps the spawn-time behaviour', async (t) => {
  const { call } = await setup(t, 'readwrite');
  assert.equal((await call('GET', 'myself')).status, 200);
});
