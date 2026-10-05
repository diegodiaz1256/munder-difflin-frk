import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { agentModels, type HarnessConfig } from '@/store/config';
import { EFFORTS, type AgentKind } from '@shared/roleModels';

/**
 * Model and effort per kind of agent (shared/roleModels.ts): the orchestrator,
 * your agents, temps. The orchestrator's model is godModel and your agents'
 * is defaultModel, the same settings as elsewhere; temps get their own.
 */
export function RoleModelsSettings({ config, stage, selectStyle, agentModel, setAgentModel }: {
  config: HarnessConfig;
  /** Your agents' model is the default-model setting above; kept in step with it. */
  agentModel: string;
  setAgentModel: (id: string) => void;
  stage: (patch: Partial<HarnessConfig>) => void;
  selectStyle: CSSProperties;
}): JSX.Element {
  const { t } = useTranslation();
  const [models, setModels] = useState<Record<AgentKind, string>>({
    god: config.godModel ?? '',
    agent: '',
    temp: config.tempModel ?? ''
  });
  const [effort, setEffort] = useState<Partial<Record<AgentKind, string>>>({ ...(config.roleEffort ?? {}) });
  const modelKey: Record<AgentKind, 'godModel' | 'defaultModel' | 'tempModel'> = { god: 'godModel', agent: 'defaultModel', temp: 'tempModel' };

  const setModel = (k: AgentKind, id: string): void => {
    if (k === 'agent') { if (id) setAgentModel(id); return; }
    setModels((m) => ({ ...m, [k]: id }));
    stage({ [modelKey[k]]: id || undefined } as Partial<HarnessConfig>);
  };
  const setRoleEffort = (k: AgentKind, e: string): void => {
    const next = { ...effort };
    if (e) next[k] = e; else delete next[k];
    setEffort(next);
    stage({ roleEffort: next } as Partial<HarnessConfig>);
  };

  const rows: AgentKind[] = ['god', 'agent', 'temp'];
  const options = agentModels().filter((m) => m.id);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: '6px 10px', alignItems: 'center' }}>
      <span />
      <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{t('settings.agentsModels.roleModel')}</span>
      <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{t('settings.agentsModels.roleEffort')}</span>
      {rows.map((k) => (
        <div key={k} style={{ display: 'contents' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 13, color: 'var(--cth-ink-900)' }}>{t(`settings.agentsModels.role_${k}`)}</span>
            <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>{t(`settings.agentsModels.role_${k}Desc`)}</span>
          </div>
          <select value={k === 'agent' ? agentModel : models[k]} onChange={(e) => setModel(k, e.target.value)} style={selectStyle} aria-label={`${t(`settings.agentsModels.role_${k}`)} ${t('settings.agentsModels.roleModel')}`}>
            <option value="">{k === 'temp' ? t('settings.agentsModels.sameAsAgents') : t('settings.agentsModels.byRole')}</option>
            {options.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <select value={effort[k] ?? ''} onChange={(e) => setRoleEffort(k, e.target.value)} style={selectStyle} aria-label={`${t(`settings.agentsModels.role_${k}`)} ${t('settings.agentsModels.roleEffort')}`}>
            <option value="">{t('settings.agentsModels.claudeDefault')}</option>
            {EFFORTS.map((e) => <option key={e} value={e}>{t(`settings.agentsModels.effort_${e}`)}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}
