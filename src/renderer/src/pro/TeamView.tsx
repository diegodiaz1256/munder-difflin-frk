import { useCallback, useEffect, useMemo, useState } from 'react';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { TRIGGER_MODES } from '@shared/triggers';
import { StateBadge } from './data';
import { Guide, useGuide } from './Guide';

type Status = Awaited<ReturnType<typeof window.cth.teamStatus>>;
type Team = Status['teams'][number];
type Member = Status['peers'][number];
type LogEntry = Awaited<ReturnType<typeof window.cth.teamLog>>[number];
type Level = Team['level'];
type Mode = Team['mode'];

const LEVELS: { value: Level; label: string; blurb: string; soon?: boolean }[] = [
  { value: 'message', label: 'Messages', blurb: 'Can write to your orchestrator.' },
  { value: 'view', label: 'View', blurb: 'Also sees your floor (coming next).', soon: true },
  { value: 'manage', label: 'Manage', blurb: 'Also acts on your office (coming next).', soon: true }
];
const TEAM_STEPS: Array<[string, string]> = [
  ['Your office gets an identity', 'Turning Team on gives this office a name and a pair of keys. The keys never leave this machine; teammates only ever see your name.'],
  ['Teams group people, each on its own relay', 'Make a team per group you work with (“Barcelona branch”, “Partners”) with “+ New team”. Each team has a relay that passes sealed messages along: a public MQTT broker by default (fast, no daily cap), or an ntfy server (keeps messages 12 h for someone offline; ntfy.sh allows 250 a day per office). A company can run its own relay and put the team on it; one that needs an access token takes it in the team’s Edit form.'],
  ['Invite, or join', '“Invite to <team>” makes a code that works once, for 24 hours. Send it over a channel you trust (Slack, Signal…). They paste it into “Got an invite?” and both offices appear in that team. You can join other people’s teams the same way, so one office can be in many teams.'],
  ['Decide what each person may do', 'Each team sets a default for its members. “May”: Messages lets them write to your orchestrator (View and Manage, to see and run your floor from their office, come next). “Messages”: strict holds every message for you in Inbox → Outside; communication only lets information through and holds requests for action; allow all sends everything straight to your orchestrator. Open a person to give them their own setting instead of the team’s.'],
  ['Talk', 'Write from a person’s conversation, or just ask your orchestrator (“tell Barcelona the release moves to Monday”): it writes to them itself, and their replies land in its inbox.'],
  ['What is protected', 'Every message is encrypted on the sending machine and opened only on the receiving one, and signed so nobody can pose as a teammate. Pairs are post-quantum: each message key also depends on an ML-KEM secret agreed when you paired, so traffic recorded today stays sealed against a future quantum computer. A relay sees a random mailbox name and unreadable bytes. Without a valid invite nobody can get in, even if they know your mailbox. Remove a person or delete a team at any time.']
];

const levelLabel = (l: Level): string => LEVELS.find((x) => x.value === l)?.label ?? l;
const modeLabel = (m: Mode): string => TRIGGER_MODES.find((x) => x.value === m)?.label ?? m;

/**
 * Team — your office and your teammates' offices, talking to each other.
 * Teams group people and each has its own relay; you pair with an invite code
 * per team. Messages are sealed end to end; a relay only ever sees encrypted
 * bytes. What each person may do in your office, and whether their messages
 * reach your orchestrator directly or wait for you, is set per team and can be
 * overridden one to one.
 */
