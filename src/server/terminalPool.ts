/**
 * The server's terminal pool: the same exports the floor's orchestration uses
 * from src/renderer/src/components/terminalPool.ts, on @xterm/headless — a
 * screen buffer per pty with no DOM. The server build aliases the renderer
 * module to this one.
 *
 * Nobody types into a server's terminals, so there is never a user draft or an
 * open picker to protect: automation is safe whenever the process is alive.
 */
import { Terminal } from '@xterm/headless';
import { normalizePtyChunk } from '@/components/terminalRecovery';

export interface TerminalEntry {
  ptyId: string;
  term: Terminal;
  /** Kept for callers that size a respawn off the terminal. */
  fit: { fit: () => void };
  exited: boolean;
  unsub: Array<() => void>;
  onData?: (chunk: string) => void;
}

const COLS = 120;
const ROWS = 40;
const pool = new Map<string, TerminalEntry>();

export function acquireTerminal(ptyId: string): TerminalEntry {
  const existing = pool.get(ptyId);
  if (existing) return existing;
  const term = new Terminal({ cols: COLS, rows: ROWS, scrollback: 5000, allowProposedApi: true });
  const entry: TerminalEntry = { ptyId, term, fit: { fit: () => {} }, exited: false, unsub: [] };
  entry.unsub.push(window.cth.onPtyData(ptyId, (raw: string) => {
    const chunk = normalizePtyChunk(raw);
    if (!chunk) return;
    term.write(chunk);
    entry.onData?.(chunk);
  }));
  entry.unsub.push(window.cth.onPtyExit(ptyId, () => { entry.exited = true; }));
  entry.unsub.push(window.cth.onPtyRelaunch(ptyId, () => { entry.exited = false; term.reset(); }));
  // TUIs ask for the terminal's colours (OSC 10/11) and wait a moment for an
  // answer; a dark terminal is the honest one on a server.
  const reply = (index: 10 | 11, rgb: string) => (data: string): boolean => {
    if (data !== '?' || entry.exited) return data === '?';
    window.cth.writePty(ptyId, `\x1b]${index};rgb:${rgb}\x1b\\`);
    return true;
  };
  term.parser.registerOscHandler(10, reply(10, 'e6e6/e6e6/e6e6'));
  term.parser.registerOscHandler(11, reply(11, '1a1a/1a1a/1a1a'));
  pool.set(ptyId, entry);
  return entry;
}

export function terminalTail(ptyId: string | undefined, max = 3): string[] {
  const entry = ptyId ? pool.get(ptyId) : undefined;
  if (!entry) return [];
  try {
    const buf = entry.term.buffer.active;
    const out: string[] = [];
    const last = buf.baseY + buf.cursorY;
    for (let y = last; y >= 0 && y > last - 200 && out.length < max; y--) {
      const text = buf.getLine(y)?.translateToString(true).trimEnd() ?? '';
      if (text.trim() && !/^[\s─-╿▀-▟>›❯]*$/.test(text)) out.unshift(text);
    }
    return out;
  } catch {
    return [];
  }
}

export function isTerminalAutomationSafe(ptyId: string): boolean {
  return !pool.get(ptyId)?.exited;
}

export function terminalAutomationBlockFor(): null { return null; }
export function hasTerminalDraft(): boolean { return false; }
export function useHasTerminalDraft(): boolean { return false; }
export function clearTerminalDraft(): string { return ''; }
export function dismissTerminalPicker(): void {}
export function notifyThemeChangeAll(): void {}
export function attachTerminal(): void {}
export function detachTerminal(): void {}
export function reflowTerminal(): void {}

export function resetTerminal(ptyId: string, opts: { preserveScrollback?: boolean } = {}): void {
  const entry = pool.get(ptyId);
  if (!entry) return;
  entry.exited = false;
  if (!opts.preserveScrollback) entry.term.reset();
}

export function disposeTerminal(ptyId: string): void {
  const entry = pool.get(ptyId);
  if (!entry) return;
  entry.unsub.forEach((u) => { try { u(); } catch { /* noop */ } });
  try { entry.term.dispose(); } catch { /* noop */ }
  pool.delete(ptyId);
}
