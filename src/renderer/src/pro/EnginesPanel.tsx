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
    <>
      <div className="pro-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))' }}>
        {ENGINES.map((e) => <EngineCard key={e.id} engine={e.id} label={e.label} config={config} />)}
      </div>
      <CustomProviders config={config} />
    </>
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
  // Your own providers' models are offered too (provider/model).
  const custom = (config.customModelProviders ?? []).flatMap((p) => p.models.map((m) => `${p.id}/${m}`));

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
        <datalist id={`models-${engine}`}>{[...(models ?? []), ...custom.filter((m) => !(models ?? []).includes(m))].map((m) => <option key={m} value={m} />)}</datalist>
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

type Custom = { id: string; label: string; baseUrl: string; models: string[] };
const PRESETS: Array<Omit<Custom, 'models'>> = [
  { id: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
  { id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
  { id: 'vllm', label: 'vLLM', baseUrl: 'http://localhost:8000/v1' },
  { id: 'llamacpp', label: 'llama.cpp', baseUrl: 'http://localhost:8080/v1' }
];
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

/** Your own OpenAI-compatible providers (local models or a self-hosted gateway),
 *  given to every OpenCode and Pi agent: models picked from what the server
 *  lists, the key (if it needs one) write-only. */
function CustomProviders({ config }: { config: HarnessConfig }) {
  const { t } = useTranslation();
  const saved = config.customModelProviders ?? [];
  const [list, setList] = useState<Custom[]>(saved);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (!dirty) setList(config.customModelProviders ?? []); }, [config.customModelProviders, dirty]);
  const edit = (i: number, patch: Partial<Custom>) => { setDirty(true); setList((l) => l.map((p, j) => (j === i ? { ...p, ...patch } : p))); };
  const add = (p: Omit<Custom, 'models'>) => {
    let id = p.id; for (let n = 2; list.some((x) => x.id === id); n++) id = `${p.id}-${n}`;
    setDirty(true); setList((l) => [...l, { ...p, id, models: [] }]);
  };
  const save = async () => {
    const r = await window.cth.customProvidersSave(list);
    setList(r); setDirty(false);
    setMsg(r.length === list.length ? t('pro.engines.customSaved') : t('pro.engines.customDropped'));
    setTimeout(() => setMsg(null), 2500);
  };
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
      <h3 style={{ margin: 0, fontSize: 14 }}>{t('pro.engines.customTitle')}</h3>
      <p className="pro-text" style={{ margin: 0 }}>{t('pro.engines.customBody')}</p>
      <div className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className="pro-sub" style={{ fontSize: 12 }}>{t('pro.engines.customAdd')}</span>
        {PRESETS.map((p) => <button key={p.id} className="pro-btn" onClick={() => add(p)}>+ {p.label}</button>)}
        <button className="pro-btn" onClick={() => add({ id: 'custom', label: t('pro.engines.customOther'), baseUrl: 'https://' })}>+ {t('pro.engines.customOther')}</button>
      </div>
      {list.map((p, i) => <CustomRow key={i} p={p} savedId={saved.some((s) => s.id === p.id) ? p.id : undefined} onChange={(patch) => edit(i, patch)}
        onRemove={() => { setDirty(true); setList((l) => l.filter((_, j) => j !== i)); }} />)}
      {(dirty || msg) && (
        <div className="pro-row" style={{ gap: 8 }}>
          {dirty && <button className="pro-btn pro-btn-primary" onClick={() => void save()}>{t('common.save')}</button>}
          {dirty && <button className="pro-btn" onClick={() => { setList(saved); setDirty(false); }}>{t('common.cancel')}</button>}
          {msg && <span className="pro-sub" style={{ fontSize: 12 }}>{msg}</span>}
        </div>
      )}
      <span className="pro-sub" style={{ fontSize: 11.5 }}>{t('pro.engines.customHint')}</span>
    </section>
  );
}

