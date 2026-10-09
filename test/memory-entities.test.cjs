'use strict';
// Entities from the tables agents write (src/shared/memoryEntities.ts), on
// the real Warhammer deliverables of a test office.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { buildEntities, parseTables, entityKey, scoreOf } = loadTs('src/shared/memoryEntities.ts');

const md = fs.readFileSync(path.join(__dirname, 'fixtures', 'memory', 'w40k-tables.md'), 'utf8');
const [facciones, paletas] = md.split('## Paletas');

test('tables are found with their headers', () => {
  const t = parseTables(facciones);
  assert.equal(t.length, 1);
  assert.equal(t[0].headers[0], 'Facción');
  assert.ok(t[0].headers.includes('Popularidad'));
});

test('rows become entities, grouped, merged across documents, sources kept', () => {
  const e = buildEntities([{ label: 'w40k-facciones.md', text: facciones }, { label: 'w40k-paletas.md', text: paletas }]);
  const sm = e.find((x) => x.key === 'space marine');
  assert.ok(sm, e.map((x) => x.key).join(', '));
  assert.equal(sm.kind, 'Facción');
  assert.match(sm.group, /Imperium/);
  const labels = sm.attrs.map((a) => a.label);
  assert.ok(labels.includes('Popularidad'), labels.join(', '));
  assert.ok(labels.some((l) => /Colores/.test(l)), 'palette merged in from the other document');
  assert.ok(sm.attrs.some((a) => a.source === 'w40k-paletas.md'));
  assert.ok(!labels.includes('Fuentes'), 'source columns are not attributes');
  assert.ok(!e.some((x) => /^imperium/.test(x.key)), 'group rows are not entities');
});

test('names and scores', () => {
  assert.equal(entityKey('**Space Marines (genérico)**'), 'space marine');
  assert.equal(scoreOf('4'), 4);
  assert.equal(scoreOf('3→2'), 2);
  assert.equal(scoreOf('$250'), null);
});

test('aliases from notes and typos lead to the same entity', () => {
  const { matchEntity } = loadTs('src/shared/memoryEntities.ts');
  const table = '| Facción | Popularidad |\n|---|---|\n| **Chaos** | |\n| Death Guard | 4 |\n| World Eaters | 3 |\n| Thousand Sons | 3 |\n';
  const e = buildEntities([{ label: 't', text: table }, { label: 'n', text: '- DG = Death Guard\n- Los marines de Nurgle, también llamados Death Guard.' }]);
  for (const q of ['DG', 'marines de nurgle', 'Deth Gaurd', 'death guards']) assert.equal(matchEntity(e, q)?.name, 'Death Guard', q);
  assert.equal(matchEntity(e, 'Wrold Eaters')?.name, 'World Eaters');
  assert.equal(matchEntity(e, 'Space Wolves'), undefined, 'no false friend');
});

test('tickets one digit apart stay separate, and each is listed once', () => {
  const { buildEntities: build } = require('./load-ts.cjs')('src/shared/memoryEntities.ts');
  const jira = (rows) => '| Key | Summary | Assignee |\n|---|---|---|\n' + rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  const docs = [
    { label: 'jira-a.md', text: jira([['INFOSEC-44587', 'Add connector', 'rsoto'], ['INFOSEC-44589', 'Add image scan', 'tomaszgi'], ['INFOSEC-44650', 'RBAC for hub', 'rsoto']]) },
    { label: 'jira-b.md', text: jira([['INFOSEC-44587', 'Add connector', 'rsoto'], ['INFOSEC-44588', 'Fix alias', 'ana'], ['INFOSEC-44650', 'RBAC for hub', 'rsoto']]) }
  ];
  const es = build(docs);
  const names = es.map((e) => e.name).sort();
  assert.deepEqual(names, ['INFOSEC-44587', 'INFOSEC-44588', 'INFOSEC-44589', 'INFOSEC-44650']);
  const a = es.find((e) => e.name === 'INFOSEC-44587');
  assert.deepEqual(a.attrs.map((x) => `${x.label}=${x.value}`), ['Summary=Add connector', 'Assignee=rsoto'], 'its own fields only, once');
});

test('numbered steps and timelines are not entities', () => {
  const { buildEntities: build } = require('./load-ts.cjs')('src/shared/memoryEntities.ts');
  const steps = '| # | Step | Owner |\n|---|---|---|\n| 1 | Build | jim |\n| 2 | Test | pam |\n| 3 | Ship | god |';
  const times = '| Time | Event |\n|---|---|\n| 10:00 | start |\n| 10:30 | review |\n| 11:00 | merge |';
  assert.deepEqual(build([{ label: 'plan.md', text: steps + '\n\n' + times }]), []);
});
