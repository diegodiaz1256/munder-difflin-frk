'use strict';
// munder-git is handed out only inside a git repository, pointed at its root
// (src/main/hive.ts). Outside one it exited at start ("Connection closed").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { HiveManager, enclosingGitRepo } = loadTs('src/main/hive.ts');

function dir(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'md-gitmcp-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}

test('a folder outside any repo gets no git server', (t) => {
  const office = dir(t);
  const { servers } = new HiveManager(() => office).buildDefaultMcpServers(office, {}, undefined, 'god');
  assert.equal(enclosingGitRepo(office), null);
  assert.equal(servers['munder-git'], undefined);
  assert.ok(servers['munder-time'] || servers['munder-fetch'], 'the other default servers stay');
});

test('a folder inside a repo gets it, pointed at the repo root', (t) => {
  const repo = dir(t);
  fs.mkdirSync(path.join(repo, '.git'));
  const sub = path.join(repo, 'packages', 'app');
  fs.mkdirSync(sub, { recursive: true });
  const { servers } = new HiveManager(() => repo).buildDefaultMcpServers(sub, {}, undefined, 'pam');
  assert.deepEqual(servers['munder-git'].args.slice(-2), ['--repository', repo]);
});
