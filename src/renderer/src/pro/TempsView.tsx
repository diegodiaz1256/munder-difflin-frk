import { useState } from 'react';
import { useStore, type Agent } from '@/store/store';
import { Avatar, Bar, ago, fmtTokens, usePoll, type WorkerList } from './data';

const EMPTY: WorkerList = { live: [], preserved: [], maxWorkers: 4 };

/**
 * Temps — agents hired for one job, gone when it is done. The orchestrator
 * hires them (when "may start agents" is on) and so can you, here: one
 * objective, one folder, a fresh worktree; the temp reports `done` to the
 * orchestrator and leaves. Finished temps whose branch is not integrated yet
 * stay listed as preserved worktrees.
 */
export function TempsView({ roster }: { roster: Agent[] }) {
  const [, setTick] = useState(0);
  const data = usePoll(() => window.cth.listWorkers(), 3000, EMPTY);
  const agents = useStore((s) => s.agents);
  const god = roster.find((a) => a.isGod);
  const [hiring, setHiring] = useState(false);
  const [objective, setObjective] = useState('');
  const [cwd, setCwd] = useState(() => god?.cwd ?? '');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hire = async () => {
    setBusy(true); setError(null);
    const res = await window.cth.hireTemp({ objective, cwd, name: name || undefined }).catch((e) => ({ ok: false, error: String(e) }));
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'Could not hire the temp.'); return; }
    setHiring(false); setObjective(''); setName(''); setTick((n) => n + 1);
  };

  const stop = (id: string) => { void window.cth.stopWorker(id).finally(() => setTick((n) => n + 1)); };

  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>Temps</h2>
        <span className="pro-sub">{data.live.length} of {data.maxWorkers} desks</span>
        <div className="pro-head-end">
          <button className="pro-btn pro-btn-primary" onClick={() => setHiring((v) => !v)}>Hire a temp</button>
        </div>
      </div>

      {hiring && (
        <div className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input className="pro-input" placeholder="The job, e.g. Check the broken links on the docs site" value={objective} onChange={(e) => setObjective(e.target.value)} autoFocus />
          <div className="pro-row">
            <input className="pro-input" style={{ flex: 2 }} placeholder="Folder (a git repo)" value={cwd} onChange={(e) => setCwd(e.target.value)} />
            <button className="pro-btn" onClick={() => { void window.cth.chooseFolder().then((r) => { if (r.ok) setCwd(r.path); }); }}>Browse</button>
            <input className="pro-input" style={{ flex: 1 }} placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="pro-btn pro-btn-primary" disabled={busy || !objective.trim() || !cwd.trim()} onClick={() => void hire()}>{busy ? 'Hiring…' : 'Hire'}</button>
          </div>
          {error && <p className="pro-text" style={{ color: 'var(--cth-coral)' }}>{error}</p>}
          <p className="pro-sub" style={{ fontSize: 12, margin: 0 }}>The temp works on its own branch in a fresh worktree and hands the result to {god?.name ?? 'the orchestrator'}.</p>
        </div>
      )}

      {data.live.length === 0 && !hiring && (
        <p className="pro-sub">No temps at work. {god?.name ?? 'The orchestrator'} hires them for one-off jobs once &ldquo;may start agents&rdquo; is on, or hire one yourself.</p>
      )}

      {data.live.map((w) => {
        const a = agents.find((x) => x.id === w.workerId);
        const ratio = w.tokenCap ? w.tokensUsed / w.tokenCap : 0;
        return (
          <article key={w.workerId} className={`pro-card${w.releasing ? ' pro-card-muted' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar agent={a} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="pro-row">
                <p className="pro-title">{w.name}</p>
                <span className="pro-sub" style={{ fontSize: 12 }}>{w.baseBranch}</span>
                {w.hasSlack && <span className="pro-chip">slack</span>}
              </div>
              <Bar value={w.tokenCap ? ratio : 1} tone={w.releasing ? 'grey' : 'green'} indeterminate={!w.tokenCap && !w.releasing} />
              <span className="pro-sub pro-mono" style={{ fontSize: 11 }}>
                {fmtTokens(w.tokensUsed)} tok{w.tokenCap ? ` of ${fmtTokens(w.tokenCap)}` : ''}{w.idleMs !== null ? ` · idle ${ago(w.idleMs)}` : ''}
              </span>
            </div>
            <span className="pro-mono pro-sub">{ago(w.ageMs)}</span>
            <button className="pro-btn" disabled={w.releasing} onClick={() => stop(w.workerId)}>{w.releasing ? 'Leaving…' : 'Stop'}</button>
          </article>
        );
      })}

      {data.preserved.length > 0 && <h3 style={{ margin: '6px 0 0', fontSize: 14 }}>Finished, waiting to be integrated</h3>}
      {data.preserved.map((p) => (
        <article key={p.workerId} className="pro-card pro-card-muted pro-row">
          <p className="pro-title">{p.workerId}</p>
          <span className="pro-mono pro-sub" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.wtPath}</span>
          <span className="pro-sub" style={{ marginInlineStart: 'auto', fontSize: 12 }}>{new Date(p.preservedAt).toLocaleString()}</span>
        </article>
      ))}
    </div>
  );
}
