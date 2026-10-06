import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { OfficeCharacterName } from '@/scene/office/cast';
import type {
  FactoryAgentView, FactoryEventView, FactoryFloorView, FactoryView
} from '../../../preload/index';
import { Avatar, Bar, StateBadge, type Tone } from './data';
import { Guide, useGuide } from './Guide';
import { FactoryScene, ROLE_GLOW } from '@/scene/office/FactoryScene';
import i18n from 'i18next';

/** Translation for this file, where `t` is a task: the screen polls, so a
 *  language switch shows on the next refresh. */
const tr = (key: string, opts?: Record<string, unknown>): string => i18n.t(key, opts);

/**
 * Factories: software factories this office sends work to, or just watches
 * (FACTORY-MCP.md). A factory is a Factory MCP server; main holds its token and
 * talks to it (main/factories.ts). This screen lists them and shows one as a
 * live floor: a desk per worker, work handed from desk to desk, the board, its
 * pacing, and — when the factory allows it — a form to send it a task.
 */

/** The guide's steps, `pro.fac.step<n>` / `pro.fac.step<n>Body`. */
const STEPS = (): Array<[string, string]> => [1, 2, 3, 4].map((n) => [tr(`pro.fac.step${n}`), tr(`pro.fac.step${n}Body`)]);

const STATE_TONE: Record<FactoryAgentView['state'], Tone> = {
  working: 'green', waiting: 'amber', resting: 'blue', idle: 'grey', away: 'gold', offline: 'grey'
};
const stateLabel = (st: FactoryAgentView['state']): string => tr(`pro.fac.state_${st}`);
const ROLE_ORDER = ['planner', 'orderer', 'builder', 'reviewer', 'qa', 'automation'] as const;
const roleLabel = (r: string): string => tr(`pro.fac.role_${r}`, { defaultValue: r });
const CAST: OfficeCharacterName[] = ['pam', 'jim', 'dwight', 'kevin', 'angela', 'oscar', 'stanley', 'phyllis', 'andy', 'kelly', 'ryan', 'toby', 'creed', 'meredith', 'michael'];

/** The same worker always gets the same face. */
function faceFor(name: string): OfficeCharacterName {
  let h = 0;
  for (const c of (name.replace(/\s+\d+$/, ''))) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CAST[h % CAST.length];
}

function host(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

export function FactoriesView() {
  const [list, setList] = useState<FactoryView[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, toggleGuide] = useGuide('cth.guide.factories');
  const reload = useCallback(() => { void window.cth.factoriesList().then(setList).catch(() => {}); }, []);
  useEffect(reload, [reload]);
  const current = list.find((f) => f.id === open) ?? null;

  if (current) return <FactoryFloor factory={current} onBack={() => setOpen(null)} onChanged={reload} />;

  return (
    <div className="pro-page">
      <div className="pro-head">
        <h1 className="pro-title" style={{ fontSize: 18 }}>{tr('pro.nav.factories')}</h1>
        <span className="pro-sub">{tr('pro.fac.sub')}</span>
        <div className="pro-head-end">
          <button className="pro-btn" onClick={toggleGuide}>{guideOpen ? tr('pro.conn.hideGuide') : tr('pro.conn.howItWorks')}</button>
        </div>
      </div>
      {guideOpen && <Guide title={tr('pro.nav.factories')} steps={STEPS()} onClose={toggleGuide}
        footer={<>{tr('pro.fac.guideFooter')} <span className="pro-mono">node tools/mock-factory.cjs</span>.</>} />}
      {error && <div className="pro-card" style={{ borderColor: 'var(--cth-coral)' }}><span className="pro-text">{error}</span></div>}
      <div className="pro-grid">
        {list.map((f) => (
          <FactoryCard key={f.id} factory={f} onOpen={() => setOpen(f.id)} onChanged={reload} onError={setError} />
        ))}
        <AddFactory onAdded={(id) => { reload(); setOpen(id); }} onError={setError} />
      </div>
    </div>
  );
}

function FactoryCard({ factory, onOpen, onChanged, onError }: {
  factory: FactoryView; onOpen: () => void; onChanged: () => void; onError: (e: string | null) => void;
}) {
  const [status, setStatus] = useState<{ ok: boolean; error?: string } | null>(null);
  const [team, setTeam] = useState<{ running?: number; capacity?: number; usage?: { window_5h_pct?: number; window_7d_pct?: number } } | null>(null);
  useEffect(() => {
    let alive = true;
    void window.cth.factoriesTest(factory.id).then((r) => {
      if (!alive) return;
      setStatus(r);
      if (r.ok && r.info?.tools.includes('team_status')) {
        void window.cth.factoriesCall(factory.id, 'team_status', {}).then((t) => { if (alive && t.ok) setTeam(t.result as typeof team); });
      }
    });
    return () => { alive = false; };
  }, [factory.id]);
  const info = status?.ok ? (factory.info ?? null) : null;
  const remove = async () => {
    if (!(await window.cth.confirm(tr('pro.fac.removeConfirm', { name: factory.name }), { detail: tr('pro.fac.removeDetail'), ok: tr('pro.conn.remove') }))) return;
    onError(null);
    void window.cth.factoriesRemove(factory.id).then(onChanged);
  };
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="pro-row">
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="pro-title">{factory.name}</p>
          <p className="pro-sub pro-mono" style={{ margin: 0, fontSize: 11 }}>{host(factory.url)}</p>
        </div>
        {status === null ? <StateBadge label={tr('pro.fac.checking')} tone="grey" />
          : status.ok ? <StateBadge label={info && !info.canSend ? tr('pro.fac.watchOnly') : tr('pro.fac.connected')} tone="green" />
          : <StateBadge label={tr('pro.fac.noAnswer')} tone="red" />}
      </div>
      {status && !status.ok && <span className="pro-sub" style={{ fontSize: 12 }}>{status.error}</span>}
      {team && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="pro-sub" style={{ fontSize: 12 }}>{tr('pro.fac.running', { count: team.running ?? 0 })}{team.capacity ? ` / ${team.capacity}` : ''}</span>
          {team.usage?.window_5h_pct !== undefined && <UsageBar label="5 h" pct={team.usage.window_5h_pct} />}
          {team.usage?.window_7d_pct !== undefined && <UsageBar label="7 d" pct={team.usage.window_7d_pct} />}
        </div>
      )}
      <div className="pro-row">
        <button className="pro-btn pro-btn-primary" onClick={onOpen} disabled={!status?.ok}>{tr('pro.fac.openFloor')}</button>
        <button className="pro-btn" style={{ marginInlineStart: 'auto' }} onClick={remove}>{tr('pro.conn.remove')}</button>
      </div>
    </section>
  );
}

function UsageBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="pro-row" style={{ gap: 6 }}>
      <span className="pro-sub pro-mono" style={{ fontSize: 11, width: 26 }}>{label}</span>
      <div style={{ flex: 1 }}><Bar value={pct / 100} tone={pct >= 90 ? 'red' : pct >= 70 ? 'amber' : 'green'} /></div>
      <span className="pro-sub pro-mono" style={{ fontSize: 11 }}>{Math.round(pct)}%</span>
    </div>
  );
}

function AddFactory({ onAdded, onError }: { onAdded: (id: string) => void; onError: (e: string | null) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    onError(null);
    setBusy(true);
    const r = await window.cth.factoriesAdd({ name, url, token }).catch((e) => ({ ok: false, error: String(e) }) as { ok: boolean; id?: string; error?: string });
    setBusy(false);
    if (!r.ok || !r.id) { onError(r.error ?? tr('pro.fac.notAdded')); return; }
    setName(''); setUrl(''); setToken(''); setAdding(false);
    onAdded(r.id);
  };
  if (!adding) {
    return (
      <button className="pro-card" onClick={() => setAdding(true)}
        style={{ borderStyle: 'dashed', cursor: 'pointer', minHeight: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="pro-sub">+ {tr('pro.fac.add')}</span>
      </button>
    );
  }
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <strong style={{ fontSize: 13 }}>{tr('pro.fac.add')}</strong>
      <input className="pro-input" placeholder={tr('pro.temps.namePlaceholder')} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      <input className="pro-input pro-mono" placeholder="https://factory.example/mcp" value={url} onChange={(e) => setUrl(e.target.value)} />
      <input className="pro-input pro-mono" type="password" autoComplete="off" placeholder={tr('pro.fac.tokenPh')} value={token} onChange={(e) => setToken(e.target.value)} />
      <span className="pro-sub" style={{ fontSize: 11 }}>{tr('pro.fac.tokenHint')}</span>
      <div className="pro-row">
        <button className="pro-btn pro-btn-primary" disabled={busy || !url.trim() || !token.trim()} onClick={() => void add()}>{busy ? tr('pro.fac.connecting') : tr('common.add')}</button>
        <button className="pro-btn" onClick={() => setAdding(false)}>{tr('common.cancel')}</button>
      </div>
    </section>
  );
}

// ─── the floor ───────────────────────────────────────────────────────────────

interface Flight { key: string; from: { x: number; y: number }; to: { x: number; y: number }; ok: boolean; text?: string }

function FactoryFloor({ factory, onBack, onChanged }: { factory: FactoryView; onBack: () => void; onChanged: () => void }) {
  const [floor, setFloor] = useState<FactoryFloorView | null>(null);
  const [noFloor, setNoFloor] = useState(false);
  const [events, setEvents] = useState<FactoryEventView[]>([]);
  /** The latest batch of events, for the pixel floor to animate. */
  const [fresh, setFresh] = useState<FactoryEventView[]>([]);
  const [view, setView] = useState<'floor' | 'desks' | 'line'>(() => {
    try { const v = window.localStorage.getItem('cth.factory.view'); return v === 'desks' || v === 'line' ? v : 'floor'; } catch { return 'floor'; }
  });
  const pickView = (v: 'floor' | 'desks' | 'line') => { setView(v); try { window.localStorage.setItem('cth.factory.view', v); } catch { /* storage unavailable */ } };
  const [projects, setProjects] = useState<Array<{ id: string; name: string; state?: string }>>([]);
  const [only, setOnly] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const cursor = useRef<string>('');
  const desks = useRef(new Map<string, HTMLElement>());
  const stage = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState(factory.info ?? null);
  useEffect(() => {
    let alive = true;
    void window.cth.factoriesTest(factory.id).then((r) => { if (alive && r.ok && r.info) setInfo(r.info); });
    return () => { alive = false; };
  }, [factory.id]);
  const withInfo = useMemo(() => ({ ...factory, info: info ?? undefined }), [factory, info]);

  // Floor and events, every 3 s (the profile's fallback rate).
  useEffect(() => {
    let alive = true;
    // A factory may rate-limit (429): wait a while before asking again.
    let quietUntil = 0;
    const tick = async () => {
      if (Date.now() < quietUntil) return;
      const f = await window.cth.factoriesFloor(factory.id);
      if (!alive) return;
      if (!f.ok) {
        if (/429|too many|rate/i.test(f.error ?? '')) { quietUntil = Date.now() + 30_000; setError(tr('pro.fac.slowDown')); return; }
        setError(f.error ?? tr('pro.fac.didNotAnswer'));
        return;
      }
      setError(null);
      if (f.floor) setFloor(f.floor); else setNoFloor(true);
      const e = await window.cth.factoriesEvents(factory.id, cursor.current || '0');
      if (!alive || !e.ok || !e.feed) return;
      const first = !cursor.current;
      cursor.current = e.feed.cursor;
      if (e.feed.events.length) {
        setEvents((prev) => [...prev, ...e.feed!.events].slice(-30));
        if (!first) { fly(e.feed.events); setFresh(e.feed.events); }
      }
    };
    void tick();
    const iv = setInterval(() => void tick(), 3000);
    return () => { alive = false; clearInterval(iv); };
  }, [factory.id]);

  /** Hand-offs walk a folder from one desk to the next. */
  const fly = (evs: FactoryEventView[]) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    const at = (name?: string) => {
      const el = name ? desks.current.get(name) : undefined;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left - box.left + r.width / 2, y: r.top - box.top + 18 };
    };
    const added: Flight[] = [];
    for (const ev of evs) {
      if (ev.type !== 'task.handoff') continue;
      const from = at(ev.from); const to = at(ev.to);
      if (from && to) added.push({ key: ev.id, from, to, ok: ev.ok !== false, text: ev.text });
    }
    if (!added.length) return;
    setFlights((f) => [...f, ...added]);
    setTimeout(() => setFlights((f) => f.filter((x) => !added.includes(x))), 1800);
  };

  const groups = useMemo(() => {
    const out = new Map<string, FactoryAgentView[]>();
    for (const a of floor?.agents ?? []) {
      const k = a.role_kind && (ROLE_ORDER as readonly string[]).includes(a.role_kind) ? a.role_kind : 'other';
      out.set(k, [...(out.get(k) ?? []), a]);
    }
    for (const [k, v] of out) {
      // Instances sit next to their base role.
      out.set(k, [...v].sort((a, b) => (a.instance_of ?? a.name).localeCompare(b.instance_of ?? b.name) || a.name.localeCompare(b.name)));
    }
    return [...ROLE_ORDER, 'other'].filter((k) => out.has(k)).map((k) => [k, out.get(k)!] as const);
  }, [floor]);

  const pickedAgent = floor?.agents.find((a) => a.id === picked) ?? null;

  // Projects: the factory's list when it offers one, else what the board shows.
  useEffect(() => {
    if (!info?.tools.includes('projects_list')) return;
    void window.cth.factoriesCall(factory.id, 'projects_list', {}).then((r) => {
      if (r.ok) setProjects(((r.result as { projects?: Array<{ id: string; name: string; state?: string }> })?.projects ?? []));
    });
  }, [factory.id, info]);
  const projectOf = useMemo(() => new Map((floor?.board ?? []).map((b) => [b.id, b.project])), [floor]);
  const projectList = useMemo(() => {
    const known = new Map(projects.map((p) => [p.id, p]));
    for (const b of floor?.board ?? []) if (!known.has(b.project)) known.set(b.project, { id: b.project, name: b.project });
    return [...known.values()];
  }, [projects, floor]);
  const perProject = useMemo(() => {
    const out = new Map<string, { working: number; waiting: number; done: number }>();
    for (const b of floor?.board ?? []) {
      const c = out.get(b.project) ?? { working: 0, waiting: 0, done: 0 };
      if (b.state === 'working' || b.state === 'queued') c.working++;
      else if (b.state === 'waiting') c.waiting++;
      else if (b.state === 'done') c.done++;
      out.set(b.project, c);
    }
    return out;
  }, [floor]);
  /** Workers outside the picked projects (none picked = everyone shows). */
  const [roleOnly, setRoleOnly] = useState<string | null>(null);
  const roleCounts = useMemo(() => {
    const out = new Map<string, { total: number; working: number }>();
    for (const a of floor?.agents ?? []) {
      if (a.state === 'offline') continue;
      const k = a.role_kind ?? 'other';
      const c = out.get(k) ?? { total: 0, working: 0 };
      c.total++;
      if (a.state === 'working' || a.state === 'away') c.working++;
      out.set(k, c);
    }
    return [...ROLE_ORDER, 'other'].filter((k) => out.has(k)).map((k) => [k, out.get(k)!] as const);
  }, [floor]);
  const dimmed = useMemo(() => {
    const out = new Set<string>();
    for (const a of floor?.agents ?? []) {
      const p = a.task ? projectOf.get(a.task.id) : undefined;
      if (only.size && (!p || !only.has(p))) out.add(a.id);
      if (roleOnly && (a.role_kind ?? 'other') !== roleOnly) out.add(a.id);
    }
    return out;
  }, [floor, only, projectOf, roleOnly]);
  const toggleProject = (id: string) => setOnly((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="pro-page">
      <div className="pro-head">
        <button className="pro-btn" onClick={onBack}>← {tr('pro.nav.factories')}</button>
        <h1 className="pro-title" style={{ fontSize: 18 }}>{factory.name}</h1>
        {info && !info.canSend && <StateBadge label={tr('pro.fac.watchOnly')} tone="grey" />}
        {floor?.pacing && <Pacing pacing={floor.pacing} />}
      </div>
      {error && <div className="pro-card" style={{ borderColor: 'var(--cth-coral)' }}><span className="pro-text">{error}</span></div>}
      {noFloor && <div className="pro-card"><span className="pro-text">{tr('pro.fac.noFloor')}</span></div>}

      {floor && (
        <div className="pro-row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <div className="pro-switch" role="group" aria-label={tr('pro.fac.floorView')}>
            <button aria-pressed={view === 'floor'} onClick={() => pickView('floor')}>{tr('pro.memory.map')}</button>
            <button aria-pressed={view === 'desks'} onClick={() => pickView('desks')}>{tr('pro.fac.desks')}</button>
            <button aria-pressed={view === 'line'} onClick={() => pickView('line')}>{tr('pro.fac.line')}</button>
          </div>
          {projectList.length > 1 && projectList.map((p) => {
            const c = perProject.get(p.id);
            return (
              <button key={p.id} className={`pro-chip${only.has(p.id) ? ' pro-chip-on' : ''}`} onClick={() => toggleProject(p.id)}
                title={c ? tr('pro.fac.projectTitle', { working: c.working, waiting: c.waiting, done: c.done }) : undefined}>
                {p.name}{c ? ` · ${c.working}${c.waiting ? ` · ${c.waiting}!` : ''}` : ''}{p.state === 'paused' ? ` (${tr('pro.fac.paused').toLowerCase()})` : ''}
              </button>
            );
          })}
          {only.size > 0 && <button className="pro-btn" onClick={() => setOnly(new Set())}>{tr('pro.fac.allProjects')}</button>}
        </div>
      )}
      {floor && roleCounts.length > 0 && (
        <div className="pro-row" style={{ flexWrap: 'wrap', gap: 6 }} aria-label={tr('pro.fac.roles')}>
          {roleCounts.map(([k, c]) => (
            <button key={k} className={`pro-chip${roleOnly === k ? ' pro-chip-on' : ''}`} onClick={() => setRoleOnly(roleOnly === k ? null : k)}
              title={tr('pro.fac.atWork', { working: c.working, total: c.total })}>
              <span className="pro-dot" style={{ background: `#${(ROLE_GLOW[k] ?? 0x9a9a9a).toString(16).padStart(6, '0')}`, marginInlineEnd: 4 }} />
              {roleLabel(k)} · {c.working}/{c.total}
            </button>
          ))}
        </div>
      )}
      {floor && view === 'floor' && (
        <FactoryScene floor={floor} events={fresh} dimmed={dimmed} onPick={(id) => setPicked(picked === id ? null : id)} />
      )}
      {floor && view === 'line' && (
        <LineView floor={floor} dimmed={dimmed} projectOf={projectOf} picked={picked} onPick={(id) => setPicked(picked === id ? null : id)} />
      )}
      {floor && view === 'desks' && (
        <div ref={stage} className="pro-card" style={{ position: 'relative', display: 'flex', gap: 12, overflowX: 'auto', flexShrink: 0, alignItems: 'flex-start' }}>
          {groups.map(([kind, agents], i) => (
            <div key={kind} style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, paddingInlineEnd: 12,
              borderInlineEnd: i < groups.length - 1 ? '1px dashed var(--cth-ink-100)' : 'none' }}>
              <span className="pro-col-head" style={{ padding: 0 }}>{roleLabel(kind)}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {agents.map((a) => (
                  <Desk key={a.id} agent={a} project={a.task ? projectOf.get(a.task.id) : undefined} dim={dimmed.has(a.id)} picked={picked === a.id} onPick={() => setPicked(picked === a.id ? null : a.id)}
                    deskRef={(el) => { if (el) desks.current.set(a.name, el); else desks.current.delete(a.name); }} />
                ))}
              </div>
            </div>
          ))}
          {flights.map((f) => <Folder key={f.key} flight={f} />)}
        </div>
      )}

      {pickedAgent && <AgentDetail agent={pickedAgent} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(220px, 1fr)', gap: 14, alignItems: 'start' }}>
        <Board factory={withInfo} floor={floor} only={only} events={events} onChanged={onChanged} />
        <EventLog events={events} />
      </div>
    </div>
  );
}

