/**
 * Subscription usage windows (Claude Pro/Max): how much of the 5-hour window
 * and of the week is used, and when each resets. Claude Code hands them to its
 * status line (`rate_limits.five_hour` / `.seven_day`, `used_percentage`,
 * `resets_at`); the agents' status-line shim forwards that payload to the app.
 * On a subscription the dollar cost says little — these windows are the limit.
 * Absent for API-key users, so everything here is optional.
 */

export interface UsageWindow { pct: number; resetsAt?: number }
export interface RateLimits {
  fiveHour?: UsageWindow;
  sevenDay?: UsageWindow;
  /** Per-model weekly caps, when the plan has them. */
  sevenDayOpus?: UsageWindow;
  sevenDaySonnet?: UsageWindow;
  /** When the app last heard it (ms). */
  at: number;
}

/** `resets_at` as epoch ms: Claude sends an ISO 8601 time (older builds: epoch seconds). */
function resetMs(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'string' && v) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : undefined;
  }
  return undefined;
}

function windowOf(v: unknown): UsageWindow | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as { used_percentage?: unknown; resets_at?: unknown };
  if (typeof o.used_percentage !== 'number' || !Number.isFinite(o.used_percentage)) return undefined;
  const pct = Math.max(0, Math.min(100, o.used_percentage));
  const resetsAt = resetMs(o.resets_at);
  return resetsAt ? { pct, resetsAt } : { pct };
}

/** The windows in a status-line payload's `rate_limits`, or null when it has none. */
export function parseRateLimits(raw: unknown, now = Date.now()): RateLimits | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: RateLimits = { at: now };
  const fiveHour = windowOf(r.five_hour);
  const sevenDay = windowOf(r.seven_day);
  const sevenDayOpus = windowOf(r.seven_day_opus);
  const sevenDaySonnet = windowOf(r.seven_day_sonnet);
  if (fiveHour) out.fiveHour = fiveHour;
  if (sevenDay) out.sevenDay = sevenDay;
  if (sevenDayOpus) out.sevenDayOpus = sevenDayOpus;
  if (sevenDaySonnet) out.sevenDaySonnet = sevenDaySonnet;
  return fiveHour || sevenDay || sevenDayOpus || sevenDaySonnet ? out : null;
}

/** "2h 05m", "3d 4h", "12m" until `at`; "now" once it has passed. */
export function untilReset(at: number, now = Date.now()): string {
  const m = Math.round((at - now) / 60000);
  if (m <= 0) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** How close a window is to its limit, for colour. */
export function usageLevel(pct: number): 'ok' | 'warn' | 'high' {
  return pct >= 90 ? 'high' : pct >= 70 ? 'warn' : 'ok';
}
