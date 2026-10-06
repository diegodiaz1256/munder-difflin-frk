/**
 * MCP gateway — keyed MCP servers whose credentials agents can never read.
 *
 * A stdio MCP server reads its key from its environment, and an agent's MCP
 * servers are children of the agent's own CLI: so handing the agent a keyed
 * server used to mean handing it the key (`echo $GITHUB_PERSONAL_ACCESS_TOKEN`).
 * Here the MAIN process starts the server instead, with the key in that child's
 * environment only, and exposes it on 127.0.0.1 as a streamable-HTTP MCP
 * endpoint. The agent's CLI connects with a per-agent capability token (a
 * handle, never the key) that reaches only the servers granted to that agent and
 * dies with its session. The agent can use the tools; the key never enters its
 * process, its environment or any file it can read.
 *
 * Wire format: POST /mcp/<serverId> with one JSON-RPC message (or a batch),
 * `Authorization: Bearer <token>`; requests are answered as application/json,
 * notifications with 202. Server-initiated requests (sampling, roots…) cannot be
 * relayed without an SSE stream and are answered "method not found" so the
 * server never hangs; server notifications are dropped. GET (the optional SSE
 * stream) is 405, as the spec allows; DELETE ends the session.
 *
 * Electron-free: the spec resolver (catalog + decrypted keys) is injected.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { hardKillTree } from './procKill';
import { filterTools, isReadTool, type Access } from '../shared/connectionAccess';

export interface McpLaunchSpec {
  command: string;
  args: string[];
  /** Merged over the gateway's own environment. Holds the credentials. */
  env: Record<string, string>;
}

export interface McpGatewayDeps {
  /** The launch spec for a server, keys included, or null when it cannot run
   *  (unknown id, or a required key is not stored). Main-internal only. */
  resolveSpec: (serverId: string) => McpLaunchSpec | null;
  /** The catalog service a connection id belongs to (an added connection is
   *  `<service>--<name>`); the read-only rules are per service. Unset → the id. */
  serviceOf?: (serverId: string) => string | undefined;
  /** Override for tests. */
  requestTimeoutMs?: number;
}

/** `access` per server: absent for a server means unrestricted (custom servers,
 *  and callers that predate access levels); 'read' lets only read-only tools
 *  through; 'none' lets nothing through. */
interface Grant { agentId: string; servers: Set<string>; access: Map<string, Access> }

interface Session {
  proc: ChildProcess;
  buf: string;
  pending: Map<string, (msg: unknown) => void>;
  initialized: boolean;
  stderrTail: string;
  /** Annotations the server declared for its tools (from tools/list). */
  annotations: Map<string, { readOnlyHint?: boolean; destructiveHint?: boolean }>;
}

const MAX_BODY = 8 * 1024 * 1024;

