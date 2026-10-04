/**
 * Factories: software factories this office sends work to, or just watches
 * (FACTORY-MCP.md). Each one is a Factory MCP server reached over Streamable
 * HTTP with a bearer token.
 *
 * The token lives in the encrypted store (`factory:<id>`), is used here in the
 * main process and nowhere else: not in the renderer, not in agents. The
 * renderer sees what a factory offers (its tools, floor, events) and may only
 * call the profile's tools through `call()`, which refuses anything else.
 *
 * Electron-free: storage and secrets are injected (index.ts wires them).
 */
import { randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface FactoryRecord { id: string; name: string; url: string; addedAt: number }

export interface FactoriesDeps {
  list: () => FactoryRecord[];
  save: (list: FactoryRecord[]) => void;
  token: (id: string) => string | undefined;
  setToken: (id: string, token: string) => { ok: boolean; error?: string };
  deleteToken: (id: string) => void;
  log?: (m: string) => void;
}

/** What a factory offers, from initialize + tools/list. */
export interface FactoryInfo {
  name: string;
  version?: string;
  profile: string | null;
  projectsRequired: boolean;
  tools: string[];
  /** Offers task_create: the UI shows a send-task form. */
  canSend: boolean;
  /** Offers task_answer: asks can be answered inline. */
  canAnswer: boolean;
}

/** The profile's tools: the only ones the renderer may call. Admin ones need
 *  an explicit confirmation flag from the UI. */
const READ_TOOLS = new Set(['task_get', 'task_list', 'team_status', 'projects_list', 'memory_search', 'memory_recall', 'context_for_task']);
const WRITE_TOOLS = new Set(['task_create', 'task_answer', 'task_comment', 'memory_store']);
const ADMIN_TOOLS = new Set(['task_cancel', 'set_pacing']);

/** https anywhere; plain http only to this machine (a local factory, tests). */
export function validFactoryUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length > 500) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol === 'https:') return u;
    if (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return u;
    return null;
  } catch {
    return null;
  }
}

function parseText(result: unknown): unknown {
  const r = result as { structuredContent?: unknown; content?: Array<{ type: string; text?: string }>; isError?: boolean };
  if (r?.isError) throw new Error(r.content?.find((c) => c.type === 'text')?.text ?? 'the factory refused');
  if (r?.structuredContent !== undefined) return r.structuredContent;
  const text = r?.content?.find((c) => c.type === 'text')?.text;
  if (text === undefined) return null;
  try { return JSON.parse(text); } catch { return text; }
}

interface Live { client: Client; info: FactoryInfo; url: string }

export class Factories {
  private live = new Map<string, Live>();
  private connecting = new Map<string, Promise<Live>>();

  constructor(private readonly deps: FactoriesDeps) {}

  list(): Array<FactoryRecord & { hasToken: boolean; info?: FactoryInfo }> {
    return this.deps.list().map((f) => ({ ...f, hasToken: !!this.deps.token(f.id), info: this.live.get(f.id)?.info }));
  }

  /** Add a factory; it must answer before it is saved. */
  async add(name: unknown, url: unknown, token: unknown): Promise<{ ok: boolean; id?: string; info?: FactoryInfo; error?: string }> {
    const u = validFactoryUrl(url);
    if (!u) return { ok: false, error: 'the address must be https:// (or http:// on this machine)' };
    if (typeof token !== 'string' || !token.trim() || token.length > 4096 || /\s/.test(token.trim())) return { ok: false, error: 'paste the access token the factory gave you' };
    let info: FactoryInfo;
    try { info = (await this.open(u.href, token.trim())).info; }
    catch (e) { return { ok: false, error: `the factory did not answer: ${e instanceof Error ? e.message : e}` }; }
    const id = `f-${randomBytes(6).toString('hex')}`;
    const saved = this.deps.setToken(id, token.trim());
    if (!saved.ok) return { ok: false, error: saved.error ?? 'could not store the token securely' };
    const label = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : info.name;
    this.deps.save([...this.deps.list(), { id, name: label, url: u.href, addedAt: Date.now() }]);
    return { ok: true, id, info };
  }

  remove(id: unknown): { ok: boolean } {
    if (typeof id !== 'string') return { ok: false };
    void this.drop(id);
    this.deps.deleteToken(id);
    this.deps.save(this.deps.list().filter((f) => f.id !== id));
    return { ok: true };
  }

