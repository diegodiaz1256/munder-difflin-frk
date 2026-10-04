/**
 * Your own MCP servers, and the ones already set up for other tools.
 *
 * Scans the MCP configs of Claude Code, Claude Desktop, Cursor, Codex, Gemini
 * CLI / Antigravity and Windsurf (read-only) so a server you already use there
 * can be imported here in one click, and keeps the ones you add by hand.
 *
 * Those configs usually hold API keys in plain text, in each server's env. An
 * imported or added server's secret env values go to the encrypted store
 * (mcp:custom--<id>:<ENV>) and the server then runs inside the app, behind the
 * MCP gateway — agents get a capability token, never the key (mcpGateway.ts).
 * A server with no secrets is handed to agents as is.
 *
 * Electron-free: file reads, config and the secret store are injected.
 */
import { join } from 'node:path';

export type McpTransport =
  | { kind: 'stdio'; command: string; args: string[] }
  | { kind: 'http'; url: string };

export interface FoundServer {
  /** Where it was found ("Claude Code", "Cursor"…). */
  source: string;
  /** The config file, for the UI. */
  file: string;
  name: string;
  transport: McpTransport;
  env: Record<string, string>;
  headers: Record<string, string>;
}

export interface CustomServer {
  id: string;
  name: string;
  transport: McpTransport;
  /** Non-secret env, kept in config. */
  env: Record<string, string>;
  /** Names of env vars whose values are in the encrypted store. */
  secretEnv: string[];
  enabled: boolean;
  /** Agent ids; null = every agent. */
  agents: string[] | null;
  source?: string;
}

export interface McpServersDeps {
  readFile: (path: string) => string | null;
  home: string;
  /** %APPDATA% on Windows, ~/Library/Application Support on macOS, ~/.config on Linux. */
  appData: () => string;
  readCustom: () => CustomServer[];
  writeCustom: (list: CustomServer[]) => void;
  getSecret: (ref: string) => string | undefined;
  setSecret: (ref: string, value: string) => { ok: boolean; error?: string };
  deleteSecret: (ref: string) => void;
}

const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS|AUTH|CREDENTIAL|PAT|PRIVATE)/i;
const SECRET_VALUE = /^(ghp_|gho_|github_pat_|sk-|sk_live_|sk_test_|xox[abp]-|AKIA|AIza|glpat-|ntn_|secret_)/;

/** Does this env var look like it holds a secret? */
export function looksSecret(name: string, value: string): boolean {
  return SECRET_NAME.test(name) || SECRET_VALUE.test(value) || /^(Bearer|Basic) \S+/.test(value) || /:\/\/[^/\s:@]+:[^/\s@]+@/.test(value);
}

export const customId = (name: string): string =>
  `custom--${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'server'}`;
const secretRef = (id: string, env: string) => `mcp:${id}:${env}`;

function strMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object') return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === 'string')) as Record<string, string>;
}

/** One `mcpServers`-shaped object (Claude, Cursor, Gemini, Windsurf…). */
function fromMcpServers(obj: unknown, source: string, file: string): FoundServer[] {
  if (!obj || typeof obj !== 'object') return [];
  const out: FoundServer[] = [];
  for (const [name, raw] of Object.entries(obj as Record<string, unknown>)) {
    const s = raw as Record<string, unknown>;
    if (!s || typeof s !== 'object') continue;
    const url = typeof s.url === 'string' ? s.url : typeof s.serverUrl === 'string' ? s.serverUrl : typeof s.httpUrl === 'string' ? s.httpUrl : null;
    if (typeof s.command === 'string' && s.command.trim()) {
      out.push({ source, file, name, transport: { kind: 'stdio', command: s.command, args: Array.isArray(s.args) ? s.args.filter((a): a is string => typeof a === 'string') : [] }, env: strMap(s.env), headers: {} });
    } else if (url) {
      out.push({ source, file, name, transport: { kind: 'http', url }, env: strMap(s.env), headers: strMap(s.headers) });
    }
  }
  return out;
}

/** The [mcp_servers.*] tables of a Codex config.toml — a deliberately small
 *  TOML reader for that shape (strings, string arrays, inline string tables). */
