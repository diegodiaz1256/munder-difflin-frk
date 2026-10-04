import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { OfficeCharacterName } from '@/scene/office/cast';
import type {
  FactoryAgentView, FactoryEventView, FactoryFloorView, FactoryView
} from '../../../preload/index';
import { Avatar, Bar, StateBadge, type Tone } from './data';
import { Guide, useGuide } from './Guide';
import { FactoryScene, ROLE_GLOW } from '@/scene/office/FactoryScene';

/**
 * Factories: software factories this office sends work to, or just watches
 * (FACTORY-MCP.md). A factory is a Factory MCP server; main holds its token and
 * talks to it (main/factories.ts). This screen lists them and shows one as a
 * live floor: a desk per worker, work handed from desk to desk, the board, its
 * pacing, and — when the factory allows it — a form to send it a task.
 */

const STEPS: Array<[string, string]> = [
  ['A factory takes whole jobs', 'A software factory is a system that builds software on its own: planners, developers, reviewers and QA in a pipeline. Anything that speaks Factory MCP (an open profile of MCP) can be one.'],
  ['Add it with its address and a token', 'The factory gives you an https address and an access token. The token is stored encrypted on this machine and used only by the app; your agents never see it.'],
  ['Watch the floor', 'Open a factory to see each worker at a desk, what they are on, work moving between desks (red when it is sent back), the board and how close it is to its usage limits.'],
  ['Send it work, if it lets you', 'Some factories accept tasks from here and let you answer their questions; others are watch-only and take work through their own channels. The screen shows what each one allows.']
];

