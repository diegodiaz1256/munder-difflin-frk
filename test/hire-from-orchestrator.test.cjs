'use strict';
// A permanent hire the orchestrator proposes in research/hires/ reaches the
// human's Add-Agent review once, and never spawns by itself (src/main/hire.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { collectHireManifests } = loadTs('src/main/hire.ts');

function hiresDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hires-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('the orchestrator\'s manifest is offered once, then filed away', (t) => {
  const dir = hiresDir(t);
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'hire-from-orchestrator.json'), path.join(dir, 'w40k-expert.json'));
  const first = collectHireManifests([dir]);
  assert.equal(first.offered.length, 1, JSON.stringify(first.invalid));
  assert.equal(first.offered[0].name, 'Dwight');
  assert.ok(fs.existsSync(path.join(dir, '.offered', 'w40k-expert.json')));
  assert.deepEqual(collectHireManifests([dir]), { offered: [], invalid: [] }, 'not offered twice');
});

test('an invalid manifest is reported and set aside', (t) => {
  const dir = hiresDir(t);
  fs.writeFileSync(path.join(dir, 'bad.json'), '{"name": "no spec"}');
  const r = collectHireManifests([dir]);
  assert.equal(r.offered.length, 0);
  assert.equal(r.invalid[0].file, 'bad.json');
  assert.ok(fs.existsSync(path.join(dir, '.invalid', 'bad.json')));
});
