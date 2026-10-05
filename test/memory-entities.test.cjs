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
