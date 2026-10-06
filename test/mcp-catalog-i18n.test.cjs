'use strict';
/**
 * The Connections and Capabilities pages showed the MCP catalog's words in
 * English in every language. The catalog stays English (main uses it too);
 * the locales carry its descriptions and key fields under mcpCatalog.<id>.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { MCP_CATALOG } = loadTs('src/shared/mcpCatalog.ts');
const LOCALES = ['en', 'es', 'zh-CN', 'ar'].map((l) => [l, require(`../src/renderer/src/i18n/locales/${l}.json`)]);

test('every catalog server has its description and key fields in every locale', () => {
  for (const [loc, json] of LOCALES) {
    for (const e of MCP_CATALOG) {
      const tr = json.mcpCatalog?.[e.id];
      assert.ok(tr?.desc, `${loc}: mcpCatalog.${e.id}.desc`);
      for (const s of e.secrets ?? []) {
        assert.ok(tr[s.env]?.label && tr[s.env]?.help, `${loc}: mcpCatalog.${e.id}.${s.env}`);
      }
    }
  }
});

test('the English locale says what the catalog says', () => {
  const en = LOCALES[0][1].mcpCatalog;
  for (const e of MCP_CATALOG) {
    assert.equal(en[e.id].desc, e.description, `en drifted from the catalog for ${e.id}`);
    for (const s of e.secrets ?? []) {
      assert.equal(en[e.id][s.env].label, s.label);
      assert.equal(en[e.id][s.env].help, s.help);
    }
  }
});

test('Spanish is not a copy of the English', () => {
  const es = LOCALES[1][1].mcpCatalog;
  const en = LOCALES[0][1].mcpCatalog;
  for (const id of Object.keys(en)) assert.notEqual(es[id].desc, en[id].desc, id);
});
