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

/** One CDP command; past this the engine is treated as wedged. Covers a
 *  navigation that never answers and an extraction script that never settles. */
const COMMAND_TIMEOUT_MS = 45_000;
const HTTP_TIMEOUT_MS = 5_000;

async function http<T>(port: number, path: string, method: 'GET' | 'PUT' = 'GET'): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
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
  // The engine crashing or closing the tab must fail what is in flight, not
  // leave it pending: the browse slot it holds would never be given back.
  const failAll = (why: string) => { for (const p of pending.values()) p.reject(new Error(why)); pending.clear(); };
  ws.on('close', () => failAll('the browser engine closed the connection'));
  ws.on('error', () => failAll('the browser engine connection failed'));
  const send = <R = unknown>(method: string, params: Record<string, unknown> = {}): Promise<R> => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} got no answer in ${COMMAND_TIMEOUT_MS / 1000} s`)); }, COMMAND_TIMEOUT_MS);
    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); (resolve as (v: unknown) => void)(v); },
      reject: (e) => { clearTimeout(timer); reject(e); }
    });
    ws.send(JSON.stringify({ id, method, params }), (err) => { if (err) pending.get(id)?.reject(err); });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('the browser engine did not open the tab')), HTTP_TIMEOUT_MS);
      ws.once('open', () => { clearTimeout(t); resolve(); });
      ws.once('error', (e) => { clearTimeout(t); reject(e); });
    });
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
    failAll('closed');
    try { ws.close(); } catch { /* gone */ }
    await http(port, `/json/close/${target.id}`).catch(() => undefined);
  }
}
