/**
 * Offices that run inside WSL (Windows only).
 *
 * Where an office lives decides where it runs: a floor at
 * `\\wsl.localhost\<distro>\home\you\offices\x` (or `\\wsl$\…`) is a WSL
 * floor — its agents, git and tools run inside that distro — and a floor at
 * `G:\…` runs on Windows as before. Nothing else records the choice, so a WSL
 * floor opened from "recent" is still a WSL floor.
 *
 * The app itself stays on Windows. It reads the office through the UNC path
 * (main's file IO is unchanged) and starts processes inside the distro through
 * `wsl.exe`, translating paths on the way in.
 *
 * Electron-free and mostly pure, for tests.
 */
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface WslLocation { distro: string; linuxPath: string }

const UNC = /^[\\/]{2}(wsl\.localhost|wsl\$)[\\/]([^\\/]+)([\\/].*)?$/i;

/** The distro and Linux path of a `\\wsl.localhost\…` / `\\wsl$\…` path, else null. */
export function parseWslPath(p: string | null | undefined): WslLocation | null {
  if (!p) return null;
  const m = UNC.exec(p.trim());
  if (!m) return null;
  const rest = (m[3] ?? '/').replace(/\\/g, '/').replace(/\/+/g, '/');
  const linuxPath = rest.length > 1 ? rest.replace(/\/$/, '') : '/';
  return { distro: m[2], linuxPath };
}

export function isWslPath(p: string | null | undefined): boolean {
  return parseWslPath(p) !== null;
}

/** The Windows (UNC) path of a Linux path inside a distro. */
export function toWslUnc(distro: string, linuxPath: string): string {
  const clean = linuxPath.replace(/\/+$/, '') || '/';
  return `\\\\wsl.localhost\\${distro}${clean === '/' ? '\\' : clean.replace(/\//g, '\\')}`;
}

/**
 * A path as a process inside `distro` sees it: its own UNC paths become Linux
 * paths, Windows drive paths become /mnt/<drive>/…, anything else is returned
 * unchanged. Another distro's UNC path has no Linux equivalent: null.
 */
export function toLinuxPath(p: string, distro: string): string | null {
  const w = parseWslPath(p);
  if (w) return w.distro.toLowerCase() === distro.toLowerCase() ? w.linuxPath : null;
  const d = /^([A-Za-z]):[\\/]?(.*)$/.exec(p);
  if (d) {
    const rest = d[2].replace(/\\/g, '/').replace(/\/+$/, '');
    return `/mnt/${d[1].toLowerCase()}${rest ? `/${rest}` : ''}`;
  }
  return p;
}

/** Rewrite every UNC path of `distro` inside a string (prompts, settings, env values). */
export function linuxizeText(text: string, distro: string): string {
  const re = new RegExp(`[\\\\/]{2}(?:wsl\\.localhost|wsl\\$)[\\\\/]${distro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}((?:[\\\\/][^\\s"'\`<>|]*)?)`, 'gi');
  return text.replace(re, (_m, rest: string) => (rest ? rest.replace(/\\/g, '/') : '/'));
}

/**
 * The `wsl.exe` invocation that runs `file args` inside `distro`, in `cwd`
 * (a Linux path), with `env` set. Run through a login shell so tools a user
 * installed the usual way (nvm, ~/.local/bin, npm -g) are on PATH.
 */
export function wslCommand(
  distro: string,
  cwd: string,
  file: string,
  args: string[],
  env: Record<string, string> = {}
): { file: string; args: string[] } {
  const assignments = Object.entries(env)
    .filter(([k]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k))
    .map(([k, v]) => `${k}=${v}`);
  return {
    file: 'wsl.exe',
    args: [
      '-d', distro, '--cd', cwd, '--',
      'bash', '-lc', 'exec "$@"', 'bash',
      ...(assignments.length ? ['env', ...assignments] : []),
      file, ...args
    ]
  };
}

/** How to run `git args` in `cwd`: inside the distro when cwd is a WSL
 *  floor (absolute path arguments translated), else plain git. Git must run
 *  where the repo lives: a worktree made by Windows git records Windows paths
 *  that git inside Linux cannot follow, and the other way round. */
export function gitInvocation(cwd: string, args: string[]): { file: string; args: string[]; cwd?: string; distro?: string } {
  const w = process.platform === 'win32' ? parseWslPath(cwd) : null;
  if (!w) return { file: 'git', args, cwd };
  const mapped = args.map((a) => (/^[A-Za-z]:[\\/]/.test(a) || isWslPath(a) ? toLinuxPath(a, w.distro) ?? a : a));
  return { ...wslCommand(w.distro, w.linuxPath, 'git', mapped), distro: w.distro };
}

/** `wsl.exe -l -q` prints UTF-16LE with NULs and a BOM: decode and split. */
export function parseDistroList(raw: Buffer | string): string[] {
  const text = typeof raw === 'string' ? raw : raw.includes(0) ? raw.toString('utf16le') : raw.toString('utf8');
  return text.replace(/^\uFEFF/, '').replace(/\0/g, '').split(/\r?\n/).map((s) => s.trim())
    .filter((s) => s && !/^docker-desktop/i.test(s));
}

/** Installed WSL distros (empty when WSL is missing or broken). */
export function listDistros(): Promise<{ ok: boolean; distros: string[]; error?: string }> {
  if (process.platform !== 'win32') return Promise.resolve({ ok: false, distros: [], error: 'WSL is a Windows feature' });
  return new Promise((resolve) => {
    execFile('wsl.exe', ['-l', '-q'], { encoding: 'buffer', windowsHide: true, timeout: 15_000 }, (err, stdout, stderr) => {
      if (err) {
        const msg = Buffer.isBuffer(stderr) && stderr.length ? parseDistroList(stderr).join(' ') : err.message;
        resolve({ ok: false, distros: [], error: msg || 'WSL is not available' });
        return;
      }
      resolve({ ok: true, distros: parseDistroList(stdout) });
    });
  });
}

/** Run a command inside a distro and return its stdout (throws on failure). */
export function runInDistro(distro: string, cmd: string, args: string[], cwd = '~'): string {
  const c = wslCommand(distro, cwd, cmd, args);
  return execFileSync(c.file, c.args, { encoding: 'utf8', windowsHide: true, timeout: 30_000 }).trim();
}

/**
 * Create `~/offices/<name>` inside `distro` and return its Windows (UNC) path.
 * The name is reduced to a safe folder name.
 */
export function createWslOffice(distro: string, name: string): { ok: boolean; path?: string; error?: string } {
  const folder = name.trim().replace(/[^A-Za-z0-9 ._-]+/g, '').replace(/\s+/g, '-').slice(0, 60);
  if (!folder || folder.startsWith('.')) return { ok: false, error: 'give the office a name' };
  try {
    const home = runInDistro(distro, 'sh', ['-c', 'printf %s "$HOME"']);
    if (!home.startsWith('/')) return { ok: false, error: `could not find your home folder in ${distro}` };
    const linux = `${home}/offices/${folder}`;
    runInDistro(distro, 'mkdir', ['-p', linux]);
    return { ok: true, path: toWslUnc(distro, linux) };
  } catch (e) {
    return { ok: false, error: `${distro}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}` };
  }
}

/** Does .wslconfig turn on mirrored networking (agents reach the app on localhost)? */
export function mirroredNetworking(): boolean {
  try {
    const cfg = readFileSync(join(homedir(), '.wslconfig'), 'utf8');
    return /^\s*networkingMode\s*=\s*mirrored\s*$/im.test(cfg);
  } catch {
    return false;
  }
}