export function parseCodexToml(text: string, file: string): FoundServer[] {
  const servers = new Map<string, { command?: string; args?: string[]; url?: string; env: Record<string, string> }>();
  let current: { name: string; sub?: 'env' } | null = null;
  const str = (v: string): string | null => {
    const m = /^"((?:[^"\\]|\\.)*)"$|^'([^']*)'$/.exec(v.trim());
    return m ? (m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2]) : null;
  };
  const arr = (v: string): string[] | null => {
    const t = v.trim();
    if (!t.startsWith('[') || !t.endsWith(']')) return null;
    return (t.slice(1, -1).match(/"(?:[^"\\]|\\.)*"|'[^']*'/g) ?? []).map((x) => str(x) ?? '');
  };
  const inline = (v: string): Record<string, string> | null => {
    const t = v.trim();
    if (!t.startsWith('{') || !t.endsWith('}')) return null;
    const out: Record<string, string> = {};
    for (const m of t.slice(1, -1).matchAll(/([A-Za-z0-9_-]+|"[^"]+")\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')/g)) out[m[1].replace(/"/g, '')] = str(m[2]) ?? '';
    return out;
  };
  for (const line of text.split(/\r?\n/)) {
    const l = line.replace(/\s+#.*$/, '').trim();
    if (!l || l.startsWith('#')) continue;
    const sec = /^\[\s*mcp_servers\.("?)([^"\].]+)\1(?:\.(env))?\s*\]$/.exec(l);
    if (sec) {
      current = { name: sec[2], sub: sec[3] as 'env' | undefined };
      if (!servers.has(current.name)) servers.set(current.name, { env: {} });
      continue;
    }
    if (l.startsWith('[')) { current = null; continue; }
    if (!current) continue;
    const kv = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(l);
    if (!kv) continue;
    const s = servers.get(current.name)!;
    if (current.sub === 'env') { const v = str(kv[2]); if (v !== null) s.env[kv[1]] = v; continue; }
    if (kv[1] === 'command') s.command = str(kv[2]) ?? undefined;
    else if (kv[1] === 'args') s.args = arr(kv[2]) ?? undefined;
    else if (kv[1] === 'url') s.url = str(kv[2]) ?? undefined;
    else if (kv[1] === 'env') Object.assign(s.env, inline(kv[2]) ?? {});
  }
  const out: FoundServer[] = [];
  for (const [name, s] of servers) {
    if (s.command) out.push({ source: 'Codex', file, name, transport: { kind: 'stdio', command: s.command, args: s.args ?? [] }, env: s.env, headers: {} });
    else if (s.url) out.push({ source: 'Codex', file, name, transport: { kind: 'http', url: s.url }, env: s.env, headers: {} });
  }
  return out;
}

export class McpServers {
  constructor(private readonly deps: McpServersDeps) {}

  private json(path: string): unknown {
    const t = this.deps.readFile(path);
    if (!t) return null;
    try { return JSON.parse(t); } catch { return null; }
  }

  /** Servers configured for other tools on this machine. */
  scan(): FoundServer[] {
    const { home } = this.deps;
    let appData = '';
    try { appData = this.deps.appData(); } catch { /* no app data dir: skip Claude Desktop */ }
    const out: FoundServer[] = [];
    const claudeJson = join(home, '.claude.json');
    const cj = this.json(claudeJson) as { mcpServers?: unknown; projects?: Record<string, { mcpServers?: unknown }> } | null;
    if (cj) {
      out.push(...fromMcpServers(cj.mcpServers, 'Claude Code', claudeJson));
      for (const [proj, p] of Object.entries(cj.projects ?? {})) {
        out.push(...fromMcpServers(p?.mcpServers, `Claude Code (${proj.split(/[\\/]/).filter(Boolean).pop() ?? proj})`, claudeJson));
      }
    }
    const desktop = join(appData, 'Claude', 'claude_desktop_config.json');
    if (appData) out.push(...fromMcpServers((this.json(desktop) as { mcpServers?: unknown } | null)?.mcpServers, 'Claude Desktop', desktop));
    const cursor = join(home, '.cursor', 'mcp.json');
    out.push(...fromMcpServers((this.json(cursor) as { mcpServers?: unknown } | null)?.mcpServers, 'Cursor', cursor));
    const gemini = join(home, '.gemini', 'settings.json');
    out.push(...fromMcpServers((this.json(gemini) as { mcpServers?: unknown } | null)?.mcpServers, 'Gemini CLI / Antigravity', gemini));
    const windsurf = join(home, '.codeium', 'windsurf', 'mcp_config.json');
    out.push(...fromMcpServers((this.json(windsurf) as { mcpServers?: unknown } | null)?.mcpServers, 'Windsurf', windsurf));
    const codex = join(home, '.codex', 'config.toml');
    const ct = this.deps.readFile(codex);
    if (ct) out.push(...parseCodexToml(ct, codex));
    return out;
  }

  /** Found servers for the UI: env values that look secret are hidden, and
   *  each says whether it is already imported. */
  scanForUi(): Array<Omit<FoundServer, 'env' | 'headers'> & { env: Array<{ name: string; secret: boolean; value?: string }>; headerNames: string[]; imported: boolean }> {
    const mine = new Set(this.deps.readCustom().map((c) => c.id));
    return this.scan().map((f) => ({
      source: f.source, file: f.file, name: f.name, transport: f.transport,
      env: Object.entries(f.env).map(([name, value]) => looksSecret(name, value) ? { name, secret: true } : { name, secret: false, value }),
      headerNames: Object.keys(f.headers),
      imported: mine.has(customId(f.name))
    }));
  }

  listCustom(): Array<CustomServer & { secretsStored: Record<string, boolean> }> {
    return this.deps.readCustom().map((c) => ({ ...c, secretsStored: Object.fromEntries(c.secretEnv.map((e) => [e, !!this.deps.getSecret(secretRef(c.id, e))])) }));
  }

