import { useCallback, useEffect, useState } from 'react';
import type { Agent } from '@/store/store';
import { IntegrationsRegistry } from '@/components/IntegrationsRegistry';
import { Avatar, StateBadge } from './data';

type Connection = Awaited<ReturnType<typeof window.cth.connectionsList>>[number];
type TestResult = { ok: boolean; message: string };

/**
 * Connections — the outside services agents can use. Keyed MCP servers (GitHub,
 * Database, Web Search, Notion, Sentry): paste the key, test it, choose who gets
 * it. Keys go one way into the encrypted store, are never shown again and never
 * reach an agent (main runs the server; see mcpGateway.ts). Below,
 * the REST APIs that agents reach through the key broker without ever seeing the
 * key (the Settings integrations registry, given a full screen).
 */
export function ConnectionsView({ roster }: { roster: Agent[] }) {
  const [list, setList] = useState<Connection[]>([]);
  const reload = useCallback(() => {
    void window.cth.connectionsList().then(setList).catch(() => { /* keep last */ });
  }, []);
  useEffect(reload, [reload]);

  const live = list.filter((c) => c.enabled && c.ready).length;

  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>Connections</h2>
        <span className="pro-sub">{live} of {list.length} on</span>
      </div>
      <p className="pro-text" style={{ marginTop: -6 }}>
        Agents never see these keys: the app runs each connection itself and agents only get to use it.
        Changes apply the next time an agent starts.
      </p>

      <div className="pro-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {list.map((c) => <ConnectionCard key={c.id} c={c} roster={roster} onChange={reload} />)}
      </div>

      <h3 style={{ margin: '10px 0 0', fontSize: 14 }}>REST APIs</h3>
      <p className="pro-text" style={{ marginTop: -6 }}>
        Linear, Jira, Stripe, your own API… Agents call these through a local broker that adds the key for
        them, so they never see it.
      </p>
      <div className="pro-card pro-embed" style={{ minHeight: 320 }}><IntegrationsRegistry /></div>
    </div>
  );
}

function ConnectionCard({ c, roster, onChange }: { c: Connection; roster: Agent[]; onChange: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);

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

  const scoped = c.scope !== null;
  const toggleAgent = (id: string) => {
    const cur = new Set(c.scope ?? []);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    void run(() => window.cth.connectionsSetScope(c.id, [...cur]));
  };

  return (
    <article className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="pro-row">
        <p className="pro-title">{c.label}</p>
        <StateBadge label={state.label} tone={state.tone} />
        <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 6 }}>
          {c.docsUrl && (
            <button className="pro-btn" onClick={() => void window.cth.openExternal(c.docsUrl!)}>Get a key</button>
          )}
          <button
            className={`pro-btn${c.enabled ? '' : ' pro-btn-primary'}`}
            disabled={busy}
            onClick={() => void run(() => window.cth.connectionsSetEnabled(c.id, !c.enabled))}
          >
            {c.enabled ? 'Turn off' : 'Turn on'}
          </button>
        </span>
      </div>
      <p className="pro-text">{c.description}</p>

      {c.fields.map((f) => (
        <div key={f.env} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="pro-sub" style={{ fontSize: 12 }} htmlFor={`${c.id}-${f.env}`}>
            {f.label}{f.optional ? ' (optional)' : ''}
            {f.stored && <span className="pro-chip pro-chip-on" style={{ marginInlineStart: 6 }}>saved</span>}
          </label>
          <div className="pro-row">
            <input
              id={`${c.id}-${f.env}`}
              className="pro-input pro-mono"
              style={{ flex: 1 }}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={f.stored ? 'Saved. Paste a new one to replace it' : (f.placeholder ?? '')}
              value={drafts[f.env] ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [f.env]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') void save(f.env); }}
            />
            <button className="pro-btn" disabled={busy || !(drafts[f.env] ?? '').trim()} onClick={() => void save(f.env)}>Save</button>
            {f.stored && (
              <button className="pro-btn" disabled={busy} onClick={() => void run(() => window.cth.connectionsSetSecret(c.id, f.env, ''))}>Remove</button>
            )}
          </div>
          <span className="pro-sub" style={{ fontSize: 11.5 }}>{f.help}</span>
        </div>
      ))}

      <div className="pro-row" style={{ flexWrap: 'wrap' }}>
        <button className="pro-btn" disabled={busy || !c.testable || !c.ready} onClick={() => void doTest()}>
          {busy ? 'Working…' : 'Test'}
        </button>
        {test && (
          <span className="pro-text" style={{ color: test.ok ? 'var(--cth-ink-900)' : 'var(--cth-coral)' }}>
            {test.ok ? '✓ ' : '✕ '}{test.message}
          </span>
        )}
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
    </article>
  );
}
