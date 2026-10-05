import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { Agent } from '@/store/store';
import type { EnvVarView, RunnerView } from '../../../preload/index';
import { StateBadge } from './data';
import { Guide, useGuide } from './Guide';

/**
 * Environment: variables for the office's agents, and secrets they can USE but
 * never SEE (main/envVault.ts). Plain values go into agents' environment;
 * secrets (stored encrypted) and 1Password references only into the commands
 * the app runs for them — runners — whose output comes back masked.
 */

/** The guide's steps, `pro.env.step<n>` / `pro.env.step<n>Body`. */
const STEPS = (t: TFunction): Array<[string, string]> =>
  [1, 2, 3, 4].map((n) => [t(`pro.env.step${n}`), t(`pro.env.step${n}Body`)]);

const KIND_TONE = { plain: 'grey', secret: 'gold', op: 'blue' } as const;
/** Kinds and approvals by key: `pro.env.kind_<k>`, `pro.env.approval_<a>`. */
const kindLabel = (t: TFunction, k: EnvVarView['kind']) => t(`pro.env.kind_${k}`);
const approvalLabel = (t: TFunction, a: RunnerView['approval']) => t(`pro.env.approval_${a}`);

export function EnvironmentView({ roster }: { roster: Agent[] }) {
  const { t } = useTranslation();
  const [vars, setVars] = useState<EnvVarView[]>([]);
  const [runners, setRunners] = useState<RunnerView[]>([]);
  const [op, setOp] = useState<{ installed: boolean; version?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, toggleGuide] = useGuide('cth.guide.environment');
  const reload = useCallback(() => {
    void window.cth.envList().then((r) => { setVars(r.vars); setRunners(r.runners); });
  }, []);
  useEffect(() => { reload(); void window.cth.envOpStatus().then(setOp); }, [reload]);
  const secretNames = vars.filter((v) => v.kind !== 'plain').map((v) => v.name);
  const agents = roster.filter((a) => !a.archived);

  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>{t('pro.nav.environment')}</h2>
        <span className="pro-sub">{t('pro.env.sub')}</span>
        <div className="pro-head-end"><button className="pro-btn" onClick={toggleGuide}>{guideOpen ? t('pro.conn.hideGuide') : t('pro.conn.howItWorks')}</button></div>
      </div>
      {guideOpen && <Guide title={t('pro.env.guideTitle')} steps={STEPS(t)} onClose={toggleGuide} />}
      {error && <div className="pro-card" style={{ borderColor: 'var(--cth-coral)' }}><span className="pro-text">{error}</span></div>}

      {op && !op.installed && (
        <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong style={{ fontSize: 13 }}>{t('pro.env.opNeeded')}</strong>
          <span className="pro-text">
            {t(`pro.env.opInstall_${['win32', 'darwin'].includes(window.cth.platform) ? window.cth.platform : 'linux'}`)} {t('pro.env.opThen')}
            {window.cth.platform === 'win32' && ` ${t('pro.env.opWsl')}`}
          </span>
        </section>
      )}

      <h3 style={{ margin: '6px 0 0', fontSize: 14 }}>{t('pro.env.variables')}</h3>
      <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0, flexShrink: 0 }}>
        {vars.length === 0 && <p className="pro-sub" style={{ margin: 0, padding: 14 }}>{t('pro.env.noVars')}</p>}
        {vars.slice().sort((a, b) => a.name.localeCompare(b.name)).map((v) => (
          <VarRow key={v.name} v={v} agents={agents} onChanged={reload} onError={setError} />
        ))}
        <NewVar agents={agents} onChanged={reload} onError={setError} />
      </section>

      <h3 style={{ margin: '6px 0 0', fontSize: 14 }}>{t('pro.env.runners')}</h3>
      <p className="pro-text" style={{ marginTop: -6 }}>{t('pro.env.runnersBody')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {runners.map((r) => <RunnerCard key={r.id} runner={r} secretNames={secretNames} onChanged={reload} onError={setError} />)}
        <RunnerCard secretNames={secretNames} onChanged={reload} onError={setError} />
      </div>
    </div>
  );
}

function scopeText(v: EnvVarView, agents: Agent[], t: TFunction): string {
  if (!v.agents || !v.agents.length) return t('pro.env.allAgentsLower');
  return v.agents.map((id) => agents.find((a) => a.id === id)?.name ?? id).join(', ');
}

