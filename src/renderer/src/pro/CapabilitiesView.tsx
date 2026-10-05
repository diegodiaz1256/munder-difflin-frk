import { useState } from 'react';
import type { HarnessConfig } from '@/store/config';
import type { Agent } from '@/store/store';
import { Icon } from '@/components/Icon';
import { SkillsTab } from '@/components/SkillsTab';
import { MCP_CATALOG, mcpCatalogEntry } from '@shared/mcpCatalog';
import { BUNDLE_ICONS, allRoleBundles, mcpLabel, type BundleIcon, type RoleBundle } from '@shared/roleBundles';
import { NATIVE_TOOL_GROUPS } from '@shared/nativeTools';
import { useProStore } from './proStore';
import { Avatar } from './data';
import { effectiveServers } from './AgentView';

/** A write/secret server is usable only once the user switched it on (Connections). */
function consented(config: HarnessConfig, id: string): boolean {
  const e = mcpCatalogEntry(id);
  if (!e) return false;
  return e.tier === 'safe-readonly' || config.mcpDefaults?.[id]?.enabled === true;
}

type Draft = { id?: string; label: string; icon: BundleIcon; servers: string[] };

/**
 * Capabilities — what each agent can reach. Grant a role bundle (a set of MCP
 * servers) to an agent in one click, make your own bundles (or start from a
 * built-in one), adjust single servers per agent, or browse and install skills.
 * Grants apply when the agent next starts; a keyed server stays dimmed until it
 * is switched on with its key in Connections.
 */
