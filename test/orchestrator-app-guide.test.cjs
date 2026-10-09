'use strict';
// The orchestrator answers "how do I … in the app" from protocol/app-guide.md.
// The guide must name every Manager page and Settings section, so adding one
// without telling the orchestrator fails here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { protocolFiles } = loadTs('src/main/protocolDocs.ts');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
// The guide is three short topics (each protocol topic stays under 2500 chars).
const parts = protocolFiles().filter((f) => /^protocol\/app-(pages|setup|settings)\.md$/.test(f.filename));
const guide = { contents: parts.map((f) => f.contents).join('\n') };

test('the guide is generated, and listed for the orchestrator in the index', () => {
  assert.equal(parts.length, 3);
  for (const f of ['app-pages', 'app-setup', 'app-settings']) assert.match(protocolFiles()[0].contents, new RegExp(`protocol/${f}\.md`));
});

test('it names every Manager page', () => {
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json'));
  const top = read('src/renderer/src/pro/ProShell.tsx').match(/const TOP[\s\S]*?\];/)[0];
  const ids = [...top.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]);
  assert.ok(ids.length >= 10);
  const missing = ids.filter((id) => !guide.contents.includes(`**${en.pro.nav[id]}**`));
  assert.deepEqual(missing, [], 'pages the guide does not mention');
  for (const extra of ['Agents', 'Temps']) assert.ok(guide.contents.includes(`**${extra}**`), extra);
});

test('it names every Settings section', () => {
  const sections = read('src/renderer/src/components/SettingsModal.tsx').match(/const NAV_SECTIONS: Section\[\] = \[([^\]]+)\]/)[1]
    .split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.ok(sections.length >= 6);
  // By the name people see in the app (en.json), not the internal id.
  const keys = read('src/renderer/src/components/SettingsModal.tsx').match(/const NAV_SECTION_KEYS[\s\S]*?\};/)[0];
  const label = (s) => { const k = keys.match(new RegExp(`'${s.replace(/[&]/g, '\$&')}': 'settings\.nav\.([a-zA-Z]+)'`))[1]; return JSON.parse(read('src/renderer/src/i18n/locales/en.json')).settings.nav[k]; };
  assert.deepEqual(sections.map(label).filter((l) => !guide.contents.includes(`**${l}**`)), []);
});

test('the orchestrator has the app map in its prompt, and the guide for the rest', () => {
  const hive = read('src/main/hive.ts');
  assert.match(hive, /APP HELP — Scranton Branch is this app \(not Claude Code[\s\S]*?app-pages\.md/);
  assert.match(hive, /"Outside its folders"/);
  assert.match(hive, /File → New Floor/);
});
