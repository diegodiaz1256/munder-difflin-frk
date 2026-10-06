/**
 * The office browser: opens a page in a hidden, throwaway Chromium window and
 * returns its readable text (shared/browsePage.ts says why and what it does
 * not do). Agents reach it through the integration broker (/browse, /search),
 * so it works from WSL floors too.
 *
 * Isolation: its own in-memory session (no cookies or logins from the app, none
 * kept), sandboxed renderer, no node, every permission denied, no downloads,
 * no popups, navigation limited to http(s).
 */
import { BrowserWindow, app, session, type Session } from 'electron';
import {
  EXTRACT_PAGE_SCRIPT, EXTRACT_SEARCH_SCRIPT, browseUrlProblem, chromeUserAgent,
  type BrowsedPage
} from '../shared/browsePage';

const LOAD_TIMEOUT_MS = 30_000;
const SETTLE_MS = 1200;
const SLOW_SETTLE_MS = 2500;
// A laptop's worth: each page of a heavy site (TikTok, X, Reddit) took about
// 250 MB while open; five at once took the app from 0.5 to 1.5 GB.
const MAX_PARALLEL = 2;
/** Requests that cost memory and CPU but add no text. */
const SKIPPED = new Set(['image', 'media', 'font', 'object']);

let browserSession: Session | null = null;
let userAgent = '';
let running = 0;
const waiting: Array<() => void> = [];

function setup(): Session {
  if (browserSession) return browserSession;
  const s = session.fromPartition('md-office-browser');
  userAgent = chromeUserAgent(app.userAgentFallback);
  s.setUserAgent(userAgent);
  s.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  s.setPermissionCheckHandler(() => false);
  s.on('will-download', (e) => e.preventDefault());
  s.webRequest.onBeforeRequest((details, cb) => cb({ cancel: SKIPPED.has(details.resourceType) }));
  browserSession = s;
  return s;
}

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  running++;
  try { return await fn(); } finally { running--; waiting.shift()?.(); }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function withPage<T>(url: string, read: (win: BrowserWindow, status: number) => Promise<T>): Promise<T> {
  const ses = setup();
  const win = new BrowserWindow({
    show: false, width: 1280, height: 900,
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, images: false, backgroundThrottling: false, spellcheck: false }
  });
  win.webContents.setAudioMuted(true);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, to) => { if (browseUrlProblem(to)) e.preventDefault(); });
  let status = 0;
  win.webContents.on('did-navigate', (_e, _u, code) => { status = code; });
  try {
    const load = win.loadURL(url, { userAgent }).catch(() => { /* error pages still have text */ });
    await Promise.race([load, sleep(LOAD_TIMEOUT_MS)]);
    await sleep(SETTLE_MS);
    return await read(win, status);
  } finally {
    // Closing the window alone left its renderer process (and the page's
    // memory, ~250 MB on a heavy site) alive for ~25 s; end it now.
    try { if (!win.isDestroyed()) win.webContents.forcefullyCrashRenderer(); } catch { /* already gone */ }
    if (!win.isDestroyed()) win.destroy();
  }
}

/** Open `url` and return its title, final URL, text and links. */
export function browsePage(url: string): Promise<BrowsedPage> {
  const problem = browseUrlProblem(url);
  if (problem) return Promise.reject(new Error(problem));
  return slot(() => withPage(url, async (win, status) => {
    let page = await win.webContents.executeJavaScript(EXTRACT_PAGE_SCRIPT, true) as BrowsedPage;
    // A page that JavaScript is still filling: give it a little longer.
    if ((page.text ?? '').trim().length < 200) {
      await sleep(SLOW_SETTLE_MS);
      page = await win.webContents.executeJavaScript(EXTRACT_PAGE_SCRIPT, true) as BrowsedPage;
    }
    return { ...page, status };
  }));
}

/** Search the web (DuckDuckGo's HTML results) and return the result list. */
export function searchWeb(query: string): Promise<{ results: Array<{ title: string; href: string; snippet: string }>; text: string }> {
  const q = String(query ?? '').trim().slice(0, 400);
  if (!q) return Promise.reject(new Error('a query is required'));
  return slot(() => withPage(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, async (win) =>
    win.webContents.executeJavaScript(EXTRACT_SEARCH_SCRIPT, true)));
}