export function TeamView() {
  const [st, setSt] = useState<Status | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [openPeer, setOpenPeer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guide, toggleGuide] = useGuide('cth.teamGuide');

  const reload = useCallback(() => {
    void window.cth.teamStatus().then(setSt).catch(() => { /* keep last */ });
    void window.cth.teamLog().then(setLog).catch(() => { /* keep last */ });
  }, []);
  useEffect(() => { reload(); return window.cth.onTeamUpdated(reload); }, [reload]);

  if (!st) return <div className="pro-page"><p className="pro-sub">Loading…</p></div>;
  if (!st.enabled) return <TeamSetup current={st} onDone={reload} />;

  const peer = st.peers.find((p) => p.id === openPeer) ?? null;
  const peerTeam = peer ? st.teams.find((t) => t.id === peer.teamId) : undefined;

  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>Team</h2>
        <span className="pro-sub">You are <strong>{st.me?.name}</strong> · {st.teams.length} team{st.teams.length === 1 ? '' : 's'} · {st.peers.length} teammate{st.peers.length === 1 ? '' : 's'}</span>
        <div className="pro-head-end">
          <button className="pro-btn" onClick={toggleGuide}>{guide ? 'Hide guide' : 'How teams work'}</button>
          <button className="pro-btn" onClick={() => { void window.cth.teamDisable().then(reload); }}>Turn off</button>
        </div>
      </div>
      {guide && <Guide title="How teams work" steps={TEAM_STEPS} onClose={toggleGuide} />}
      <p className="pro-text" style={{ marginTop: -6 }}>
        Messages are sealed on this machine and opened only on your teammate&rsquo;s; relays carry encrypted bytes they cannot read.
      </p>
      {error && <p className="pro-text" style={{ color: 'var(--cth-coral)' }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {st.teams.map((t) => (
            <TeamCard key={t.id} team={t} members={st.peers.filter((p) => p.teamId === t.id)}
              open={openPeer} onOpen={setOpenPeer} onChanged={reload} onError={setError} />
          ))}
          <NewTeam onChanged={reload} onError={setError} defaultRelay={st.me?.relay ?? DEFAULT_RELAY} />
          <JoinCard onChanged={reload} onError={setError} />
        </div>

        {peer && peerTeam
          ? <Conversation key={peer.id} peer={peer} team={peerTeam} log={log.filter((e) => e.peerId === peer.id)} onChanged={reload} onError={setError} onClose={() => setOpenPeer(null)} />
          : <section className="pro-card"><p className="pro-sub" style={{ margin: 0 }}>Pick a teammate to see your conversation and what they may do in your office.</p></section>}
      </div>
    </div>
  );
}

function TeamSetup({ current, onDone }: { current: Status; onDone: () => void }) {
  const [name, setName] = useState(current.me?.name ?? '');
  const [relay, setRelay] = useState(current.me?.relay ?? DEFAULT_RELAY);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState('');
  const go = async () => {
    setBusy(true); setError(null);
    const r = await window.cth.teamEnable({ name, relay }).catch((e) => ({ ok: false, error: String(e) }));
    if (!r.ok) { setBusy(false); setError(r.error ?? 'Could not turn Team on.'); return; }
    // Came with an invite: join it right away (Team has to be on first).
    if (invite.trim()) {
      const j = await window.cth.teamJoin(invite.trim()).catch((e) => ({ ok: false, error: String(e) }));
      if (!j.ok) { setBusy(false); setError(`Team is on, but the invite did not work: ${j.error ?? 'unknown error'}`); onDone(); return; }
    }
    setBusy(false);
    onDone();
  };
  return (
    <div className="pro-page">
      <div className="pro-head"><h2>Team</h2></div>
      <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 620 }}>
        <strong style={{ fontSize: 14 }}>Connect your office with your teammates&rsquo; offices</strong>
        <p className="pro-text" style={{ margin: 0 }}>
          Your orchestrator and theirs can write to each other. You pair once with an invite code; after that every
          message is encrypted on the sending machine and opened only on the receiving one. No account, no server of ours:
          a relay passes along bytes it cannot read.
        </p>
        <label className="pro-sub" style={{ fontSize: 12 }} htmlFor="team-name">How teammates will see you</label>
        <input id="team-name" className="pro-input" placeholder="e.g. Diego (Madrid office)" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        {advanced ? (
          <>
            <label className="pro-sub" style={{ fontSize: 12 }} htmlFor="team-relay">Default relay (an ntfy server; each team can use its own)</label>
            <input id="team-relay" className="pro-input pro-mono" list="relay-presets" value={relay} onChange={(e) => setRelay(e.target.value)} />
            <RelayPresets />
          </>
        ) : (
          <button className="pro-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAdvanced(true)}>Relay settings</button>
        )}
        <label className="pro-sub" style={{ fontSize: 12 }} htmlFor="team-invite">Got an invite? Paste it here (optional)</label>
        <textarea id="team-invite" className="pro-input pro-mono" rows={2} placeholder="mdteam1.…" value={invite}
          onChange={(e) => setInvite(e.target.value)} style={{ fontSize: 11, resize: 'vertical' }} />
        {error && <p className="pro-text" style={{ color: 'var(--cth-coral)', margin: 0 }}>{error}</p>}
        <button className="pro-btn pro-btn-primary" style={{ alignSelf: 'flex-start' }} disabled={busy || !name.trim()} onClick={() => void go()}>
          {busy ? 'Turning on…' : invite.trim() ? 'Turn on Team and join' : 'Turn on Team'}
        </button>
      </section>
      <div style={{ maxWidth: 820 }}><Guide title="How teams work" steps={TEAM_STEPS} /></div>
    </div>
  );
}

