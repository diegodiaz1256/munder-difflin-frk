'use strict';
// Factories (src/main/factories.ts) against a pretend Factory MCP server
// (tools/mock-factory.cjs): adding one checks it answers, the token stays
// out of every result, read-only factories offer no send, the floor and events
// read through, and only the profile's tools can be called.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { startMockFactory } = require('../tools/mock-factory.cjs');

const { Factories, validFactoryUrl } = loadTs('src/main/factories.ts');

function memoryDeps() {
  let list = [];
  const tokens = new Map();
  return {
    list: () => list,
    save: (l) => { list = l; },
    token: (id) => tokens.get(id),
    setToken: (id, t) => { tokens.set(id, t); return { ok: true }; },
    deleteToken: (id) => tokens.delete(id),
    tokens
  };
}

test('only https, or http to this machine', () => {
  assert.ok(validFactoryUrl('https://factory.lan/mcp'));
  assert.ok(validFactoryUrl('http://127.0.0.1:8787/mcp'));
  assert.equal(validFactoryUrl('http://factory.lan/mcp'), null);
  assert.equal(validFactoryUrl('ftp://x'), null);
});

test('add a factory: it must answer, the token never comes back out', async (t) => {
  const m = await startMockFactory({ token: 's3cret', tick: 0 });
  const deps = memoryDeps();
  const f = new Factories(deps);
  t.after(async () => { await f.closeAll(); await m.close(); });

  const bad = await f.add('Shop line', m.url, 'wrong');
  assert.equal(bad.ok, false);
  assert.equal(deps.list().length, 0, 'nothing saved when it does not answer');

  const r = await f.add('Shop line', m.url, 's3cret');
  assert.equal(r.ok, true, r.error);
  assert.equal(r.info.profile, 'factory-mcp/0');
  assert.equal(r.info.projectsRequired, true);
  assert.equal(r.info.canSend, true);
  const listed = f.list();
  assert.equal(listed[0].name, 'Shop line');
  assert.ok(!JSON.stringify(listed).includes('s3cret'), 'the token is not in what the renderer sees');
});

test('a read-only factory offers no send and refuses write tools', async (t) => {
  const m = await startMockFactory({ token: 'r', tick: 0, readOnly: true });
  const f = new Factories(memoryDeps());
  t.after(async () => { await f.closeAll(); await m.close(); });
  const r = await f.add('', m.url, 'r');
  assert.equal(r.ok, true, r.error);
  assert.equal(r.info.canSend, false);
  assert.equal(r.info.canAnswer, false);
  await assert.rejects(f.call(r.id, 'task_create', { project: 'shop', title: 't', detail: 'long enough detail' }), /does not offer/);
});

test('floor, events and tools read through; only profile tools are callable', async (t) => {
  const m = await startMockFactory({ token: 'x', tick: 0 });
  const f = new Factories(memoryDeps());
  t.after(async () => { await f.closeAll(); await m.close(); });
  const { id } = await f.add('', m.url, 'x');
  for (let i = 0; i < 6; i++) m.factory.tick();

  const floor = await f.floor(id);
  assert.ok(floor.agents.some((a) => a.state === 'working'), 'someone is working');
  assert.ok(Array.isArray(floor.board) && floor.board.length > 0);

  const ev = await f.events(id, '0');
  assert.ok(ev.events.length > 0);
  const later = await f.events(id, ev.cursor);
  assert.equal(later.events.length, 0, 'nothing new since the cursor');

  const created = await f.call(id, 'task_create', { project: 'blog', title: 'Search', detail: 'Full-text search over posts.', client_ref: 'r-1' });
  const again = await f.call(id, 'task_create', { project: 'blog', title: 'Search', detail: 'Full-text search over posts.', client_ref: 'r-1' });
  assert.equal(again.task_id, created.task_id, 'client_ref makes it idempotent');
  const got = await f.call(id, 'task_get', { task_id: created.task_id });
  assert.equal(got.title, 'Search');

  await assert.rejects(f.call(id, 'shell_exec', {}), /not a Factory MCP tool/);
  await assert.rejects(f.call(id, 'task_cancel', { task_id: created.task_id }), /confirmation/);
});

test('remove forgets the factory and its token', async (t) => {
  const m = await startMockFactory({ token: 'z', tick: 0 });
  const deps = memoryDeps();
  const f = new Factories(deps);
  t.after(async () => { await f.closeAll(); await m.close(); });
  const { id } = await f.add('', m.url, 'z');
  f.remove(id);
  assert.equal(deps.list().length, 0);
  assert.equal(deps.tokens.size, 0);
});
