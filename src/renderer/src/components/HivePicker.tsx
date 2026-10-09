import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { Icon } from './Icon';
import type { HarnessConfig } from '@/store/config';

export interface HivePickerProps {
  config: HarnessConfig;
  /** Open the CURRENT harness home in-place (no relaunch). */
  onOpenCurrent: () => void;
}

// Set right before a hive SWITCH so App skips this picker once after the relaunch
// changeHome triggers — otherwise the user would land back on the picker for the
// hive they just chose. App.tsx reads + clears it on mount.
const SKIP_KEY = 'cth.skipHivePickerOnce';

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** "Ubuntu" for a floor that lives in WSL, else null (main/wsl.ts decides the same way). */
function wslDistro(path: string): string | null {
  return /^[\\/]{2}(?:wsl\.localhost|wsl\$)[\\/]([^\\/]+)/i.exec(path)?.[1] ?? null;
}

function RunsOn({ path }: { path: string }) {
  const d = wslDistro(path);
  return (
    <span style={{
      fontFamily: 'var(--cth-font-mono)', fontSize: 10, padding: '1px 5px', flexShrink: 0,
      background: d ? 'var(--cth-lilac-light)' : 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
    }}>{d ? `WSL · ${d}` : 'Windows'}</span>
  );
}

/**
 * HivePicker — the launch-time workspace selector. A "hive" is a harness home
 * folder: its own agents, memory, tasks, and history. On reopen the user can open
 * the hive they were in (fast, in-place), jump to a recent one, browse to an
 * existing folder, or start a new one. Switching to a DIFFERENT home goes through
 * changeHome('fresh'), which tears down services and relaunches against it — so
 * every switch is a clean process restart (cheap here, before any work is live).
 */
