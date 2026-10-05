/**
 * Is `path` inside the folder `root`, and where? For the renderer, which gets
 * paths from every source (terminal links, the Files tab, memory) on every
 * OS: `/` or `\` separators, `C:\…`, `\\wsl.localhost\…`, `/home/…`.
 * Comparing with `root + '/'` failed on every Windows path, so a clicked file
 * opened the IDE without the file, or in the wrong agent's workspace.
 */

/** Windows-style (drive letter or UNC): compared case-insensitively. */
function windowsish(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || /^[\\/]{2}[^\\/]/.test(p);
}

function norm(p: string): string {
  const unc = /^[\\/]{2}/.test(p);
  const body = p.replace(/[\\/]+/g, '/').replace(/\/+$/, '');
  return unc ? `/${body}` : body;
}

/** The path relative to root, with `/` separators ('' for root itself), or null when outside it. */
export function pathWithin(path: string, root: string): string | null {
  if (!path || !root) return null;
  const win = windowsish(path) || windowsish(root);
  let p = norm(path);
  let r = norm(root);
  if (win) { p = p.toLowerCase(); r = r.toLowerCase(); }
  if (p === r) return '';
  if (!p.startsWith(`${r}/`)) return null;
  // Slice the ORIGINAL (normalized, case kept) path, so the relative path keeps its case.
  return norm(path).slice(norm(root).length + 1);
}

/** The agent whose folder holds `path`, the deepest one when folders nest
 *  (a worker's repo inside the office). */
export function ownerOf<T extends { cwd: string }>(path: string, agents: T[]): T | undefined {
  let best: T | undefined;
  for (const a of agents) {
    if (a.cwd && pathWithin(path, a.cwd) !== null && (!best || norm(a.cwd).length > norm(best.cwd).length)) best = a;
  }
  return best;
}