const STATE_TONE: Record<FactoryAgentView['state'], Tone> = {
  working: 'green', waiting: 'amber', resting: 'blue', idle: 'grey', away: 'gold', offline: 'grey'
};
const STATE_LABEL: Record<FactoryAgentView['state'], string> = {
  working: 'Working', waiting: 'Waiting', resting: 'On a break', idle: 'Idle', away: 'Away', offline: 'Off'
};
const ROLE_ORDER = ['planner', 'orderer', 'builder', 'reviewer', 'qa', 'automation'] as const;
const ROLE_LABEL: Record<string, string> = {
  planner: 'Planning', orderer: 'Ordering', builder: 'Building', reviewer: 'Review', qa: 'QA', automation: 'Automation', other: 'Others'
};
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
        <h1 className="pro-title" style={{ fontSize: 18 }}>Factories</h1>
        <span className="pro-sub">Software factories this office sends work to, or watches.</span>
        <div className="pro-head-end">
          <button className="pro-btn" onClick={toggleGuide}>{guideOpen ? 'Hide guide' : 'How it works'}</button>
        </div>
      </div>
      {guideOpen && <Guide title="Factories" steps={STEPS} onClose={toggleGuide}
        footer={<>Any server following FACTORY-MCP.md works, including the demo one: <span className="pro-mono">node tools/mock-factory.cjs</span>.</>} />}
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
  const remove = () => {
    if (!window.confirm(`Remove the factory "${factory.name}"? Its token is deleted from this machine.`)) return;
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
        {status === null ? <StateBadge label="Checking" tone="grey" />
          : status.ok ? <StateBadge label={info && !info.canSend ? 'Watch only' : 'Connected'} tone="green" />
          : <StateBadge label="No answer" tone="red" />}
      </div>
      {status && !status.ok && <span className="pro-sub" style={{ fontSize: 12 }}>{status.error}</span>}
      {team && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="pro-sub" style={{ fontSize: 12 }}>{team.running ?? 0} running{team.capacity ? ` of ${team.capacity}` : ''}</span>
          {team.usage?.window_5h_pct !== undefined && <UsageBar label="5 h" pct={team.usage.window_5h_pct} />}
          {team.usage?.window_7d_pct !== undefined && <UsageBar label="7 d" pct={team.usage.window_7d_pct} />}
        </div>
      )}
      <div className="pro-row">
        <button className="pro-btn pro-btn-primary" onClick={onOpen} disabled={!status?.ok}>Open floor</button>
        <button className="pro-btn" style={{ marginInlineStart: 'auto' }} onClick={remove}>Remove</button>
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
    if (!r.ok || !r.id) { onError(r.error ?? 'Not added.'); return; }
    setName(''); setUrl(''); setToken(''); setAdding(false);
    onAdded(r.id);
  };
  if (!adding) {
    return (
      <button className="pro-card" onClick={() => setAdding(true)}
        style={{ borderStyle: 'dashed', cursor: 'pointer', minHeight: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="pro-sub">+ Add a factory</span>
      </button>
    );
  }
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <strong style={{ fontSize: 13 }}>Add a factory</strong>
      <input className="pro-input" placeholder="Name (optional)" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      <input className="pro-input pro-mono" placeholder="https://factory.example/mcp" value={url} onChange={(e) => setUrl(e.target.value)} />
      <input className="pro-input pro-mono" type="password" autoComplete="off" placeholder="Access token" value={token} onChange={(e) => setToken(e.target.value)} />
      <span className="pro-sub" style={{ fontSize: 11 }}>The token is kept encrypted on this machine; agents never see it.</span>
      <div className="pro-row">
        <button className="pro-btn pro-btn-primary" disabled={busy || !url.trim() || !token.trim()} onClick={() => void add()}>{busy ? 'Connecting…' : 'Add'}</button>
        <button className="pro-btn" onClick={() => setAdding(false)}>Cancel</button>
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
  const [view, setView] = useState<'floor' | 'desks'>(() => {
    try { return window.localStorage.getItem('cth.factory.view') === 'desks' ? 'desks' : 'floor'; } catch { return 'floor'; }
  });
  const pickView = (v: 'floor' | 'desks') => { setView(v); try { window.localStorage.setItem('cth.factory.view', v); } catch { /* storage unavailable */ } };
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
    const tick = async () => {
      const f = await window.cth.factoriesFloor(factory.id);
      if (!alive) return;
      if (!f.ok) { setError(f.error ?? 'The factory did not answer.'); return; }
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
        <button className="pro-btn" onClick={onBack}>← Factories</button>
        <h1 className="pro-title" style={{ fontSize: 18 }}>{factory.name}</h1>
        {info && !info.canSend && <StateBadge label="Watch only" tone="grey" />}
        {floor?.pacing && <Pacing pacing={floor.pacing} />}
      </div>
      {error && <div className="pro-card" style={{ borderColor: 'var(--cth-coral)' }}><span className="pro-text">{error}</span></div>}
      {noFloor && <div className="pro-card"><span className="pro-text">This factory does not share its floor. Its tasks are below.</span></div>}

      {floor && (
        <div className="pro-row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <div className="pro-switch" role="group" aria-label="Floor view">
            <button aria-pressed={view === 'floor'} onClick={() => pickView('floor')}>Map</button>
            <button aria-pressed={view === 'desks'} onClick={() => pickView('desks')}>Desks</button>
          </div>
          {projectList.length > 1 && projectList.map((p) => {
            const c = perProject.get(p.id);
            return (
              <button key={p.id} className={`pro-chip${only.has(p.id) ? ' pro-chip-on' : ''}`} onClick={() => toggleProject(p.id)}
                title={c ? `${c.working} in the line · ${c.waiting} waiting · ${c.done} done` : undefined}>
                {p.name}{c ? ` · ${c.working}${c.waiting ? ` · ${c.waiting}!` : ''}` : ''}{p.state === 'paused' ? ' (paused)' : ''}
              </button>
            );
          })}
          {only.size > 0 && <button className="pro-btn" onClick={() => setOnly(new Set())}>All projects</button>}
        </div>
      )}
      {floor && roleCounts.length > 0 && (
        <div className="pro-row" style={{ flexWrap: 'wrap', gap: 6 }} aria-label="Roles">
          {roleCounts.map(([k, c]) => (
            <button key={k} className={`pro-chip${roleOnly === k ? ' pro-chip-on' : ''}`} onClick={() => setRoleOnly(roleOnly === k ? null : k)}
              title={`${c.working} of ${c.total} at work`}>
              <span className="pro-dot" style={{ background: `#${(ROLE_GLOW[k] ?? 0x9a9a9a).toString(16).padStart(6, '0')}`, marginInlineEnd: 4 }} />
              {ROLE_LABEL[k]} · {c.working}/{c.total}
            </button>
          ))}
        </div>
      )}
      {floor && view === 'floor' && (
        <FactoryScene floor={floor} events={fresh} dimmed={dimmed} onPick={(id) => setPicked(picked === id ? null : id)} />
      )}
      {floor && view === 'desks' && (
        <div ref={stage} className="pro-card" style={{ position: 'relative', display: 'flex', gap: 12, overflowX: 'auto', flexShrink: 0, alignItems: 'flex-start' }}>
          {groups.map(([kind, agents], i) => (
            <div key={kind} style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, paddingInlineEnd: 12,
              borderInlineEnd: i < groups.length - 1 ? '1px dashed var(--cth-ink-100)' : 'none' }}>
              <span className="pro-col-head" style={{ padding: 0 }}>{ROLE_LABEL[kind]}</span>
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
        <Board factory={withInfo} floor={floor} only={only} onChanged={onChanged} />
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
        width: 150, textAlign: 'start', padding: 8, display: 'flex', flexDirection: 'column', gap: 4,
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
          <strong style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.display_name ?? agent.name}</strong>
          <span className="pro-sub" style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.display_name ? agent.name : agent.role}</span>
        </span>
      </div>
      <StateBadge label={agent.state === 'away' && agent.at ? `Away · ${agent.at.replace('_', ' ')}` : STATE_LABEL[agent.state]} tone={STATE_TONE[agent.state]} />
      {agent.task && (
        <span className="pro-sub" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
    <span className="pro-row" style={{ gap: 8, marginInlineStart: 'auto' }} title={pacing.reason}>
      {paused && <StateBadge label="Paused" tone="amber" />}
      {pacing.window_5h_pct !== undefined && <span className="pro-sub pro-mono" style={{ fontSize: 11 }}>5 h {Math.round(pacing.window_5h_pct)}%</span>}
      {pacing.window_7d_pct !== undefined && <span className="pro-sub pro-mono" style={{ fontSize: 11 }}>7 d {Math.round(pacing.window_7d_pct)}%</span>}
    </span>
  );
}

// ─── board, asks, sending work ──────────────────────────────────────────────

interface TaskView {
  task_id: string; project: string; title: string; state: string; stage?: string; agent?: string;
  ask?: { id: string; kind: 'question' | 'approval'; question: string; options?: string[] };
  output?: { summary?: string; pr_url?: string; deploy_url?: string };
}
const COLUMNS: Array<{ id: string; label: string; match: (s: string) => boolean }> = [
  { id: 'queued', label: 'Queued', match: (s) => s === 'queued' },
  { id: 'working', label: 'In the line', match: (s) => s === 'working' },
  { id: 'waiting', label: 'Waiting on a human', match: (s) => s === 'waiting' },
  { id: 'done', label: 'Done', match: (s) => s === 'done' || s === 'failed' }
];

function Board({ factory, floor, only, onChanged }: { factory: FactoryView; floor: FactoryFloorView | null; only: Set<string>; onChanged: () => void }) {
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const info = factory.info;
  const load = useCallback(() => {
    if (!info?.tools.includes('task_list')) return;
    void window.cth.factoriesCall(factory.id, 'task_list', { limit: 60 }).then((r) => {
      if (r.ok) setTasks(((r.result as { tasks?: TaskView[] })?.tasks ?? []));
    });
  }, [factory.id, info]);
  useEffect(() => { load(); const iv = setInterval(load, 5000); return () => clearInterval(iv); }, [load]);
  // No task_list: fall back to the floor's board.
  const rows: TaskView[] = tasks.length || !floor ? tasks
    : floor.board.map((b) => ({ task_id: b.id, project: b.project, title: b.title, state: b.state, stage: b.stage, agent: b.assignee }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      {info?.canSend && <SendTask factory={factory} onSent={load} />}
      <div className="pro-board">
        {COLUMNS.map((c) => {
          const items = rows.filter((t) => c.match(t.state) && (!only.size || only.has(t.project))).slice(-12);
          return (
            <div key={c.id} className="pro-col">
              <span className="pro-col-head">{c.label} <span className="pro-sub">{items.length}</span></span>
              {items.map((t) => <TaskCard key={t.task_id} factory={factory} task={t} onChanged={() => { load(); onChanged(); }} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({ factory, task, onChanged }: { factory: FactoryView; task: TaskView; onChanged: () => void }) {
  const [text, setText] = useState('');
  const canAnswer = factory.info?.canAnswer;
  const answer = async (approve?: boolean) => {
    if (!task.ask) return;
    await window.cth.factoriesCall(factory.id, 'task_answer', { task_id: task.task_id, ask_id: task.ask.id, ...(text ? { text } : {}), ...(approve !== undefined ? { approve } : {}) });
    setText('');
    onChanged();
  };
  return (
    <div className="pro-card" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600 }}>{task.title}</span>
      <span className="pro-ticket">{task.task_id} · {task.project}{task.stage ? ` · ${task.stage}` : ''}{task.agent ? ` · ${task.agent}` : ''}</span>
      {task.state === 'failed' && <StateBadge label="Failed" tone="red" />}
      {task.output?.pr_url && <a className="pro-mono" href={task.output.pr_url} onClick={(e) => { e.preventDefault(); void window.cth.openExternal(task.output!.pr_url!); }}>pull request</a>}
      {task.output?.deploy_url && <a className="pro-mono" href={task.output.deploy_url} onClick={(e) => { e.preventDefault(); void window.cth.openExternal(task.output!.deploy_url!); }}>deployed</a>}
      {task.ask && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--cth-ink-100)', paddingTop: 4 }}>
          <span style={{ fontSize: 12 }}>{task.ask.question}</span>
          {canAnswer ? (
            task.ask.kind === 'approval' ? (
              <div className="pro-row" style={{ gap: 6 }}>
                <button className="pro-btn pro-btn-primary" onClick={() => void answer(true)}>Approve</button>
                <button className="pro-btn" onClick={() => void answer(false)}>Reject</button>
              </div>
            ) : (
              <div className="pro-row" style={{ gap: 6 }}>
                <input className="pro-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer" />
                <button className="pro-btn" disabled={!text.trim()} onClick={() => void answer()}>Send</button>
              </div>
            )
          ) : <span className="pro-sub" style={{ fontSize: 11 }}>Answer it in the factory’s own channel.</span>}
        </div>
      )}
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
    if (!r.ok) { setMsg(r.error ?? 'Not sent.'); return; }
    setTitle(''); setDetail('');
    setMsg(`Sent: ${(r.result as { task_id?: string })?.task_id ?? 'ok'}`);
    onSent();
  };
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <strong style={{ fontSize: 13 }}>Send the factory a task</strong>
      <div className="pro-row" style={{ gap: 6 }}>
        <select className="pro-input" value={project} onChange={(e) => setProject(e.target.value)} style={{ maxWidth: 180 }}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input className="pro-input" placeholder="What to build" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1 }} />
      </div>
      <textarea className="pro-input" rows={3} placeholder="Details: what it should do, and how to tell it works" value={detail} onChange={(e) => setDetail(e.target.value)} />
      <div className="pro-row">
        <button className="pro-btn pro-btn-primary" disabled={!project || !title.trim() || !detail.trim()} onClick={() => void send()}>Send</button>
        {msg && <span className="pro-sub" style={{ fontSize: 12 }}>{msg}</span>}
      </div>
    </section>
  );
}

function EventLog({ events }: { events: FactoryEventView[] }) {
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 420, overflowY: 'auto' }}>
      <span className="pro-col-head" style={{ padding: 0 }}>What happened</span>
      {events.length === 0 && <span className="pro-sub" style={{ fontSize: 12 }}>Nothing yet.</span>}
      {[...events].reverse().map((e) => (
        <span key={e.id} className="pro-mono" style={{ color: e.ok === false ? 'var(--cth-coral)' : 'var(--cth-ink-700)' }}>
          {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}{' '}
          {e.type.replace('task.', '')}{e.from || e.to ? ` ${e.from ?? ''}→${e.to ?? ''}` : ''}{e.task ? ` ${e.task}` : ''}{e.text ? `: ${e.text}` : ''}
        </span>
      ))}
    </section>
  );
}
