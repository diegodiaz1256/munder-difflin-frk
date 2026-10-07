/**
 * The office browser over the Chrome DevTools Protocol, for an engine that runs
 * outside the app (Fortress, fortress.ts). Same contract as browser.ts's
 * built-in path: open a page in a fresh tab, let it settle, run the shared
 * extraction script, close the tab. No cookies are shared with the app; the
 * engine keeps its own profile in the Fortress folder.
 */
import WebSocket from 'ws';

const LOAD_TIMEOUT_MS = 30_000;
const SETTLE_MS = 1200;
const SLOW_SETTLE_MS = 2500;
/** Requests that cost bandwidth but add no text. */
const BLOCKED = ['*.png', '*.jpg', '*.jpeg', '*.gif', '*.webp', '*.avif', '*.svg', '*.ico', '*.mp4', '*.webm', '*.mp3', '*.woff', '*.woff2', '*.ttf', '*.otf'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Target { id: string; webSocketDebuggerUrl: string }

async function http<T>(port: number, path: string, method: 'GET' | 'PUT' = 'GET'): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method });
  if (!res.ok) throw new Error(`CDP ${path}: HTTP ${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/** Open `url` in a new tab of the engine on `port`, run `extract` there, and
 *  resolve its value plus the main document's HTTP status. `slowRetry`
 *  re-extracts once after a longer wait when `isThin` says the page is still filling. */
export async function cdpRead<T>(port: number, url: string, extract: string, isThin?: (v: T) => boolean): Promise<{ value: T; status: number }> {
  const target = await http<Target>(port, `/json/new?${encodeURIComponent('about:blank')}`, 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const listeners = new Set<(method: string, params: Record<string, unknown>) => void>();
  ws.on('message', (raw) => {
    let msg: { id?: number; result?: unknown; error?: { message?: string }; method?: string; params?: Record<string, unknown> };
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (typeof msg.id === 'number') {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message ?? 'CDP error')); else p.resolve(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg.method, msg.params ?? {});
    }
  });
  const send = <R = unknown>(method: string, params: Record<string, unknown> = {}): Promise<R> => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  try {
    await new Promise<void>((resolve, reject) => { ws.once('open', () => resolve()); ws.once('error', reject); });
    let status = 0;
    let loaded = false;
    listeners.add((method, params) => {
      if (method === 'Network.responseReceived' && params.type === 'Document' && !status) {
        status = Number((params.response as { status?: number } | undefined)?.status ?? 0);
      }
      if (method === 'Page.loadEventFired') loaded = true;
    });
    await send('Page.enable');
    await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: BLOCKED }).catch(() => undefined);
    await send('Page.navigate', { url });
    const deadline = Date.now() + LOAD_TIMEOUT_MS;
    while (!loaded && Date.now() < deadline) await sleep(100);
    await sleep(SETTLE_MS);
    const evaluate = async (): Promise<T> => {
      const r = await send<{ result?: { value?: T }; exceptionDetails?: { text?: string } }>('Runtime.evaluate', { expression: extract, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? 'extraction failed');
      return r.result?.value as T;
    };
    let value = await evaluate();
    if (isThin?.(value)) { await sleep(SLOW_SETTLE_MS); value = await evaluate(); }
    return { value, status };
  } finally {
    for (const p of pending.values()) p.reject(new Error('closed'));
    try { ws.close(); } catch { /* gone */ }
    await http(port, `/json/close/${target.id}`).catch(() => undefined);
  }
}