function VarRow({ v, agents, onChanged, onError }: { v: EnvVarView; agents: Agent[]; onChanged: () => void; onError: (e: string | null) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const remove = async () => {
    if (!(await window.cth.confirm(t('pro.env.deleteVar', { name: v.name }), { detail: v.kind === 'secret' ? t('pro.env.deleteVarDetail') : undefined, ok: t('pro.caps.delete') }))) return;
    await window.cth.envRemoveVar(v.name);
    onChanged();
  };
  if (editing) return <VarForm initial={v} agents={agents} onDone={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} onError={onError} />;
  return (
    <div className="pro-row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--pro-line)', gap: 12 }}>
      <span className="pro-mono" style={{ fontSize: 13, fontWeight: 600, minWidth: 160 }}>{v.name}</span>
      <StateBadge label={kindLabel(t, v.kind)} tone={KIND_TONE[v.kind]} />
      <span className="pro-mono" style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--cth-ink-700)' }}>
        {v.kind === 'plain' ? v.value : v.kind === 'op' ? v.value : v.stored ? `•••••••• ${t('pro.env.stored')}` : t('pro.env.noValue')}
      </span>
      <span className="pro-sub" style={{ fontSize: 11 }}>{v.kind === 'plain' ? scopeText(v, agents, t) : t('pro.env.runnersOnly')}</span>
      <button className="pro-btn" onClick={() => setEditing(true)}>{t('pro.caps.edit')}</button>
      <button className="pro-btn" onClick={() => void remove()}>{t('pro.caps.delete')}</button>
    </div>
  );
}

