import { useCallback, useEffect, useState } from 'react';
import type { Agent } from '@/store/store';
import { IntegrationsRegistry } from '@/components/IntegrationsRegistry';
import { Avatar, StateBadge } from './data';
import { Guide, useGuide } from './Guide';

type Connection = Awaited<ReturnType<typeof window.cth.connectionsList>>[number];
type TestResult = { ok: boolean; message: string };

const STEPS: Array<[string, string]> = [
  ['Pick a service and get its key', 'Press “Get a key” on the card: it opens the right page at GitHub, Notion, Sentry… Create the key there, paste it into the card and Save. It is stored encrypted on this machine and never shown again.'],
  ['Test it', 'Test makes one harmless call to the service with your key and tells you who it belongs to, or what is wrong with it.'],
  ['Turn it on and choose who gets it', 'Turn on, then “Every agent” or “Choose agents”. An agent can use a connection but never sees its key: the app runs the connection itself and the agent only gets permission to use it.'],
  ['Restart the agent', 'Agents pick up connections when they start. Use Restart & Continue on the agent: it keeps the conversation.'],
  ['Ask for it', 'Ask in plain words; each card lists things to try. With several connections of one service (GitHub “Personal” and “Work”), say which one: “in my Work GitHub, …”. Add one with “+ Another … connection”.']
];

/**
 * Connections — the outside services agents can use. Keyed MCP servers (GitHub,
 * Database, Web Search, Notion, Sentry), as many connections of each as you
 * need (two GitHub accounts, prod and staging databases): paste the key, test
 * it, choose who gets it. Keys go one way into the encrypted store, are never
 * shown again and never reach an agent (main runs the server; see
 * mcpGateway.ts). A guide walks through it. Below, the REST APIs that agents
 * reach through the key broker.
 */
export function ConnectionsView({ roster }: { roster: Agent[] }) {
  const [list, setList] = useState<Connection[]>([]);
  const [guide, toggleGuide] = useGuide('cth.connectionsGuide');
  const reload = useCallback(() => {
    void window.cth.connectionsList().then(setList).catch(() => { /* keep last */ });
  }, []);
  useEffect(reload, [reload]);

  const live = list.filter((c) => c.enabled && c.ready).length;
  const services = Array.from(new Map(list.map((c) => [c.service, c.serviceLabel])).entries());

  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>Connections</h2>
        <span className="pro-sub">{live} of {list.length} on</span>
        <div className="pro-head-end">
          <button className="pro-btn" onClick={toggleGuide}>{guide ? 'Hide guide' : 'How it works'}</button>
        </div>
      </div>

      {guide && <Guide title="Using connections, step by step" steps={STEPS} onClose={toggleGuide} />}

      {services.map(([service, label]) => (
        <ServiceGroup key={service} service={service} label={label}
          connections={list.filter((c) => c.service === service)} roster={roster} onChange={reload} />
      ))}

      <h3 style={{ margin: '10px 0 0', fontSize: 14 }}>REST APIs</h3>
      <p className="pro-text" style={{ marginTop: -6 }}>
        Linear, Jira, Stripe, your own API… Agents call these through a local broker that adds the key for
        them, so they never see it.
      </p>
      {/* A plain card that grows with its content: the page scrolls, not the card. */}
      <div className="pro-card" style={{ flexShrink: 0 }}><IntegrationsRegistry /></div>
    </div>
  );
}

function ServiceGroup({ service, label, connections, roster, onChange }: {
  service: string; label: string; connections: Connection[]; roster: Agent[]; onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    setError(null);
    const r = await window.cth.connectionsAdd(service, name);
    if (!r.ok) { setError(r.error ?? 'Could not add it.'); return; }
    setAdding(false); setName(''); onChange();
  };
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="pro-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
        {connections.map((c) => <ConnectionCard key={c.id} c={c} roster={roster} onChange={onChange} />)}
      </div>
      {adding ? (
        <div className="pro-row">
          <input className="pro-input" placeholder={`Name, e.g. Work ${label}`} maxLength={40} value={name} autoFocus
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); if (e.key === 'Escape') setAdding(false); }} />
          <button className="pro-btn pro-btn-primary" disabled={!name.trim()} onClick={() => void add()}>Add</button>
          <button className="pro-btn" onClick={() => setAdding(false)}>Cancel</button>
          {error && <span className="pro-text" style={{ color: 'var(--cth-coral)' }}>{error}</span>}
        </div>
      ) : (
        <button className="pro-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}>+ Another {label} connection</button>
      )}
    </section>
  );
}