function CustomRow({ p, savedId, onChange, onRemove }: { p: Custom; savedId?: string; onChange: (patch: Partial<Custom>) => void; onRemove: () => void }) {
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [found, setFound] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  useEffect(() => { if (savedId) void window.cth.customProvidersHasKey(savedId).then(setHasKey).catch(() => {}); }, [savedId]);
  const fetchModels = async () => {
    setFetching(true); setErr(null);
    const r = await window.cth.customProvidersFetchModels(p.baseUrl, savedId).catch((e) => ({ ok: false, models: [], error: String(e) }));
    setFetching(false);
    if (r.ok) setFound(r.models); else { setFound(null); setErr(r.error ?? null); }
  };
  const toggle = (m: string) => onChange({ models: p.models.includes(m) ? p.models.filter((x) => x !== m) : [...p.models, m] });
  return (
    <article className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="pro-row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input className="pro-input" style={{ width: 160 }} value={p.label} placeholder={t('pro.engines.customName')}
          onChange={(e) => onChange({ label: e.target.value, ...(savedId ? {} : { id: slug(e.target.value) || p.id }) })} />
        <span className="pro-chip pro-mono" style={{ fontSize: 11 }} title={t('pro.engines.customIdTip')}>{p.id}/…</span>
        <input className="pro-input pro-mono" style={{ flex: 1, minWidth: 240 }} value={p.baseUrl} placeholder="http://localhost:11434/v1" onChange={(e) => onChange({ baseUrl: e.target.value })} />
        <button className="pro-btn" onClick={onRemove}>{t('pro.caps.delete')}</button>
      </div>
      <div className="pro-row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input className="pro-input pro-mono" type="password" autoComplete="off" style={{ flex: 1, minWidth: 220 }} value={key}
          placeholder={hasKey ? t('pro.engines.customKeyStored') : t('pro.engines.customKeyPh')} disabled={!savedId} onChange={(e) => setKey(e.target.value)} />
        <button className="pro-btn" disabled={!savedId || !key.trim()} onClick={() => { void window.cth.customProvidersSetKey(savedId!, key).then((r) => { if (r.ok) { setHasKey(true); setKey(''); } }); }}>{t('common.save')}</button>
        {hasKey && <button className="pro-btn" onClick={() => { void window.cth.customProvidersSetKey(savedId!, '').then(() => setHasKey(false)); }}>{t('pro.conn.remove')}</button>}
        {!savedId && <span className="pro-sub" style={{ fontSize: 11 }}>{t('pro.engines.customKeyAfterSave')}</span>}
      </div>
      <div className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className="pro-sub" style={{ fontSize: 12 }}>{t('pro.engines.customModels')}</span>
        {p.models.map((m) => <button key={m} className="pro-chip pro-chip-on pro-mono" style={{ fontSize: 11, cursor: 'pointer' }} title={t('pro.engines.customRemoveModel')} onClick={() => toggle(m)}>{m} ×</button>)}
        <input className="pro-input pro-mono" style={{ width: 170 }} placeholder={t('pro.engines.customModelPh')} value={typed}
          onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && typed.trim()) { toggle(typed.trim()); setTyped(''); } }} />
        <button className="pro-btn" disabled={fetching || !p.baseUrl.trim()} onClick={() => void fetchModels()}>{fetching ? t('pro.engines.loading') : t('pro.engines.customFetch')}</button>
      </div>
      {found && (
        <div className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {found.map((m) => <button key={m} className={`pro-chip pro-mono${p.models.includes(m) ? ' pro-chip-on' : ''}`} style={{ fontSize: 11, cursor: 'pointer' }} aria-pressed={p.models.includes(m)} onClick={() => toggle(m)}>{m}</button>)}
        </div>
      )}
      {err && <span className="pro-text" style={{ color: 'var(--cth-coral)', fontSize: 12 }}>{err}</span>}
    </article>
  );
}
