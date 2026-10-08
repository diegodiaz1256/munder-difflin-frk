/**
 * Freeze log: the app writes down, by itself, when it stalls and what it was
 * doing, so "it froze" comes with data instead of a reproduction hunt.
 *
 * - MAIN: a 100 ms heartbeat. When a beat arrives more than `thresholdMs` late,
 *   the main thread was blocked that long. Every IPC handler, timer callback and
 *   event listener (sockets, terminals, child processes) is timed, a couple of
 *   clock reads each; the slow ones that ended inside the stall are what blocked
 *   it. Async IPC handlers still running are listed too: the work after their
 *   first `await` is not timed, so one of them may be the cause.
 * - RENDERER: the window reports its own long tasks (PerformanceObserver), with
 *   the screen it was on.
 *
 * One JSON line per freeze in `<userData>/logs/freezes.jsonl`, rotated at 1 MB
 * (one old file kept). Nothing leaves the machine.
 */
import { EventEmitter } from 'node:events';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

export interface SlowOp { label: string; ms: number; end: number }
export interface FreezeEntry {
  at: string;
  where: 'main' | 'renderer';
  ms: number;
  /** main: the slow handlers/timers/events that ended inside the stall, slowest first. */
  during?: Array<{ label: string; ms: number; times?: number }>;
  /** main: async IPC requests that were still running (suspects). */
  inFlight?: string[];
  /** renderer: the screen it was on. */
  screen?: string;
  rssMb?: number;
  extra?: Record<string, unknown>;
}

const BEAT_MS = 100;
const SLOW_OP_MS = 30;
const MAX_BYTES = 1024 * 1024;

export class FreezeMonitor {
  private ops: SlowOp[] = [];
  private inFlight = new Map<number, string>();
  private flightSeq = 0;
  private timer: NodeJS.Timeout | null = null;
  private last = 0;
  private readonly threshold: number;
  private readonly now: () => number;

  constructor(private opts: {
    file: string;
    thresholdMs?: number;
    now?: () => number;
    extra?: () => Record<string, unknown>;
  }) {
    this.threshold = opts.thresholdMs ?? 200;
    this.now = opts.now ?? (() => performance.now());
  }

  start(): void {
    if (this.timer) return;
    this.last = this.now();
    this.timer = setInterval(() => this.beat(), BEAT_MS);
    this.timer.unref?.();
  }

  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  /** One heartbeat: how late was it? Exposed for tests. */
  beat(): void {
    const t = this.now();
    const late = t - this.last - BEAT_MS;
    this.last = t;
    if (late >= this.threshold) {
      const from = t - late - BEAT_MS;
      // Same work several times over (six agents spawning at once) is one line.
      const byLabel = new Map<string, { label: string; ms: number; times: number }>();
      for (const o of this.ops) {
        if (o.end < from) continue;
        const g = byLabel.get(o.label);
        if (g) { g.ms = Math.max(g.ms, o.ms); g.times++; } else byLabel.set(o.label, { label: o.label, ms: o.ms, times: 1 });
      }
      const during = [...byLabel.values()].sort((a, b) => b.ms * b.times - a.ms * a.times).slice(0, 5)
        .map((g) => ({ label: g.label, ms: Math.round(g.ms), ...(g.times > 1 ? { times: g.times } : {}) }));
      const inFlight = [...new Set(this.inFlight.values())].slice(0, 5);
      this.record({ where: 'main', ms: Math.round(late), during, ...(inFlight.length ? { inFlight } : {}) });
    }
    // Keep only what a stall right now could still be blamed on.
    const keepFrom = t - 10_000;
    if (this.ops.length && this.ops[0].end < keepFrom) this.ops = this.ops.filter((o) => o.end >= keepFrom);
  }

  /** Remember a slow piece of work (the caller timed it). */
  noteOp(label: string, ms: number): void {
    if (ms < SLOW_OP_MS) return;
    this.ops.push({ label, ms, end: this.now() });
    if (this.ops.length > 200) this.ops.splice(0, this.ops.length - 200);
  }

  /** Track a pending async request until it settles. */
  track(label: string, p: PromiseLike<unknown>): void {
    const id = ++this.flightSeq;
    const t0 = this.now();
    this.inFlight.set(id, label);
    // Settled by the time the late beat runs, so it is no longer "in flight":
    // a slow one is remembered with its whole duration instead.
    const done = () => { this.inFlight.delete(id); this.noteOp(`${label} (async)`, this.now() - t0); };
    p.then(done, done);
  }

