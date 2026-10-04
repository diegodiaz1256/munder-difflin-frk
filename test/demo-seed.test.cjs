'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { seedDemo, CAST, demoAgentCommand } = require('../tools/seed-demo-hive.cjs');
const loadTs = require('./load-ts.cjs');

const { tokenizeCommand } = loadTs('src/shared/commandLine.ts');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function seeded(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md demo-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return seedDemo({ home, now: Date.UTC(2026, 9, 4, 9), git: false });
}

test('the demo config opens the seeded office without onboarding or the picker', (t) => {
  const out = seeded(t);
  const cfg = readJson(path.join(out.userData, 'config.json'));
  assert.equal(cfg.onboardingComplete, true);
  assert.equal(cfg.demoMode, true);
  assert.equal(cfg.harnessHome, out.office);
  assert.equal(cfg.godProvider, 'custom');
  // Every agent runs the fake CLI, never a real (paid) one.
  const [bin, script] = tokenizeCommand(cfg.defaultCommand);
  assert.equal(bin, 'node');
  assert.ok(fs.existsSync(script), `demo agent script resolves: ${script}`);
  assert.ok(cfg.missions.length >= 3);
});

test('the board covers every status, an open human question and dependencies', (t) => {
  const out = seeded(t);
  const { tasks } = readJson(path.join(out.hive, 'tasks.json'));
  const ids = new Set(tasks.map((x) => x.id));
  assert.deepEqual(new Set(tasks.map((x) => x.status)), new Set(['todo', 'doing', 'blocked', 'done']));
  assert.ok(tasks.some((x) => x.status === 'blocked' && x.humanQA?.some((q) => !q.a)));
  assert.ok(tasks.some((x) => x.dependsOn.length > 0));
  for (const x of tasks) {
    for (const d of x.dependsOn) assert.ok(ids.has(d), `${x.id} depends on a real card (${d})`);
    assert.ok(x.assignee, `${x.id} has an assignee`);
  }
});

test('registry, roster and mailboxes agree on the cast', (t) => {
  const out = seeded(t);
  const reg = readJson(path.join(out.hive, 'registry.json'));
  const roster = readJson(path.join(out.office, 'roster.json'));
  assert.equal(reg.godId, 'god');
  for (const m of CAST) {
    assert.ok(reg.agents[m.id], `${m.id} registered`);
    assert.ok(fs.readFileSync(path.join(out.hive, 'agents', m.id, 'memory.md'), 'utf8').includes('## Facts'));
  }
  // Workers are restored on boot from `restorable`; Michael is spawned by the app.
  assert.deepEqual(roster.restorable.map((a) => a.id).sort(), CAST.filter((m) => !m.isGod).map((m) => m.id).sort());
  assert.ok(roster.restorable.every((a) => a.command === demoAgentCommand(path.resolve(__dirname, '..'))));
  assert.ok(roster.archived.every((a) => reg.agents[a.id]?.archived));

  const mail = [];
  for (const id of Object.keys(reg.agents)) {
    for (const sub of ['inbox', path.join('inbox', '.done'), path.join('outbox', '.sent')]) {
      const dir = path.join(out.hive, 'agents', id, sub);
      for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) mail.push(readJson(path.join(dir, f)));
    }
  }
  assert.ok(mail.some((m) => m.from === 'webhook'), 'outside mail is seeded');
  assert.ok(mail.some((m) => m.to === 'human'), 'something is addressed to the human');
});

test('re-seeding replaces a demo folder but refuses anything else', (t) => {
  const out = seeded(t);
  fs.writeFileSync(path.join(out.office, 'stray.txt'), 'x');
  seedDemo({ home: out.home, git: false });
  assert.equal(fs.existsSync(path.join(out.office, 'stray.txt')), false);

  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'not-demo-'));
  t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  fs.writeFileSync(path.join(other, 'keep.txt'), 'mine');
  assert.throws(() => seedDemo({ home: other, git: false }), /not a demo folder/);
  assert.equal(fs.readFileSync(path.join(other, 'keep.txt'), 'utf8'), 'mine');
});
