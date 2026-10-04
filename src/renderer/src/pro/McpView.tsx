import { useCallback, useEffect, useState } from 'react';
import type { Agent } from '@/store/store';
import type { McpFoundView, McpMineView, McpTransportView } from '../../../preload/index';
import { StateBadge } from './data';
import { Guide, useGuide } from './Guide';

/**
 * MCP servers: your own, and the ones already set up for Claude Code, Claude
 * Desktop, Cursor, Codex, Gemini CLI / Antigravity and Windsurf on this
 * machine (main/mcpServers.ts). Importing one moves its keys into the
 * encrypted store; the server then runs inside the app and agents reach it
 * with a capability token, never the key.
 */

const STEPS: Array<[string, string]> = [
  ['Servers you already use', 'The app reads the MCP settings of your other tools (read-only) and lists their servers here. Import one and your agents get it too.'],
  ['Keys stay out of reach', 'Those settings usually hold API keys in plain text. On import, anything that looks like a key is moved into the encrypted store and the server runs inside the app: agents talk to it through the app with a pass, and never see the key.'],
  ['Servers without keys', 'They are handed to agents as they are, like the built-in ones.'],
  ['Choose who gets what', 'A server reaches every agent unless you pick some. Switch it off to keep it without using it.']
];

const transportText = (t: McpTransportView) => (t.kind === 'stdio' ? [t.command, ...t.args].join(' ') : t.url);

export function McpView({ roster }: { roster: Agent[] }) {
  const [mine, setMine] = useState<McpMineView[]>([]);
  const [found, setFound] = useState<McpFoundView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [guideOpen, toggleGuide] = useGuide('cth.guide.mcp');
  const reload = useCallback(() => {
    void window.cth.mcpList().then((r) => { setMine(r.mine); setFound(r.found); });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const agents = roster.filter((a) => !a.archived);
  const bySource = new Map<string, McpFoundView[]>();
  for (const f of found) bySource.set(f.source, [...(bySource.get(f.source) ?? []), f]);

  const doImport = async (f: McpFoundView) => {
    setError(null);
    const r = await window.cth.mcpImport(f.source, f.name);
    if (!r.ok) setError(r.error ?? 'Not imported.');
    reload();
  };

  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>MCP</h2>
        <span className="pro-sub">Tool servers for your agents — your own, and the ones your other tools already use.</span>
        <div className="pro-head-end"><button className="pro-btn" onClick={toggleGuide}>{guideOpen ? 'Hide guide' : 'How it works'}</button></div>
      </div>
      {guideOpen && <Guide title="MCP servers" steps={STEPS} onClose={toggleGuide} />}
      {error && <div className="pro-card" style={{ borderColor: 'var(--cth-coral)' }}><span className="pro-text">{error}</span></div>}

      <h3 style={{ margin: '6px 0 0', fontSize: 14 }}>Yours</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mine.length === 0 && !adding && <p className="pro-sub" style={{ margin: 0 }}>None yet. Import one below or add your own. Built-in servers and keyed services are in Capabilities and Connections.</p>}
        {mine.slice().sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
          <MineCard key={s.id} s={s} agents={agents} onChanged={reload} onError={setError} />
        ))}
        {adding
          ? <ServerForm onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} onError={setError} />
          : <button className="pro-card" onClick={() => setAdding(true)} style={{ borderStyle: 'dashed', cursor: 'pointer', textAlign: 'center', flexShrink: 0 }}><span className="pro-sub">+ Add a server</span></button>}
      </div>

      <h3 style={{ margin: '6px 0 0', fontSize: 14 }}>Found on this machine</h3>
      {found.length === 0 && <p className="pro-sub" style={{ margin: 0 }}>No MCP servers in Claude Code, Claude Desktop, Cursor, Codex, Gemini CLI / Antigravity or Windsurf settings.</p>}
      {[...bySource.entries()].map(([source, list]) => (
        <section key={source} className="pro-card" style={{ display: 'flex', flexDirection: 'column', padding: 0, flexShrink: 0 }}>
          <div className="pro-row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--pro-line)' }}>
            <strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{source}</strong>
            <span className="pro-sub pro-mono" style={{ fontSize: 11, marginInlineStart: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{list[0].file}</span>
          </div>
          {list.map((f) => <FoundRow key={f.name} f={f} onImport={() => void doImport(f)} />)}
        </section>
      ))}
    </div>
  );
}

