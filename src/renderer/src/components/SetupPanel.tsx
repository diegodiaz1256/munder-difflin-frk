/**
 * PREREQUISITES — the external tools this app needs, and whether you have them.
 *
 * Several of the harness's best features are thin wrappers over tools that live
 * OUTSIDE the app bundle: mempalace for semantic memory, uv to install it, git
 * for worktrees, one CLI per agent engine. Every one of them degrades silently
 * when missing — which is the right runtime behaviour and a terrible diagnostic
 * one, because "off" and "broken" look identical from the floor. This page is the
 * single place that distinguishes them, and the only place that says what each
 * tool actually buys you.
 *
 * The primary action delegates rather than executes: installing software touches
 * the user's machine and can need a password, so the button SEEDS Michael's
 * dispatch box with an exact, verified-by-him contract instead of shelling out
 * from the renderer. The user still presses dispatch. That keeps a real
 * confirmation step in front of anything that writes outside the app.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { Icon } from './Icon';
import { useStore } from '@/store/store';
import { setupPrompt, type ToolStatus, type ToolKind } from '../../../shared/toolCatalog';

const SECTIONS: { kind: ToolKind; titleKey: string; blurbKey: string }[] = [
  { kind: 'prerequisite', titleKey: 'setupPanel.sections.prerequisites.title', blurbKey: 'setupPanel.sections.prerequisites.blurb' },
  { kind: 'memory', titleKey: 'setupPanel.sections.memory.title', blurbKey: 'setupPanel.sections.memory.blurb' },
  { kind: 'engine', titleKey: 'setupPanel.sections.engine.title', blurbKey: 'setupPanel.sections.engine.blurb' }
];

function StatusChip({ tool }: { tool: ToolStatus }) {
  const { t } = useTranslation();
  const ready = tool.found;
  return (
    <span style={{
      fontFamily: 'var(--cth-font-display)', fontSize: 9, letterSpacing: 0.5,
      padding: '2px 6px', flexShrink: 0, whiteSpace: 'nowrap',
      background: ready ? 'var(--cth-mint-light)' : 'var(--cth-cream-200)',
      boxShadow: `inset 0 0 0 1px ${ready ? 'var(--cth-mint)' : 'var(--cth-ink-300)'}`,
      color: 'var(--cth-ink-900)'
    }}>
      {ready ? t('setupPanel.statusReady') : tool.essential ? t('setupPanel.statusMissing') : t('setupPanel.statusNotSetUp')}
    </span>
  );
}

function ToolRow({ tool, onChanged }: { tool: ToolStatus; onChanged?: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(tool.installCommand).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1200); },
      () => { /* clipboard denied — the text is on screen to select by hand */ }
    );
  };
  return (
    <div style={{
      padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
      background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 11, flex: 1, minWidth: 0 }}>
          {tool.label.toUpperCase()}
        </span>
        {tool.essential && !tool.found && (
          <span style={{ fontSize: 10, color: 'var(--cth-ink-500)', flexShrink: 0 }}>{t('setupPanel.recommended')}</span>
        )}
        <StatusChip tool={tool} />
      </div>

      <div style={{ fontSize: 12, color: 'var(--cth-ink-700)', lineHeight: 1.5 }}>{tool.why}</div>

      {/* Found: show WHERE, so a "ready" claim is verifiable rather than trusted. */}
      {tool.found && tool.path && (
        <div style={{
          fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-500)',
          wordBreak: 'break-all'
        }}>
          {tool.path}{tool.detail ? ` · ${tool.detail}` : ''}
        </div>
      )}

      {/* Missing WITH a scripted install: the exact command, one click to copy. */}
      {!tool.found && tool.installCommand && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
          <code style={{
            flex: 1, minWidth: 0, fontFamily: 'var(--cth-font-mono)', fontSize: 11,
            padding: '4px 6px', background: 'var(--cth-cream-100)',
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
            color: 'var(--cth-ink-900)', overflowX: 'auto', whiteSpace: 'pre'
          }}>{tool.installCommand}</code>
          <button
            onClick={copy}
            style={{
              flexShrink: 0, fontFamily: 'var(--cth-font-ui)', fontSize: 11, padding: '0 8px',
              background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
              border: 'none', cursor: 'pointer', color: 'var(--cth-ink-900)'
            }}
          >{copied ? t('common.copy') + ' ✓' : t('common.copy')}</button>
        </div>
      )}

      {tool.managed === 'fortress' && <FortressControls onInstalledChange={onChanged} />}

      {(tool.note || tool.docsUrl) && (
        <div style={{ fontSize: 11, color: 'var(--cth-ink-500)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tool.note && <span>{tool.note}</span>}
          {tool.docsUrl && (
            <a
              href={tool.docsUrl}
              onClick={(e) => { e.preventDefault(); void window.cth.openExternal(tool.docsUrl!); }}
              style={{ color: 'var(--cth-ink-700)' }}
            >{t('setupPanel.docs')}</a>
          )}
        </div>
      )}
    </div>
  );
}