export function HivePicker({ config, onOpenCurrent }: HivePickerProps) {
  const { t } = useTranslation();
  const current = config.harnessHome;
  const recents = (config.recentHives ?? []).filter((h) => h && h !== current);
  // Offices another floor is running right now: shown, but not openable here.
  const [inUse, setInUse] = useState<string[]>([]);
  useEffect(() => {
    if (!recents.length) return;
    void window.cth.officesInUse(recents).then(setInUse).catch(() => {});
  }, [recents.join('|')]);
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const isWindows = window.cth.platform === 'win32';
  const [creating, setCreating] = useState(false);

  // Open a hive. Same folder as the current one → just enter it (no relaunch).
  // A different folder → changeHome('fresh') re-points + relaunches the process.
  const openHive = async (path: string) => {
    if (!path) return;
    if (current && path === current) { onOpenCurrent(); return; }
    setError(undefined);
    setBusy(path);
    try {
      window.localStorage.setItem(SKIP_KEY, '1');
      const res = await window.cth.changeHome(path, 'fresh');
      // Success never returns (the process relaunches). A return means an error.
      if (!res.ok) {
        window.localStorage.removeItem(SKIP_KEY);
        setError(res.error ?? t('hivePicker.couldNotOpen'));
        setBusy(undefined);
      }
    } catch (e) {
      window.localStorage.removeItem(SKIP_KEY);
      setError(e instanceof Error ? e.message : String(e));
      setBusy(undefined);
    }
  };

  const browse = async () => {
    setError(undefined);
    const res = await window.cth.chooseFolder();
    if (res.ok) void openHive(res.path);
    else if (res.error !== 'cancelled') setError(res.error);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--cth-cream-200)',
      backgroundImage:
        `repeating-linear-gradient(45deg, rgba(232, 217, 160, 0.4) 0 1px, transparent 1px 8px)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200,
      padding: 32
    }}>
      <div style={{ width: 560, maxWidth: '94vw' }}>
        <PixelPanel variant="dialog" title={t('hivePicker.title')} noPadding>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 12, lineHeight: '19px', color: 'var(--cth-ink-700)' }}>
              <span dangerouslySetInnerHTML={{ __html: t('hivePicker.intro') }} />
            </p>

            {/* CURRENT — the last-used home, the one-click default. */}
            {current && (
              <div>
                <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 9, color: 'var(--cth-ink-500)', marginBottom: 4 }}>
                  {t('hivePicker.current')}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  background: 'var(--cth-mint-light)', boxShadow: 'inset 0 0 0 2px var(--cth-mint)'
                }}>
                  <Icon name="folder" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 11, lineHeight: '15px', display: 'flex', gap: 6, alignItems: 'center' }}>
                      {folderName(current)} {isWindows && <RunsOn path={current} />}
                    </div>
                    <div style={{
                      fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-500)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', direction: 'rtl', textAlign: 'left'
                    }}>{current}</div>
                  </div>
                  <PixelButton variant="primary" size="md" onClick={onOpenCurrent} disabled={!!busy}>
                    {t('hivePicker.open')}
                  </PixelButton>
                </div>
              </div>
            )}

            {/* RECENTS — other homes this install has opened before. */}
            {recents.length > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 9, color: 'var(--cth-ink-500)', marginBottom: 4 }}>
                  {t('hivePicker.recent')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {recents.map((h) => (
                    <button
                      key={h}
                      onClick={() => openHive(h)}
                      disabled={!!busy || inUse.includes(h)}
                      title={inUse.includes(h) ? t('hivePicker.inUseTitle') : t('hivePicker.switchTitle', { path: h })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                        border: 'none', cursor: busy || inUse.includes(h) ? 'default' : 'pointer', textAlign: 'left',
                        opacity: (busy && busy !== h) || inUse.includes(h) ? 0.5 : 1
                      }}
                    >
                      <Icon name="folder" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--cth-ink-900)', display: 'flex', gap: 6, alignItems: 'center' }}>
                          {folderName(h)} {isWindows && <RunsOn path={h} />}
                        </div>
                        <div style={{
                          fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-500)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', direction: 'rtl', textAlign: 'left'
                        }}>{h}</div>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--cth-ink-500)', flexShrink: 0 }}>
                        {busy === h ? t('hivePicker.opening') : inUse.includes(h) ? t('hivePicker.inUse') : t('hivePicker.switch')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {creating && <NewOffice onCancel={() => setCreating(false)} onWindows={() => { setCreating(false); void browse(); }}
              onCreated={(p) => { setCreating(false); void openHive(p); }} onError={setError} />}

            {error && (
              <div style={{
                padding: '6px 10px', background: 'var(--cth-coral-light)',
                boxShadow: 'inset 0 0 0 1px var(--cth-coral)', fontSize: 12, color: 'var(--cth-ink-900)'
              }}>{error}</div>
            )}

            {busy && (
              <div style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>
                {t('hivePicker.reloading', { name: folderName(busy) })}
              </div>
            )}

            {/* OPEN / CREATE — both browse to a folder; "fresh" mode re-points at it
                (bootstrapping an empty one, or reusing existing hive data in place). */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <PixelButton variant="secondary" size="md" onClick={browse} disabled={!!busy}>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <Icon name="folder" /> {t('hivePicker.openExisting')}
                </span>
              </PixelButton>
              <PixelButton variant="secondary" size="md" onClick={isWindows ? () => setCreating(true) : browse} disabled={!!busy}>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <Icon name="plus" /> {t('hivePicker.createNew')}
                </span>
              </PixelButton>
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

/** New floor: where it runs is chosen here. On Windows a folder is picked as
 *  before; in WSL the floor is created as ~/offices/<name> inside the distro,
 *  where its agents, git and tools will run. */
function NewOffice({ onCancel, onWindows, onCreated, onError }: {
  onCancel: () => void; onWindows: () => void; onCreated: (path: string) => void; onError: (e: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const [where, setWhere] = useState<'windows' | 'wsl'>('windows');
  const [distros, setDistros] = useState<string[] | null>(null);
  const [wslError, setWslError] = useState<string | null>(null);
  const [distro, setDistro] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void window.cth.wslDistros().then((r) => {
      setDistros(r.distros);
      if (!r.ok || !r.distros.length) setWslError(r.error ?? t('hivePicker.noDistro'));
      else setDistro(r.distros[0]);
    });
  }, []);
  const create = async () => {
    onError(undefined);
    setBusy(true);
    const r = await window.cth.wslCreateOffice(distro, name);
    setBusy(false);
    if (r.ok && r.path) onCreated(r.path); else onError(r.error ?? t('hivePicker.couldNotCreate'));
  };
  const label = { fontFamily: 'var(--cth-font-display)', fontSize: 9, color: 'var(--cth-ink-500)' } as const;
  return (
    <div style={{ padding: 12, background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-300)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={label}>{t('hivePicker.newWhere')}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['windows', 'wsl'] as const).map((w) => (
          <button key={w} onClick={() => setWhere(w)} style={{
            flex: 1, padding: '8px 10px', textAlign: 'left', border: 'none', cursor: 'pointer',
            background: where === w ? 'var(--cth-mint-light)' : 'var(--cth-cream-100)',
            boxShadow: `inset 0 0 0 2px ${where === w ? 'var(--cth-mint)' : 'var(--cth-ink-100)'}`
          }}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{w === 'windows' ? 'Windows' : 'WSL (Linux)'}</div>
            <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>
              {w === 'windows' ? t('hivePicker.windowsDesc') : t('hivePicker.wslDesc')}
            </div>
          </button>
        ))}
      </div>
      {where === 'wsl' && (
        distros === null ? <div style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{t('hivePicker.lookingForWsl')}</div>
        : wslError ? (
          <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>
            {wslError}<br />
            <span dangerouslySetInnerHTML={{ __html: t('hivePicker.installWsl') }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={distro} onChange={(e) => setDistro(e.target.value)} style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 12 }}>
                {distros.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('hivePicker.namePlaceholder')}
                style={{ flex: 1, fontFamily: 'var(--cth-font-mono)', fontSize: 12, padding: '4px 6px' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{t('hivePicker.createdAs', { name: name.trim() || t('hivePicker.name'), distro })}</div>
          </div>
        )
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <PixelButton variant="secondary" size="md" onClick={onCancel}>{t('common.cancel')}</PixelButton>
        {where === 'windows'
          ? <PixelButton variant="primary" size="md" onClick={onWindows}>{t('hivePicker.pickFolder')}</PixelButton>
          : <PixelButton variant="primary" size="md" onClick={() => void create()} disabled={busy || !!wslError || !distro || !name.trim()}>{busy ? t('hivePicker.creating') : t('hivePicker.createInWsl')}</PixelButton>}
      </div>
    </div>
  );
}