function PolicySelects({ level, mode, inheritLevel, inheritMode, onLevel, onMode }: {
  level: Level | undefined; mode: Mode | undefined;
  /** When given, an "as team" option appears (a member's override). */
  inheritLevel?: Level; inheritMode?: Mode;
  onLevel: (l: Level | null) => void; onMode: (m: Mode | null) => void;
}) {
  const asTeam = inheritLevel !== undefined;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 8px', alignItems: 'center', fontSize: 12 }}>
      <span className="pro-sub">May</span>
      <select className="pro-input" value={level ?? ''} onChange={(e) => onLevel((e.target.value || null) as Level | null)}>
        {asTeam && <option value="">As team ({levelLabel(inheritLevel)})</option>}
        {LEVELS.map((l) => <option key={l.value} value={l.value} disabled={l.soon}>{l.label}{l.soon ? ' (soon)' : ''}</option>)}
      </select>
      <span className="pro-sub">Messages</span>
      <select className="pro-input" value={mode ?? ''} onChange={(e) => onMode((e.target.value || null) as Mode | null)}>
        {asTeam && <option value="">As team ({modeLabel(inheritMode!)})</option>}
        {TRIGGER_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
    </div>
  );
}

const DEFAULT_RELAY = 'mqtts://broker.emqx.io:8883';

/** Public relays that work out of the box (all carry only sealed bytes). */
function RelayPresets() {
  return (
    <datalist id="relay-presets">
      <option value="mqtts://broker.emqx.io:8883">EMQX public MQTT broker — fast, no daily cap</option>
      <option value="wss://broker.hivemq.com:8884/mqtt">HiveMQ public MQTT broker (WebSocket)</option>
      <option value="https://ntfy.sh">ntfy.sh — keeps messages 12 h, 250 a day per office</option>
    </datalist>
  );
}

