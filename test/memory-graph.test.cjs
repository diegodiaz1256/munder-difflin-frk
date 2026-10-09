'use strict';
// The memory graph: concepts from agents' memories and research deliverables
// (src/shared/memoryGraph.ts), on real notes from a test office.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { buildMemoryGraph, conceptsIn, splitNotes, parsePalaceSearch } = loadTs('src/shared/memoryGraph.ts');

const fx = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', 'memory', f), 'utf8');
const docs = [
  { id: 'agent:god', kind: 'agent', label: 'Michael', agentId: 'god', text: fx('god.md') },
  { id: 'agent:lexi', kind: 'agent', label: 'Lexi', agentId: 'lexi', text: fx('lexi.md') },
  { id: 'doc:research/w40k-paletas.md', kind: 'doc', label: 'w40k-paletas.md', text: fx('paletas.md') }
];

test('concepts are the names that recur, not grammar, colour codes or table cells', () => {
  const g = buildMemoryGraph(docs);
  const labels = g.concepts.map((c) => c.label);
  for (const want of ['Abaddon Black', 'Black Legion', 'Imperial Knights', 'w40k-facciones.md']) assert.ok(labels.includes(want), `${want} in ${labels.join(', ')}`);
  for (const noise of ['C39E81', '231F', '10ª', 'Memory', 'Append', 'Azul', 'Negro']) assert.ok(!labels.includes(noise), `${noise} should not be a concept`);
});

test('concepts in the same note are linked; agents and documents mention them', () => {
  const g = buildMemoryGraph(docs);
  assert.ok(g.edges.some((e) => [e.a, e.b].includes('abaddon black') && [e.a, e.b].includes('black legion')));
  assert.ok(g.mentions['doc:research/w40k-paletas.md'].includes('abaddon black'));
  assert.ok(g.mentions['agent:god'].includes('w40k-facciones.md'));
  assert.ok(g.notes['abaddon black'].length > 0);
});

test('a sentence-initial capital is grammar, a mid-sentence one is a name', () => {
  assert.deepEqual([...conceptsIn('Entregable listo para Dwight.').values()], ['Dwight']);
  assert.ok(!conceptsIn('Meta: nothing new').has('meta'));
  assert.ok(conceptsIn('Meta 2025: Death Guard e Imperial Knights co-líderes').has('death guard'));
});

test('bullets, headings and table rows are separate notes', () => {
  const notes = splitNotes('# Title\n- one thing\n- another\n\n| Faction | Color |\n|---|---|\n| Orks | Green |');
  assert.ok(notes.includes('one thing') && notes.includes('another'));
  assert.ok(notes.some((n) => n.includes('Orks; Green')));
});

test('mempalace search output becomes results, not lines', () => {
  const hits = parsePalaceSearch(fx('palace-search.txt'));
  assert.equal(hits.length, 2);
  assert.equal(hits[0].wing, 'god');
  assert.equal(hits[0].source, 'memory.md');
  assert.ok(hits[0].score > 0.5);
  assert.ok(!/={5,}|Results for|Match:/.test(hits.map((h) => h.text).join('\n')));
});

test('markdown markup is not part of a note, and bold labels are not concepts', () => {
  const doc = [
    '**Purpose**: cache invoices for Acme Billing.',
    '',
    '```http',
    'Cache-Control: private, max-age=3600',
    '```',
    '',
    '| Header | Effect |',
    '|---|:---:|',
    '| ETag | Validation |'
  ].join('\n');
  const notes = splitNotes(doc);
  assert.deepEqual(notes, ['Purpose: cache invoices for Acme Billing.', 'Cache-Control: private, max-age=3600', 'Header; Effect', 'ETag; Validation']);
  const g = buildMemoryGraph([{ id: 'd', kind: 'doc', label: 'd', text: doc }]);
  const ids = g.concepts.map((c) => c.id);
  assert.ok(!ids.includes('purpose') && !ids.includes('effect'), `labels leaked into concepts: ${ids}`);
  assert.ok(ids.includes('acme billing'), `real names stay: ${ids}`);
});

test('measurements are not concepts, names with digits still are', () => {
  const found = conceptsIn('Sidebar icons: 1.5px stroke, round caps, 16px box, 5px gap; builds in 30ms on Node 22 with OAuth2.');
  for (const k of ['16px', '5px', '30ms']) assert.ok(!found.has(k), `${k} should not be a concept`);
  assert.ok(found.has('oauth2'), 'OAuth2 is still a concept');
});
