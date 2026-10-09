'use strict';
// Your own skill marketplaces (src/main/skillMarketplaces.ts) and the policy
// that lets the orchestrator use them (src/shared/skillRequests.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => require('os').tmpdir() } } };
const { skillDirsFromTree, mergeCatalog, cleanMarketplaces, marketplaceProblem } = loadTs('src/main/skillMarketplaces.ts');
const { policyAllows, cleanSkillPolicy, searchCatalog, planSkillRequest } = loadTs('src/shared/skillRequests.ts');

test('a marketplace is a GitHub repo or folder', () => {
  assert.equal(marketplaceProblem('https://github.com/acme/skills'), null);
  assert.equal(marketplaceProblem('https://github.com/acme/skills/tree/main/team'), null);
  assert.match(marketplaceProblem('https://gitlab.com/acme/skills'), /GitHub/);
  assert.match(marketplaceProblem('acme/skills'), /GitHub/);
});

test('skill folders come from the tree: every SKILL.md, under the folder given', () => {
  const paths = ['README.md', 'skills/pdf/SKILL.md', 'skills/pdf/run.py', 'skills/xlsx/SKILL.md', 'other/thing/SKILL.md', 'SKILL.md'];
  assert.deepEqual(skillDirsFromTree(paths, ''), ['skills/pdf', 'skills/xlsx', 'other/thing', '']);
  assert.deepEqual(skillDirsFromTree(paths, 'skills'), ['skills/pdf', 'skills/xlsx']);
});

test('marketplace skills join the catalog and replace a same-named one from the same owner', () => {
  const catalog = [{ name: 'pdf', owner: 'acme', description: 'old', url: 'u1', category: 'c' }, { name: 'docx', owner: 'anthropics', description: '', url: 'u2', category: 'c' }];
  const merged = mergeCatalog(catalog, [{ url: 'm', label: 'acme', fetchedAt: 1, skills: [{ name: 'pdf', owner: 'acme', description: 'new', url: 'u3', category: 'acme', marketplace: 'm' }] }]);
  assert.deepEqual(merged.map((s) => [s.name, s.description]), [['pdf', 'new'], ['docx', '']]);
});

test('the saved list is cleaned: valid GitHub addresses, no duplicates', () => {
  assert.deepEqual(cleanMarketplaces([{ url: ' https://github.com/a/b ' }, { url: 'https://github.com/a/b' }, { url: 'ftp://x' }, null, { url: 'https://github.com/c/d', label: 'Team' }]),
    [{ url: 'https://github.com/a/b' }, { url: 'https://github.com/c/d', label: 'Team' }]);
});

test('"mine": the orchestrator may add Anthropic skills and your marketplaces, not the rest', () => {
  assert.equal(cleanSkillPolicy('mine'), 'mine');
  const anth = { owner: 'anthropics' }, own = { owner: 'acme', marketplace: 'https://github.com/acme/skills' }, other = { owner: 'someone' };
  assert.deepEqual([anth, own, other].map((e) => policyAllows(e, 'mine')), [true, true, false]);
  assert.deepEqual([anth, own, other].map((e) => policyAllows(e, 'official')), [true, false, false]);
  assert.deepEqual([anth, own, other].map((e) => policyAllows(e, 'catalog')), [true, true, true]);

  const catalog = [
    { name: 'brand-voice', owner: 'acme', description: 'our voice', url: 'https://github.com/acme/skills/tree/main/brand-voice', category: 'acme', marketplace: 'https://github.com/acme/skills' },
    { name: 'brand-guide', owner: 'someone', description: 'voice', url: 'https://github.com/someone/x', category: 'c' }
  ];
  assert.deepEqual(searchCatalog(catalog, 'brand', 'mine').map((c) => c.name), ['brand-voice']);
  const ok = planSkillRequest({ action: 'add', skill: 'brand-voice', agents: ['*'] }, { state: { skills: {} }, catalog, policy: 'mine', agents: new Set(['god']) });
  assert.equal(ok.ok, true, ok.message);
  const no = planSkillRequest({ action: 'add', skill: 'brand-guide', agents: ['*'] }, { state: { skills: {} }, catalog, policy: 'mine', agents: new Set(['god']) });
  assert.equal(no.ok, false);
  assert.match(no.message, /marketplaces/);
});