function TeamCard({ team, members, open, onOpen, onChanged, onError }: {
  team: Team; members: Member[]; open: string | null; onOpen: (id: string) => void; onChanged: () => void; onError: (e: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [relay, setRelay] = useState(team.relay);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState('');

  // Write-only: the token goes to main's encrypted store; the app never shows it again.
  const saveToken = async (value: string) => {
    onError(null);
    const r = await window.cth.teamSetRelayToken({ relay: team.relay, token: value });
    if (!r.ok) onError(r.error ?? 'Token not saved.');
    else setToken('');
    onChanged();
  };

  const update = async (patch: Parameters<typeof window.cth.teamUpdateTeam>[1]) => {
    onError(null);
    const r = await window.cth.teamUpdateTeam(team.id, patch);
    if (!r.ok) onError(r.error ?? 'Not saved.');
    onChanged();
    return r.ok;
  };
  const invite = async () => {
    onError(null);
    const r = await window.cth.teamCreateInvite(team.id);
    if (r.ok && r.code) { setCode(r.code); setCopied(false); } else onError(r.error ?? 'Could not create an invite.');
  };
  const remove = async () => {
    if (!(await window.cth.confirm(`Delete the team "${team.name}"?`, { detail: `Its ${members.length} member(s) are forgotten.`, ok: 'Delete' }))) return;
    void window.cth.teamRemoveTeam(team.id).then(onChanged);
  };

  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input className="pro-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <input className="pro-input pro-mono" list="relay-presets" value={relay} onChange={(e) => setRelay(e.target.value)} title="Relay (MQTT broker or ntfy server)" />
          <RelayPresets />
          <span className="pro-sub" style={{ fontSize: 11 }}>A new relay applies to people who join after the change.</span>
          <label className="pro-sub" style={{ fontSize: 12 }} htmlFor={`relay-token-${team.id}`}>
            Relay access token {team.relayAuth ? '(stored — enter a new one to replace it)' : '(only for a private relay: an MQTT user:password, or an ntfy token)'}
          </label>
          <div className="pro-row">
            <input id={`relay-token-${team.id}`} className="pro-input pro-mono" type="password" autoComplete="off" placeholder="tk_…"
              value={token} onChange={(e) => setToken(e.target.value)} style={{ flex: 1 }} />
            <button className="pro-btn" disabled={!token.trim()} onClick={() => void saveToken(token)}>Save token</button>
            {team.relayAuth && <button className="pro-btn" onClick={() => void saveToken('')}>Remove</button>}
          </div>
          <span className="pro-sub" style={{ fontSize: 11 }}>Kept encrypted on this machine and used only to talk to the relay. Agents never see it.</span>
          <div className="pro-row">
            <button className="pro-btn pro-btn-primary" onClick={() => { void update({ name, relay }).then((ok) => ok && setEditing(false)); }}>Save</button>
            <button className="pro-btn" onClick={() => { setEditing(false); setName(team.name); setRelay(team.relay); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="pro-row">
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="pro-title">{team.name}</p>
            <p className="pro-sub pro-mono" style={{ fontSize: 11, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.relay}{team.relayAuth ? ' · token' : ''}</p>
          </div>
          <button className="pro-btn" onClick={() => setEditing(true)}>Edit</button>
          <button className="pro-btn" onClick={remove}>Delete</button>
        </div>
      )}

      <PolicySelects level={team.level} mode={team.mode}
        onLevel={(l) => { if (l) void update({ level: l }); }} onMode={(m) => { if (m) void update({ mode: m }); }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {members.length === 0 && <span className="pro-sub" style={{ fontSize: 12 }}>No members yet.</span>}
        {members.map((p) => (
          <button key={p.id} className="pro-card pro-row" aria-pressed={open === p.id} onClick={() => onOpen(p.id)} style={{ padding: '6px 10px' }}>
            <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <strong style={{ fontSize: 13 }}>{p.name}</strong>
              <span className="pro-sub" style={{ fontSize: 11 }}>
                {levelLabel(p.level ?? team.level)}{p.level ? ' (own)' : ''} · {modeLabel(p.mode ?? team.mode)}{p.mode ? ' (own)' : ''}
                {p.pq === 'on' ? ' · post-quantum' : p.confirmed ? ' · classical (their app is older)' : ''}
              </span>
            </span>
            <StateBadge label={p.confirmed ? 'Paired' : 'Waiting'} tone={p.confirmed ? 'green' : 'amber'} />
          </button>
        ))}
      </div>

      {code ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea className="pro-input pro-mono" readOnly rows={4} value={code} style={{ fontSize: 11, resize: 'none' }} onFocus={(e) => e.currentTarget.select()} />
          <div className="pro-row">
            <button className="pro-btn pro-btn-primary" onClick={() => { void navigator.clipboard.writeText(code).then(() => setCopied(true)); }}>{copied ? 'Copied' : 'Copy invite'}</button>
            <span className="pro-sub" style={{ fontSize: 11 }}>One use, 24 h. Send it over a channel you trust.</span>
          </div>
        </div>
      ) : (
        <button className="pro-btn" style={{ alignSelf: 'flex-start' }} onClick={() => void invite()}>Invite to {team.name}</button>
      )}
    </section>
  );
}

function NewTeam({ onChanged, onError, defaultRelay }: { onChanged: () => void; onError: (e: string | null) => void; defaultRelay: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [relay, setRelay] = useState(defaultRelay);
  if (!open) return <button className="pro-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>+ New team</button>;
  const create = async () => {
    onError(null);
    const r = await window.cth.teamCreateTeam({ name, relay });
    if (!r.ok) { onError(r.error ?? 'Could not create the team.'); return; }
    setOpen(false); setName(''); onChanged();
  };
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <strong style={{ fontSize: 13 }}>New team</strong>
      <input className="pro-input" placeholder="Name, e.g. Barcelona branch" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <input className="pro-input pro-mono" list="relay-presets" placeholder="mqtts://broker.emqx.io:8883" value={relay} onChange={(e) => setRelay(e.target.value)} title="Relay (MQTT broker or ntfy server) for this team" />
      <RelayPresets />
      <div className="pro-row">
        <button className="pro-btn pro-btn-primary" disabled={!name.trim()} onClick={() => void create()}>Create</button>
        <button className="pro-btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </section>
  );
}

function JoinCard({ onChanged, onError }: { onChanged: () => void; onError: (e: string | null) => void }) {
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true); onError(null);
    const r = await window.cth.teamJoin(paste).catch((e) => ({ ok: false, error: String(e) }));
    setBusy(false);
    if (r.ok) { setPaste(''); onChanged(); } else onError(r.error ?? 'Could not join.');
  };
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <strong style={{ fontSize: 13 }}>Got an invite?</strong>
      <textarea className="pro-input pro-mono" rows={2} placeholder="mdteam1.…" value={paste} onChange={(e) => setPaste(e.target.value)} style={{ fontSize: 11, resize: 'vertical' }} />
      <button className="pro-btn" style={{ alignSelf: 'flex-start' }} disabled={busy || !paste.trim()} onClick={() => void join()}>{busy ? 'Joining…' : 'Join'}</button>
      <span className="pro-sub" style={{ fontSize: 11 }}>You join their team, on their relay. New teams start on Messages, held for you.</span>
    </section>
  );
}