function Desk({ agent, project, dim, picked, onPick, deskRef }: {
  agent: FactoryAgentView; project?: string; dim?: boolean; picked: boolean; onPick: () => void; deskRef: (el: HTMLElement | null) => void;
}) {
  const fresh = agent.hired_at ? Date.now() - Date.parse(agent.hired_at) < 20_000 : false;
  const gone = agent.state === 'offline';
  return (
    <button
      ref={deskRef}
      onClick={onPick}
      className={`pro-desk${fresh ? ' pro-desk-new' : ''}`}
      aria-pressed={picked}
      title={[agent.role, agent.waiting_for, agent.state === 'away' && agent.at ? `at the ${agent.at.replace('_', ' ')}` : null].filter(Boolean).join(' · ')}
      style={{
        // Everything inside is clipped to the desk: long task titles wrap to two
        // lines and end in "…" instead of running into the next desk.
        width: 150, minWidth: 0, overflow: 'hidden', textAlign: 'start', padding: 8, display: 'flex', flexDirection: 'column', gap: 4,
        border: `1px solid ${picked ? 'var(--cth-ink-900)' : 'var(--cth-ink-100)'}`, borderRadius: 8,
        background: gone ? 'transparent' : agent.kind === 'automation' ? 'var(--cth-cream-200)' : 'var(--cth-paper-100)',
        opacity: dim ? 0.35 : gone || agent.state === 'away' ? 0.55 : 1, cursor: 'pointer', position: 'relative'
      }}
    >
      <div className="pro-row" style={{ gap: 6 }}>
        <span className={agent.state === 'working' ? 'pro-typing' : undefined} style={{ lineHeight: 0 }}>
          {gone ? <span style={{ width: 32, height: 32, display: 'inline-block' }} /> : <Avatar agent={{ character: faceFor(agent.name) }} scale={2} />}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <strong title={agent.display_name ?? agent.name} style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{agent.display_name ?? agent.name}</strong>
          <span className="pro-sub" style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.display_name ? agent.name : agent.role}</span>
        </span>
      </div>
      <StateBadge label={agent.state === 'away' && agent.at ? `${stateLabel('away')} · ${agent.at.replace('_', ' ')}` : stateLabel(agent.state)} tone={STATE_TONE[agent.state]} />
      {agent.task && (
        <span className="pro-sub" title={agent.task.title} style={{ fontSize: 11, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word', maxWidth: '100%' }}>
          {project ? `[${project}] ` : ''}{agent.task.title}{agent.task.stage ? ` · ${agent.task.stage}` : ''}
        </span>
      )}
      {agent.state === 'waiting' && agent.waiting_for && (
        <span style={{ fontSize: 11, color: 'var(--cth-ink-700)', fontStyle: 'italic', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{agent.waiting_for}</span>
      )}
      {(agent.queue?.length ?? 0) > 0 && <span className="pro-ticket">{agent.queue!.length} in tray</span>}
    </button>
  );
}

/** A folder carried from one desk to the next; red when work goes back. */
function Folder({ flight }: { flight: Flight }) {
  const el = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const n = el.current;
    if (!n) return;
    n.animate([
      { transform: `translate(${flight.from.x}px, ${flight.from.y}px) scale(.8)`, opacity: 0 },
      { transform: `translate(${flight.from.x}px, ${flight.from.y}px) scale(1)`, opacity: 1, offset: 0.12 },
      { transform: `translate(${flight.to.x}px, ${flight.to.y}px) scale(1)`, opacity: 1, offset: 0.85 },
      { transform: `translate(${flight.to.x}px, ${flight.to.y}px) scale(.8)`, opacity: 0 }
    ], { duration: 1700, easing: 'ease-in-out', fill: 'forwards' });
  }, [flight]);
  return (
    <span ref={el} title={flight.text} style={{
      position: 'absolute', left: -9, top: -7, width: 18, height: 14, borderRadius: 2, pointerEvents: 'none',
      background: flight.ok ? 'var(--cth-lemon)' : 'var(--cth-coral)', boxShadow: '0 0 0 1px var(--cth-ink-900)'
    }} />
  );
}

function AgentDetail({ agent }: { agent: FactoryAgentView }) {
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="pro-row">
        <strong>{agent.display_name ? `${agent.display_name} · ${agent.name}` : agent.name}</strong>
        <span className="pro-sub">{agent.role}{agent.kind === 'automation' ? ' · automation' : ''}</span>
        {agent.spent_usd !== undefined && <span className="pro-sub pro-mono" style={{ marginInlineStart: 'auto' }}>${agent.spent_usd.toFixed(2)} (notional)</span>}
      </div>
      {agent.waiting_for && <span className="pro-text">{agent.waiting_for}</span>}
      {(agent.queue?.length ?? 0) > 0 && <span className="pro-text">Next: {agent.queue!.map((q) => q.title).join(', ')}</span>}
      {(agent.history?.length ?? 0) > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {agent.history!.map((h, i) => (
            <span key={i} className="pro-mono" style={{ color: h.result === 'ok' ? 'var(--cth-ink-700)' : 'var(--cth-coral)' }}>
              {h.result === 'ok' ? '✓' : '✗'} {h.task} · {h.step}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function Pacing({ pacing }: { pacing: NonNullable<FactoryFloorView['pacing']> }) {
  const paused = pacing.mode === 'paused';
  return (
    <span className="pro-row" style={{ gap: 12, marginInlineStart: 'auto' }} title={pacing.reason}>
      {paused && <StateBadge label={tr('pro.fac.paused')} tone="amber" />}
      {pacing.running !== undefined && <span className="pro-sub pro-mono" style={{ fontSize: 11 }}>{pacing.running}{pacing.capacity ? `/${pacing.capacity}` : ''} {tr('pro.fac.runningWord')}</span>}
      <UsageWindow label="5 h" own={pacing.own_5h_pct} account={pacing.window_5h_pct} ceiling={pacing.ceiling_5h_pct} />
      <UsageWindow label="7 d" own={pacing.own_7d_pct} account={pacing.window_7d_pct} ceiling={pacing.ceiling_7d_pct} />
    </span>
  );
}

/** One usage window: the factory's own use (strong), the rest of the account
 *  behind it (light), and the factory's ceiling (tick). Without the split it
 *  shows the account total alone. */
function UsageWindow({ label, own, account, ceiling }: { label: string; own?: number; account?: number; ceiling?: number }) {
  if (own === undefined && account === undefined) return null;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const total = account ?? own ?? 0;
  const tip = [
    own !== undefined ? tr('pro.fac.tipFactory', { pct: Math.round(own) }) : null,
    account !== undefined ? tr('pro.fac.tipAccount', { pct: Math.round(account) }) : null,
    ceiling !== undefined ? tr('pro.fac.tipCeiling', { pct: Math.round(ceiling) }) : null
  ].filter(Boolean).join(' · ');
  const near = ceiling !== undefined && own !== undefined ? own >= ceiling - 5 : total >= 90;
  return (
    <span className="pro-row" style={{ gap: 6 }} title={tip}>
      <span className="pro-sub pro-mono" style={{ fontSize: 11 }}>{label}</span>
      <span style={{ position: 'relative', width: 90, height: 7, borderRadius: 4, background: 'var(--pro-line)', overflow: 'hidden', display: 'inline-block' }}>
        <span style={{ position: 'absolute', insetBlock: 0, insetInlineStart: 0, width: `${clamp(total)}%`, background: near ? 'var(--cth-coral-light)' : 'var(--cth-sky-light)' }} />
        {own !== undefined && <span style={{ position: 'absolute', insetBlock: 0, insetInlineStart: 0, width: `${clamp(own)}%`, background: near ? 'var(--cth-coral)' : 'var(--cth-sky)' }} />}
        {ceiling !== undefined && <span style={{ position: 'absolute', insetBlock: -1, insetInlineStart: `calc(${clamp(ceiling)}% - 1px)`, width: 2, background: 'var(--cth-ink-900)' }} />}
      </span>
      <span className="pro-sub pro-mono" style={{ fontSize: 11 }}>
        {own !== undefined ? `${Math.round(own)}%` : `${Math.round(total)}%`}{ceiling !== undefined ? ` / ${Math.round(ceiling)}%` : ''}
      </span>
    </span>
  );
}

// ─── board, asks, sending work ──────────────────────────────────────────────

interface TaskView {
  task_id: string; project: string; project_name?: string; title: string; state: string; stage?: string; agent?: string;
  attempts?: number; parent_id?: string; parts?: string[];
  state_since?: string; stage_since?: string; created_at?: string; updated_at?: string;
  ask?: { id: string; kind: 'question' | 'approval'; question: string; options?: string[] };
  output?: { summary?: string; repo?: string; pr_url?: string; deploy_url?: string };
}
const COLUMNS: Array<{ id: string; readonly label: string; match: (s: string) => boolean }> = [
  { id: 'queued', get label() { return tr('pro.fac.col_queued'); }, match: (s) => s === 'queued' },
  { id: 'working', get label() { return tr('pro.fac.col_working'); }, match: (s) => s === 'working' },
  { id: 'waiting', get label() { return tr('pro.fac.col_waiting'); }, match: (s) => s === 'waiting' },
  { id: 'done', get label() { return tr('pro.fac.col_done'); }, match: (s) => s === 'done' || s === 'failed' || s === 'cancelled' }
];
const FIRST = 5;
const MORE = 10;

/** "3 h", "2 d", "40 min" since an ISO time. */
function since(iso?: string): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  const m = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}
/** When the task entered where it is now: the factory's own field when it
 *  sends one, else its last update (an approximation). */
function inStateFor(t: TaskView): { text: string; exact: boolean } | null {
  const exact = t.stage_since ?? t.state_since;
  const s = since(exact ?? t.updated_at);
  return s ? { text: s, exact: !!exact } : null;
}

function Board({ factory, floor, only, events, onChanged }: {
  factory: FactoryView; floor: FactoryFloorView | null; only: Set<string>; events: FactoryEventView[]; onChanged: () => void;
}) {
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<string | null>(null);
  const info = factory.info;
  const load = useCallback(() => {
    if (!info?.tools.includes('task_list')) return;
    void window.cth.factoriesCall(factory.id, 'task_list', { limit: 1000, include_parts: true }).then((r) => {
      if (r.ok) setTasks(((r.result as { tasks?: TaskView[] })?.tasks ?? []));
    });
  }, [factory.id, info]);
  useEffect(() => { load(); const iv = setInterval(load, 8000); return () => clearInterval(iv); }, [load]);

  // No task_list: fall back to the floor's board.
  const all: TaskView[] = tasks.length || !floor ? tasks
    : floor.board.map((b) => ({ task_id: b.id, project: b.project, title: b.title, state: b.state, stage: b.stage, agent: b.assignee }));
  const byId = useMemo(() => new Map(all.map((t) => [t.task_id, t])), [all]);
  // Parts are listed under their parent, not as cards of their own.
  const top = all.filter((t) => !t.parent_id || !byId.has(t.parent_id));
  const q = query.trim().toLowerCase();
  const match = (t: TaskView) => !q || [t.title, t.task_id, t.agent, t.project, t.project_name, t.stage]
    .some((v) => v?.toLowerCase().includes(q))
    || (t.parts ?? []).some((p) => byId.get(p)?.title.toLowerCase().includes(q));
  const newestFirst = (a: TaskView, b: TaskView) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
  const openTask = open ? byId.get(open) ?? null : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      {info?.canSend && <SendTask factory={factory} onSent={load} />}
      <div className="pro-row" style={{ gap: 8 }}>
        <input className="pro-input" type="search" placeholder={tr('pro.fac.searchPh')} value={query}
          onChange={(e) => { setQuery(e.target.value); setShown({}); }} style={{ flex: 1 }} />
        {tasks.length > 0 && <span className="pro-sub" style={{ fontSize: 12 }}>{tr('kanban.count', { count: top.length })}</span>}
      </div>
      <div className="pro-board">
        {COLUMNS.map((c) => {
          const items = top.filter((t) => c.match(t.state) && (!only.size || only.has(t.project)) && match(t)).sort(newestFirst);
          const n = shown[c.id] ?? FIRST;
          return (
            <div key={c.id} className="pro-col">
              <span className="pro-col-head">{c.label} <span className="pro-sub">{items.length}</span></span>
              {items.slice(0, n).map((t) => (
                <TaskCard key={t.task_id} task={t} parts={(t.parts ?? []).map((p) => byId.get(p)).filter((p): p is TaskView => !!p)}
                  onOpen={setOpen} />
              ))}
              {items.length > n && (
                <button className="pro-btn" onClick={() => setShown((s) => ({ ...s, [c.id]: n + MORE }))}>
                  Show {Math.min(MORE, items.length - n)} more ({items.length - n} left)
                </button>
              )}
            </div>
          );
        })}
      </div>
      {openTask && (
        <TaskDetail factory={factory} task={openTask} parent={openTask.parent_id ? byId.get(openTask.parent_id) : undefined}
          parts={(openTask.parts ?? []).map((p) => byId.get(p)).filter((p): p is TaskView => !!p)}
          events={events.filter((e) => e.task === openTask.task_id || (openTask.parts ?? []).includes(e.task ?? ''))}
          onOpen={setOpen} onClose={() => setOpen(null)} onChanged={() => { load(); onChanged(); }} />
      )}
    </div>
  );
}

function TaskCard({ task, parts, onOpen }: { task: TaskView; parts: TaskView[]; onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const inState = inStateFor(task);
  const doneParts = parts.filter((p) => p.state === 'done').length;
  return (
    <div className="pro-card" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <button onClick={() => onOpen(task.task_id)} title={tr('pro.fac.openTask')}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>{task.title}</span>
        <span className="pro-ticket" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.task_id} · {task.project_name ?? task.project}{task.stage ? ` · ${task.stage}` : ''}{task.agent ? ` · ${task.agent}` : ''}
        </span>
        <span className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {task.state === 'failed' && <StateBadge label={tr('pro.fac.failed')} tone="red" />}
          {task.state === 'cancelled' && <StateBadge label={tr('pro.fac.cancelled')} tone="grey" />}
          {task.ask && <StateBadge label={task.ask.kind === 'approval' ? tr('pro.fac.needsApproval') : tr('pro.fac.question')} tone="amber" />}
          {inState && <span className="pro-ticket" title={inState.exact ? tr('pro.fac.timeInState') : tr('pro.fac.sinceUpdate')}>{inState.exact ? '' : '~'}{inState.text}{task.stage ? ` · ${task.stage}` : ''}</span>}
        </span>
      </button>
      {parts.length > 0 && (
        <>
          <button className="pro-ticket" onClick={() => setExpanded(!expanded)} style={{ all: 'unset', cursor: 'pointer', fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-700)' }}>
            {expanded ? '▾' : '▸'} {tr('pro.fac.parts', { count: parts.length, done: doneParts })}
          </button>
          {expanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingInlineStart: 10, borderInlineStart: '2px solid var(--cth-ink-100)' }}>
              {parts.map((p) => (
                <button key={p.task_id} onClick={() => onOpen(p.task_id)} style={{ all: 'unset', cursor: 'pointer', fontSize: 11, display: 'flex', gap: 6, minWidth: 0 }}>
                  <span style={{ color: p.state === 'done' ? 'var(--cth-mint)' : p.state === 'failed' ? 'var(--cth-coral)' : 'var(--cth-ink-500)' }}>
                    {p.state === 'done' ? '✓' : p.state === 'failed' ? '✗' : '•'}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** One task in full: where it is, who has it, how long, its parts and parent,
 *  what came out of it, and what happened to it. */
function TaskDetail({ factory, task, parent, parts, events, onOpen, onClose, onChanged }: {
  factory: FactoryView; task: TaskView; parent?: TaskView; parts: TaskView[]; events: FactoryEventView[];
  onOpen: (id: string) => void; onClose: () => void; onChanged: () => void;
}) {
  const [full, setFull] = useState<TaskView>(task);
  const [text, setText] = useState('');
  useEffect(() => {
    setFull(task);
    if (!factory.info?.tools.includes('task_get')) return;
    void window.cth.factoriesCall(factory.id, 'task_get', { task_id: task.task_id }).then((r) => { if (r.ok && r.result) setFull({ ...task, ...(r.result as TaskView) }); });
  }, [factory.id, factory.info, task]);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const t = full;
  const inState = inStateFor(t);
  const answer = async (approve?: boolean) => {
    if (!t.ask) return;
    await window.cth.factoriesCall(factory.id, 'task_answer', { task_id: t.task_id, ask_id: t.ask.id, ...(text ? { text } : {}), ...(approve !== undefined ? { approve } : {}) });
    setText('');
    onChanged();
  };
  const link = (url: string, label: string) => (
    <a className="pro-mono" href={url} onClick={(e) => { e.preventDefault(); void window.cth.openExternal(url); }}>{label}</a>
  );
  return (
    <div role="dialog" aria-label={t.title} onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(20, 16, 12, 0.35)', display: 'flex', justifyContent: 'flex-end'
    }}>
      <aside onClick={(e) => e.stopPropagation()} className="pro-card" style={{
        width: 'min(520px, 92vw)', height: '100%', borderRadius: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12
      }}>
        <div className="pro-row">
          <span className="pro-ticket">{t.task_id}</span>
          <button className="pro-btn" style={{ marginInlineStart: 'auto' }} onClick={onClose}>{tr('common.close')}</button>
        </div>
        <h2 style={{ margin: 0, fontSize: 16, lineHeight: 1.35 }}>{t.title}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 13 }}>
          <span className="pro-sub">{tr('pro.fac.state')}</span><span>{t.state}{t.stage ? ` · ${t.stage}` : ''}{inState ? ` · ${inState.exact ? '' : '~'}${inState.text}` : ''}</span>
          <span className="pro-sub">{tr('pro.fac.project')}</span><span>{t.project_name ?? t.project}</span>
          {t.agent && <><span className="pro-sub">{tr('pro.fac.worker')}</span><span>{t.agent}</span></>}
          {t.attempts !== undefined && <><span className="pro-sub">{tr('pro.fac.attempts')}</span><span>{t.attempts}</span></>}
          {t.created_at && <><span className="pro-sub">{tr('pro.fac.created')}</span><span>{new Date(t.created_at).toLocaleString()}</span></>}
          {t.updated_at && <><span className="pro-sub">{tr('pro.fac.updated')}</span><span>{new Date(t.updated_at).toLocaleString()}</span></>}
        </div>
        {parent && (
          <div className="pro-row" style={{ gap: 6, fontSize: 12 }}>
            <span className="pro-sub">{tr('pro.fac.partOf')}</span>
            <button className="pro-btn" onClick={() => onOpen(parent.task_id)}>{parent.title}</button>
          </div>
        )}
        {(t.output?.summary || t.output?.pr_url || t.output?.deploy_url || t.output?.repo) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="pro-col-head" style={{ padding: 0 }}>{tr('pro.fac.output')}</span>
            {t.output.summary && <span className="pro-text">{t.output.summary}</span>}
            <span className="pro-row" style={{ gap: 10 }}>
              {t.output.pr_url && link(t.output.pr_url, tr('pro.fac.pullRequest'))}
              {t.output.deploy_url && link(t.output.deploy_url, tr('pro.fac.deployed'))}
              {t.output.repo && link(t.output.repo, tr('pro.fac.repository'))}
            </span>
          </div>
        )}
        {t.ask && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, background: 'var(--cth-lemon-light)', borderRadius: 6 }}>
            <strong style={{ fontSize: 13 }}>{t.ask.kind === 'approval' ? tr('pro.fac.needsApproval') : tr('pro.fac.question')}</strong>
            <span style={{ fontSize: 13 }}>{t.ask.question}</span>
            {factory.info?.canAnswer ? (
              t.ask.kind === 'approval' ? (
                <div className="pro-row" style={{ gap: 6 }}>
                  <button className="pro-btn pro-btn-primary" onClick={() => void answer(true)}>{tr('triggerHistory.approve')}</button>
                  <button className="pro-btn" onClick={() => void answer(false)}>{tr('triggerHistory.reject')}</button>
                </div>
              ) : (
                <div className="pro-row" style={{ gap: 6 }}>
                  <input className="pro-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={tr('pro.fac.yourAnswer')} style={{ flex: 1 }} />
                  <button className="pro-btn" disabled={!text.trim()} onClick={() => void answer()}>{tr('threads.send')}</button>
                </div>
              )
            ) : <span className="pro-sub" style={{ fontSize: 12 }}>{tr('pro.fac.answerElsewhere')}</span>}
          </div>
        )}
        {parts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="pro-col-head" style={{ padding: 0 }}>{tr('pro.fac.partsHead', { done: parts.filter((p) => p.state === 'done').length, count: parts.length })}</span>
            {parts.map((p) => (
              <button key={p.task_id} onClick={() => onOpen(p.task_id)} className="pro-card" style={{ padding: '6px 8px', display: 'flex', gap: 8, alignItems: 'center', textAlign: 'start' }}>
                <StateBadge label={p.state} tone={p.state === 'done' ? 'green' : p.state === 'failed' ? 'red' : p.state === 'waiting' ? 'amber' : p.state === 'working' ? 'blue' : 'grey'} />
                <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                {p.agent && <span className="pro-ticket">{p.agent}</span>}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="pro-col-head" style={{ padding: 0 }}>What happened{events.length ? '' : ' (since this screen opened: nothing yet)'}</span>
          {[...events].reverse().map((e) => (
            <span key={e.id} className="pro-mono" style={{ color: e.ok === false ? 'var(--cth-coral)' : 'var(--cth-ink-700)' }}>
              {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {e.type.replace('task.', '')}
              {e.from || e.to ? ` ${e.from ?? ''}→${e.to ?? ''}` : ''}{e.text ? `: ${e.text}` : ''}
            </span>
          ))}
        </div>
      </aside>
    </div>
  );
}

function SendTask({ factory, onSent }: { factory: FactoryView; onSent: () => void }) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [project, setProject] = useState('');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void window.cth.factoriesCall(factory.id, 'projects_list', {}).then((r) => {
      const ps = ((r.result as { projects?: Array<{ id: string; name: string; state?: string }> })?.projects ?? []).filter((p) => p.state !== 'done');
      setProjects(ps);
      if (ps[0]) setProject((p) => p || ps[0].id);
    });
  }, [factory.id]);
  const send = async () => {
    setMsg(null);
    const r = await window.cth.factoriesCall(factory.id, 'task_create', {
      project, title: title.trim(), detail: detail.trim(), client_ref: `sb-${Date.now().toString(36)}`
    });
    if (!r.ok) { setMsg(r.error ?? tr('pro.team.notSent')); return; }
    setTitle(''); setDetail('');
    setMsg(tr('pro.fac.sent', { id: (r.result as { task_id?: string })?.task_id ?? 'ok' }));
    onSent();
  };
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <strong style={{ fontSize: 13 }}>{tr('pro.fac.sendTask')}</strong>
      <div className="pro-row" style={{ gap: 6 }}>
        <select className="pro-input" value={project} onChange={(e) => setProject(e.target.value)} style={{ maxWidth: 180 }}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input className="pro-input" placeholder={tr('pro.fac.whatToBuild')} value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1 }} />
      </div>
      <textarea className="pro-input" rows={3} placeholder={tr('pro.fac.detailsPh')} value={detail} onChange={(e) => setDetail(e.target.value)} />
      <div className="pro-row">
        <button className="pro-btn pro-btn-primary" disabled={!project || !title.trim() || !detail.trim()} onClick={() => void send()}>{tr('threads.send')}</button>
        {msg && <span className="pro-sub" style={{ fontSize: 12 }}>{msg}</span>}
      </div>
    </section>
  );
}

function EventLog({ events }: { events: FactoryEventView[] }) {
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 420, overflowY: 'auto' }}>
      <span className="pro-col-head" style={{ padding: 0 }}>{tr('pro.fac.whatHappened')}</span>
      {events.length === 0 && <span className="pro-sub" style={{ fontSize: 12 }}>{tr('commandCenter.nothingYet')}</span>}
      {[...events].reverse().map((e) => (
        <span key={e.id} className="pro-mono" style={{ color: e.ok === false ? 'var(--cth-coral)' : 'var(--cth-ink-700)' }}>
          {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}{' '}
          {e.type.replace('task.', '')}{e.from || e.to ? ` ${e.from ?? ''}→${e.to ?? ''}` : ''}{e.task ? ` ${e.task}` : ''}{e.text ? `: ${e.text}` : ''}
        </span>
      ))}
    </section>
  );
}

