import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/** A dismissible step-by-step guide at the top of a Pro screen. Open the first
 *  time; once closed it stays closed for this viewer (a per-viewer nicety, so
 *  localStorage), and the screen's "How it works" button brings it back. */
export function useGuide(key: string): [boolean, () => void] {
  const [open, setOpen] = useState<boolean>(() => {
    try { return window.localStorage.getItem(key) !== 'hidden'; } catch { return true; }
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { window.localStorage.setItem(key, next ? 'shown' : 'hidden'); } catch { /* storage unavailable */ }
  };
  return [open, toggle];
}

export function Guide({ title, steps, footer, onClose }: {
  title: string;
  steps: Array<[string, string]>;
  footer?: React.ReactNode;
  /** Omit for a guide that is always shown (no "Got it"). */
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderColor: 'var(--cth-lemon)' }}>
      <div className="pro-row">
        <strong style={{ fontSize: 14 }}>{title}</strong>
        {onClose && <button className="pro-btn" style={{ marginInlineStart: 'auto' }} onClick={onClose}>{t('updateBadge.gotIt')}</button>}
      </div>
      <ol style={{ margin: 0, paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map(([head, body]) => (
          <li key={head} style={{ fontSize: 13 }}>
            <strong>{head}.</strong> <span className="pro-text">{body}</span>
          </li>
        ))}
      </ol>
      {footer && <div className="pro-sub" style={{ fontSize: 12 }}>{footer}</div>}
    </section>
  );
}
