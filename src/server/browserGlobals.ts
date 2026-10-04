/**
 * The few browser globals the floor's orchestration touches, for the server:
 * `window` (the preload publishes `cth` on it), window events, a localStorage
 * that survives restarts (the roster lives there as well as in its file), and
 * harmless stand-ins for the rest.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from './electronShim';

class FileStorage {
  private data: Record<string, string> = {};
  private timer: NodeJS.Timeout | null = null;
  constructor(private path: string) {
    try { this.data = JSON.parse(readFileSync(path, 'utf8')); } catch { this.data = {}; }
    process.once('exit', () => this.flush());
  }
  get length(): number { return Object.keys(this.data).length; }
  key(i: number): string | null { return Object.keys(this.data)[i] ?? null; }
  getItem(k: string): string | null { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null; }
  setItem(k: string, v: string): void { this.data[k] = String(v); this.schedule(); }
  removeItem(k: string): void { delete this.data[k]; this.schedule(); }
  clear(): void { this.data = {}; this.schedule(); }
  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 500);
  }
  flush(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path + '.tmp', JSON.stringify(this.data));
      renameSync(this.path + '.tmp', this.path);
    } catch (e) { console.error('[server] localStorage flush failed:', (e as Error).message); }
  }
}

let installed = false;

export function installBrowserGlobals(): void {
  if (installed) return;
  installed = true;
  const g = globalThis as Record<string, unknown>;
  const events = new EventTarget();
  const win = g as Record<string, unknown>;
  win.window = g;
  win.self = g;
  win.addEventListener = events.addEventListener.bind(events);
  win.removeEventListener = events.removeEventListener.bind(events);
  win.dispatchEvent = events.dispatchEvent.bind(events);
  win.localStorage = new FileStorage(join(app.getPath('userData'), 'floor-state.json'));
  win.sessionStorage = new FileStorage(join(app.getPath('userData'), '.session-state.json'));
  win.innerWidth = 1280;
  win.innerHeight = 800;
  win.devicePixelRatio = 1;
  win.requestAnimationFrame ??= (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
  win.cancelAnimationFrame ??= (id: number) => clearTimeout(id as unknown as NodeJS.Timeout);
  win.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  if (!('navigator' in g)) win.navigator = { platform: process.platform, userAgent: 'MunderDifflinServer', language: 'en-US', languages: ['en-US'] };
  win.location ??= { href: 'server://floor', search: '', hash: '', reload() {} };
}
