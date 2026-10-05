/**
 * "Open a terminal in this agent's folder", on every platform. It only knew
 * macOS (`open -a Terminal`), so on Windows and Linux the button failed with
 * "spawn open ENOENT". Each platform gets a list of terminals to try in
 * order; the first that starts wins. A WSL floor's folder opens inside its
 * distribution, at the Linux path.
 */
import { spawn } from 'node:child_process';
import { parseWslPath } from './wsl';

export interface TerminalLaunch {
  file: string;
  args: string[];
  /** Run in this folder (terminals with no folder option). */
  cwd?: string;
  /** Pass args to cmd.exe as written (its own quoting rules). */
  verbatim?: boolean;
}

/** The terminals to try for `cwd`, best first. */
export function terminalLaunches(cwd: string, platform: NodeJS.Platform): TerminalLaunch[] {
  if (platform === 'darwin') return [{ file: 'open', args: ['-a', 'Terminal', cwd] }];
  if (platform === 'win32') {
    const wsl = parseWslPath(cwd);
    if (wsl) {
      return [
        { file: 'wt.exe', args: ['-w', '0', 'nt', 'wsl.exe', '-d', wsl.distro, '--cd', wsl.linuxPath] },
        { file: 'cmd.exe', args: ['/d', '/s', '/c', `start "" wsl.exe -d "${wsl.distro}" --cd "${wsl.linuxPath}"`], verbatim: true }
      ];
    }
    return [
      { file: 'wt.exe', args: ['-w', '0', 'nt', '-d', cwd] },
      { file: 'cmd.exe', args: ['/d', '/s', '/c', `start "" /D "${cwd}" cmd.exe`], verbatim: true }
    ];
  }
  return [
    { file: 'x-terminal-emulator', args: [], cwd },
    { file: 'gnome-terminal', args: [`--working-directory=${cwd}`] },
    { file: 'konsole', args: ['--workdir', cwd] },
    { file: 'xfce4-terminal', args: [`--working-directory=${cwd}`] },
    { file: 'xterm', args: [], cwd }
  ];
}

/** Start the first terminal that exists. */
export function openTerminalAt(cwd: string, platform: NodeJS.Platform = process.platform): Promise<{ ok: boolean; error?: string }> {
  const tries = terminalLaunches(cwd, platform);
  return new Promise((resolve) => {
    const next = (i: number, lastErr?: string) => {
      if (i >= tries.length) { resolve({ ok: false, error: lastErr ?? 'no terminal found' }); return; }
      const t = tries[i];
      let settled = false;
      try {
        const p = spawn(t.file, t.args, { cwd: t.cwd, detached: true, stdio: 'ignore', windowsHide: false, windowsVerbatimArguments: t.verbatim });
        p.once('error', (e) => { if (!settled) { settled = true; next(i + 1, e.message); } });
        p.once('spawn', () => { if (!settled) { settled = true; p.unref(); resolve({ ok: true }); } });
      } catch (e) {
        next(i + 1, e instanceof Error ? e.message : String(e));
      }
    };
    next(0);
  });
}