function FoundRow({ f, onImport }: { f: McpFoundView; onImport: () => void }) {
  const secrets = f.env.filter((e) => e.secret).map((e) => e.name);
  const needsHeader = f.transport.kind === 'http' && f.headerNames.length > 0;
  return (
    <div className="pro-row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--pro-line)', gap: 12 }}>
      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 120 }}>{f.name}</span>
      <StateBadge label={f.transport.kind === 'stdio' ? 'Local' : 'Remote'} tone={f.transport.kind === 'stdio' ? 'grey' : 'blue'} />
      <span className="pro-mono" style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--cth-ink-700)' }}>{transportText(f.transport)}</span>
      {secrets.length > 0 && <span className="pro-sub" style={{ fontSize: 11 }} title={secrets.join(', ')}>{secrets.length === 1 ? '1 key' : `${secrets.length} keys`} → encrypted</span>}
      {f.imported
        ? <StateBadge label="Imported" tone="green" />
        : <button className="pro-btn" disabled={needsHeader} title={needsHeader ? 'Needs a key in a header — not supported yet' : undefined} onClick={onImport}>Import</button>}
    </div>
  );
}

function MineCard({ s, agents, onChanged, onError }: { s: McpMineView; agents: Agent[]; onChanged: () => void; onError: (e: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const missing = s.secretEnv.filter((e) => !s.secretsStored[e]);
  const remove = async () => {
    if (!(await window.cth.confirm(`Remove ${s.name}?`, { detail: s.secretEnv.length ? 'Its stored keys are erased.' : undefined, ok: 'Remove' }))) return;
    await window.cth.mcpRemove(s.id);
    onChanged();
  };
  const toggleAgent = async (id: string) => {
    const cur = s.agents ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    await window.cth.mcpSetAgents(s.id, next.length ? next : null);
    onChanged();
  };
  if (editing) return <ServerForm initial={s} onDone={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} onError={onError} />;
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, opacity: s.enabled ? 1 : 0.65 }}>
      <div className="pro-row" style={{ gap: 8 }}>
        <strong style={{ fontSize: 13 }}>{s.name}</strong>
        <StateBadge label={s.transport.kind === 'stdio' ? 'Local' : 'Remote'} tone={s.transport.kind === 'stdio' ? 'grey' : 'blue'} />
        {s.secretEnv.length > 0 && <StateBadge label="Through the app" tone="gold" />}
        {s.source && <span className="pro-sub" style={{ fontSize: 11 }}>from {s.source}</span>}
        <div className="pro-switch" role="group" aria-label="On or off" style={{ marginInlineStart: 'auto' }}>
          <button aria-pressed={s.enabled} onClick={() => void window.cth.mcpSetEnabled(s.id, true).then(onChanged)}>On</button>
          <button aria-pressed={!s.enabled} onClick={() => void window.cth.mcpSetEnabled(s.id, false).then(onChanged)}>Off</button>
        </div>
        <button className="pro-btn" onClick={() => setEditing(true)}>Edit</button>
        <button className="pro-btn" onClick={() => void remove()}>Remove</button>
      </div>
      <code className="pro-mono" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{transportText(s.transport)}</code>
      {(s.secretEnv.length > 0 || Object.keys(s.env).length > 0) && (
        <div className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {s.secretEnv.map((e) => <span key={e} className="pro-chip pro-mono" style={{ fontSize: 11 }}>{e} {s.secretsStored[e] ? '•••• stored' : 'missing'}</span>)}
          {Object.entries(s.env).map(([k, v]) => <span key={k} className="pro-chip pro-mono" style={{ fontSize: 11 }}>{k}={v}</span>)}
        </div>
      )}
      {missing.length > 0 && <span className="pro-sub" style={{ fontSize: 11, color: 'var(--cth-coral)' }}>Missing {missing.join(', ')} — agents won’t get this server until you add it (Edit).</span>}
      {agents.length > 0 && (
        <div className="pro-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span className="pro-sub" style={{ fontSize: 12 }}>For:</span>
          <button className={`pro-chip${!s.agents?.length ? ' pro-chip-on' : ''}`} onClick={() => void window.cth.mcpSetAgents(s.id, null).then(onChanged)}>All agents</button>
          {agents.map((a) => (
            <button key={a.id} className={`pro-chip${s.agents?.includes(a.id) ? ' pro-chip-on' : ''}`} onClick={() => void toggleAgent(a.id)}>{a.name}</button>
          ))}
        </div>
      )}
      <span className="pro-sub" style={{ fontSize: 11 }}>Agents pick changes up the next time they start.</span>
    </section>
  );
}