type FortressView = Awaited<ReturnType<typeof window.cth.fortressStatus>>;

const btn: React.CSSProperties = {
  flexShrink: 0, fontFamily: 'var(--cth-font-ui)', fontSize: 11, padding: '3px 8px',
  background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
  border: 'none', cursor: 'pointer', color: 'var(--cth-ink-900)'
};

/**
 * Fortress's own controls: the app downloads and verifies it, the user signs in
 * with their own account (Fortress's device flow, in their browser), and a
 * switch makes it the office browser's engine. Polls while something runs.
 */
function FortressControls({ onInstalledChange }: { onInstalledChange?: () => void }) {
  const { t } = useTranslation();
  const [st, setSt] = useState<FortressView | null>(null);
  // The row's READY / NOT SET UP chip comes from the panel's list: reload it
  // when an install finishes or a removal lands here.
  const installed = st?.installed;
  const seen = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (installed === undefined) return;
    if (seen.current !== undefined && seen.current !== installed) onInstalledChange?.();
    seen.current = installed;
  }, [installed, onInstalledChange]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setSt(await window.cth.fortressStatus()); } catch { /* keep last */ } }, []);
  useEffect(() => { void load(); }, [load]);
  const busy = !!st && (['downloading', 'verifying', 'extracting'].includes(st.installing.state) || st.activation.state === 'waiting');
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => { void load(); }, 1500);
    return () => clearInterval(id);
  }, [busy, load]);
  if (!st) return null;
  if (!st.supported) return <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{t('fortress.unsupported')}</div>;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    const r = await fn();
    if (!r.ok && r.error) setError(r.error);
    void load();
  };
  const licensed = st.license?.licensed && st.license.mode === 'v3';
  const inst = st.installing;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--cth-ink-700)' }}>
      {!st.installed && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {inst.state === 'idle' || inst.state === 'failed'
            ? <button style={btn} onClick={() => void run(window.cth.fortressInstall)}>{t('fortress.install')}</button>
            : <span>{t(`fortress.state_${inst.state}`, { percent: inst.percent ?? 0 })}</span>}
          <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{t('fortress.installNote')}</span>
        </div>
      )}
      {st.installed && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{licensed ? t('fortress.licensed') : t('fortress.notLicensed')}</span>
            {!licensed && st.activation.state !== 'waiting' && st.activator && (
              <button style={btn} onClick={() => void run(window.cth.fortressActivate)}>{t('fortress.signIn')}</button>
            )}
            {!st.activator && !licensed && <span style={{ color: 'var(--cth-ink-500)' }}>{t(window.cth.platform === 'win32' ? 'fortress.needsUvWindows' : 'fortress.needsUv')}</span>}
            <button style={btn} onClick={() => { void window.cth.fortressRefreshLicense().then(() => load()); }}>{t('fortress.check')}</button>
            {licensed && <button style={btn} title={t('fortress.renewTip')} onClick={() => void run(() => window.cth.fortressLicense('refresh'))}>{t('fortress.renew')}</button>}
            {licensed && <button style={btn} onClick={() => void run(() => window.cth.fortressLicense('logout'))}>{t('fortress.signOut')}</button>}
          </div>
          {st.activation.state === 'waiting' && st.activation.url && (
            <div style={{ padding: 6, background: 'var(--cth-lemon-light)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)' }}>
              {t('fortress.approveHint')}{' '}
              <a href={st.activation.url} onClick={(e) => { e.preventDefault(); void window.cth.openExternal(st.activation.url!); }} style={{ color: 'var(--cth-ink-900)', wordBreak: 'break-all' }}>{st.activation.url}</a>
            </div>
          )}
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={st.enabled} onChange={(e) => void run(() => window.cth.fortressSetEnabled(e.target.checked))} />
            {t('fortress.useIt')}
          </label>
          {st.enabled && !licensed && <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{t('fortress.v1Note')}</div>}
          <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>
            {t('fortress.manual')} <code style={{ fontFamily: 'var(--cth-font-mono)' }}>{st.activator === 'tilion' ? 'tilion activate' : 'uvx --from tilion-fortress==153.0.8010.36.post1 tilion-fortress activate'}</code>
            {' · '}
            <button style={{ ...btn, padding: '1px 6px' }} onClick={() => void run(window.cth.fortressUninstall)}>{t('fortress.remove', { size: `${Math.round(st.bytes / 1e6)} MB` })}</button>
          </div>
        </>
      )}
      {(error || inst.error || st.activation.error || st.error) && (
        <div style={{ fontSize: 11, color: 'var(--cth-coral)' }}>{error || inst.error || st.activation.error || st.error}</div>
      )}
    </div>
  );
}