  /** Time a synchronous piece of work; a thrown error passes through. */
  time<T>(label: string | (() => string), fn: () => T): T {
    const t0 = this.now();
    try { return fn(); } finally {
      const ms = this.now() - t0;
      if (ms >= SLOW_OP_MS) this.noteOp(typeof label === 'function' ? label() : label, ms);
    }
  }

  record(e: Omit<FreezeEntry, 'at'>): void {
    const entry: FreezeEntry = {
      at: new Date().toISOString(),
      ...e,
      rssMb: Math.round(process.memoryUsage().rss / 1048576),
      ...(this.opts.extra ? { extra: this.opts.extra() } : {})
    };
    try {
      mkdirSync(dirname(this.opts.file), { recursive: true });
      if (existsSync(this.opts.file) && statSync(this.opts.file).size > MAX_BYTES) renameSync(this.opts.file, this.opts.file + '.1');
      appendFileSync(this.opts.file, JSON.stringify(entry) + '\n');
    } catch { /* a log that cannot be written must never become the freeze */ }
  }

  /** The newest entries, newest first (Settings shows them). */
  recent(limit = 50): FreezeEntry[] {
    try {
      const lines = readFileSync(this.opts.file, 'utf8').trim().split('\n').filter(Boolean);
      return lines.slice(-limit).reverse().map((l) => JSON.parse(l) as FreezeEntry);
    } catch { return []; }
  }
}

/** A short name for a callback that turned out slow: its function name, or the
 *  start of its source. Only computed for the slow ones. */
export function callbackLabel(kind: string, fn: unknown): string {
  const f = fn as { name?: string; toString?: () => string };
  const name = f?.name && f.name !== 'anonymous' ? f.name : '';
  if (name) return `${kind} ${name}`;
  const src = typeof f?.toString === 'function' ? f.toString().replace(/\s+/g, ' ').slice(0, 70) : '?';
  return `${kind} ${src}`;
}

type Handler = (...args: unknown[]) => unknown;
interface IpcLike { handle(channel: string, fn: Handler): void; on(channel: string, fn: Handler): unknown }

/** Time every IPC handler (its synchronous part: that is what blocks main). */
export function instrumentIpc(ipc: IpcLike, monitor: FreezeMonitor): void {
  const handle = ipc.handle.bind(ipc);
  const on = ipc.on.bind(ipc);
  ipc.handle = (channel, fn) => handle(channel, (...args: unknown[]) => {
    const r = monitor.time(`ipc ${channel}`, () => fn(...args));
    if (r && typeof (r as PromiseLike<unknown>).then === 'function') monitor.track(`ipc ${channel}`, r as PromiseLike<unknown>);
    return r;
  });
  ipc.on = (channel, fn) => on(channel, (...args: unknown[]) => monitor.time(`ipc ${channel}`, () => fn(...args)));
}

/** Time every event listener in this process (sockets, terminals, children…).
 *  A listener that throws still throws. */
export function instrumentEvents(monitor: FreezeMonitor, proto: { emit: (...a: unknown[]) => boolean } = EventEmitter.prototype as never): void {
  const emit = proto.emit;
  proto.emit = function (this: unknown, ...a: unknown[]): boolean {
    return monitor.time(() => `event ${(this as { constructor?: { name?: string } })?.constructor?.name ?? '?'}.${String(a[0])}`, () => emit.apply(this, a));
  };
}

/** Time every timer callback in this process. */
export function instrumentTimers(monitor: FreezeMonitor, g: { setTimeout: typeof setTimeout; setInterval: typeof setInterval } = globalThis): void {
  const wrap = (kind: string, orig: (cb: Handler, ms?: number, ...rest: unknown[]) => unknown) => {
    const timed = (cb: unknown, ms?: number, ...rest: unknown[]) => {
      if (typeof cb !== 'function') return orig(cb as Handler, ms, ...rest);
      return orig((...a: unknown[]) => monitor.time(() => callbackLabel(kind, cb), () => (cb as Handler)(...a)), ms, ...rest);
    };
    // Keep what hangs off the original (util.promisify.custom on setTimeout).
    for (const k of Reflect.ownKeys(orig)) {
      if (!(k in timed)) Object.defineProperty(timed, k, Object.getOwnPropertyDescriptor(orig, k) as PropertyDescriptor);
    }
    return timed;
  };
  g.setTimeout = wrap('timeout', g.setTimeout as never) as unknown as typeof setTimeout;
  g.setInterval = wrap('interval', g.setInterval as never) as unknown as typeof setInterval;
}
