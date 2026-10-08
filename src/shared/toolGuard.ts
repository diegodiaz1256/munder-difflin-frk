/**
 * What an agent may do with its tools beyond what the CLI itself allows,
 * checked at PreToolUse for every CLI whose hook can refuse a call.
 *
 * - Git off (Capabilities → Who has what): taking the Git server away left
 *   the agent running `git` in its shell, so "no git" did nothing. With Git
 *   off, a shell command that runs git is refused too.
 * - Its folders: an agent writes in its own folders (its workspace, its hive
 *   folder, the hive, the temp dir), not anywhere on the disk. Bypass mode
 *   lets Edit/Write reach any path, and on Windows there is no OS sandbox for
 *   the shell. A file tool writing outside, or a shell command that moves
 *   into, writes to or deletes from a folder outside, is refused. Reading
 *   elsewhere stays allowed. The check reads the command line, so it catches
 *   the plain ways out (cd, redirects, rm/mv/cp/Remove-Item…), not a script
 *   determined to hide where it writes; it is a fence, not a jail.
 */

import { writtenPathsOf } from './agentSteps';

export interface GuardPolicy {
  /** Folders the agent may write in (absolute; any spelling: C:\, /c/, /mnt/c/). */
  roots: string[];
  /** The agent's working folder: relative paths resolve against it. */
  cwd: string;
  /** False: no git at all (the Git capability is off). */
  git: boolean;
  /** False: the agent may write anywhere (the human let it out). */
  contained: boolean;
}

export interface GuardVerdict { deny: true; reason: string }

/** Comparable form of a path: forward slashes, drive letters as `/c/…`,
 *  WSL `/mnt/c/` and Cygwin `/cygdrive/c/` folded in, lower case for drive
 *  paths (Windows is case-insensitive), no trailing slash. */
export function normPath(p: string): string {
  let s = p.trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/');
  const drive = /^([a-zA-Z]):(\/|$)/.exec(s);
  if (drive) s = `/${drive[1].toLowerCase()}/${s.slice(drive[0].length)}`;
  s = s.replace(/^\/(?:mnt|cygdrive)\/([a-zA-Z])(\/|$)/, (_m, d: string, sl: string) => `/${d.toLowerCase()}${sl}`);
  const isDrive = /^\/[a-z](\/|$)/.test(s);
  const out: string[] = [];
  for (const part of s.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { out.pop(); continue; }
    out.push(part);
  }
  const joined = (s.startsWith('//') ? '//' : '/') + out.join('/');
  return isDrive ? joined.toLowerCase() : joined;
}

/** Absolute: /x, C:\x, C:/x, ~/x, \\server\x. */
function isAbsolute(p: string): boolean {
  return /^(?:[a-zA-Z]:[\\/]|[\\/]|~(?:[\\/]|$))/.test(p);
}

/** `p` as an absolute comparable path (relative ones against `cwd`; `~` against `home`). */
export function resolveFor(p: string, cwd: string, home = ''): string {
  const raw = p.trim().replace(/^["']|["']$/g, '');
  if (/^~(?:[\\/]|$)/.test(raw)) return normPath(home + raw.slice(1));
  if (isAbsolute(raw)) return normPath(raw);
  return normPath(`${cwd}/${raw}`);
}

/** True when `p` is `root` or inside it. */
export function within(p: string, root: string): boolean {
  const a = normPath(p);
  const b = normPath(root);
  if (b === '/') return true;
  const ci = /^\/[a-z](\/|$)/.test(b);
  const x = ci ? a.toLowerCase() : a;
  const y = ci ? b.toLowerCase() : b;
  return x === y || x.startsWith(y.endsWith('/') ? y : `${y}/`);
}

/** Paths a write may always reach: the null devices. */
const SINKS = new Set(['/dev/null', '/dev/stdout', '/dev/stderr', 'nul', '$null']);


const SHELL_TOOLS = new Set(['Bash', 'PowerShell', 'bash', 'shell', 'run_shell_command', 'exec_command', 'local_shell']);

/** Commands that move the shell somewhere else. */
const MOVES = new Set(['cd', 'pushd', 'chdir', 'set-location', 'sl', 'push-location']);
/** Commands whose path arguments are written, moved or deleted. */
const WRITES = new Set([
  'rm', 'rmdir', 'mv', 'cp', 'mkdir', 'touch', 'ln', 'tee', 'chmod', 'chown', 'install', 'rsync', 'truncate', 'dd', 'unlink', 'shred',
  'del', 'erase', 'rd', 'move', 'copy', 'ren', 'rename', 'xcopy', 'robocopy', 'md',
  'remove-item', 'ri', 'new-item', 'ni', 'set-content', 'sc', 'add-content', 'ac', 'out-file', 'copy-item', 'cpi', 'move-item', 'mi',
  'rename-item', 'rni', 'clear-content', 'clc', 'expand-archive', 'compress-archive'
]);
/** Wrappers before the real command. */
const PREFIXES = new Set(['sudo', 'command', 'env', 'time', 'nohup', 'exec', 'builtin', 'xargs', '&', '.', 'call', 'start']);

/** Split a command line into simple commands (on && || ; | & and newlines),
 *  keeping quoted text together. Good enough to read what each one runs. */
export function splitCommands(cmd: string): string[][] {
  const out: string[][] = [];
  let words: string[] = [];
  let cur = '';
  let quote: string | null = null;
  let hasWord = false;
  const endWord = () => { if (hasWord) words.push(cur); cur = ''; hasWord = false; };
  const endCmd = () => { endWord(); if (words.length) out.push(words); words = []; };
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; hasWord = true; continue; }
    if (ch === '\n' || ch === ';') { endCmd(); continue; }
    if (ch === '&' || ch === '|') {
      // `2>&1` and `&>` are redirects, not separators.
      if (ch === '&' && (cmd[i - 1] === '>' || cmd[i + 1] === '>')) { cur += ch; hasWord = true; continue; }
      endCmd();
      if (cmd[i + 1] === ch) i++;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === '{' || ch === '}') { endWord(); continue; }
    if (/\s/.test(ch)) { endWord(); continue; }
    cur += ch; hasWord = true;
  }
  endCmd();
  return out;
}

