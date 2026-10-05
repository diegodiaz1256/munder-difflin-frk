/**
 * Remote Control's state, read from what Claude Code prints in the
 * orchestrator's terminal: the session link when it is on, a disconnect or
 * failure notice when it is off. The Command Center's cloud button shows it.
 */
export type RemoteControlState =
  | { state: 'on'; url: string }
  | { state: 'off'; reason?: string };

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g;
const URL_RE = /https:\/\/claude\.ai\/code\/session_[A-Za-z0-9]+/g;
const OFF_RE = /Remote Control (?:disconnected|failed|is off)|Session creation failed|Disconnected from Remote Control/gi;

/** The newest Remote Control state in `text` (a chunk plus a little of what
 *  came before it), or null when it says nothing about Remote Control. */
export function detectRemoteControl(text: string): RemoteControlState | null {
  const t = text.replace(ANSI, '');
  const urls = [...t.matchAll(URL_RE)];
  const offs = [...t.matchAll(OFF_RE)];
  const url = urls[urls.length - 1];
  const off = offs[offs.length - 1];
  if (url && (!off || (url.index ?? 0) > (off.index ?? 0))) return { state: 'on', url: url[0] };
  if (off) {
    const reason = /Session creation failed[^\n—]*/i.exec(t.slice(off.index ?? 0))?.[0]?.replace(/\s*[—-]\s*$/, '').trim();
    return { state: 'off', ...(reason ? { reason } : {}) };
  }
  return null;
}
