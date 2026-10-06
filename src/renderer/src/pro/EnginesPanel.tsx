import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HarnessConfig } from '@/store/config';
import { PtyTerminalView } from '@/components/PtyTerminalView';
import { ProviderLogo } from '@/components/ProviderLogo';
import { StateBadge } from './data';

type Engine = 'pi' | 'opencode';
type Status = Awaited<ReturnType<typeof window.cth.engineStatus>>;
const ENGINES: Array<{ id: Engine; label: string }> = [{ id: 'opencode', label: 'OpenCode' }, { id: 'pi', label: 'Pi' }];

/**
 * Pi and OpenCode, managed from here: who each is signed in to (your
 * subscription through its own login, or the API keys below), signing in in a
 * terminal inside the app, and the default model picked from what the engine
 * itself lists. The app's agents of that engine use all of it on their next start.
 */
export function EnginesPanel({ config }: { config: HarnessConfig }) {
  return (
    <div className="pro-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))' }}>
      {ENGINES.map((e) => <EngineCard key={e.id} engine={e.id} label={e.label} config={config} />)}
    </div>
  );
}

function EngineCard({ engine, label, config }: { engine: Engine; label: string; config: HarnessConfig }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = config.providerDefaultModels?.[engine] ?? '';
  const [model, setModel] = useState(saved);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => setModel(saved), [saved]);
  const refresh = () => { void window.cth.engineStatus(engine).then(setStatus).catch(() => setStatus(null)); };
  useEffect(refresh, [engine]);

  const load = async () => {
    setLoading(true); setError(null);
    const r = await window.cth.engineModels(engine).catch((e) => ({ ok: false, models: [], error: String(e) }));
    setLoading(false);
    if (r.ok) setModels(r.models); else { setModels(null); setError(r.error ?? t('pro.engines.noModels')); }
  };
  const save = async () => {
    const next = { ...(config.providerDefaultModels ?? {}), [engine]: model.trim() || undefined };
    await window.cth.updateConfig({ providerDefaultModels: next });
    setNote(t('pro.engines.saved'));
    setTimeout(() => setNote(null), 1500);
  };
  const providers = status?.providers ?? [];

  return (
    <article className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="pro-row">
        <ProviderLogo provider={engine} size={16} />
        <p className="pro-title">{label}</p>
        <StateBadge label={providers.length ? t('pro.engines.signedIn') : t('pro.engines.notSignedIn')} tone={providers.length ? 'green' : 'amber'} />
      </div>

      <span className="pro-sub" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>{t('pro.engines.signInTitle')}</span>
      <span className="pro-text" style={{ fontSize: 12.5 }}>
        {providers.length
          ? t('pro.engines.signedInTo', { list: providers.map((p) => `${p.id}${p.kind === 'oauth' ? ` (${t('pro.engines.subscription')})` : ''}`).join(', ') })
          : t('pro.engines.notSignedInBody')}
      </span>
      <div className="pro-row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="pro-btn pro-btn-primary" disabled={!status?.ok} onClick={() => setSigningIn(true)}>{t('pro.engines.signIn')}</button>
        <button className="pro-btn" onClick={refresh}>{t('pro.engines.check')}</button>
        <span className="pro-sub" style={{ fontSize: 11.5 }}>{t('pro.engines.orKey')}</span>
      </div>

      <span className="pro-sub" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', marginTop: 4 }}>{t('pro.engines.modelTitle')}</span>
      <div className="pro-row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input className="pro-input pro-mono" style={{ flex: 1, minWidth: 220 }} list={`models-${engine}`} placeholder="provider/model"
          value={model} onChange={(e) => setModel(e.target.value)} />
        <datalist id={`models-${engine}`}>{(models ?? []).map((m) => <option key={m} value={m} />)}</datalist>
        <button className="pro-btn" disabled={loading} onClick={() => void load()}>{loading ? t('pro.engines.loading') : t('pro.engines.loadModels')}</button>
        <button className="pro-btn pro-btn-primary" disabled={model.trim() === saved} onClick={() => void save()}>{t('common.save')}</button>
      </div>
      {models && <span className="pro-sub" style={{ fontSize: 11.5 }}>{t('pro.engines.modelsFound', { count: models.length })}</span>}
      {error && <span className="pro-text" style={{ color: 'var(--cth-coral)', fontSize: 12 }}>{error}</span>}
      {note && <span className="pro-sub" style={{ fontSize: 11.5 }}>{note}</span>}
      <span className="pro-sub" style={{ fontSize: 11.5 }}>{t('pro.engines.modelHint')}</span>

      {signingIn && status?.home && status.signIn && (
        <SignInTerminal engine={engine} label={label} cwd={status.home} cmd={status.signIn.cmd} args={status.signIn.args}
          onClose={() => { setSigningIn(false); refresh(); }} />
      )}
    </article>
  );
}

/** The engine's own sign-in, in a terminal inside the app. The process ends with
 *  the dialog; the login it stored stays (the engine's own auth file). */
function SignInTerminal({ engine, label, cwd, cmd, args, onClose }: { engine: Engine; label: string; cwd: string; cmd: string; args: string[]; onClose: () => void }) {
  const { t } = useTranslation();
  const [id] = useState(() => `signin-${engine}-${Date.now()}`);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    let alive = true;
    void window.cth.spawnPty({ id, cwd, command: cmd, args, cols: 110, rows: 30 }).then((r) => {
      if (!alive) return;
      if (r.ok) setStarted(true); else setError(r.error ?? t('pro.engines.couldNotStart', { cmd }));
    });
    return () => { alive = false; void window.cth.killPty(id).catch(() => {}); };
  }, [id, cwd, cmd, args, t]);
  return (
    <div role="dialog" aria-label={t('pro.engines.signInTo', { name: label })}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <section className="pro-card" style={{ width: 'min(920px, 92vw)', height: 'min(600px, 86vh)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="pro-row">
          <strong style={{ fontSize: 14 }}>{t('pro.engines.signInTo', { name: label })}</strong>
          <button className="pro-btn pro-btn-primary" style={{ marginInlineStart: 'auto' }} onClick={onClose}>{t('pro.engines.done')}</button>
        </div>
        <span className="pro-text" style={{ fontSize: 12.5 }}>{t(engine === 'pi' ? 'pro.engines.piSteps' : 'pro.engines.opencodeSteps')}</span>
        {error && <span className="pro-text" style={{ color: 'var(--cth-coral)' }}>{error}</span>}
        <div className="pro-embed" style={{ flex: 1, minHeight: 0 }}>{started && <PtyTerminalView ptyId={id} embedded />}</div>
      </section>
    </div>
  );
}
