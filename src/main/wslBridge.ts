/**
 * The way agents on a WSL floor reach the app (Windows only).
 *
 * The app's hook server, MCP gateway and key broker listen on Windows
 * loopback only. Inside WSL2 "localhost" is the distro's own VM, so without
 * mirrored networking an agent there cannot reach them — and opening them to
 * the VM network would expose the key broker. Instead, per distro, the app runs
 * a small bridge INSIDE the distro over `wsl.exe`, and talks to it through that
 * process's stdin/stdout:
 *
 *   agent ──tcp──▶ bridge (127.0.0.1 inside WSL) ══stdio══▶ app ──▶ service
 *
 * The bridge listens on the same port numbers as the Windows services where it
 * can (so URLs handed to agents work unchanged) and on a free port for the hook
 * server (a named pipe on Windows): HIVE_SOCK=tcp://127.0.0.1:<port>. A port
 * already taken inside the distro means mirrored networking is on and the
 * Windows service is reachable directly: that one is skipped.
 *
 * Protocol: JSON lines. bridge → app: {t:'ready', ports}, {t:'o', c, n} (a
 * connection on listener n), {t:'d', c, b} (data, base64), {t:'x', c}
 * (closed). app → bridge: {t:'d', c, b}, {t:'x', c}. The bridge exits when its
 * stdin closes, so it never outlives the app.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { connect, type Socket } from 'node:net';
import { createInterface } from 'node:readline';
import { describeWslError, wslCommand } from './wsl';

/** Where a listener inside WSL leads on Windows: a TCP port or a named pipe. */
export type BridgeTarget = { port: number } | { path: string };

/** The Linux side, run with `node -e`. Plain Node, no dependencies. */
export const BRIDGE_SCRIPT = String.raw`
const net = require('net');
const listeners = JSON.parse(process.argv[1]);
const socks = new Map();
let next = 1;
const out = (m) => process.stdout.write(JSON.stringify(m) + '\n');
const listen = (l, cb) => {
  const srv = net.createServer((s) => {
    const c = next++;
    socks.set(c, s);
    out({ t: 'o', c, n: l.name });
    s.on('data', (d) => out({ t: 'd', c, b: d.toString('base64') }));
    s.on('close', () => { if (socks.delete(c)) out({ t: 'x', c }); });
    s.on('error', () => {});
  });
  srv.on('error', (e) => cb(e.code === 'EADDRINUSE' ? 'direct' : 'failed:' + e.code));
  srv.listen(l.port, '127.0.0.1', () => cb(srv.address().port));
};
const ports = {};
let pending = listeners.length;
for (const l of listeners) listen(l, (p) => { ports[l.name] = p; if (--pending === 0) out({ t: 'ready', ports }); });
if (!pending) out({ t: 'ready', ports });
const rl = require('readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.t === 'listen') { listen(m, (p) => out({ t: 'listening', n: m.name, p })); return; }
  const s = socks.get(m.c);
  if (!s) return;
  if (m.t === 'd') s.write(Buffer.from(m.b, 'base64'));
  else if (m.t === 'x') { socks.delete(m.c); s.end(); }
});
rl.on('close', () => process.exit(0));
`;

export interface BridgePorts { [name: string]: number | 'direct' | string }

export class WslBridge {
  private proc: ChildProcess | null = null;
  private socks = new Map<number, Socket>();
  private ready: Promise<BridgePorts> | null = null;
  /** Where each listener ended up inside WSL (from 'ready' and 'listening'). */
  private ports: BridgePorts = {};
  private waiting = new Map<string, (p: number | string) => void>();

  constructor(
    readonly distro: string,
    /** Listener name → where it leads, plus the port to try inside WSL (0 = any). */
    private readonly listeners: Array<{ name: string; port: number; target: BridgeTarget }>,
    private readonly log: (m: string) => void = () => {}
  ) {}