/** The program a simple command runs, lower case, without folder or .exe. */
function programOf(words: string[]): { name: string; args: string[] } | null {
  let i = 0;
  while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || PREFIXES.has(words[i].toLowerCase()))) i++;
  if (i >= words.length) return null;
  const base = words[i].replace(/\\/g, '/').split('/').pop() ?? '';
  return { name: base.toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, ''), args: words.slice(i + 1) };
}

/** Redirect targets in a simple command (`> f`, `>>f`, `2> f`, `&> f`, `| Out-File f` is a WRITES command). */
function redirectTargets(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const m = /^(?:\d|&)?>>?(.*)$/.exec(words[i]);
    if (!m) continue;
    const t = m[1] || words[i + 1];
    if (t && !t.startsWith('&')) out.push(t);
  }
  return out;
}

/** Copies read their sources: only where they write counts (the last path;
 *  robocopy's second). */
const COPIES = new Set(['cp', 'copy', 'copy-item', 'cpi', 'xcopy', 'rsync', 'install', 'ln']);

/** Arguments that look like paths (not flags, not redirect operators). */
function pathArgs(args: string[]): string[] {
  return args.filter((a) => a && !a.startsWith('-') && !/^(?:\d|&)?>/.test(a));
}

/** The paths a write command changes. */
function writtenPaths(name: string, args: string[]): string[] {
  if (name === 'dd') return args.filter((a) => a.startsWith('of=')).map((a) => a.slice(3));
  const paths = pathArgs(args);
  if (name === 'robocopy') return paths.slice(1, 2);
  if (COPIES.has(name)) return paths.slice(-1);
  return paths;
}

/** Why a call is refused, or null. `home` resolves `~`. */
export function guardToolCall(tool: string | undefined, input: unknown, policy: GuardPolicy, home = ''): GuardVerdict | null {
  if (!tool) return null;
  const inp = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const outside = (p: string): boolean => {
    const raw = p.trim().replace(/^["']|["']$/g, '');
    if (!raw || SINKS.has(raw.toLowerCase())) return false;
    // A variable or command substitution: cannot know where it points.
    if (/^\$|%[A-Za-z_]+%/.test(raw) && !/^\$(?:HOME|env:USERPROFILE)\b/i.test(raw)) return false;
    const abs = resolveFor(raw.replace(/^\$(?:HOME|env:USERPROFILE)/i, '~'), policy.cwd, home);
    return !policy.roots.some((r) => within(abs, r));
  };
  const fenceReason = (p: string) =>
    `Refused: ${p} is outside your folders. You work in ${policy.cwd} (and your hive folder); if the job needs another place, say so to the orchestrator or the human.`;

  // Files a tool writes, in every CLI's spelling (Write/Edit, write_to_file,
  // apply_patch...): the same reading the Deliverables use.
  if (policy.contained) for (const p of writtenPathsOf(tool, inp)) if (outside(p)) return { deny: true, reason: fenceReason(p) };

  if (!SHELL_TOOLS.has(tool)) return null;
  const cmd = typeof inp.command === 'string' ? inp.command : Array.isArray(inp.command) ? (inp.command as unknown[]).join(' ') : typeof inp.cmd === 'string' ? inp.cmd : '';
  if (!cmd) return null;
  for (const words of splitCommands(cmd)) {
    const prog = programOf(words);
    if (!prog) continue;
    if (!policy.git && prog.name === 'git') {
      return { deny: true, reason: 'Refused: git is switched off for you (Capabilities). Leave git to an agent that has it, or tell the human.' };
    }
    if (!policy.contained) continue;
    if (MOVES.has(prog.name)) {
      const target = prog.args.find((a) => !/^-/.test(a));
      if (target && target !== '-' && outside(target)) return { deny: true, reason: fenceReason(target) };
    }
    if (prog.name === 'git') {
      const c = prog.args.indexOf('-C');
      if (c >= 0 && prog.args[c + 1] && outside(prog.args[c + 1])) return { deny: true, reason: fenceReason(prog.args[c + 1]) };
    }
    if (WRITES.has(prog.name)) {
      for (const a of writtenPaths(prog.name, prog.args)) if (outside(a)) return { deny: true, reason: fenceReason(a) };
    }
    for (const t of redirectTargets(words)) if (outside(t)) return { deny: true, reason: fenceReason(t) };
  }
  return null;
}
