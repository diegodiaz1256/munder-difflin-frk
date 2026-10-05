/**
 * Who the orchestrator has handed work to, read from the hive's message log.
 *
 * A request from the orchestrator to an agent opens a delegation; that
 * agent's next message back (done, inform, a question…) answers it. The
 * Manager's map draws each one: the envelope going out, the agent at work
 * while the orchestrator waits, and the envelope coming back.
 */

export interface LogMessage {
  ts: number;
  kind?: string;
  from?: string;
  to?: string | string[];
  act?: string;
  subject?: string;
}

export type DelegationPhase = 'sent' | 'working' | 'returned';

export interface Delegation {
  agentId: string;
  /** What was asked (the request's subject). */
  subject: string;
  /** What came back, once it has. */
  reply?: string;
  replyAct?: string;
  sentAt: number;
  repliedAt?: number;
  phase: DelegationPhase;
}

/** How long an envelope is shown travelling, out or back. */
export const ENVELOPE_MS = 6_000;
/** How long an answered delegation stays on the map. */
export const RETURNED_SHOWN_MS = 120_000;

const recipients = (to: LogMessage['to']): string[] => (Array.isArray(to) ? to : to ? [to] : []);

/**
 * The delegations worth showing at `now`: open ones, and answered ones for
 * RETURNED_SHOWN_MS after the answer. Newest request first.
 */
export function delegations(log: LogMessage[], godId: string, now: number): Delegation[] {
  const byAgent = new Map<string, Delegation>();
  const msgs = log.filter((m) => m && m.kind === 'message' && typeof m.ts === 'number').sort((a, b) => a.ts - b.ts);
  for (const m of msgs) {
    if (m.from === godId) {
      if (m.act && m.act !== 'request') continue;
      for (const to of recipients(m.to)) {
        if (to === godId || to === 'human' || to === 'broadcast') continue;
        byAgent.set(to, { agentId: to, subject: m.subject ?? '', sentAt: m.ts, phase: 'working' });
      }
    } else if (m.from && recipients(m.to).includes(godId)) {
      const d = byAgent.get(m.from);
      if (d && d.repliedAt === undefined && m.ts >= d.sentAt) {
        d.repliedAt = m.ts;
        d.reply = m.subject ?? '';
        d.replyAct = m.act;
      }
    }
  }
  const out: Delegation[] = [];
  for (const d of byAgent.values()) {
    if (d.repliedAt !== undefined) {
      if (now - d.repliedAt > RETURNED_SHOWN_MS) continue;
      d.phase = 'returned';
    } else {
      d.phase = now - d.sentAt < ENVELOPE_MS ? 'sent' : 'working';
    }
    out.push(d);
  }
  return out.sort((a, b) => b.sentAt - a.sentAt);
}

/** True while an envelope should be drawn moving back to the orchestrator. */
export function envelopeReturning(d: Delegation, now: number): boolean {
  return d.phase === 'returned' && d.repliedAt !== undefined && now - d.repliedAt < ENVELOPE_MS;
}
