import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import type { FreezeEntry } from '../../../preload/index';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Settings → General: the freezes the app wrote down by itself (main/freezeLog.ts).
 * How many in the last day, the latest few with what caused them, and the file
 * to attach when reporting one.
 */
export function FreezeLogSection({ headStyle }: { headStyle: CSSProperties }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<FreezeEntry[] | null>(null);
  useEffect(() => { void window.cth.freezes().then(setEntries).catch(() => setEntries([])); }, []);

  const day = (entries ?? []).filter((e) => Date.now() - Date.parse(e.at) < DAY_MS);
  const worst = day.reduce((m, e) => Math.max(m, e.ms), 0);
  const cause = (e: FreezeEntry): string => e.where === 'renderer'
    ? t('settings.freezes.inWindow', { screen: e.screen ?? '?' })
    : e.during?.[0] ? `${e.during[0].label}${e.during[0].times ? ` ×${e.during[0].times}` : ''} (${e.during[0].ms} ms)` : t('settings.freezes.unknown');

  return (
    <div>
      <div style={headStyle}>{t('settings.freezes.title')}</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13, lineHeight: '20px' }}>
        <span style={{ flex: 1, color: 'var(--cth-ink-900)' }}>
          {entries === null ? '…' : day.length === 0 ? t('settings.freezes.none')
            : t('settings.freezes.count', { count: day.length, worst })}
        </span>
        <PixelButton variant="secondary" size="sm" onClick={() => void window.cth.openFreezeLog()}>{t('settings.freezes.open')}</PixelButton>
      </div>
      {day.length > 0 && (
        <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {day.slice(0, 5).map((e, i) => (
            <li key={i} style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--cth-ink-700)' }}>
              <span style={{ fontFamily: 'var(--cth-font-mono)', flexShrink: 0 }}>{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span style={{ flexShrink: 0, fontWeight: 600 }}>{e.ms} ms</span>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cause(e)}>{cause(e)}</span>
            </li>
          ))}
        </ul>
      )}
      <div style={{ fontSize: 11, color: 'var(--cth-ink-500)', marginTop: 6 }}>{t('settings.freezes.hint')}</div>
    </div>
  );
}
