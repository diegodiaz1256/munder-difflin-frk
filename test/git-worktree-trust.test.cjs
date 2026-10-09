'use strict';
// Claude Code asks its folder-trust question about a worktree's MAIN repository,
// so the app has to find that repository from the worktree's `.git` file.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { mainRepoOfWorktree } = loadTs('src/shared/gitWorktree.ts');

test('a Windows worktree points at its main repository', () => {
  const git = 'gitdir: C:/Users/alice/My Office/project/.git/worktrees/worker-a\n';
  assert.equal(mainRepoOfWorktree(git, 'C:\\Users\\alice\\My Office\\worktrees\\worker-a'), 'C:/Users/alice/My Office/project');
});

test('backslashes and POSIX paths both work', () => {
  assert.equal(mainRepoOfWorktree('gitdir: D:\\repos\\shop\\.git\\worktrees\\t1', 'D:\\wt\\t1'), 'D:/repos/shop');
  assert.equal(mainRepoOfWorktree('gitdir: /home/bob/shop/.git/worktrees/t1\n', '/home/bob/wt/t1'), '/home/bob/shop');
});

test('a relative gitdir resolves against the worktree', () => {
  assert.equal(mainRepoOfWorktree('gitdir: ../../shop/.git/worktrees/t1', '/home/bob/wt/t1'), '/home/bob/shop');
});

test('a plain repository or a submodule is not a worktree', () => {
  assert.equal(mainRepoOfWorktree('', '/home/bob/shop'), null);
  assert.equal(mainRepoOfWorktree('gitdir: ../.git/modules/lib', '/home/bob/shop/lib'), null);
});
