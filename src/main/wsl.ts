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
 * A failed wsl.exe call as a sentence a person can act on. `raw` is whatever
 * the failure carried (Error, stderr text or Buffer): wsl.exe writes UTF-16, so
 * NULs are stripped before matching. Unknown failures keep their first line.
 */
export function describeWslError(raw: unknown, distro?: string): string {
  const decode = (b: unknown): string => (Buffer.isBuffer(b) ? (b.includes(0) ? b.toString('utf16le') : b.toString('utf8')) : String(b ?? ''));
  let text: string;
  if (raw instanceof Error) {
    const e = raw as Error & { code?: string; stderr?: unknown };
    text = `${e.code ?? ''} ${decode(e.stderr)} ${e.message}`;
  } else text = decode(raw);
  text = text.replace(/\uFEFF/g, '').replace(/\0/g, '').trim();
  const where = distro ? ` (${distro})` : '';
  if (/ENOENT/.test(text)) return 'wsl.exe was not found. WSL is not installed or is disabled on this computer (Windows features: "Windows Subsystem for Linux").';
  if (/EPERM|EACCES|access is denied|blocked/i.test(text)) return 'Windows refused to start wsl.exe. Security software (EDR/antivirus) or a company policy may be blocking it: ask IT to allow it, then try again.';
  if (/ETIMEDOUT|timed out|did not start/i.test(text)) return `WSL${where} took too long to answer. It may be starting up or slowed by security software: wait a moment and try again, or run "wsl --shutdown" and retry.`;
  if (/WSL_E_DISTRO_NOT_FOUND|no distribution with the supplied name|there is no distribution/i.test(text)) return `The WSL distribution${where || ''} was not found. Check the name with "wsl -l -v".`;
  if (/no installed distributions|has no installed/i.test(text)) return 'WSL has no installed distribution. Install one with "wsl --install -d Ubuntu" from an administrator PowerShell.';
  if (/virtualization|HCS_E|0x80370102|0x80370114|0x8007019e/i.test(text)) return 'WSL could not start: virtualization is off (enable it in the BIOS) or the "Virtual Machine Platform" Windows feature is disabled.';
  if (/not found|command not found/i.test(text) && /node/.test(text)) return `node is not installed inside WSL${where}. Install it there (for example with nvm) and try again.`;
  const first = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  return first ? first.slice(0, 300) : 'WSL failed without an error message.';
}

/** Run before every command inside a distro: a login shell already has
 *  ~/.local/bin and npm -g on PATH, but node version managers set themselves up
 *  only in interactive shells (nvm in ~/.bashrc), so load them explicitly. */
const WSL_SETUP = [
  '[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1',
  '[ -d "$HOME/.volta/bin" ] && PATH="$HOME/.volta/bin:$PATH"',
  'command -v fnm >/dev/null 2>&1 && eval "$(fnm env)"'
];
export const WSL_PRELUDE = [...WSL_SETUP, 'exec "$@"'].join('; ');

/**
 * Run a shell `command` inside `distro` with secrets in its environment, for
 * runners (envVault.ts). The values never go on a command line (other
 * processes can read those): they arrive on stdin as NAME=base64 lines ended
 * by a blank one, are exported, and stdin is then closed for the command.
 */
export function wslSecretRun(distro: string, cwd: string, command: string): { file: string; args: string[] } {
  const script = [
    ...WSL_SETUP,
    'while IFS= read -r l && [ -n "$l" ]; do export "${l%%=*}=$(printf %s "${l#*=}" | base64 -d)"; done',
    'exec bash -c "$1" </dev/null'
  ].join('; ');
  return { file: 'wsl.exe', args: ['-d', distro, '--cd', cwd, '--exec', 'bash', '-lc', script, 'bash', command] };
}

/** Where each of `bins` resolves inside `distro` (null when missing), with
 *  the same login shell + version managers agents get. One wsl.exe call. */
export function probeInDistro(distro: string, bins: string[], onError?: (message: string) => void): Promise<Record<string, string | null>> {
  const safe = bins.filter((b) => /^[A-Za-z0-9._-]+$/.test(b));
  const script = [...WSL_SETUP, 'for b in "$@"; do printf "%s\\t%s\\n" "$b" "$(command -v "$b" 2>/dev/null)"; done'].join('; ');
  return new Promise((resolve) => {
    execFile('wsl.exe', ['-d', distro, '--exec', 'bash', '-lc', script, 'bash', ...safe], { timeout: 45000, windowsHide: true }, (err, stdout) => {
      const out: Record<string, string | null> = Object.fromEntries(safe.map((b) => [b, null]));
      if (err) onError?.(describeWslError(err, distro));
      if (!err) for (const line of String(stdout).split(/\r?\n/)) {
        const [b, p] = line.split('\t');
        if (b && b in out) out[b] = p?.trim() || null;
      }
      resolve(out);
    });
  });
}

/** How to install a tool inside a WSL distro (Ubuntu/Debian), when that
 *  differs from the generic Linux hint. Node comes through nvm: installing it
 *  with apt gives an old version, and npm -g then needs sudo. */
export const WSL_INSTALL: Record<string, string> = {
  git: 'sudo apt update && sudo apt install -y git',
  node: 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && . ~/.nvm/nvm.sh && nvm install --lts',
  uv: 'curl -LsSf https://astral.sh/uv/install.sh | sh'
};

const homes = new Map<string, string>();
/** The user's home in `distro` as a Windows UNC path (cached), or null when
 *  WSL does not answer. */
export function distroHomeUnc(distro: string): string | null {
  const cached = homes.get(distro);
  if (cached) return cached;
  try {
    const home = runInDistro(distro, 'sh', ['-c', 'printf %s "$HOME"']);
    if (!home.startsWith('/')) return null;
    const unc = toWslUnc(distro, home);
    homes.set(distro, unc);
    return unc;
  } catch { return null; }
}

/** The stdin wslSecretRun reads its secrets from. */
export function secretStdin(secrets: Record<string, string>): string {
  return Object.entries(secrets)
    .filter(([k]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k))
    .map(([k, v]) => `${k}=${Buffer.from(v, 'utf8').toString('base64')}\n`).join('') + '\n';
}

/**
 * The `wsl.exe` invocation that runs `file args` inside `distro`, in `cwd`
 * (a Linux path), with `env` set: a login shell plus WSL_PRELUDE, so tools a
 * user installed the usual way (nvm, ~/.local/bin, npm -g) are found.
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
      '-d', distro, '--cd', cwd, '--exec',
      'bash', '-lc', WSL_PRELUDE, 'bash',
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
    execFile('wsl.exe', ['-l', '-q'], { encoding: 'buffer', windowsHide: true, timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) {
        const out = Buffer.isBuffer(stderr) && stderr.length ? stderr : Buffer.isBuffer(stdout) && stdout.length ? stdout : null;
        const code = (err as NodeJS.ErrnoException).code;
        resolve({ ok: false, distros: [], error: describeWslError(code && !out ? err : out ?? err) });
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
    return { ok: false, error: `${distro}: ${describeWslError(e, distro)}` };
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
