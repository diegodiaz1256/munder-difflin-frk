/**
 * Keeping what the app adds to agents' context small. Two things repeated
 * without need:
 * - the orchestrator's live roster was injected on EVERY prompt (inbox nudges
 *   included), ~200 tokens with five agents and ~650 with 24, piling up in its
 *   transcript even when nothing had changed;
 * - the hourly standup fired on an idle floor, costing the orchestrator a full
 *   turn to find out that nothing happened.
 */

/** The roster without what changes every minute (last active, tokens, cost,
 *  snapshot age, exact context %). Two rosters with the same signature tell the
 *  orchestrator nothing new. A context above 80% still counts: that is a
 *  routing signal. */
export function rosterSignature(roster: string): string {
  return roster
    .replace(/snapshot [^\]]*\]/g, 'snapshot]')
    .replace(/active \d+[smh] ago/g, 'active')
    .replace(/no activity yet/g, 'active')
    .replace(/\d+k tok/g, '')
    .replace(/\$\d+(?:\.\d+)?/g, '')
    .replace(/ctx (\d+)%/g, (_m, p) => (Number(p) >= 80 ? 'ctx high' : ''))
    .replace(/[ ,]+/g, ' ')
    .trim();
}

/** Log kinds that are the scheduler's own noise or plain bookkeeping, not work. */
const QUIET_KINDS = new Set(['app-start', 'broker-grant', 'mission', 'standup', 'heartbeat']);
const SYSTEM_SENDERS = new Set(['scheduler', 'heartbeat', 'system', 'breaker']);

/** Did anything happen on the floor after `since` (ms)? Reads log.jsonl lines:
 *  any event except the scheduler's own messages and bookkeeping counts. */
export function floorActiveSince(logLines: string[], since: number): boolean {
  for (let i = logLines.length - 1; i >= 0; i--) {
    let e: { ts?: number; kind?: string; from?: string };
    try { e = JSON.parse(logLines[i]); } catch { continue; }
    if (typeof e.ts !== 'number') continue;
    if (e.ts <= since) return false;
    if (QUIET_KINDS.has(e.kind ?? '')) continue;
    if (e.kind === 'message' && SYSTEM_SENDERS.has(e.from ?? '')) continue;
    // god archiving or moving the scheduler's own mail is not work either
    if (e.kind === 'inbox-settled') continue;
    return true;
  }
  return false;
}