function ConnectionCard({ c, roster, onChange }: { c: Connection; roster: Agent[]; onChange: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState(c.label);
  const [copied, setCopied] = useState<number | null>(null);

  const state = !c.enabled
    ? { label: 'Off', tone: 'grey' as const }
    : c.ready ? { label: 'On', tone: 'green' as const } : { label: 'Needs a key', tone: 'amber' as const };

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true); setError(null);
    const res = await fn().catch((e) => ({ ok: false, error: String(e) }));
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'Could not save.');
    onChange();
    return res.ok;
  };

  const save = async (env: string) => {
    const value = drafts[env] ?? '';
    if (!value.trim()) return;
    if (await run(() => window.cth.connectionsSetSecret(c.id, env, value))) {
      setDrafts((d) => ({ ...d, [env]: '' }));
      setTest(null);
    }
  };

  const doTest = async () => {
    setBusy(true); setTest(null);
    const res = await window.cth.connectionsTest(c.id).catch(() => ({ ok: false, message: 'Test failed to run.' }));
    setBusy(false);
    setTest(res);
  };

  const remove = () => {
    if (!window.confirm(`Delete the connection "${c.label}"? Its key is erased.`)) return;
    void run(() => window.cth.connectionsRemove(c.id));
  };

  const rename = () => { void run(() => window.cth.connectionsRename(c.id, label)).then(() => setRenaming(false)); };

  const scoped = c.scope !== null;
  const toggleAgent = (id: string) => {
    const cur = new Set(c.scope ?? []);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    void run(() => window.cth.connectionsSetScope(c.id, [...cur]));
  };

  return (
    <article className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="pro-row">
        {renaming ? (
          <>
            <input className="pro-input" value={label} maxLength={40} autoFocus onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setRenaming(false); }} />
            <button className="pro-btn" onClick={rename}>Save</button>
          </>
        ) : (
          <>
            <p className="pro-title">{c.label}</p>
            {!c.primary && <span className="pro-chip">{c.serviceLabel}</span>}
            <StateBadge label={state.label} tone={state.tone} />
          </>
        )}
        <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 6 }}>
          {c.docsUrl && <button className="pro-btn" onClick={() => void window.cth.openExternal(c.docsUrl!)}>Get a key</button>}
          <button className={`pro-btn${c.enabled ? '' : ' pro-btn-primary'}`} disabled={busy}
            onClick={() => void run(() => window.cth.connectionsSetEnabled(c.id, !c.enabled))}>
            {c.enabled ? 'Turn off' : 'Turn on'}
          </button>
        </span>
      </div>
      {c.primary ? <p className="pro-text">{c.description}</p> : (
        <div className="pro-row" style={{ gap: 6 }}>
          <span className="pro-sub" style={{ fontSize: 12 }}>A separate {c.serviceLabel} connection with its own key.</span>
          {!renaming && <button className="pro-btn" style={{ padding: '2px 8px' }} onClick={() => setRenaming(true)}>Rename</button>}
          <button className="pro-btn" style={{ padding: '2px 8px' }} onClick={remove}>Delete</button>
        </div>
      )}

      {c.fields.map((f) => (
        <div key={f.env} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="pro-sub" style={{ fontSize: 12 }} htmlFor={`${c.id}-${f.env}`}>
            {f.label}{f.optional ? ' (optional)' : ''}
            {f.stored && <span className="pro-chip pro-chip-on" style={{ marginInlineStart: 6 }}>saved</span>}
          </label>
          <div className="pro-row">
            <input id={`${c.id}-${f.env}`} className="pro-input pro-mono" style={{ flex: 1 }} type="password" autoComplete="off" spellCheck={false}
              placeholder={f.stored ? 'Saved. Paste a new one to replace it' : (f.placeholder ?? '')}
              value={drafts[f.env] ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [f.env]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') void save(f.env); }} />
            <button className="pro-btn" disabled={busy || !(drafts[f.env] ?? '').trim()} onClick={() => void save(f.env)}>Save</button>
            {f.stored && <button className="pro-btn" disabled={busy} onClick={() => void run(() => window.cth.connectionsSetSecret(c.id, f.env, ''))}>Remove</button>}
          </div>
          <span className="pro-sub" style={{ fontSize: 11.5 }}>{f.help}</span>
        </div>
      ))}

      <div className="pro-row" style={{ flexWrap: 'wrap' }}>
        <button className="pro-btn" disabled={busy || !c.testable || !c.ready} onClick={() => void doTest()}>{busy ? 'Working…' : 'Test'}</button>
        {test && <span className="pro-text" style={{ color: test.ok ? 'var(--cth-ink-900)' : 'var(--cth-coral)' }}>{test.ok ? '✓ ' : '✕ '}{test.message}</span>}
        {error && <span className="pro-text" style={{ color: 'var(--cth-coral)' }}>{error}</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--pro-line)', paddingTop: 10 }}>
        <div className="pro-tabs" role="radiogroup" aria-label="Who gets it">
          <button role="radio" aria-selected={!scoped} aria-checked={!scoped} disabled={busy}
            onClick={() => void run(() => window.cth.connectionsSetScope(c.id, null))}>Every agent</button>
          <button role="radio" aria-selected={scoped} aria-checked={scoped} disabled={busy}
            onClick={() => { if (!scoped) void run(() => window.cth.connectionsSetScope(c.id, [])); }}>Choose agents</button>
        </div>
        {scoped && (
          <div className="pro-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {roster.length === 0 && <span className="pro-sub">No agents on the floor yet.</span>}
            {roster.map((a) => {
              const on = c.scope!.includes(a.id);
              return (
                <button key={a.id} className={`pro-chip ${on ? 'pro-chip-on' : 'pro-chip-off'}`} style={{ cursor: 'pointer', fontFamily: 'var(--cth-font-ui)' }}
                  aria-pressed={on} disabled={busy} onClick={() => toggleAgent(a.id)}>
                  <Avatar agent={a} /> {a.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {c.examples.length > 0 && (
        <details>
          <summary className="pro-sub" style={{ fontSize: 12, cursor: 'pointer' }}>Things to ask an agent</summary>
          <ul style={{ margin: '6px 0 0', paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {c.examples.map((ex, i) => {
              const text = c.primary ? ex : `Using the "${c.label}" ${c.serviceLabel} connection: ${ex}`;
              return (
                <li key={i} style={{ fontSize: 12.5 }}>
                  <span className="pro-text">{text}</span>{' '}
                  <button className="pro-btn" style={{ padding: '0 6px', fontSize: 11 }}
                    onClick={() => { void navigator.clipboard.writeText(text).then(() => { setCopied(i); setTimeout(() => setCopied(null), 1200); }); }}>
                    {copied === i ? 'Copied' : 'Copy'}
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </article>
  );
}
