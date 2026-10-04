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
import { wslCommand } from './wsl';

/** Where a listener inside WSL leads on Windows: a TCP port or a named pipe. */
export type BridgeTarget = { port: number } | { path: string };

/** The Linux side, run with `node -e`. Plain Node, no dependencies. */
export const BRIDGE_SCRIPT = String.raw`
const net = require('net');
const listeners = JSON.parse(process.argv[1]);
const socks = new Map();
let next = 1;
const out = (m) => process.stdout.write(JSON.stringify(m) + '\n');
const ports = {};
let pending = listeners.length;
const done = () => { if (--pending === 0) out({ t: 'ready', ports }); };
for (const l of listeners) {
  const srv = net.createServer((s) => {
    const c = next++;
    socks.set(c, s);
    out({ t: 'o', c, n: l.name });
    s.on('data', (d) => out({ t: 'd', c, b: d.toString('base64') }));
    s.on('close', () => { if (socks.delete(c)) out({ t: 'x', c }); });
    s.on('error', () => {});
  });
  srv.on('error', (e) => { ports[l.name] = e.code === 'EADDRINUSE' ? 'direct' : 'failed:' + e.code; done(); });
  srv.listen(l.port, '127.0.0.1', () => { ports[l.name] = srv.address().port; done(); });
}
if (!pending) out({ t: 'ready', ports });
const rl = require('readline').createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
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
      const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error(`WSL bridge for ${this.distro} did not start`)); } }, 30_000);
      p.stderr?.on('data', (d) => this.log(`[wsl-bridge ${this.distro}] ${String(d).trim()}`));
      p.on('exit', (code) => {
        this.log(`[wsl-bridge ${this.distro}] exited (${code})`);
        for (const s of this.socks.values()) s.destroy();
        this.socks.clear();
        this.proc = null;
        this.ready = null; // next start() launches a fresh one
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error(`WSL bridge for ${this.distro} exited (${code}); is node installed in the distro?`)); }
      });
      createInterface({ input: p.stdout! }).on('line', (line) => {
        let m: { t: string; c?: number; n?: string; b?: string; ports?: BridgePorts };
        try { m = JSON.parse(line); } catch { return; }
        if (m.t === 'ready' && m.ports) {
          if (!settled) { settled = true; clearTimeout(timer); resolve(m.ports); }
        } else if (m.t === 'o' && typeof m.c === 'number') {
          this.open(m.c, m.n ?? '');
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
  }
}