export function SetupPanel({ onDone }: { onDone?: () => void } = {}) {
  const { t } = useTranslation();
  const [tools, setTools] = useState<ToolStatus[] | null>(null);
  const [busy, setBusy] = useState(false);
  const requestDispatchSeed = useStore((s) => s.requestDispatchSeed);
  const requestCommandCenterTab = useStore((s) => s.requestCommandCenterTab);

  const refresh = useCallback(async () => {
    setBusy(true);
    try { setTools(await window.cth.toolsStatus()); }
    catch { setTools([]); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  // Only ESSENTIALS are handed to Michael. Installing all eight engine CLIs
  // because they happen to be listed would be a wild overreach of one click.
  const missingEssential = useMemo(
    () => (tools ?? []).filter((t) => !t.found && t.essential),
    [tools]
  );
  const readyCount = (tools ?? []).filter((t) => t.found).length;

  const askMichael = () => {
    if (missingEssential.length === 0) return;
    requestDispatchSeed(setupPrompt(missingEssential));
    requestCommandCenterTab('floor'); // the dispatch box lives on the monitor tab
    // This panel lives in a modal now — leaving it open would hide the very box
    // we just filled in.
    onDone?.();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 12 }}>{t('setupPanel.title')}</div>
          <div style={{ fontSize: 12, color: 'var(--cth-ink-500)', marginTop: 2 }}>
            {tools === null
              ? t('setupPanel.checking')
              : t('setupPanel.summary', {
                  ready: readyCount,
                  total: tools.length,
                  // The slot takes a phrase, not a number: passing the count
                  // printed "6 of 16 ready0".
                  missing: missingEssential.length
                    ? t('setupPanel.summaryMissing', { count: missingEssential.length })
                    : t('setupPanel.summaryAllReady')
                })}
          </div>
        </div>
        <PixelButton variant="ghost" size="md" onClick={() => void refresh()} disabled={busy}>
          {busy ? t('setupPanel.checkingBtn') : t('setupPanel.recheck')}
        </PixelButton>
      </div>

      {/* The headline action, shown only while something recommended is missing. */}
      <div style={{
        padding: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        background: missingEssential.length ? 'var(--cth-lemon-light)' : 'var(--cth-cream-100)',
        boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
      }}>
        <div style={{ flex: 1, minWidth: 220, fontSize: 12, color: 'var(--cth-ink-700)', lineHeight: 1.5 }}>
          {missingEssential.length
            ? t('setupPanel.askDesc', { count: missingEssential.length })
            : t('setupPanel.allReady')}
        </div>
        {/* Only when there is something to install: a disabled primary button
            read as clickable and did nothing. */}
        {missingEssential.length > 0 && (
          <PixelButton variant="primary" size="md" onClick={askMichael}>
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <Icon name="sparkle" /> {t('setupPanel.askMichael')}
            </span>
          </PixelButton>
        )}
      </div>

      {SECTIONS.map((section) => {
        const rows = (tools ?? []).filter((t) => t.kind === section.kind);
        if (rows.length === 0) return null;
        return (
          <div key={section.kind} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              fontFamily: 'var(--cth-font-display)', fontSize: 10, letterSpacing: 0.5,
              color: 'var(--cth-ink-500)', textTransform: 'uppercase'
            }}>{t(section.titleKey)}</div>
            <div style={{ fontSize: 11, color: 'var(--cth-ink-500)', marginTop: -2 }}>{t(section.blurbKey)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rows.map((t) => <ToolRow key={t.id} tool={t} onChanged={() => void refresh()} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
