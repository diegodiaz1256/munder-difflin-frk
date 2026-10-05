'use strict';
// A message's `id` names its inbox FILE, and agents author their own outbox
// messages. An id like `../../x` used to be joined into the path as is, so a
// (prompt-injected) agent could have main write JSON anywhere it can write —
// the user's ~/.claude/settings.json, the app's config.json. Now an id that is
// not a plain name is replaced, and a recipient outside agents/ gets nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

test('a message id cannot climb out of the inbox, nor a recipient out of agents/', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-msgid-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god-1', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  await hive.ensureAgent({ id: 'pam-1', name: 'Pam', provider: 'claude', cwd: home });

  const victim = path.join(home, 'victim');
  const sent = hive.send({ to: 'god-1', id: '../../../victim', subject: 's', body: 'b' }, 'pam-1');
  assert.ok(!fs.existsSync(`${victim}.json`), 'nothing written outside the inbox');
  assert.match(sent.id, /^[A-Za-z0-9._-]+$/, 'the id was replaced by a plain one');
  assert.equal(hive.inbox('god-1').length, 1, 'the message itself is still delivered');

  // A recipient that walks out of agents/ (into a folder that has an inbox/).
  fs.mkdirSync(path.join(home, 'outside', 'inbox'), { recursive: true });
  hive.send({ to: '../../outside', subject: 's', body: 'b' }, 'pam-1');
  assert.deepEqual(fs.readdirSync(path.join(home, 'outside', 'inbox')), [], 'no file in a folder outside agents/');
});
