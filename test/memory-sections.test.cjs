'use strict';
// Structured memory (src/shared/memorySections.ts): sections by project type,
// dates from bullets, headings nobody planned for, free-form memories.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { parseMemory, memoryTemplate, memoryInstruction, sectionForHeading, filePathIn, detectProjectType, orderSections, sectionDef } = loadTs('src/shared/memorySections.ts');

test('the template of every project type parses to nothing (headings only)', () => {
  for (const t of ['code', 'data', 'infra', 'docs', 'research']) assert.deepEqual(parseMemory(memoryTemplate('Pam', 'pam', t)), [], t);
});

test('project types are detected from what is in the folder', () => {
  assert.equal(detectProjectType(['package.json', 'src', 'README.md']), 'code');
  assert.equal(detectProjectType(['analysis.ipynb', 'sales.csv', 'README.md']), 'data');
  assert.equal(detectProjectType(['main.tf', 'variables.tf']), 'infra');
  assert.equal(detectProjectType(['intro.md', 'chapter-1.md', 'chapter-2.md', 'notes.md']), 'docs');
  assert.equal(detectProjectType(['hive', 'palace', 'roster.json']), 'research');
});

test('each type tells agents its own sections', () => {
  assert.match(memoryInstruction('research'), /Findings.*Sources.*Glossary/);
  assert.match(memoryInstruction('code'), /Decisions.*Conventions.*Known issues.*Key files/);
  assert.match(memoryTemplate('Lexi', 'lexi', 'research'), /## Findings[\s\S]*## Sources[\s\S]*## Glossary/);
});

test('bullets land in their section, with their date; Spanish headings work', () => {
  const md = ['## Decisions', '- 2026-10-05: Use Postgres, not SQLite.', '## Hallazgos', '- 2026-10-05 — Death Guard lidera el meta.', '## Fuentes', '- warhammer40000.com (oficial)', '## Key files', '- `src/server/db.ts` — pool.'].join('\n');
  const e = parseMemory(md);
  assert.deepEqual(e.map((x) => x.section), ['decisions', 'findings', 'sources', 'files']);
  assert.equal(e[1].date, '2026-10-05');
  assert.equal(e[1].text, 'Death Guard lidera el meta.');
  assert.equal(filePathIn(e[3].text), 'src/server/db.ts');
  assert.equal(sectionForHeading('Problemas conocidos'), 'issues');
});

test('a heading nobody planned for gets its own section, ordered after the type\'s own', () => {
  const e = parseMemory('## Paint recipes\n- Macragge Blue base, Calgar Blue highlight.\n## Findings\n- x is y.');
  assert.equal(e[0].section, 'h:Paint recipes');
  assert.equal(sectionDef('h:Paint recipes').label, 'Paint recipes');
  assert.deepEqual(orderSections(['h:Paint recipes', 'notes', 'findings', 'decisions'], 'research'), ['findings', 'decisions', 'notes', 'h:Paint recipes']);
});

test('a free-form memory still parses; dated headings date their bullets', () => {
  const lexi = fs.readFileSync(path.join(__dirname, 'fixtures', 'memory', 'lexi.md'), 'utf8');
  const e = parseMemory(lexi);
  assert.ok(e.length >= 3);
  assert.ok(e.every((x) => x.date === '2026-10-05'));
});
