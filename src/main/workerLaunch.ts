/**
 * How a god-hired worker's spawn request becomes an executable + argv, as a
 * pure function: this exact translation silently killed real workers for days
 * while reporting success, which is what earned it a unit test.
 */
import {
  autoModeFlagForProvider,
  defaultCommandForProvider,
  hasAutoModeStance,
  inferAgentProvider,
  normalizeAgentProvider
} from '../shared/agentProvider';
import { tokenizeCommand } from '../shared/commandLine';

export interface WorkerLaunch {
  /** The executable name alone — what the PTY layer resolves and spawns. */
  bin: string;
  /** Everything else, in argv form, model flag included when applicable. */
  args: string[];
  /** The full effective command line, for display and floor cards. */
  command: string;
}

export function buildWorkerLaunch(opts: {
  /** `command` from the spawn request — god authors a full command LINE. */
  requestCommand?: unknown;
  requestProvider?: unknown;
  /** Separate `model` field from the request, if any. */
  requestModel?: unknown;
  defaultCommand?: string;
  /** The app's auto (skip-permissions) setting. */
  autoMode: boolean;
}): WorkerLaunch {
  const requestCommand =
    typeof opts.requestCommand === 'string' && opts.requestCommand.trim()
      ? opts.requestCommand.trim()
      : '';
  const requestProvider = normalizeAgentProvider(opts.requestProvider);
  const fallbackCommand = opts.defaultCommand ?? 'claude';
  // An explicit command may be a wrapper or shim and remains authoritative.
  // Without one, keep the executable and provider behavior coherent by taking
  // the provider's canonical command before the configured legacy fallback.
  let command =
    requestCommand ||
    (requestProvider ? defaultCommandForProvider(requestProvider, fallbackCommand) : fallbackCommand);
  // Inherit the app's auto (skip-permissions) mode when the request takes no
  // stance of its own: a headless worker has no human to click through tool
  // prompts, so without the flag it stalls at the first ask until the idle
  // reaper kills it. The flag is the PROVIDER'S — a codex worker needs
  // `-a never -s workspace-write`, and claude's --permission-mode
  // would mean nothing to it (an earlier hardcoded-claude version left every
  // non-claude worker stalling; review caught it). An explicit stance in the
  // request still wins: the flag's leading token already present as a TOKEN
  // (not substring — copilot's flag starts with `-s`) means the request chose.
  const provider = inferAgentProvider(command, requestProvider);
  const autoFlag = opts.autoMode ? autoModeFlagForProvider(provider) : '';
  if (autoFlag && !hasAutoModeStance(tokenizeCommand(command), provider)) {
    command += ` ${autoFlag}`;
  }
  // god authors `command` as a full command LINE ("claude --model … --permission-mode …"),
  // but the PTY layer takes ONE executable name (resolveCommand) plus argv — the
  // unsplit line made node-pty exec a binary literally named like the whole
  // string → ENOENT → the worker died within ~1s of spawning while its request
  // archived as .done (this killed both flag-carrying Ryan spawns on 2026-08-16;
  // only the bare-`claude` one lived). Split with the SAME tokenizer the
  // renderer's spawn flows use, and hand the flags over as argv.
  const tokens = tokenizeCommand(command);
  const bin = tokens[0] || command;
  const flags = tokens.slice(1);
  // A separate `model` field only applies when the command line didn't pick a
  // model itself (spawnAgentCore likewise skips its default-model injection
  // when argv already carries --model).
  const model =
    typeof opts.requestModel === 'string' && opts.requestModel.trim() ? opts.requestModel.trim() : '';
  const args = [...flags, ...(model && !flags.includes('--model') ? ['--model', model] : [])];
  return { bin, args, command };
}

/**
 * Whether a worker spawn request may run, as a pure check. The request file is
 * untrusted: every agent can write the hive (and on Windows nothing sandboxes
 * them), so a prompt-injected agent could otherwise have the app start any
 * command, unsandboxed, with a broker token. A worker is an agent CLI:
 *  - the executable is a known agent CLI (or the configured default command's),
 *    by name or as a path ending in one — never bash/sh/node/powershell…;
 *  - its flags carry no shell metacharacters (a .cmd shim goes through cmd.exe)
 *    and none of the flags that hand a CLI new settings, MCP servers, extra
 *    folders, a different backend or a config override;
 *  - its folder is one the user set up: a registered repo, the office, or an
 *    existing agent's folder (or inside one).
 * Returns null when allowed, else the reason.
 */
export function workerRequestProblem(
  launch: { bin: string; args: string[] },
  cwd: string,
  allow: { bins: string[]; roots: string[]; sep?: string; caseInsensitive?: boolean }
): string | null {
  const leaf = (p: string): string => (p.split(/[\\/]/).pop() ?? p).replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase();
  const bins = new Set(allow.bins.filter(Boolean).map(leaf));
  if (!bins.has(leaf(launch.bin))) return `"${launch.bin}" is not an agent CLI this office runs`;
  for (const a of launch.args) {
    if (!/^[A-Za-z0-9 ._\/=:,@+[\]()-]{0,200}$/.test(a)) return `argument "${a.slice(0, 40)}" has characters a worker command may not use`;
    const name = a.split('=', 1)[0].toLowerCase();
    if (DENIED_WORKER_FLAGS.has(name)) return `flag "${name}" is not allowed in a worker request`;
  }
  const norm = (p: string): string => {
    const t = p.replace(/[\\/]+$/, '');
    return allow.caseInsensitive ? t.toLowerCase() : t;
  };
  const c = norm(cwd);
  const ok = allow.roots.filter(Boolean).some((r) => {
    const root = norm(r);
    return c === root || c.startsWith(root + '/') || c.startsWith(root + '\\');
  });
  return ok ? null : `"${cwd}" is not a registered repo, the office, or an agent's folder`;
}

/** Flags that change what a CLI trusts or where it talks: settings/MCP/extra
 *  dirs/plugins/system prompt files, config overrides (codex -c), backends and
 *  keys. Matched on the name before `=`. */
const DENIED_WORKER_FLAGS: ReadonlySet<string> = new Set([
  '--settings', '--setting-sources', '--mcp-config', '--strict-mcp-config', '--add-dir', '--plugin-dir',
  '--system-prompt-file', '--append-system-prompt-file',
  '-c', '--config', '--profile', '--provider', '--base-url', '--api-key', '--oss',
  '--cd', '-C', '--include-directories', '--extensions', '-e'
].map((f) => f.toLowerCase()));