function rpcError(id: unknown, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

/** Windows runs npx/uvx shims through cmd.exe, which takes one command line. */
function quoteWin(a: string): string {
  return /[\s"&|<>^()%!]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a;
}

export class McpGateway {
  private server: Server | null = null;
  private port = 0;
  private readonly byToken = new Map<string, Grant>();
  private readonly byAgent = new Map<string, string>();
  private readonly sessions = new Map<string, Session>();
  private readonly timeoutMs: number;

  constructor(private readonly deps: McpGatewayDeps) {
    this.timeoutMs = deps.requestTimeoutMs ?? 120_000;
  }

  start(): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (this.server) { resolve({ ok: true }); return; }
      const server = createServer((req, res) => { void this.handle(req, res); });
      server.once('error', (e) => resolve({ ok: false, error: e.message }));
      server.listen(0, '127.0.0.1', () => {
        this.server = server;
        const addr = server.address();
        this.port = addr && typeof addr === 'object' ? addr.port : 0;
        resolve({ ok: true });
      });
    });
  }

  running(): boolean { return !!this.server; }
  url(): string { return `http://127.0.0.1:${this.port}`; }

  /** A fresh capability for this agent over these servers. Replaces (and
   *  revokes) whatever the agent held before, so a respawn never leaves a live
   *  stale token behind. */
  grant(agentId: string, serverIds: string[], access?: Record<string, Access>): string {
    this.revoke(agentId);
    const token = randomBytes(32).toString('hex');
    this.byToken.set(token, { agentId, servers: new Set(serverIds), access: new Map(Object.entries(access ?? {})) });
    this.byAgent.set(agentId, token);
    return token;
  }

  /** Revoke an agent's capability and stop its server processes. Idempotent. */
  revoke(agentId: string): void {
    const token = this.byAgent.get(agentId);
    if (!token) return;
    this.byAgent.delete(agentId);
    this.byToken.delete(token);
    for (const key of [...this.sessions.keys()]) if (key.startsWith(`${token}:`)) this.endSession(key);
  }

  stop(): void {
    for (const key of [...this.sessions.keys()]) this.endSession(key);
    this.byToken.clear();
    this.byAgent.clear();
    try { this.server?.close(); } catch { /* noop */ }
    this.server = null;
  }

  // ─── HTTP ──────────────────────────────────────────────────────────────────

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const remote = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
    if (remote !== '127.0.0.1' && remote !== '::1') { res.writeHead(403); res.end(); return; }
    const m = /^\/mcp\/([a-z0-9-]+)\/?$/.exec((req.url ?? '').split('?')[0]);
    if (!m) { res.writeHead(404); res.end(); return; }
    const serverId = m[1];
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const grant = token ? this.byToken.get(token) : undefined;
    if (!grant) { res.writeHead(401); res.end(); return; }
    if (!grant.servers.has(serverId)) { res.writeHead(403); res.end(); return; }
    const key = `${token}:${serverId}`;

    if (req.method === 'DELETE') { this.endSession(key); res.writeHead(200); res.end(); return; }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST, DELETE' }); res.end(); return; }

    let body = '';
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY) { res.writeHead(413); res.end(); return; }
      body += chunk;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { this.json(res, 400, rpcError(null, -32700, 'Parse error')); return; }
    const batch = Array.isArray(parsed);
    const messages = (batch ? parsed : [parsed]) as Array<Record<string, unknown>>;

    const replies: unknown[] = [];
    for (const msg of messages) {
      if (!msg || typeof msg !== 'object') { replies.push(rpcError(null, -32600, 'Invalid Request')); continue; }
      const isRequest = typeof msg.method === 'string' && msg.id !== undefined && msg.id !== null;
      if (isRequest && msg.method === 'initialize' && this.sessions.get(key)?.initialized) {
        // A reconnecting client starts over; a stdio server expects one handshake.
        this.endSession(key);
      }
      const session = this.session(key, serverId);
      if (!session) {
        if (isRequest) replies.push(rpcError(msg.id, -32000, `${serverId} cannot start (missing key or unknown server)`));
        continue;
      }
      const access = grant.access.get(serverId);
      const service = this.deps.serviceOf?.(serverId) ?? serverId;
      // A tool the agent's access does not cover never reaches the server. The
      // refusal is a tool error (not a protocol one) so the agent reads why.
      if (isRequest && msg.method === 'tools/call' && access && access !== 'readwrite') {
        const name = String((msg.params as { name?: unknown } | undefined)?.name ?? '');
        if (access === 'none' || !isReadTool(service, name, session.annotations.get(name))) {
          replies.push({ jsonrpc: '2.0', id: msg.id, result: { isError: true, content: [{ type: 'text', text: `Not allowed: your role gives read-only access to this connection, and "${name}" changes things. Ask the human to give your role read & write access under Capabilities.` }] } });
          continue;
        }
      }
      if (isRequest && msg.method === 'initialize') session.initialized = true;
      this.write(session, msg);
      if (isRequest) {
        const reply = await this.await(session, msg.id, serverId);
        replies.push(msg.method === 'tools/list' ? this.shapeToolList(reply, session, service, access) : reply);
      }
    }
    if (replies.length === 0) { res.writeHead(202); res.end(); return; }
    this.json(res, 200, batch ? replies : replies[0]);
  }

  /** Remember the tools' annotations and hide the ones this access forbids. */
  private shapeToolList(reply: unknown, session: Session, service: string, access: Access | undefined): unknown {
    const r = reply as { result?: { tools?: Array<{ name?: unknown; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }> } };
    const tools = r?.result?.tools;
    if (!Array.isArray(tools)) return reply;
    for (const t of tools) if (typeof t.name === 'string' && t.annotations) session.annotations.set(t.name, t.annotations);
    if (!access || access === 'readwrite') return reply;
    return { ...(reply as object), result: { ...r.result, tools: filterTools(service, tools, access) } };
  }

  private json(res: ServerResponse, status: number, value: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(value));
  }

  // ─── stdio sessions ────────────────────────────────────────────────────────

  private session(key: string, serverId: string): Session | null {
    const existing = this.sessions.get(key);
    if (existing && existing.proc.exitCode === null && !existing.proc.killed) return existing;
    if (existing) this.sessions.delete(key);
    const spec = this.deps.resolveSpec(serverId);
    if (!spec) return null;
    const win = process.platform === 'win32';
    const proc = win
      ? spawn([spec.command, ...spec.args].map(quoteWin).join(' '), { shell: true, windowsHide: true, env: { ...process.env, ...spec.env }, stdio: ['pipe', 'pipe', 'pipe'] })
      // Own process group, so endSession can take down the whole tree (npx
      // starts the real server as a grandchild).
      : spawn(spec.command, spec.args, { env: { ...process.env, ...spec.env }, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    const s: Session = { proc, buf: '', pending: new Map(), initialized: false, stderrTail: '', annotations: new Map() };
    proc.stdout?.setEncoding('utf8');
    proc.stdout?.on('data', (d: string) => this.read(s, d));
    proc.stderr?.setEncoding('utf8');
    proc.stderr?.on('data', (d: string) => { s.stderrTail = (s.stderrTail + d).slice(-2000); });
    proc.on('error', () => { /* surfaced on exit */ });
    proc.on('exit', () => {
      for (const [id, resolve] of s.pending) {
        resolve(rpcError(JSON.parse(id), -32000, `${serverId} exited${s.stderrTail ? `: ${s.stderrTail.trim().split('\n').slice(-3).join(' | ')}` : ''}`));
      }
      s.pending.clear();
      if (this.sessions.get(key) === s) this.sessions.delete(key);
    });
    this.sessions.set(key, s);
    return s;
  }

  private write(s: Session, msg: unknown): void {
    try { s.proc.stdin?.write(JSON.stringify(msg) + '\n'); } catch { /* exit handler reports it */ }
  }

  private read(s: Session, chunk: string): void {
    s.buf += chunk;
    let nl: number;
    while ((nl = s.buf.indexOf('\n')) >= 0) {
      const line = s.buf.slice(0, nl).trim();
      s.buf = s.buf.slice(nl + 1);
      if (!line) continue;
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(line); } catch { continue; }
      if (typeof msg.method === 'string') {
        // A server-initiated request would wait for a client that cannot hear
        // it; answer so it moves on. Server notifications are dropped.
        if (msg.id !== undefined && msg.id !== null) this.write(s, rpcError(msg.id, -32601, 'Not supported through the gateway'));
        continue;
      }
      const resolve = s.pending.get(JSON.stringify(msg.id));
      if (resolve) { s.pending.delete(JSON.stringify(msg.id)); resolve(msg); }
    }
  }

  private await(s: Session, id: unknown, serverId: string): Promise<unknown> {
    return new Promise((resolve) => {
      const k = JSON.stringify(id);
      const timer = setTimeout(() => {
        if (s.pending.delete(k)) resolve(rpcError(id, -32000, `${serverId} did not answer in ${Math.round(this.timeoutMs / 1000)} s`));
      }, this.timeoutMs);
      timer.unref?.();
      s.pending.set(k, (msg) => { clearTimeout(timer); resolve(msg); });
    });
  }

  private endSession(key: string): void {
    const s = this.sessions.get(key);
    if (!s) return;
    this.sessions.delete(key);
    try { s.proc.stdin?.end(); } catch { /* noop */ }
    // The whole tree: on Windows the direct child is cmd.exe (npx/uvx shims),
    // and killing only it would orphan the server, key and all.
    if (s.proc.pid && s.proc.exitCode === null) hardKillTree(s.proc.pid);
  }
}
