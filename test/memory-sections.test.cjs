'use strict';
// Structured memory (src/shared/memorySections.ts): sections from headings,
// dates from bullets, and free-form memories still parse.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { parseMemory, memoryTemplate, sectionForHeading, filePathIn } = loadTs('src/shared/memorySections.ts');

test('the template parses to nothing (headings only)', () => {
  assert.deepEqual(parseMemory(memoryTemplate('Pam', 'pam')), []);
});

test('bullets land in the section their heading names, with their date', () => {
  const md = [
    '# Memory — Pam (pam)', '',
    '## Decisions', '- 2026-10-05: Use Postgres, not SQLite — we need concurrent writers.',
    '## Known issues', '- `npm test` hangs on Windows unless --runInBand.',
    '## Key files', '- `src/server/db.ts` — connection pool and migrations.',
    '## Open questions', '- Do we keep the v1 API?'
  ].join('\n');
  const e = parseMemory(md);
  assert.deepEqual(e.map((x) => x.section), ['decisions', 'issues', 'files', 'questions']);
  assert.equal(e[0].date, '2026-10-05');
  assert.equal(e[0].text, 'Use Postgres, not SQLite — we need concurrent writers.');
  assert.equal(filePathIn(e[2].text), 'src/server/db.ts');
});

test('a free-form memory still parses; dated headings date their bullets; Spanish headings work', () => {
  const lexi = fs.readFileSync(path.join(__dirname, 'fixtures', 'memory', 'lexi.md'), 'utf8');
  const e = parseMemory(lexi);
  assert.ok(e.length >= 3);
  assert.ok(e.every((x) => x.date === '2026-10-05'), JSON.stringify(e.map((x) => x.date)));
  assert.equal(sectionForHeading('Problemas conocidos'), 'issues');
  assert.equal(sectionForHeading('Decisiones'), 'decisions');
});

test('a bullet can name its own kind', () => {
  const e = parseMemory('## Log\n- Gotcha: the proxy drops HEAD requests.\n- Decision: ship weekly.');
  assert.deepEqual(e.map((x) => [x.section, x.text]), [['issues', 'the proxy drops HEAD requests.'], ['decisions', 'ship weekly.']]);
});
