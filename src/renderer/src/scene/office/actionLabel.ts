/**
 * An agent's `action` in the app language. The hive and the terminal parser
 * write short English markers ("using Read", "idle", "heading to kitchen");
 * the bubbles, cards and tiles show them through this. Anything else (an
 * agent's own words, a prompt) passes through untouched.
 */
type T = (key: string, opts?: Record<string, unknown>) => string;

const FIXED: Record<string, string> = {
  'running the floor': 'runningFloor',
  'compacting context': 'compacting',
  resumed: 'resumed',
  thinking: 'thinking',
  idle: 'idle',
  'reading inbox': 'readingInbox',
  'starting up': 'startingUp',
  'revived after sleep': 'revived',
  awaiting: 'awaiting',
  'waiting on you': 'waitingOnYou',
  'waiting on god': 'waitingOnGod',
  'heading back to desk': 'backToDesk',
  'reconnecting…': 'reconnecting'
};

export function actionLabel(action: string, t: T): string {
  const a = action.trim();
  const key = FIXED[a];
  if (key) return t(`office.act.${key}`);
  let m = /^using (.+)$/.exec(a);
  if (m) return t('office.act.using', { tool: m[1] });
  m = /^heading to (.+)$/.exec(a);
  if (m) return t('office.act.headingTo', { place: m[1] });
  return action;
}

/** What a restored agent says before its first event (store.loadPersistedAgents). */
export const RECONNECTING = 'reconnecting…';

/**
 * A restored agent whose terminal is live again, but idle, sends no event that
 * would replace "reconnecting…", so the bubble kept saying it for good. Once
 * its PTY is listed, it is back: what it says then, or null to leave it.
 */
export function reconnectedAction(action: string, isGod: boolean | undefined, ptyLive: boolean): string | null {
  if (action !== RECONNECTING || !ptyLive) return null;
  return isGod ? 'running the floor' : 'idle';
}
