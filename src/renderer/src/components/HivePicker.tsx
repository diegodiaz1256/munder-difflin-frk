import { useEffect, useState } from 'react';
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
  const current = config.harnessHome;
  const recents = (config.recentHives ?? []).filter((h) => h && h !== current);
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
        setError(res.error ?? 'Could not open that folder.');
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
        <PixelPanel variant="dialog" title="SELECT A HARNESS CONFIG" noPadding>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 12, lineHeight: '19px', color: 'var(--cth-ink-700)' }}>
              A <strong>harness config</strong> is the folder where the app keeps everything for one
              workspace — its settings, your agents and their memory, tasks, triggers, and history.
              Each config is separate and self-contained, so you can run different setups side by side.
              Open the one you were working in, switch to another, or start a new one.
            </p>

            {/* CURRENT — the last-used home, the one-click default. */}
            {current && (
              <div>
                <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 9, color: 'var(--cth-ink-500)', marginBottom: 4 }}>
                  CURRENT
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
                    open
                  </PixelButton>
                </div>
              </div>
            )}

            {/* RECENTS — other homes this install has opened before. */}
            {recents.length > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 9, color: 'var(--cth-ink-500)', marginBottom: 4 }}>
                  RECENT
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {recents.map((h) => (
                    <button
                      key={h}
                      onClick={() => openHive(h)}
                      disabled={!!busy}
                      title={`Switch to ${h} (reloads the app)`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                        border: 'none', cursor: busy ? 'default' : 'pointer', textAlign: 'left',
                        opacity: busy && busy !== h ? 0.5 : 1
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
                        {busy === h ? 'opening…' : 'switch →'}
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
                Opening {folderName(busy)} — the app will reload…
              </div>
            )}

            {/* OPEN / CREATE — both browse to a folder; "fresh" mode re-points at it
                (bootstrapping an empty one, or reusing existing hive data in place). */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <PixelButton variant="secondary" size="md" onClick={browse} disabled={!!busy}>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <Icon name="folder" /> open existing config…
                </span>
              </PixelButton>
              <PixelButton variant="secondary" size="md" onClick={isWindows ? () => setCreating(true) : browse} disabled={!!busy}>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <Icon name="plus" /> create new config…
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
  const [where, setWhere] = useState<'windows' | 'wsl'>('windows');
  const [distros, setDistros] = useState<string[] | null>(null);
  const [wslError, setWslError] = useState<string | null>(null);
  const [mirrored, setMirrored] = useState(true);
  const [distro, setDistro] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void window.cth.wslDistros().then((r) => {
      setDistros(r.distros);
      setMirrored(r.mirrored !== false);
      if (!r.ok || !r.distros.length) setWslError(r.error ?? 'No WSL distribution is installed.');
      else setDistro(r.distros[0]);
    });
  }, []);
  const create = async () => {
    onError(undefined);
    setBusy(true);
    const r = await window.cth.wslCreateOffice(distro, name);
    setBusy(false);
    if (r.ok && r.path) onCreated(r.path); else onError(r.error ?? 'Could not create it.');
  };
  const label = { fontFamily: 'var(--cth-font-display)', fontSize: 9, color: 'var(--cth-ink-500)' } as const;
  return (
    <div style={{ padding: 12, background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-300)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={label}>NEW CONFIG · WHERE DOES IT RUN?</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['windows', 'wsl'] as const).map((w) => (
          <button key={w} onClick={() => setWhere(w)} style={{
            flex: 1, padding: '8px 10px', textAlign: 'left', border: 'none', cursor: 'pointer',
            background: where === w ? 'var(--cth-mint-light)' : 'var(--cth-cream-100)',
            boxShadow: `inset 0 0 0 2px ${where === w ? 'var(--cth-mint)' : 'var(--cth-ink-100)'}`
          }}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{w === 'windows' ? 'Windows' : 'WSL (Linux)'}</div>
            <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>
              {w === 'windows' ? 'Agents run on Windows, in a folder you pick.' : 'Agents, git and tools run inside a Linux distribution.'}
            </div>
          </button>
        ))}
      </div>
      {where === 'wsl' && (
        distros === null ? <div style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>Looking for WSL…</div>
        : wslError ? (
          <div style={{ fontSize: 12, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>
            {wslError}<br />
            Install it from an administrator PowerShell with <code>wsl --install -d Ubuntu</code> (virtualization must be on in the BIOS), then come back.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={distro} onChange={(e) => setDistro(e.target.value)} style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 12 }}>
                {distros.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name, e.g. shop"
                style={{ flex: 1, fontFamily: 'var(--cth-font-mono)', fontSize: 12, padding: '4px 6px' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>Created as <code>~/offices/{name.trim() || 'name'}</code> in {distro}.</div>
            {!mirrored && (
              <div style={{ fontSize: 11, lineHeight: '16px', color: 'var(--cth-ink-700)', background: 'var(--cth-lemon-light)', padding: '4px 6px' }}>
                Agents in WSL report back to the app over localhost, which needs WSL's mirrored networking:
                add <code>networkingMode=mirrored</code> under <code>[wsl2]</code> in <code>%UserProfile%\.wslconfig</code>, then run <code>wsl --shutdown</code>.
              </div>
            )}
          </div>
        )
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <PixelButton variant="secondary" size="md" onClick={onCancel}>cancel</PixelButton>
        {where === 'windows'
          ? <PixelButton variant="primary" size="md" onClick={onWindows}>pick a folder…</PixelButton>
          : <PixelButton variant="primary" size="md" onClick={() => void create()} disabled={busy || !!wslError || !distro || !name.trim()}>{busy ? 'creating…' : 'create in WSL'}</PixelButton>}
      </div>
    </div>
  );
}
