import { useCallback, useEffect, useState } from 'react';
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

const STEPS: Array<[string, string]> = [
  ['Plain variables reach every agent', 'NODE_ENV, API_BASE_URL… anything that is not secret. Agents see these in their environment, like any other variable.'],
  ['Secrets never reach an agent', 'A secret is stored encrypted on this machine and never shown again. A 1Password reference (op://Vault/Item/field) is read from 1Password at the moment it is needed and kept nowhere. Neither goes into an agent’s environment, files or prompt.'],
  ['Agents use secrets through runners', 'A runner is a command you define (npm test, npm run migrate…) with the secrets it needs. An agent can only ask the app to run it by name: the app runs it in the agent’s worktree and hands back the output with every secret value masked as ***.'],
  ['You stay in the loop', 'By default a runner asks you before it runs whenever the agent changed files since you last allowed it — the command runs code the agent can edit. APIs and MCP servers that need keys go in Connections instead: the app adds the key to each request.']
];

/** How to install the 1Password CLI on the machine running the app. */
const OP_INSTALL: Record<string, string> = {
  win32: 'Install it with: winget install AgileBits.1Password.CLI',
  darwin: 'Install it with: brew install 1password-cli',
  linux: 'Install it from 1Password’s apt or dnf repository (1password.com/downloads/command-line).'
};

const KIND_LABEL: Record<EnvVarView['kind'], string> = { plain: 'Plain', secret: 'Secret', op: '1Password' };
const KIND_TONE = { plain: 'grey', secret: 'gold', op: 'blue' } as const;
const APPROVAL_LABEL: Record<RunnerView['approval'], string> = {
  'on-change': 'Ask me when files changed', always: 'Ask me every time', never: 'Never ask'
};

export function EnvironmentView({ roster }: { roster: Agent[] }) {
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
        <h2>Environment</h2>
        <span className="pro-sub">Variables for your agents, and secrets they can use but never see.</span>
        <div className="pro-head-end"><button className="pro-btn" onClick={toggleGuide}>{guideOpen ? 'Hide guide' : 'How it works'}</button></div>
      </div>
      {guideOpen && <Guide title="Environment & secrets" steps={STEPS} onClose={toggleGuide} />}
      {error && <div className="pro-card" style={{ borderColor: 'var(--cth-coral)' }}><span className="pro-text">{error}</span></div>}

      {op && !op.installed && (
        <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong style={{ fontSize: 13 }}>1Password references need the 1Password CLI</strong>
          <span className="pro-text">
            {OP_INSTALL[window.cth.platform] ?? OP_INSTALL.linux} Then, in the 1Password app, turn on Settings → Developer → “Integrate with 1Password CLI”.
            Values are read with your 1Password unlock, at the moment a runner needs them.
            {window.cth.platform === 'win32' && ' The app reads 1Password on Windows, for WSL floors too: nothing to install inside the distribution.'}
          </span>
        </section>
      )}

      <h3 style={{ margin: '6px 0 0', fontSize: 14 }}>Variables</h3>
      <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0, flexShrink: 0 }}>
        {vars.length === 0 && <p className="pro-sub" style={{ margin: 0, padding: 14 }}>No variables yet.</p>}
        {vars.slice().sort((a, b) => a.name.localeCompare(b.name)).map((v) => (
          <VarRow key={v.name} v={v} agents={agents} onChanged={reload} onError={setError} />
        ))}
        <NewVar agents={agents} onChanged={reload} onError={setError} />
      </section>

      <h3 style={{ margin: '6px 0 0', fontSize: 14 }}>Runners</h3>
      <p className="pro-text" style={{ marginTop: -6 }}>Commands your agents can ask the app to run with secrets. They get the output, masked — never the values.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {runners.map((r) => <RunnerCard key={r.id} runner={r} secretNames={secretNames} onChanged={reload} onError={setError} />)}
        <RunnerCard secretNames={secretNames} onChanged={reload} onError={setError} />
      </div>
    </div>
  );
}

function scopeText(v: EnvVarView, agents: Agent[]): string {
  if (!v.agents || !v.agents.length) return 'all agents';
  return v.agents.map((id) => agents.find((a) => a.id === id)?.name ?? id).join(', ');
}

