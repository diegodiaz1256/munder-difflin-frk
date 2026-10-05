import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import type { MemoryStatus } from '../../../preload/index';

const MODEL_NAME: Record<MemoryStatus['model'], string> = { minilm: 'MiniLM', embeddinggemma: 'EmbeddingGemma' };

/**
 * Settings → Memory & Knowledge: is the embedding model on disk, and the one
 * button that may fetch it. mempalace otherwise runs with the Hugging Face hub
 * offline (main/memory.ts OFFLINE_ENV), so it never goes online by itself.
 */
export function MemoryModelSettings() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<MemoryStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => { void window.cth.memoryStatus().then((s) => { if (alive) setStatus(s); }).catch(() => {}); };
    load();
    const id = setInterval(load, 4000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!status?.available) return null;
  const name = MODEL_NAME[status.model];
  const downloading = busy || status.downloading;

  const download = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await window.cth.memoryDownloadModel();
      // main/memory.ts MEMPALACE_TOO_OLD: it tried updating mempalace itself first.
      const tooOld = r.error?.startsWith('mempalace-too-old');
      setNote(r.ok ? { ok: true, text: t('settings.memory.modelDone') }
        : { ok: false, text: tooOld ? t('settings.memory.modelTooOld', { detail: r.error!.replace('mempalace-too-old', '').trim() }) : t('settings.memory.modelFailed', { error: r.error ?? '' }) });
      setStatus(await window.cth.memoryStatus());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13, lineHeight: '20px', color: 'var(--cth-ink-900)' }}>{t('settings.memory.modelTitle')}</span>
        <span style={{ fontSize: 12, lineHeight: '16px', color: status.modelReady ? 'var(--cth-ink-500)' : 'var(--cth-coral)' }}>
          {downloading ? t('settings.memory.modelDownloading')
            : status.modelReady ? t('settings.memory.modelReady', { model: name }) : t('settings.memory.modelMissing', { model: name })}
        </span>
        <span style={{ fontSize: 11, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>{t('settings.memory.modelOffline')}</span>
        {downloading && <span style={{ fontSize: 11, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>{t('settings.memory.modelDownloadingHint')}</span>}
        {note && <span style={{ fontSize: 12, color: note.ok ? 'var(--cth-mint)' : 'var(--cth-coral)', overflowWrap: 'anywhere' }}>{note.text}</span>}
      </div>
      <PixelButton variant={status.modelReady ? 'secondary' : 'primary'} size="sm" onClick={() => void download()} disabled={downloading}>
        {downloading ? '…' : status.modelReady ? t('settings.memory.modelUpdate') : t('settings.memory.modelDownload')}
      </PixelButton>
    </div>
  );
}
