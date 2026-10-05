import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store/store';
import { PixelButton } from './PixelButton';
import { downloadWhisper, removeWhisper } from '@/freeflow/localWhisper';

/**
 * Where dictation is transcribed: on this computer (Whisper small, offline
 * once downloaded) or by Groq (online, needs a key). Entirely optional:
 * nothing is downloaded until the button is pressed, what it costs is said
 * before, and it can be deleted again.
 */
export function LocalWhisperSettings({ engine, onEngine, selectStyle }: {
  engine: 'groq' | 'local';
  onEngine: (e: 'groq' | 'local') => void;
  selectStyle: CSSProperties;
}): JSX.Element {
  const { t } = useTranslation();
  const [status, setStatus] = useState<{ small: boolean; bytes: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const refresh = () => { void window.cth.whisperStatus().then(setStatus).catch(() => {}); };
  useEffect(refresh, []);

  const pick = (v: 'groq' | 'local') => {
    onEngine(v);
    void window.cth.freeflowSetConfig({ engine: v, localModel: 'small' });
    if (v === 'local') useStore.getState().setHasGroqKey(true);
  };
  const download = async () => {
    setBusy(true); setNote(null); setProgress(null);
    // transformers.js reports per file; show the running total across files.
    const files = new Map<string, { loaded: number; total: number }>();
    const r = await downloadWhisper('small', (p) => {
      files.set(p.file ?? '', { loaded: p.loaded, total: p.total });
      let loaded = 0; let total = 0;
      for (const f of files.values()) { loaded += f.loaded; total += f.total; }
      setProgress({ loaded, total });
    });
    setBusy(false); setProgress(null);
    setNote(r.ok ? t('settings.voice.localReady') : t('settings.voice.localFailed', { error: r.error ?? '?' }));
    refresh();
  };
  const remove = async () => {
    if (!(await window.cth.confirm(t('settings.voice.localDeleteConfirm'), { ok: t('common.delete') }))) return;
    await removeWhisper();
    setNote(null);
    refresh();
  };
  const ready = status?.small ?? false;
  const mb = (n: number) => `${Math.round(n / 1e6)} MB`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 320 }}>
        <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{t('settings.voice.engine')}</span>
        <select value={engine} style={selectStyle} onChange={(e) => pick(e.target.value as 'groq' | 'local')}>
          <option value="groq">{t('settings.voice.engineGroq')}</option>
          <option value="local">{t('settings.voice.engineLocal')}</option>
        </select>
      </label>
      {engine === 'local' && (
        <>
          <div style={{ fontSize: 12, lineHeight: '17px', color: 'var(--cth-ink-700)', background: 'var(--cth-cream-200)', padding: '8px 10px' }}>
            <strong>{t('settings.voice.localResourcesTitle')}</strong>
            <ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>
              <li>{t('settings.voice.localResDisk')}</li>
              <li>{t('settings.voice.localResRam')}</li>
              <li>{t('settings.voice.localResGpu')}</li>
              <li>{t('settings.voice.localResFirst')}</li>
            </ul>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: ready ? 'var(--cth-ink-700)' : 'var(--cth-status-waiting)' }}>
              {ready ? t('settings.voice.localOnDisk', { size: mb(status?.bytes ?? 0) }) : t('settings.voice.localMissing')}
            </span>
            {!ready && (
              <PixelButton variant="primary" size="sm" disabled={busy} onClick={() => void download()}>
                {busy ? t('settings.voice.localDownloading') : t('settings.voice.localDownload')}
              </PixelButton>
            )}
            {ready && <PixelButton variant="ghost" size="sm" disabled={busy} onClick={() => void remove()}>{t('settings.voice.localDelete')}</PixelButton>}
            {progress && progress.total > 0 && (
              <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{mb(progress.loaded)} / {mb(progress.total)}</span>
            )}
            {note && <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{note}</span>}
          </div>
          <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>{t('settings.voice.localHint')}</span>
        </>
      )}
    </div>
  );
}