type EnvRow = { name: string; value: string; secret: boolean };

function ServerForm({ initial, onDone, onCancel, onError }: { initial?: McpMineView; onDone: () => void; onCancel: () => void; onError: (e: string | null) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<McpTransportView['kind']>(initial?.transport.kind ?? 'stdio');
  const [command, setCommand] = useState(initial?.transport.kind === 'stdio' ? [initial.transport.command, ...initial.transport.args].join(' ') : '');
  const [url, setUrl] = useState(initial?.transport.kind === 'http' ? initial.transport.url : '');
  const [env, setEnv] = useState<EnvRow[]>(() => [
    ...Object.entries(initial?.env ?? {}).map(([n, v]) => ({ name: n, value: v, secret: false })),
    ...(initial?.secretEnv ?? []).map((n) => ({ name: n, value: '', secret: true }))
  ]);
  const save = async () => {
    onError(null);
    // Simple splitting: quoted parts stay together ("C:\Program Files\…").
    const parts = (command.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((p) => p.replace(/^["']|["']$/g, ''));
    const transport: McpTransportView = kind === 'stdio' ? { kind, command: parts[0] ?? '', args: parts.slice(1) } : { kind, url: url.trim() };
    const rows = env.filter((r) => r.name.trim());
    const r = await window.cth.mcpSave({ id: initial?.id, name, transport, env: Object.fromEntries(rows.map((x) => [x.name.trim(), x.value])) }, rows.filter((x) => x.secret).map((x) => x.name.trim()));
    if (!r.ok) { onError(r.error ?? 'Not saved.'); return; }
    onDone();
  };
  const setRow = (i: number, patch: Partial<EnvRow>) => setEnv((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
      <div className="pro-row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input className="pro-input" placeholder="Name, e.g. github" value={name} disabled={!!initial} onChange={(e) => setName(e.target.value)} style={{ width: 200 }} />
        <div className="pro-switch" role="group" aria-label="Kind">
          <button aria-pressed={kind === 'stdio'} onClick={() => setKind('stdio')}>Local command</button>
          <button aria-pressed={kind === 'http'} onClick={() => setKind('http')}>Remote address</button>
        </div>
      </div>
      {kind === 'stdio'
        ? <input className="pro-input pro-mono" placeholder="npx -y @modelcontextprotocol/server-github" value={command} onChange={(e) => setCommand(e.target.value)} />
        : <input className="pro-input pro-mono" placeholder="https://example.com/mcp" value={url} onChange={(e) => setUrl(e.target.value)} />}
      {kind === 'stdio' && (
        <>
          <span className="pro-sub" style={{ fontSize: 12 }}>Environment</span>
          {env.map((r, i) => (
            <div key={i} className="pro-row" style={{ gap: 6 }}>
              <input className="pro-input pro-mono" placeholder="NAME" value={r.name} onChange={(e) => setRow(i, { name: e.target.value.replace(/[^A-Za-z0-9_]/g, '_') })} style={{ width: 200 }} />
              <input className="pro-input pro-mono" type={r.secret ? 'password' : 'text'} autoComplete="off" style={{ flex: 1 }}
                placeholder={r.secret ? (initial?.secretsStored[r.name] ? 'stored — paste a new value to replace it' : 'key') : 'value'}
                value={r.value} onChange={(e) => setRow(i, { value: e.target.value })} />
              <button className={`pro-chip${r.secret ? ' pro-chip-on' : ''}`} onClick={() => setRow(i, { secret: !r.secret })}>Secret</button>
              <button className="pro-btn" onClick={() => setEnv((rows) => rows.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button className="pro-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setEnv((rows) => [...rows, { name: '', value: '', secret: true }])}>+ Variable</button>
          <span className="pro-sub" style={{ fontSize: 11 }}>Secret values are encrypted on this machine, never shown again, and never reach an agent: the server runs inside the app.</span>
        </>
      )}
      {kind === 'http' && <span className="pro-sub" style={{ fontSize: 11 }}>For a remote server that needs an API key, use Connections when it is listed there.</span>}
      <div className="pro-row" style={{ gap: 8 }}>
        <button className="pro-btn pro-btn-primary" disabled={!name.trim() || (kind === 'stdio' ? !command.trim() : !url.trim())} onClick={() => void save()}>Save</button>
        <button className="pro-btn" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
