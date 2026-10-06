import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store/store';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { officeStarting } from './bootState';

const GOD_PTY = 'pty-god';
/** Stop asking after this: a terminal that never prints is not "starting". */
const GIVE_UP_MS = 120_000;

/**
 * The Floor view says when the office is starting (and when the orchestrator
 * failed to); the Manager view showed Michael as "idle" and nothing else while
 * his terminal was still coming up, so the app looked frozen. Shown on top of
 * every Manager page until his terminal has printed something.
 */
export function BootBanner() {
  const { t } = useTranslation();
  const godStatus = useStore((s) => s.godStatus);
  const godError = useStore((s) => s.godError);
  const name = useResolvedGodName();
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    if (printed) return;
    const started = Date.now();
    let stop = false;
    const tick = async (): Promise<void> => {
      const list = await window.cth.listPtys().catch(() => []);
      if (stop) return;
      if (list.some((p) => p.id === GOD_PTY && p.hasOutput) || Date.now() - started > GIVE_UP_MS) { setPrinted(true); return; }
      setTimeout(() => { void tick(); }, 1000);
    };
    void tick();
    return () => { stop = true; };
  }, [printed]);

  if (godStatus === 'failed' && godError) {
    return (
      <div role="alert" className="pro-card" style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '16px 22px 0', boxShadow: 'inset 0 0 0 1.5px var(--cth-coral)', background: 'var(--cth-coral-light)' }}>
        <span style={{ flex: 1, minWidth: 0 }}><strong>{t('app.godFailed')}</strong> {godError}</span>
        <button className="pro-btn pro-btn-primary" onClick={() => window.location.reload()}>{t('app.godRetry')}</button>
      </div>
    );
  }
  if (!officeStarting(godStatus, printed)) return null;
  return (
    <div role="status" className="pro-card" style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '16px 22px 0' }}>
      <span style={{ display: 'inline-flex', gap: 4 }} aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 8, height: 8, background: 'var(--cth-status-working)', animation: 'cth-blink 1s steps(1, end) infinite', animationDelay: `${i * 0.2}s` }} />
        ))}
      </span>
      <span><strong>{t('pro.boot.title')}</strong> {t('pro.boot.body', { name })}</span>
    </div>
  );
}