  /** Start (once) and resolve with the ports agents should use inside WSL. */
  start(): Promise<BridgePorts> {
    if (this.ready) return this.ready;
    this.ready = new Promise<BridgePorts>((resolve, reject) => {
      const spec = JSON.stringify(this.listeners.map((l) => ({ name: l.name, port: l.port })));
      const inv = wslCommand(this.distro, '/', 'node', ['-e', BRIDGE_SCRIPT, spec]);
      const p = spawn(inv.file, inv.args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      this.proc = p;
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error(`${describeWslError('timed out', this.distro)} (the bridge into ${this.distro} did not start in 30s)`)); } }, 30_000);
      let errTail = '';
      p.stderr?.on('data', (d) => {
        errTail = (errTail + String(d)).slice(-600);
        this.log(`[wsl-bridge ${this.distro}] ${String(d).trim()}`);
      });
      // wsl.exe itself could not start (missing, or blocked by security software).
      p.on('error', (e) => {
        this.log(`[wsl-bridge ${this.distro}] spawn failed: ${e.message}`);
        this.proc = null;
        this.ready = null;
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error(describeWslError(e, this.distro))); }
      });
      p.on('exit', (code) => {
        this.log(`[wsl-bridge ${this.distro}] exited (${code})`);
        // A bridge that was already replaced must not wipe its successor's
        // state (its exit can be reported after the new one started).
        if (this.proc !== p) {
          if (!settled) { settled = true; clearTimeout(timer); reject(new Error(`the WSL bridge into ${this.distro} was replaced`)); }
          return;
        }
        for (const s of this.socks.values()) s.destroy();
        this.socks.clear();
        this.proc = null;
        this.ready = null; // next start() launches a fresh one
        this.ports = {};
        for (const w of this.waiting.values()) w('failed:exited');
        this.waiting.clear();
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error(`the WSL bridge into ${this.distro} stopped (exit ${code}). ${errTail.trim() ? describeWslError(errTail, this.distro) : 'It ended without a message: security software may have stopped it, or node is missing inside the distro.'}`)); }
      });
      createInterface({ input: p.stdout! }).on('line', (line) => {
        let m: { t: string; c?: number; n?: string; b?: string; ports?: BridgePorts };
        try { m = JSON.parse(line); } catch { return; }
        if (m.t === 'ready' && m.ports) {
          this.ports = { ...m.ports };
          if (!settled) { settled = true; clearTimeout(timer); resolve(m.ports); }
        } else if (m.t === 'listening' && m.n) {
          const p = (m as { p?: number | string }).p ?? 'failed';
          this.ports[m.n] = p;
          this.waiting.get(m.n)?.(p);
          this.waiting.delete(m.n);
        } else if (m.t === 'o' && Number.isSafeInteger(m.c) && (m.c as number) > 0 && !this.socks.has(m.c as number)) {
          // A connection id is opened once: a repeated one must not rewire a live socket.
          this.open(m.c as number, m.n ?? '');
        } else if (m.t === 'd' && typeof m.c === 'number' && m.b) {
          this.socks.get(m.c)?.write(Buffer.from(m.b, 'base64'));
        } else if (m.t === 'x' && typeof m.c === 'number') {
          const s = this.socks.get(m.c);
          this.socks.delete(m.c);
          s?.end();
        }
      });
    });
    return this.ready;
  }

  /**
   * Make sure `l` is bridged, adding it to a running bridge when it is new (a
   * service that started after the first agent, a Slack reply server, an
   * agent's own proxy sidecar), and resolve with where it listens inside WSL.
   * A listener is known by its name: a new target port means a new name.
   */
  async ensure(l: { name: string; port: number; target: BridgeTarget }): Promise<number | string> {
    // A listener that did not bind last time (port taken, error) is tried again.
    if (this.ready && typeof this.ports[l.name] === 'string') {
      const i = this.listeners.findIndex((x) => x.name === l.name);
      if (i >= 0) this.listeners.splice(i, 1);
      delete this.ports[l.name];
    }
    if (!this.listeners.some((x) => x.name === l.name)) {
      this.listeners.push(l);
      if (this.ready) {
        await this.ready;
        if (!(l.name in this.ports)) {
          const p = await new Promise<number | string>((resolve) => {
            this.waiting.set(l.name, resolve);
            this.send({ t: 'listen', name: l.name, port: l.port });
            setTimeout(() => { if (this.waiting.delete(l.name)) resolve('failed:timeout'); }, 10_000).unref?.();
          });
          if (typeof p === 'string' && p.startsWith('failed')) this.log(`[wsl-bridge ${this.distro}] ${l.name}: ${p}`);
          return p;
        }
      }
    }
    const ports = await this.start();
    const got = this.ports[l.name] ?? ports[l.name];
    if (got !== undefined) return got;
    // Known but not bound by the running bridge: it was restarted after
    // exiting, or started while this listener was being added. Ask it now
    // instead of failing the agent's start ("failed:unknown").
    return this.listenNow(l);
  }

  private listenNow(l: { name: string; port: number }): Promise<number | string> {
    return new Promise<number | string>((resolve) => {
      this.waiting.set(l.name, resolve);
      this.send({ t: 'listen', name: l.name, port: l.port });
      setTimeout(() => { if (this.waiting.delete(l.name)) resolve('failed:timeout'); }, 10_000).unref?.();
    });
  }

  private send(m: unknown): void {
    try { this.proc?.stdin?.write(JSON.stringify(m) + '\n'); } catch { /* bridge gone */ }
  }

  private open(c: number, name: string): void {
    const l = this.listeners.find((x) => x.name === name);
    if (!l) { this.send({ t: 'x', c }); return; }
    const s = 'path' in l.target ? connect(l.target.path) : connect(l.target.port, '127.0.0.1');
    this.socks.set(c, s);
    s.on('data', (d) => this.send({ t: 'd', c, b: d.toString('base64') }));
    s.on('close', () => { if (this.socks.delete(c)) this.send({ t: 'x', c }); });
    s.on('error', () => s.destroy());
  }

  stop(): void {
    for (const s of this.socks.values()) s.destroy();
    this.socks.clear();
    try { this.proc?.stdin?.end(); } catch { /* gone */ }
    try { this.proc?.kill(); } catch { /* gone */ }
    this.proc = null;
    this.ready = null;
    this.ports = {};
  }
}