function VarRow({ v, agents, onChanged, onError }: { v: EnvVarView; agents: Agent[]; onChanged: () => void; onError: (e: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const remove = async () => {
    if (!(await window.cth.confirm(`Delete ${v.name}?`, { detail: v.kind === 'secret' ? 'Its stored value is erased.' : undefined, ok: 'Delete' }))) return;
    await window.cth.envRemoveVar(v.name);
    onChanged();
  };
  if (editing) return <VarForm initial={v} agents={agents} onDone={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} onError={onError} />;
  return (
    <div className="pro-row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--pro-line)', gap: 12 }}>
      <span className="pro-mono" style={{ fontSize: 13, fontWeight: 600, minWidth: 160 }}>{v.name}</span>
      <StateBadge label={KIND_LABEL[v.kind]} tone={KIND_TONE[v.kind]} />
      <span className="pro-mono" style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--cth-ink-700)' }}>
        {v.kind === 'plain' ? v.value : v.kind === 'op' ? v.value : v.stored ? '•••••••• stored' : 'no value stored'}
      </span>
      <span className="pro-sub" style={{ fontSize: 11 }}>{v.kind === 'plain' ? scopeText(v, agents) : 'runners only'}</span>
      <button className="pro-btn" onClick={() => setEditing(true)}>Edit</button>
      <button className="pro-btn" onClick={() => void remove()}>Delete</button>
    </div>
  );
}

function NewVar({ agents, onChanged, onError }: { agents: Agent[]; onChanged: () => void; onError: (e: string | null) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="pro-btn" style={{ margin: 12, alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>+ Add a variable</button>;
  return <VarForm agents={agents} onDone={() => { setOpen(false); onChanged(); }} onCancel={() => setOpen(false)} onError={onError} />;
}

function VarForm({ initial, agents, onDone, onCancel, onError }: {
  initial?: EnvVarView; agents: Agent[]; onDone: () => void; onCancel: () => void; onError: (e: string | null) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<EnvVarView['kind']>(initial?.kind ?? 'plain');
  const [value, setValue] = useState(initial && initial.kind !== 'secret' ? initial.value ?? '' : '');
  const [secret, setSecret] = useState('');
  const [scope, setScope] = useState<string[]>(initial?.agents ?? []);
  const save = async () => {
    onError(null);
    const r = await window.cth.envSetVar({ name, kind, value: kind === 'secret' ? undefined : value, agents: kind === 'plain' && scope.length ? scope : null }, kind === 'secret' ? secret : undefined);
    if (!r.ok) { onError(r.error ?? 'Not saved.'); return; }
    onDone();
  };
  return (
    <div style={{ padding: 14, borderBottom: '1px solid var(--pro-line)', display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--cth-cream-100)' }}>
      <div className="pro-row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input className="pro-input pro-mono" placeholder="NAME" value={name} disabled={!!initial} onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))} style={{ width: 200 }} />
        <div className="pro-switch" role="group" aria-label="Kind">
          {(['plain', 'secret', 'op'] as const).map((k) => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}
        </div>
      </div>
      {kind === 'plain' && <input className="pro-input pro-mono" placeholder="value" value={value} onChange={(e) => setValue(e.target.value)} />}
      {kind === 'secret' && (
        <>
          <input className="pro-input pro-mono" type="password" autoComplete="off" placeholder={initial?.stored ? 'stored — paste a new value to replace it' : 'secret value'} value={secret} onChange={(e) => setSecret(e.target.value)} />
          <span className="pro-sub" style={{ fontSize: 11 }}>Encrypted on this machine and never shown again. Agents never see it; runners use it.</span>
        </>
      )}
      {kind === 'op' && (
        <>
          <input className="pro-input pro-mono" placeholder="op://Vault/Item/field" value={value} onChange={(e) => setValue(e.target.value)} />
          <span className="pro-sub" style={{ fontSize: 11 }}>Read from 1Password each time a runner needs it (in 1Password: Copy Secret Reference). Nothing is stored here.</span>
        </>
      )}
      {kind === 'plain' && agents.length > 0 && (
        <div className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span className="pro-sub" style={{ fontSize: 12 }}>For:</span>
          <button className={`pro-chip${scope.length === 0 ? ' pro-chip-on' : ''}`} onClick={() => setScope([])}>All agents</button>
          {agents.map((a) => (
            <button key={a.id} className={`pro-chip${scope.includes(a.id) ? ' pro-chip-on' : ''}`}
              onClick={() => setScope((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id]))}>{a.name}</button>
          ))}
        </div>
      )}
      <div className="pro-row" style={{ gap: 8 }}>
        <button className="pro-btn pro-btn-primary" disabled={!name || (kind === 'secret' && !secret && !initial?.stored) || (kind !== 'secret' && !value.trim())} onClick={() => void save()}>Save</button>
        <button className="pro-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function RunnerCard({ runner, secretNames, onChanged, onError }: {
  runner?: RunnerView; secretNames: string[]; onChanged: () => void; onError: (e: string | null) => void;
}) {
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
    if (!r.ok) { onError(r.error ?? 'Not saved.'); return; }
    setEditing(false); setAdding(false);
    if (!runner) { setName(''); setCommand(''); setDescription(''); setSecrets([]); setApproval('on-change'); }
    onChanged();
  };
  const remove = async () => {
    if (!runner || !(await window.cth.confirm(`Delete the runner "${runner.name}"?`, { ok: 'Delete' }))) return;
    await window.cth.envRemoveRunner(runner.id);
    onChanged();
  };
  if (!runner && !adding) {
    return <button className="pro-card" onClick={() => setAdding(true)} style={{ borderStyle: 'dashed', cursor: 'pointer', textAlign: 'center' }}><span className="pro-sub">+ Add a runner</span></button>;
  }
  if (runner && !editing) {
    return (
      <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="pro-row">
          <strong style={{ fontSize: 13 }}>{runner.name}</strong>
          <span className="pro-ticket">{runner.id}</span>
          <span className="pro-sub" style={{ fontSize: 11, marginInlineStart: 'auto' }}>{APPROVAL_LABEL[runner.approval]}</span>
          <button className="pro-btn" onClick={() => setEditing(true)}>Edit</button>
          <button className="pro-btn" onClick={() => void remove()}>Delete</button>
        </div>
        <code className="pro-mono" style={{ fontSize: 12 }}>{runner.command}</code>
        {runner.description && <span className="pro-text">{runner.description}</span>}
        <div className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {runner.secrets.length ? runner.secrets.map((s) => <span key={s} className="pro-chip pro-mono" style={{ fontSize: 11 }}>{s}</span>)
            : <span className="pro-sub" style={{ fontSize: 11 }}>no secrets</span>}
        </div>
      </section>
    );
  }
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="pro-row" style={{ gap: 8 }}>
        <input className="pro-input" placeholder="Name, e.g. test" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 180 }} />
        <input className="pro-input pro-mono" placeholder="Command, e.g. npm test" value={command} onChange={(e) => setCommand(e.target.value)} style={{ flex: 1 }} />
      </div>
      <input className="pro-input" placeholder="What it does (shown to agents)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className="pro-sub" style={{ fontSize: 12 }}>Secrets it gets:</span>
        {secretNames.length === 0 && <span className="pro-sub" style={{ fontSize: 12 }}>add a Secret or 1Password variable first</span>}
        {secretNames.map((s) => (
          <button key={s} className={`pro-chip pro-mono${secrets.includes(s) ? ' pro-chip-on' : ''}`} style={{ fontSize: 11 }}
            onClick={() => setSecrets((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))}>{s}</button>
        ))}
      </div>
      <div className="pro-row" style={{ gap: 8 }}>
        <span className="pro-sub" style={{ fontSize: 12 }}>Before it runs:</span>
        <select className="pro-input" value={approval} onChange={(e) => setApproval(e.target.value as RunnerView['approval'])} style={{ maxWidth: 260 }}>
          {(['on-change', 'always', 'never'] as const).map((a) => <option key={a} value={a}>{APPROVAL_LABEL[a]}</option>)}
        </select>
      </div>
      {approval === 'never' && <span className="pro-sub" style={{ fontSize: 11 }}>Only for commands whose code you trust: the agent can edit what it runs.</span>}
      <div className="pro-row" style={{ gap: 8 }}>
        <button className="pro-btn pro-btn-primary" disabled={!name.trim() || !command.trim()} onClick={() => void save()}>Save</button>
        <button className="pro-btn" onClick={() => { setEditing(false); setAdding(false); }}>Cancel</button>
      </div>
    </section>
  );
}