  /**
   * Import a found server (by source + name). `secretNames` overrides which env
   * vars are treated as secrets (default: the ones that look like one).
   * Remote servers that need a header (an API key) cannot go through the
   * gateway yet and are refused rather than handed over with the key.
   */
  import(source: string, name: string, secretNames?: string[]): { ok: boolean; id?: string; error?: string } {
    const f = this.scan().find((x) => x.source === source && x.name === name);
    if (!f) return { ok: false, error: 'that server is no longer in its config' };
    if (f.transport.kind === 'http' && Object.keys(f.headers).length) {
      return { ok: false, error: 'this remote server needs a key in a header; that kind cannot be imported safely yet' };
    }
    return this.save({ name: f.name, transport: f.transport, env: f.env, source: f.source }, secretNames ?? Object.entries(f.env).filter(([k, v]) => looksSecret(k, v)).map(([k]) => k));
  }

  /** Add or replace a server. Env values named in `secretNames` go to the
   *  encrypted store; an empty value keeps the stored one. */
  save(input: { id?: string; name: string; transport: McpTransport; env: Record<string, string>; source?: string; enabled?: boolean; agents?: string[] | null }, secretNames: string[]): { ok: boolean; id?: string; error?: string } {
    const name = input.name.trim().slice(0, 60);
    if (!name) return { ok: false, error: 'give it a name' };
    if (input.transport.kind === 'stdio' && !input.transport.command.trim()) return { ok: false, error: 'give it a command' };
    if (input.transport.kind === 'http' && !/^https?:\/\//.test(input.transport.url)) return { ok: false, error: 'the address must start with https://' };
    const id = input.id ?? customId(name);
    const secrets = new Set(secretNames);
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.env)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue;
      if (secrets.has(k)) {
        if (v) { const r = this.deps.setSecret(secretRef(id, k), v); if (!r.ok) return { ok: false, error: r.error ?? 'could not store a key securely' }; }
      } else env[k] = v;
    }
    const prev = this.deps.readCustom().find((c) => c.id === id);
    for (const old of prev?.secretEnv ?? []) if (!secrets.has(old)) this.deps.deleteSecret(secretRef(id, old));
    const rec: CustomServer = {
      id, name, transport: input.transport, env, secretEnv: [...secrets].filter((s) => s in input.env || prev?.secretEnv.includes(s)),
      enabled: input.enabled ?? prev?.enabled ?? true, agents: input.agents !== undefined ? input.agents : prev?.agents ?? null,
      ...(input.source ?? prev?.source ? { source: input.source ?? prev?.source } : {})
    };
    this.deps.writeCustom([...this.deps.readCustom().filter((c) => c.id !== id), rec]);
    return { ok: true, id };
  }

  setEnabled(id: string, enabled: boolean): void {
    this.deps.writeCustom(this.deps.readCustom().map((c) => (c.id === id ? { ...c, enabled } : c)));
  }

  setAgents(id: string, agents: string[] | null): void {
    this.deps.writeCustom(this.deps.readCustom().map((c) => (c.id === id ? { ...c, agents } : c)));
  }

  remove(id: string): void {
    const c = this.deps.readCustom().find((x) => x.id === id);
    for (const e of c?.secretEnv ?? []) this.deps.deleteSecret(secretRef(id, e));
    this.deps.writeCustom(this.deps.readCustom().filter((x) => x.id !== id));
  }

  /** What one agent gets: servers with secrets go through the gateway (by id),
   *  the rest are handed over as plain entries. */
  forAgent(agentId: string): { gateway: string[]; plain: Record<string, { command: string; args: string[]; env?: Record<string, string> } | { type: 'http'; url: string; headers: Record<string, string> }> } {
    const gateway: string[] = [];
    const plain: Record<string, { command: string; args: string[]; env?: Record<string, string> } | { type: 'http'; url: string; headers: Record<string, string> }> = {};
    for (const c of this.deps.readCustom()) {
      if (!c.enabled) continue;
      if (c.agents && c.agents.length && !c.agents.includes(agentId)) continue;
      if (c.secretEnv.length) { if (c.secretEnv.every((e) => this.deps.getSecret(secretRef(c.id, e)))) gateway.push(c.id); continue; }
      plain[c.id] = c.transport.kind === 'stdio'
        ? { command: c.transport.command, args: c.transport.args, ...(Object.keys(c.env).length ? { env: c.env } : {}) }
        : { type: 'http', url: c.transport.url, headers: {} };
    }
    return { gateway, plain };
  }

  /** The gateway's launch spec for a custom server, keys included (main only). */
  launchSpec(id: string): { command: string; args: string[]; env: Record<string, string> } | null {
    const c = this.deps.readCustom().find((x) => x.id === id);
    if (!c || c.transport.kind !== 'stdio') return null;
    const env: Record<string, string> = { ...c.env };
    for (const e of c.secretEnv) { const v = this.deps.getSecret(secretRef(c.id, e)); if (!v) return null; env[e] = v; }
    return { command: c.transport.command, args: c.transport.args, env };
  }
}