/** The Line: one row per worker, in pipeline order, reading left to right —
 *  what they finished, what they are on now, what is lined up for them. */
function LineView({ floor, dimmed, projectOf, picked, onPick }: {
  floor: FactoryFloorView; dimmed: Set<string>; projectOf: Map<string, string>; picked: string | null; onPick: (id: string) => void;
}) {
  const rows = [...floor.agents].sort((x, y) =>
    ((ROLE_ORDER as readonly string[]).indexOf(x.role_kind ?? '') + 1 || 99) - ((ROLE_ORDER as readonly string[]).indexOf(y.role_kind ?? '') + 1 || 99)
    || (x.instance_of ?? x.name).localeCompare(y.instance_of ?? y.name) || x.name.localeCompare(y.name));
  const titleOf = new Map(floor.board.map((b) => [b.id, b.title]));
  let lastKind = '';
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0, padding: '8px 10px' }}>
      {rows.map((a) => {
        const kind = a.role_kind ?? 'other';
        const head = kind !== lastKind ? (lastKind = kind, <span key={`h-${kind}`} className="pro-col-head" style={{ padding: '8px 2px 2px' }}>{roleLabel(kind)}</span>) : null;
        const project = a.task ? projectOf.get(a.task.id) : undefined;
        return (
          <div key={a.id} style={{ display: 'contents' }}>
            {head}
            <button onClick={() => onPick(a.id)} aria-pressed={picked === a.id} style={{
              display: 'grid', gridTemplateColumns: '190px minmax(120px, 1fr) minmax(200px, 2fr) minmax(120px, 1fr)', gap: 10, alignItems: 'center',
              padding: '6px 8px', border: 'none', borderRadius: 6, textAlign: 'start', cursor: 'pointer', font: 'inherit', color: 'inherit',
              background: picked === a.id ? 'var(--cth-lemon-light)' : 'transparent', opacity: dimmed.has(a.id) ? 0.35 : a.state === 'offline' ? 0.5 : 1
            }}>
              {/* who */}
              <span className="pro-row" style={{ gap: 8, minWidth: 0 }}>
                <Avatar agent={{ character: faceFor(a.name) }} scale={1.5} />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <strong style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.display_name ?? a.name}</strong>
                  <StateBadge label={a.state === 'away' && a.at ? `${stateLabel('away')} · ${a.at.replace('_', ' ')}` : stateLabel(a.state)} tone={STATE_TONE[a.state]} />
                </span>
              </span>
              {/* done: the last steps, oldest first */}
              <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minWidth: 0 }}>
                {(a.history ?? []).slice(-4).map((h, i) => (
                  <span key={i} className="pro-chip" title={`${titleOf.get(h.task) ?? h.task} · ${h.step}`}
                    style={{ fontSize: 10, color: h.result === 'ok' ? 'var(--cth-ink-700)' : 'var(--cth-coral)' }}>
                    {h.result === 'ok' ? '✓' : '✗'} {h.step}
                  </span>
                ))}
              </span>
              {/* now */}
              <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {a.task ? (
                  <>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{a.task.title}</span>
                    <span className="pro-ticket">{project ? `${project} · ` : ''}{a.task.id}{a.task.stage ? ` · ${a.task.stage}` : ''}</span>
                  </>
                ) : <span className="pro-sub" style={{ fontSize: 12 }}>—</span>}
                {a.waiting_for && <span style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--cth-ink-700)' }}>{a.waiting_for}</span>}
              </span>
              {/* next */}
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                {(a.queue ?? []).slice(0, 3).map((q) => (
                  <span key={q.id} className="pro-ticket" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>→ {q.title}</span>
                ))}
                {(a.queue?.length ?? 0) > 3 && <span className="pro-ticket">+{a.queue!.length - 3} more</span>}
              </span>
            </button>
          </div>
        );
      })}
    </section>
  );
}
