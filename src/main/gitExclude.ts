/**
 * The office's own files never end up in a project's git.
 *
 * An office folder holds the hive (its own git repo), the memory palace, the
 * roster and agents' worktrees. When that folder is inside a project's repo —
 * people open an office right in their project — all of it shows up as
 * untracked files there, one `git add .` away from being committed. So the
 * app lists them in that repo's `.git/info/exclude`: local to this clone,
 * never committed, and the project's own .gitignore stays untouched.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { gitInvocation, parseWslPath, toWslUnc } from './wsl';

/** What an office folder holds that belongs to the app, not the project. */
export const OFFICE_ENTRIES = ['hive/', 'palace/', 'worktrees/', 'roster.json', 'roster-backups/'];

export const EXCLUDE_HEADER = '# Scranton Branch: the office\'s own files, never part of this project';

/** The exclude lines for an office at `prefix` (its path inside the repo, as
 *  `git rev-parse --show-prefix` prints it: "" or "sub/dir/"). */
export function excludeLines(prefix: string): string[] {
  const p = prefix.replace(/\\/g, '/').replace(/^\/+/, '');
  return OFFICE_ENTRIES.map((e) => `/${p}${e}`);
}

/** The text to append to an exclude file so it holds `lines` (empty when it
 *  already does). */
export function missingExcludeText(current: string, lines: string[]): string {
  const have = new Set(current.split(/\r?\n/).map((l) => l.trim()));
  const missing = lines.filter((l) => !have.has(l));
  if (!missing.length) return '';
  const lead = current && !current.endsWith('\n') ? '\n' : '';
  return `${lead}${have.has(EXCLUDE_HEADER) ? '' : `${EXCLUDE_HEADER}\n`}${missing.join('\n')}\n`;
}

type RunGit = (cwd: string, args: string[]) => string;

const defaultRunGit: RunGit = (cwd, args) => {
  const inv = gitInvocation(cwd, args);
  return execFileSync(inv.file, inv.args, { cwd: inv.cwd, encoding: 'utf8', timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
};

/**
 * Make sure the repo containing `officeDir` (if any) ignores the office's
 * files. Best-effort: no repo, no git, or a read-only .git → nothing happens.
 * Returns the exclude file it wrote to, or null.
 */
export function excludeOfficeFromRepo(officeDir: string, runGit: RunGit = defaultRunGit): string | null {
  try {
    if (runGit(officeDir, ['rev-parse', '--is-inside-work-tree']) !== 'true') return null;
    const prefix = runGit(officeDir, ['rev-parse', '--show-prefix']);
    let file = runGit(officeDir, ['rev-parse', '--git-path', 'info/exclude']);
    // A WSL floor: git answered with a Linux path.
    const wsl = process.platform === 'win32' ? parseWslPath(officeDir) : null;
    if (wsl && file.startsWith('/')) file = toWslUnc(wsl.distro, file);
    else if (!isAbsolute(file)) file = join(officeDir, file);
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const add = missingExcludeText(current, excludeLines(prefix));
    if (!add) return file;
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, add, 'utf8');
    return file;
  } catch {
    return null;
  }
}
