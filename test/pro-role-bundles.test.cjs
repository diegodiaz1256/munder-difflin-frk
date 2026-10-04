'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { ROLE_BUNDLES, cleanServerList } = loadTs('src/shared/roleBundles.ts');
const { MCP_CATALOG } = loadTs('src/shared/mcpCatalog.ts');

test('every role bundle names real catalog servers', () => {
  const ids = new Set(MCP_CATALOG.map((e) => e.id));
  for (const b of ROLE_BUNDLES) for (const s of b.servers) assert.ok(ids.has(s), `${b.id}: ${s}`);
});

test('a grant is cleaned to known ids, de-duplicated, in catalog order', () => {
  assert.deepEqual(cleanServerList(['git', 'nope', 'context7', 'git', 3]), ['context7', 'git']);
  assert.deepEqual(cleanServerList('git'), []);
});

const { cleanCustomBundles, allRoleBundles, MAX_CUSTOM_BUNDLES } = loadTs('src/shared/roleBundles.ts');

test('custom bundles are cleaned: slug ids, real servers, known icons', () => {
  const out = cleanCustomBundles([
    { label: '  Data Analyst ', icon: 'ledger', servers: ['db', 'nope', 'fetch', 'db'] },
    { label: 'Data Analyst', icon: 'rocket', servers: [] },
    { id: 'designer', label: 'My designer', servers: ['context7'] },
    { label: '' },
    'junk'
  ]);
  assert.deepEqual(out.map((b) => b.id), ['my-data-analyst', 'my-data-analyst-2', 'my-my-designer']);
  assert.deepEqual(out[0].servers, ['fetch', 'db']);
  assert.equal(out[0].label, 'Data Analyst');
  assert.equal(out[1].icon, 'mcp', 'unknown icon falls back');
  assert.ok(out.every((b) => b.custom));
});

test('custom bundles are capped and listed after the built-ins', () => {
  const many = Array.from({ length: MAX_CUSTOM_BUNDLES + 5 }, (_, i) => ({ label: `B${i}`, servers: ['git'] }));
  assert.equal(cleanCustomBundles(many).length, MAX_CUSTOM_BUNDLES);
  const all = allRoleBundles([{ label: 'Mine', servers: ['git'] }]);
  assert.deepEqual(all.slice(0, ROLE_BUNDLES.length).map((b) => b.id), ROLE_BUNDLES.map((b) => b.id));
  assert.equal(all.at(-1).id, 'my-mine');
});
