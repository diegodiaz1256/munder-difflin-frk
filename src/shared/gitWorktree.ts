/**
 * The main repository behind a git worktree, from the worktree's `.git` file
 * ("gitdir: <repo>/.git/worktrees/<name>"). Claude Code asks its folder-trust
 * question about that main repository, not about the worktree, so a worktree
 * has to be trusted through it.
 *
 * Pure: the caller reads the file. `gitFile` is its text, `worktreeDir` the
 * folder it sits in; returns the main repository's folder with forward
 * slashes, or null when this is not a linked worktree.
 */
export function mainRepoOfWorktree(gitFile: string, worktreeDir: string): string | null {
  const m = /^gitdir:\s*(.+?)\s*$/m.exec(gitFile);
  if (!m) return null;
  let gitdir = m[1].replace(/\\/g, '/');
  const base = worktreeDir.replace(/\\/g, '/').replace(/\/+$/, '');
  // Relative gitdir (worktree.useRelativePaths): resolve against the worktree.
  if (!/^(?:[A-Za-z]:)?\//.test(gitdir)) {
    const parts = `${base}/${gitdir}`.split('/');
    const out: string[] = [];
    for (const p of parts) {
      if (p === '..') out.pop();
      else if (p !== '.' && (p !== '' || out.length === 0)) out.push(p);
    }
    gitdir = out.join('/');
  }
  const i = gitdir.lastIndexOf('/.git/worktrees/');
  return i > 0 ? gitdir.slice(0, i) : null;
}