function NewVar({ agents, onChanged, onError }: { agents: Agent[]; onChanged: () => void; onError: (e: string | null) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!open) return <button className="pro-btn" style={{ margin: 12, alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>+ {t('pro.env.addVar')}</button>;
  return <VarForm agents={agents} onDone={() => { setOpen(false); onChanged(); }} onCancel={() => setOpen(false)} onError={onError} />;
}

function VarForm({ initial, agents, onDone, onCancel, onError }: {
  initial?: EnvVarView; agents: Agent[]; onDone: () => void; onCancel: () => void; onError: (e: string | null) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<EnvVarView['kind']>(initial?.kind ?? 'plain');
  const [value, setValue] = useState(initial && initial.kind !== 'secret' ? initial.value ?? '' : '');
  const [secret, setSecret] = useState('');
  const [scope, setScope] = useState<string[]>(initial?.agents ?? []);
  const save = async () => {
    onError(null);
    const r = await window.cth.envSetVar({ name, kind, value: kind === 'secret' ? undefined : value, agents: kind === 'plain' && scope.length ? scope : null }, kind === 'secret' ? secret : undefined);
    if (!r.ok) { onError(r.error ?? t('pro.env.notSaved')); return; }
    onDone();
  };
  return (
    <div style={{ padding: 14, borderBottom: '1px solid var(--pro-line)', display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--cth-cream-100)' }}>
      <div className="pro-row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input className="pro-input pro-mono" placeholder={t('pro.env.namePh')} value={name} disabled={!!initial} onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))} style={{ width: 200 }} />
        <div className="pro-switch" role="group" aria-label={t('pro.env.kind')}>
          {(['plain', 'secret', 'op'] as const).map((k) => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{kindLabel(t, k)}</button>)}
        </div>
      </div>
      {kind === 'plain' && <input className="pro-input pro-mono" placeholder={t('pro.env.valuePh')} value={value} onChange={(e) => setValue(e.target.value)} />}
      {kind === 'secret' && (
        <>
          <input className="pro-input pro-mono" type="password" autoComplete="off" placeholder={initial?.stored ? t('pro.env.storedPh') : t('pro.env.secretPh')} value={secret} onChange={(e) => setSecret(e.target.value)} />
          <span className="pro-sub" style={{ fontSize: 11 }}>{t('pro.env.secretHint')}</span>
        </>
      )}
      {kind === 'op' && (
        <>
          <input className="pro-input pro-mono" placeholder="op://Vault/Item/field" value={value} onChange={(e) => setValue(e.target.value)} />
          <span className="pro-sub" style={{ fontSize: 11 }}>{t('pro.env.opHint')}</span>
        </>
      )}
      {kind === 'plain' && agents.length > 0 && (
        <div className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span className="pro-sub" style={{ fontSize: 12 }}>{t('pro.env.for')}</span>
          <button className={`pro-chip${scope.length === 0 ? ' pro-chip-on' : ''}`} onClick={() => setScope([])}>{t('pro.env.allAgents')}</button>
          {agents.map((a) => (
            <button key={a.id} className={`pro-chip${scope.includes(a.id) ? ' pro-chip-on' : ''}`}
              onClick={() => setScope((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id]))}>{a.name}</button>
          ))}
        </div>
      )}
      <div className="pro-row" style={{ gap: 8 }}>
        <button className="pro-btn pro-btn-primary" disabled={!name || (kind === 'secret' && !secret && !initial?.stored) || (kind !== 'secret' && !value.trim())} onClick={() => void save()}>{t('common.save')}</button>
        <button className="pro-btn" onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </div>
  );
}

function RunnerCard({ runner, secretNames, onChanged, onError }: {
  runner?: RunnerView; secretNames: string[]; onChanged: () => void; onError: (e: string | null) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(!runner ? false : false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(runner?.name ?? '');
  const [command, setCommand] = useState(runner?.command ?? '');
  const [description, setDescription] = useState(runner?.description ?? '');
  const [secrets, setSecrets] = useState<string[]>(runner?.secrets ?? []);
  const [approval, setApproval] = useState<RunnerView['approval']>(runner?.approval ?? 'on-change');
  const save = async () => {
    onError(null);
    const r = await window.cth.envSetRunner({ id: runner?.id, name, command, description, secrets, approval });
    if (!r.ok) { onError(r.error ?? t('pro.env.notSaved')); return; }
    setEditing(false); setAdding(false);
    if (!runner) { setName(''); setCommand(''); setDescription(''); setSecrets([]); setApproval('on-change'); }
    onChanged();
  };
  const remove = async () => {
    if (!runner || !(await window.cth.confirm(t('pro.env.deleteRunner', { name: runner.name }), { ok: t('pro.caps.delete') }))) return;
    await window.cth.envRemoveRunner(runner.id);
    onChanged();
  };
  if (!runner && !adding) {
    return <button className="pro-card" onClick={() => setAdding(true)} style={{ borderStyle: 'dashed', cursor: 'pointer', textAlign: 'center' }}><span className="pro-sub">+ {t('pro.env.addRunner')}</span></button>;
  }
  if (runner && !editing) {
    return (
      <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="pro-row">
          <strong style={{ fontSize: 13 }}>{runner.name}</strong>
          <span className="pro-ticket">{runner.id}</span>
          <span className="pro-sub" style={{ fontSize: 11, marginInlineStart: 'auto' }}>{approvalLabel(t, runner.approval)}</span>
          <button className="pro-btn" onClick={() => setEditing(true)}>{t('pro.caps.edit')}</button>
          <button className="pro-btn" onClick={() => void remove()}>{t('pro.caps.delete')}</button>
        </div>
        <code className="pro-mono" style={{ fontSize: 12 }}>{runner.command}</code>
        {runner.description && <span className="pro-text">{runner.description}</span>}
        <div className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {runner.secrets.length ? runner.secrets.map((s) => <span key={s} className="pro-chip pro-mono" style={{ fontSize: 11 }}>{s}</span>)
            : <span className="pro-sub" style={{ fontSize: 11 }}>{t('pro.env.noSecrets')}</span>}
        </div>
      </section>
    );
  }
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="pro-row" style={{ gap: 8 }}>
        <input className="pro-input" placeholder={t('pro.env.runnerNamePh')} value={name} onChange={(e) => setName(e.target.value)} style={{ width: 180 }} />
        <input className="pro-input pro-mono" placeholder={t('pro.env.commandPh')} value={command} onChange={(e) => setCommand(e.target.value)} style={{ flex: 1 }} />
      </div>
      <input className="pro-input" placeholder={t('pro.env.descPh')} value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className="pro-sub" style={{ fontSize: 12 }}>{t('pro.env.secretsItGets')}</span>
        {secretNames.length === 0 && <span className="pro-sub" style={{ fontSize: 12 }}>{t('pro.env.addSecretFirst')}</span>}
        {secretNames.map((s) => (
          <button key={s} className={`pro-chip pro-mono${secrets.includes(s) ? ' pro-chip-on' : ''}`} style={{ fontSize: 11 }}
            onClick={() => setSecrets((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))}>{s}</button>
        ))}
      </div>
      <div className="pro-row" style={{ gap: 8 }}>
        <span className="pro-sub" style={{ fontSize: 12 }}>{t('pro.env.beforeRuns')}</span>
        <select className="pro-input" value={approval} onChange={(e) => setApproval(e.target.value as RunnerView['approval'])} style={{ maxWidth: 260 }}>
          {(['on-change', 'always', 'never'] as const).map((a) => <option key={a} value={a}>{approvalLabel(t, a)}</option>)}
        </select>
      </div>
      {approval === 'never' && <span className="pro-sub" style={{ fontSize: 11 }}>{t('pro.env.neverWarning')}</span>}
      <div className="pro-row" style={{ gap: 8 }}>
        <button className="pro-btn pro-btn-primary" disabled={!name.trim() || !command.trim()} onClick={() => void save()}>{t('common.save')}</button>
        <button className="pro-btn" onClick={() => { setEditing(false); setAdding(false); }}>{t('common.cancel')}</button>
      </div>
    </section>
  );
}