function Conversation({ peer, team, log, onChanged, onError, onClose }: {
  peer: Member; team: Team; log: LogEntry[]; onChanged: () => void; onError: (e: string | null) => void; onClose: () => void;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const sorted = useMemo(() => log.slice().sort((a, b) => a.at.localeCompare(b.at)), [log]);
  const send = async () => {
    setBusy(true); onError(null);
    const r = await window.cth.teamSend({ to: peer.id, subject, body }).catch((e) => ({ ok: false, error: String(e) }));
    setBusy(false);
    if (r.ok) { setSubject(''); setBody(''); onChanged(); } else onError(r.error ?? 'Not sent.');
  };
  const remove = async () => {
    if (!(await window.cth.confirm(`Remove ${peer.name}?`, { detail: 'You will need a new invite to talk again.', ok: 'Remove' }))) return;
    void window.cth.teamRemovePeer(peer.id).then(() => { onClose(); onChanged(); });
  };
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 420 }}>
      <div className="pro-row" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="pro-row"><strong style={{ fontSize: 14 }}>{peer.name}</strong>
            <StateBadge label={peer.confirmed ? 'Paired' : 'Waiting for them to come online'} tone={peer.confirmed ? 'green' : 'amber'} /></div>
          <span className="pro-sub" style={{ fontSize: 12 }}>in {team.name}</span>
        </div>
        <PolicySelects level={peer.level} mode={peer.mode} inheritLevel={team.level} inheritMode={team.mode}
          onLevel={(l) => { void window.cth.teamSetMember(peer.id, { level: l }).then(onChanged); }}
          onMode={(m) => { void window.cth.teamSetMember(peer.id, { mode: m }).then(onChanged); }} />
        <button className="pro-btn" onClick={remove}>Remove</button>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 460 }}>
        {sorted.length === 0 && <p className="pro-sub" style={{ margin: 0 }}>No messages yet. Your orchestrator can also write to {peer.name} on its own.</p>}
        {sorted.map((m) => (
          <article key={`${m.id}-${m.direction}`} className="pro-card" style={{
            padding: '8px 10px', alignSelf: m.direction === 'out' ? 'flex-end' : 'flex-start', maxWidth: '85%',
            background: m.direction === 'out' ? 'var(--cth-lemon-light)' : undefined
          }}>
            <div className="pro-sub" style={{ fontSize: 11 }}>
              {m.direction === 'out' ? (m.by === 'agent' ? 'Your orchestrator' : 'You') : peer.name} · {new Date(m.at).toLocaleString()}
            </div>
            {m.subject && <strong style={{ fontSize: 13 }}>{m.subject}</strong>}
            <div style={{ fontSize: 13 }}><MarkdownPreview source={m.body} variant="card" /></div>
          </article>
        ))}
      </div>
      <input className="pro-input" placeholder="Subject (optional)" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea className="pro-input" rows={3} placeholder={`Write to ${peer.name}'s office…`} value={body} onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send(); }} />
      <div className="pro-row">
        <button className="pro-btn pro-btn-primary" disabled={busy || !body.trim()} onClick={() => void send()}>{busy ? 'Sending…' : 'Send'}</button>
        <span className="pro-sub" style={{ fontSize: 11 }}>Ctrl+Enter · arrives in their orchestrator&rsquo;s inbox</span>
      </div>
    </section>
  );
}
