import { existsSync } from 'node:fs';
import { lstat, readlink, realpath, symlink, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { parseWslPath, wslCommand } from './wsl';

/** Both checkouts inside the same WSL distro (Windows only): the link has to be
 *  made by Linux — a Windows junction cannot point into \\wsl.localhost. */
function sameDistro(a: string, b: string): { distro: string; base: string; wt: string } | null {
  if (process.platform !== 'win32') return null;
  const x = parseWslPath(a);
  const y = parseWslPath(b);
  return x && y && x.distro.toLowerCase() === y.distro.toLowerCase()
    ? { distro: x.distro, base: x.linuxPath, wt: y.linuxPath } : null;
}

/** Run a fixed shell snippet in the distro with paths as positional args
 *  ($1, $2: never spliced into the script). Resolves with its exit code. */
function inDistro(distro: string, script: string, args: string[]): Promise<{ code: number; err: string }> {
  const inv = wslCommand(distro, '/', 'sh', ['-c', script, 'sh', ...args]);
  return new Promise((done) => {
    execFile(inv.file, inv.args, { windowsHide: true, timeout: 30_000 }, (e, _out, err) => {
      done({ code: e ? (typeof (e as { code?: unknown }).code === 'number' ? (e as { code: number }).code : 1) : 0, err: String(err ?? '') });
    });
  });
}

export type DepLink =
  | { ok: true; skipped: boolean }
  | { ok: false; error: string };

export type DepUnlink =
  | { ok: true; removed: boolean }
  | { ok: false; error: string };

/** Link the base checkout's dependencies into an isolated worktree. */
export async function linkWorktreeDeps(baseDir: string, worktreeDir: string): Promise<DepLink> {
  const baseNodeModules = join(baseDir, 'node_modules');
  const worktreeNodeModules = join(worktreeDir, 'node_modules');
  if (!existsSync(baseNodeModules)) return { ok: true, skipped: true };

  const wsl = sameDistro(baseDir, worktreeDir);
  if (wsl) {
    // 0 linked, 3 already there; anything else is an error.
    const r = await inDistro(wsl.distro,
      '[ -e "$2/node_modules" ] || [ -L "$2/node_modules" ] && exit 3; ln -s "$1/node_modules" "$2/node_modules"',
      [wsl.base, wsl.wt]);
    if (r.code === 0) return { ok: true, skipped: false };
    if (r.code === 3) return { ok: true, skipped: true };
    return { ok: false, error: r.err.trim() || `ln exited ${r.code}` };
  }

  try {
    await lstat(worktreeNodeModules);
    return { ok: true, skipped: true };
  } catch {
    // node_modules does not exist in this worktree yet.
  }

  try {
    await symlink(baseNodeModules, worktreeNodeModules, process.platform === 'win32' ? 'junction' : null);
    return { ok: true, skipped: false };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/** Remove the dependency link before testing whether a worktree is dirty. */
export async function unlinkWorktreeDeps(baseDir: string, worktreeDir: string): Promise<DepUnlink> {
  const baseNodeModules = join(baseDir, 'node_modules');
  const worktreeNodeModules = join(worktreeDir, 'node_modules');

  const wsl = sameDistro(baseDir, worktreeDir);
  if (wsl) {
    // Remove it only when it is OUR link to the base checkout's node_modules.
    const r = await inDistro(wsl.distro,
      '[ -L "$2/node_modules" ] || exit 3; [ "$(readlink -f "$2/node_modules")" = "$(readlink -f "$1/node_modules")" ] || exit 3; rm "$2/node_modules"',
      [wsl.base, wsl.wt]);
    if (r.code === 0) return { ok: true, removed: true };
    if (r.code === 3) return { ok: true, removed: false };
    return { ok: false, error: r.err.trim() || `rm exited ${r.code}` };
  }

  try {
    const stat = await lstat(worktreeNodeModules);
    if (!stat.isSymbolicLink()) return { ok: true, removed: false };
    const linkTarget = await readlink(worktreeNodeModules);
    const [baseTarget, worktreeTarget] = await Promise.all([
      realpath(baseNodeModules),
      realpath(resolve(worktreeDir, linkTarget))
    ]);
    if (baseTarget !== worktreeTarget) return { ok: true, removed: false };
    await unlink(worktreeNodeModules);
    return { ok: true, removed: true };
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code === 'ENOENT') return { ok: true, removed: false };
    return { ok: false, error: String(error) };
  }
}