  /** Connect (or reconnect) and report what the factory offers. */
  async test(id: string): Promise<{ ok: boolean; info?: FactoryInfo; error?: string }> {
    await this.drop(id);
    try { return { ok: true, info: (await this.conn(id)).info }; }
    catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  }

  /** The live floor, or null when the factory does not offer one. */
  async floor(id: string): Promise<unknown | null> {
    return this.withConn(id, async (l) => {
      try {
        const r = await l.client.readResource({ uri: 'factory://floor' });
        const text = (r.contents[0] as { text?: string } | undefined)?.text;
        return text ? JSON.parse(text) : null;
      } catch (e) {
        if (/not found|unknown resource|-32002|-32601/i.test(String(e))) return null;
        throw e;
      }
    });
  }

  async events(id: string, since: string): Promise<{ events: unknown[]; cursor: string; gap: boolean } | null> {
    return this.withConn(id, async (l) => {
      try {
        const r = await l.client.readResource({ uri: `factory://events?since=${encodeURIComponent(since || '0')}` });
        const text = (r.contents[0] as { text?: string } | undefined)?.text;
        return text ? JSON.parse(text) : null;
      } catch (e) {
        if (/not found|unknown resource|-32002|-32601/i.test(String(e))) return null;
        throw e;
      }
    });
  }

  /** Call one of the profile's tools. Admin tools need `confirmed`. */
  async call(id: string, tool: unknown, args: unknown, confirmed = false): Promise<unknown> {
    if (typeof tool !== 'string' || !(READ_TOOLS.has(tool) || WRITE_TOOLS.has(tool) || ADMIN_TOOLS.has(tool))) {
      throw new Error('not a Factory MCP tool');
    }
    if (ADMIN_TOOLS.has(tool) && !confirmed) throw new Error(`${tool} needs your confirmation`);
    return this.withConn(id, async (l) => {
      if (!l.info.tools.includes(tool)) throw new Error('this factory does not offer that');
      return parseText(await l.client.callTool({ name: tool, arguments: (args && typeof args === 'object' ? args : {}) as Record<string, unknown> }));
    });
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.live.keys()].map((id) => this.drop(id)));
  }

  // ─── connections ───────────────────────────────────────────────────────────

  private async withConn<T>(id: string, fn: (l: Live) => Promise<T>): Promise<T> {
    const l = await this.conn(id);
    try {
      return await fn(l);
    } catch (e) {
      // A dropped session or a restarted server: reconnect once.
      if (/session|ECONNRESET|ECONNREFUSED|socket|fetch failed|404|400/i.test(String(e))) {
        await this.drop(id);
        return fn(await this.conn(id));
      }
      throw e;
    }
  }

  private conn(id: string): Promise<Live> {
    const have = this.live.get(id);
    if (have) return Promise.resolve(have);
    const pending = this.connecting.get(id);
    if (pending) return pending;
    const rec = this.deps.list().find((f) => f.id === id);
    const token = this.deps.token(id);
    if (!rec) return Promise.reject(new Error('no such factory'));
    if (!token) return Promise.reject(new Error('this factory has no token stored'));
    const p = this.open(rec.url, token).then((l) => { this.live.set(id, l); return l; })
      .finally(() => this.connecting.delete(id));
    this.connecting.set(id, p);
    return p;
  }

  private async open(url: string, token: string): Promise<Live> {
    const client = new Client({ name: 'scranton-branch', version: '1' });
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } }
    });
    await client.connect(transport);
    const instructions = client.getInstructions() ?? '';
    const tools = (await client.listTools()).tools.map((t) => t.name);
    const server = client.getServerVersion();
    const info: FactoryInfo = {
      name: server?.name ?? 'Factory',
      version: server?.version,
      profile: instructions.match(/profile:\s*([\w./-]+)/)?.[1] ?? null,
      projectsRequired: /projects:\s*required/.test(instructions),
      tools,
      canSend: tools.includes('task_create'),
      canAnswer: tools.includes('task_answer')
    };
    return { client, info, url };
  }

  private async drop(id: string): Promise<void> {
    const l = this.live.get(id);
    this.live.delete(id);
    if (l) { try { await l.client.close(); } catch { /* already gone */ } }
  }
}
