import { useState } from 'react';
import type { HarnessConfig } from '@/store/config';
import type { Agent } from '@/store/store';
import { Icon } from '@/components/Icon';
import { SkillsTab } from '@/components/SkillsTab';
import { MCP_CATALOG, mcpCatalogEntry } from '@shared/mcpCatalog';
import { ROLE_BUNDLES, mcpLabel } from '@shared/roleBundles';
import { Avatar } from './data';
import { effectiveServers } from './AgentView';

/** A write/secret server is usable only once the user switched it on in Settings. */
function consented(config: HarnessConfig, id: string): boolean {
  const e = mcpCatalogEntry(id);
  if (!e) return false;
  return e.tier === 'safe-readonly' || config.mcpDefaults?.[id]?.enabled === true;
}

/**
 * Capabilities — what each agent can reach. Grant a role bundle (a set of MCP
 * servers) to an agent in one click, adjust single servers per agent, or browse
 * and install skills. Grants apply when the agent next starts; a keyed server
 * in a grant stays dimmed until it is switched on in Settings.
 */
export function CapabilitiesView({ roster, config }: { roster: Agent[]; config: HarnessConfig }) {
  const [tab, setTab] = useState<'bundles' | 'skills'>('bundles');
  const [target, setTarget] = useState<string | null>(roster.find((a) => !a.isGod)?.id ?? roster[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const targetAgent = roster.find((a) => a.id === target);

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

  const toggle = (agentId: string, id: string) => {
    const cur = effectiveServers(config, agentId);
    void grant(agentId, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
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

          <div className="pro-grid">
            {ROLE_BUNDLES.map((b) => {
              const current = target ? effectiveServers(config, target) : [];
              const match = b.servers.length === current.length && b.servers.every((s) => current.includes(s));
              return (
                <button key={b.id} className="pro-card" aria-pressed={match} disabled={!target || saving}
                  onClick={() => target && void grant(target, b.servers)}
                  style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 110 }}>
                  <span className="pro-row">
                    <span style={{ display: 'inline-flex', padding: 8, borderRadius: 8, background: 'var(--cth-cream-200)' }}><Icon name={b.icon} /></span>
                    <strong style={{ fontSize: 15 }}>{b.label}</strong>
                  </span>
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {b.servers.map((s) => <span key={s} className={`pro-chip${consented(config, s) ? '' : ' pro-chip-off'}`}>{mcpLabel(s)}</span>)}
                  </span>
                </button>
              );
            })}
          </div>

          <h3 style={{ margin: '6px 0 0', fontSize: 14 }}>Who has what</h3>
          {roster.map((a) => {
            const has = effectiveServers(config, a.id);
            const custom = !!config.agentMcpGrants?.[a.id];
            return (
              <div key={a.id} className="pro-card pro-row" style={{ flexWrap: 'wrap' }}>
                <span className="pro-row" style={{ width: 150 }}><Avatar agent={a} /><strong style={{ fontSize: 13 }}>{a.name}</strong></span>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
                  {MCP_CATALOG.map((e) => {
                    const on = has.includes(e.id);
                    const usable = consented(config, e.id);
                    return (
                      <button key={e.id}
                        className={`pro-chip${on && usable ? ' pro-chip-on' : ''}${!on ? ' pro-chip-off' : ''}`}
                        style={{ cursor: 'pointer', borderStyle: on && !usable ? 'dashed' : undefined }}
                        title={on && !usable ? `${e.label} is granted but switched off in Settings` : e.description}
                        disabled={saving}
                        onClick={() => toggle(a.id, e.id)}>
                        {e.label}
                      </button>
                    );
                  })}
                </span>
                {custom
                  ? <button className="pro-btn" disabled={saving} onClick={() => void grant(a.id, undefined)}>Use defaults</button>
                  : <span className="pro-sub" style={{ fontSize: 11 }}>workspace defaults</span>}
              </div>
            );
          })}
          <p className="pro-sub" style={{ fontSize: 12 }}>
            MCP servers reach Claude Code agents. Keyed servers (GitHub, Database, Email &amp; Calendar, Web Search) need their switch and key in Settings first.
          </p>
        </>
      )}
    </div>
  );
}