export function CapabilitiesView({ roster, config }: { roster: Agent[]; config: HarnessConfig }) {
  const setView = useProStore((s) => s.setView);
  const [tab, setTab] = useState<'bundles' | 'skills'>('bundles');
  const [target, setTarget] = useState<string | null>(roster.find((a) => !a.isGod)?.id ?? roster[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const targetAgent = roster.find((a) => a.id === target);
  const bundles = allRoleBundles(config.customRoleBundles);
  const custom = bundles.filter((b) => b.custom);

  const grant = async (agentId: string, servers: string[] | undefined) => {
    setSaving(true);
    try {
      await window.cth.setAgentMcpGrant(agentId, servers);
      const who = roster.find((a) => a.id === agentId)?.name ?? agentId;
      setNote(`${who}: saved. It takes effect the next time ${who} starts (Restart & Continue keeps the conversation).`);
    } catch (e) {
      setNote(String(e));
    } finally {
      setSaving(false);
    }
  };

  /** Take a Claude Code tool group away from an agent, or give it back. */
  const toggleTools = async (agentId: string, group: string) => {
    const all = { ...(config.agentToolBlocks ?? {}) };
    const cur = all[agentId] ?? [];
    const next = cur.includes(group) ? cur.filter((g) => g !== group) : [...cur, group];
    if (next.length) all[agentId] = next; else delete all[agentId];
    setSaving(true);
    try {
      await window.cth.updateConfig({ agentToolBlocks: all });
      const who = roster.find((a) => a.id === agentId)?.name ?? agentId;
      setNote(`${who}: saved. It takes effect the next time ${who} starts (Restart & Continue keeps the conversation).`);
    } catch (e) {
      setNote(String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (agentId: string, id: string) => {
    const cur = effectiveServers(config, agentId);
    void grant(agentId, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };

  /** Write the user's bundle list (config:changed refreshes `config`). */
  const saveBundles = async (next: Array<Omit<RoleBundle, 'custom'>>, done: string) => {
    setSaving(true);
    try {
      await window.cth.saveRoleBundles(next);
      setNote(done);
      setDraft(null);
    } catch (e) {
      setNote(String(e));
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = () => {
    if (!draft || !draft.label.trim()) return;
    const rest = custom.filter((b) => b.id !== draft.id).map(({ custom: _c, ...b }) => b);
    const edited = { id: draft.id ?? '', label: draft.label.trim(), icon: draft.icon, servers: draft.servers };
    const next = draft.id
      ? custom.map(({ custom: _c, ...b }) => (b.id === draft.id ? edited : b))
      : [...rest, edited];
    void saveBundles(next, `Bundle "${edited.label}" saved.`);
  };

  const remove = async (b: RoleBundle) => {
    if (!(await window.cth.confirm(`Delete the bundle "${b.label}"?`, { detail: 'Agents that were granted it keep their servers.', ok: 'Delete' }))) return;
    void saveBundles(custom.filter((x) => x.id !== b.id).map(({ custom: _c, ...x }) => x), `Bundle "${b.label}" deleted.`);
  };

  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>Capabilities</h2>
        <span className="pro-sub">Grant a role bundle</span>
        <div className="pro-head-end">
          <div className="pro-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'bundles'} onClick={() => setTab('bundles')}>Bundles &amp; servers</button>
            <button role="tab" aria-selected={tab === 'skills'} onClick={() => setTab('skills')}>Skills</button>
          </div>
        </div>
      </div>

      {tab === 'skills' ? (
        <div className="pro-card pro-embed" style={{ padding: 0, minHeight: 420 }}><SkillsTab agentCwd={targetAgent?.cwd} /></div>
      ) : (
        <>
          <div className="pro-row">
            <span className="pro-sub">Grant to</span>
            <select className="pro-input" value={target ?? ''} onChange={(e) => setTarget(e.target.value)}>
              {roster.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {note && <span className="pro-sub" style={{ fontSize: 12 }}>{note}</span>}
          </div>

          {draft && (
            <BundleEditor draft={draft} config={config} saving={saving}
              onChange={setDraft} onCancel={() => setDraft(null)} onSave={saveDraft}
              onConnections={() => setView({ kind: 'section', section: 'connections' })} />
          )}

          <div className="pro-grid">
            {bundles.map((b) => {
              const current = target ? effectiveServers(config, target) : [];
              const match = b.servers.length === current.length && b.servers.every((s) => current.includes(s));
              return (
                <article key={b.id} className="pro-card"
                  style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 130, ...(match ? { background: 'var(--cth-lemon-light)', borderColor: 'var(--cth-lemon)' } : {}) }}>
                  <span className="pro-row">
                    <span style={{ display: 'inline-flex', padding: 8, borderRadius: 8, background: 'var(--cth-cream-200)' }}><Icon name={b.icon} /></span>
                    <strong style={{ fontSize: 15, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.label}</strong>
                    {b.custom && <span className="pro-chip" style={{ marginInlineStart: 'auto' }}>yours</span>}
                  </span>
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
                    {b.servers.length === 0 && <span className="pro-sub" style={{ fontSize: 12 }}>No servers</span>}
                    {b.servers.map((s) => <span key={s} className={`pro-chip${consented(config, s) ? '' : ' pro-chip-off'}`}>{mcpLabel(s)}</span>)}
                  </span>
                  <span className="pro-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    <button className="pro-btn pro-btn-primary" disabled={!target || saving || match} onClick={() => target && void grant(target, b.servers)}>
                      {match ? `${targetAgent?.name ?? 'Agent'} has it` : `Grant to ${targetAgent?.name ?? '…'}`}
                    </button>
                    {b.custom ? (
                      <>
                        <button className="pro-btn" disabled={saving} onClick={() => setDraft({ id: b.id, label: b.label, icon: b.icon, servers: b.servers })}>Edit</button>
                        <button className="pro-btn" disabled={saving} onClick={() => remove(b)}>Delete</button>
                      </>
                    ) : (
                      <button className="pro-btn" disabled={saving} title="Make your own copy to change"
                        onClick={() => setDraft({ label: `${b.label} (copy)`, icon: b.icon, servers: b.servers })}>Duplicate</button>
                    )}
                  </span>
                </article>
              );
            })}
            <button className="pro-card" disabled={saving}
              style={{ borderStyle: 'dashed', minHeight: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cth-ink-500)' }}
              onClick={() => setDraft({ label: '', icon: 'mcp', servers: [] })}>
              + New bundle
            </button>
          </div>

          <h3 style={{ margin: '6px 0 0', fontSize: 14 }}>Who has what</h3>
          {roster.map((a) => {
            const has = effectiveServers(config, a.id);
            const ownGrant = !!config.agentMcpGrants?.[a.id];
            return (
              <div key={a.id} className="pro-card pro-row" style={{ flexWrap: 'wrap' }}>
                <span className="pro-row" style={{ width: 150 }}><Avatar agent={a} /><strong style={{ fontSize: 13 }}>{a.name}</strong></span>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
                  {NATIVE_TOOL_GROUPS.map((g) => {
                    // The orchestrator delegates through the office: never Claude's sub-agents.
                    const locked = g.id === 'subagents' && a.isGod;
                    const on = !locked && !(config.agentToolBlocks?.[a.id] ?? []).includes(g.id);
                    return (
                      <button key={g.id}
                        className={`pro-chip${on ? ' pro-chip-on' : ' pro-chip-off'}`}
                        style={{ cursor: locked ? 'default' : 'pointer' }}
                        title={locked ? 'The orchestrator delegates through the office, never with sub-agents' : `Claude Code: ${g.description}`}
                        disabled={saving || locked}
                        onClick={() => void toggleTools(a.id, g.id)}>
                        {g.label}
                      </button>
                    );
                  })}
                  <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--cth-ink-100)' }} />
                  {MCP_CATALOG.map((e) => {
                    const on = has.includes(e.id);
                    const usable = consented(config, e.id);
                    return (
                      <button key={e.id}
                        className={`pro-chip${on && usable ? ' pro-chip-on' : ''}${!on ? ' pro-chip-off' : ''}`}
                        style={{ cursor: 'pointer', borderStyle: on && !usable ? 'dashed' : undefined }}
                        title={on && !usable ? `${e.label} is granted but not switched on in Connections` : e.description}
                        disabled={saving}
                        onClick={() => toggle(a.id, e.id)}>
                        {e.label}
                      </button>
                    );
                  })}
                </span>
                {ownGrant
                  ? <button className="pro-btn" disabled={saving} onClick={() => void grant(a.id, undefined)}>Use defaults</button>
                  : <span className="pro-sub" style={{ fontSize: 11 }}>workspace defaults</span>}
              </div>
            );
          })}
          <p className="pro-sub" style={{ fontSize: 12 }}>
            Web, Shell and Sub-agents are Claude Code's own tools; switched off, the agent cannot use them. MCP servers reach Claude Code agents. Dimmed or dashed servers need their key and switch in{' '}
            <button className="pro-btn" style={{ padding: '1px 6px' }} onClick={() => setView({ kind: 'section', section: 'connections' })}>Connections</button> first.
          </p>
        </>
      )}
    </div>
  );
}

function BundleEditor({ draft, config, saving, onChange, onCancel, onSave, onConnections }: {
  draft: Draft; config: HarnessConfig; saving: boolean;
  onChange: (d: Draft) => void; onCancel: () => void; onSave: () => void; onConnections: () => void;
}) {
  const flip = (id: string) =>
    onChange({ ...draft, servers: draft.servers.includes(id) ? draft.servers.filter((s) => s !== id) : [...draft.servers, id] });
  const needsKey = draft.servers.filter((s) => !consented(config, s));
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 12, borderColor: 'var(--cth-lemon)' }}>
      <div className="pro-row">
        <strong style={{ fontSize: 14 }}>{draft.id ? 'Edit bundle' : 'New bundle'}</strong>
      </div>
      <div className="pro-row" style={{ flexWrap: 'wrap' }}>
        <input className="pro-input" style={{ flex: 1, minWidth: 200 }} placeholder="Name, e.g. Data Analyst" maxLength={40} autoFocus
          value={draft.label} onChange={(e) => onChange({ ...draft, label: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }} />
        <div className="pro-row" role="radiogroup" aria-label="Icon" style={{ gap: 4 }}>
          {BUNDLE_ICONS.map((ic) => (
            <button key={ic} role="radio" aria-checked={draft.icon === ic} title={ic}
              className="pro-btn" style={{ padding: 5, background: draft.icon === ic ? 'var(--cth-lemon-light)' : undefined, borderColor: draft.icon === ic ? 'var(--cth-lemon)' : undefined }}
              onClick={() => onChange({ ...draft, icon: ic })}><Icon name={ic} /></button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {MCP_CATALOG.map((e) => {
          const on = draft.servers.includes(e.id);
          return (
            <button key={e.id} aria-pressed={on} title={e.description}
              className={`pro-chip${on ? ' pro-chip-on' : ' pro-chip-off'}`} style={{ cursor: 'pointer' }}
              onClick={() => flip(e.id)}>{on ? '✓ ' : ''}{e.label}</button>
          );
        })}
      </div>
      {needsKey.length > 0 && (
        <p className="pro-sub" style={{ fontSize: 12, margin: 0 }}>
          {needsKey.map(mcpLabel).join(', ')} {needsKey.length === 1 ? 'needs' : 'need'} a key before agents can use {needsKey.length === 1 ? 'it' : 'them'}:{' '}
          <button className="pro-btn" style={{ padding: '1px 6px' }} onClick={onConnections}>set up in Connections</button>
        </p>
      )}
      <div className="pro-row">
        <button className="pro-btn pro-btn-primary" disabled={saving || !draft.label.trim()} onClick={onSave}>{saving ? 'Saving…' : 'Save bundle'}</button>
        <button className="pro-btn" disabled={saving} onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
