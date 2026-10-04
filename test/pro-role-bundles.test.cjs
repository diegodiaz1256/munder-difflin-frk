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
