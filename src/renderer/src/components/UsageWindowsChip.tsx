import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { untilReset, usageLevel, type RateLimits, type UsageWindow } from '@shared/rateLimits';

const colour = { ok: 'var(--cth-ink-500)', warn: 'var(--cth-status-waiting)', high: 'var(--cth-status-blocked)' } as const;

/**
 * The subscription's usage windows in the title bar: "5h 23% · week 40%".
 * On a Claude subscription these, not dollars, are what runs out. Reported by
 * the agents' status line (shared/rateLimits.ts), so it shows once an agent
 * has answered; hidden for API-key users, who have no windows.
 */
export function UsageWindowsChip(): JSX.Element | null {
  const { t } = useTranslation();
  const [rl, setRl] = useState<RateLimits | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    let live = true;
    void window.cth.rateLimits().then((r) => { if (live && r) setRl(r); }).catch(() => {});
    const off = window.cth.onRateLimits((r) => setRl(r));
    // Re-render each minute so "resets in" stays true between ticks.
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => { live = false; off(); clearInterval(id); };
  }, []);

  if (!rl || (!rl.fiveHour && !rl.sevenDay)) return null;
  const now = Date.now();
  // A window that has reset since the last report is back to 0.
  const shown = (w?: UsageWindow): UsageWindow | undefined =>
    w && w.resetsAt && w.resetsAt <= now ? { pct: 0 } : w;
  const five = shown(rl.fiveHour);
  const week = shown(rl.sevenDay);
  const line = (label: string, w?: UsageWindow): string | null =>
    w ? `${label}: ${Math.round(w.pct)}%${w.resetsAt ? ` · ${t('usage.resetsIn', { time: untilReset(w.resetsAt, now) })}` : ''}` : null;
  const title = [
    t('usage.title'),
    line(t('usage.fiveHour'), five),
    line(t('usage.week'), week),
    line(t('usage.weekOpus'), shown(rl.sevenDayOpus)),
    line(t('usage.weekSonnet'), shown(rl.sevenDaySonnet))
  ].filter(Boolean).join('\n');

  const part = (label: string, w?: UsageWindow) => w && (
    <span style={{ color: colour[usageLevel(w.pct)] }}>{label} {Math.round(w.pct)}%</span>
  );
  return (
    <span
      className="cth-titlebar-nodrag"
      title={title}
      aria-label={title}
      style={{ display: 'inline-flex', gap: 6, fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-500)', whiteSpace: 'nowrap' }}
    >
      {part(t('usage.fiveHourShort'), five)}
      {five && week && <span>·</span>}
      {part(t('usage.weekShort'), week)}
    </span>
  );
}
