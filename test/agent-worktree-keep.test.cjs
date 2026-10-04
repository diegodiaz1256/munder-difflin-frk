'use strict';
/**
 * Stopping or closing a regular isolated agent used to `git worktree remove
 * --force` its worktree unconditionally, discarding anything it had not
 * committed or merged. finalizeAgentWorktree (main) now asks
 * worktreeHasUnintegratedWork against the parent repo's current branch, the
 * branch the worktree was cut from. These pin the decision it acts on.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { worktreeHasUnintegratedWork, addWorktree } = loadTs('src/main/git.ts');

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe' }).toString().trim();

function repoWithWorktree(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'md wt-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  const wt = path.join(base, 'wt');
  git(repo, 'worktree', 'add', '-q', '-b', 'agent/dwight', wt);
  const baseBranch = git(repo, 'rev-parse', '--abbrev-ref', 'HEAD');
  return { repo, wt, baseBranch };
}

test('a clean worktree with nothing new can go', async (t) => {
  const { wt, baseBranch } = repoWithWorktree(t);
  const r = await worktreeHasUnintegratedWork(wt, baseBranch);
  assert.equal(r.keep, false, r.detail);
});

test('uncommitted changes keep it', async (t) => {
  const { wt, baseBranch } = repoWithWorktree(t);
  fs.writeFileSync(path.join(wt, 'a.txt'), 'two\n');
  const r = await worktreeHasUnintegratedWork(wt, baseBranch);
  assert.equal(r.keep, true);
  assert.equal(r.dirty, true);
});

test('an untracked file keeps it', async (t) => {
  const { wt, baseBranch } = repoWithWorktree(t);
  fs.writeFileSync(path.join(wt, 'new.txt'), 'draft\n');
  assert.equal((await worktreeHasUnintegratedWork(wt, baseBranch)).keep, true);
});

test('a commit not merged into the base keeps it, and merging releases it', async (t) => {
  const { repo, wt, baseBranch } = repoWithWorktree(t);
  fs.writeFileSync(path.join(wt, 'b.txt'), 'work\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-q', '-m', 'agent work');
  const before = await worktreeHasUnintegratedWork(wt, baseBranch);
  assert.equal(before.keep, true);
  assert.equal(before.ahead, 1);
  git(repo, 'merge', '-q', '--ff-only', 'agent/dwight');
  assert.equal((await worktreeHasUnintegratedWork(wt, baseBranch)).keep, false);
});

// Keep the import honest: the helper the spawn path uses to create these exists.
test('git.ts still exports the worktree creator the isolation path uses', () => {
  assert.equal(typeof addWorktree, 'function');
});
