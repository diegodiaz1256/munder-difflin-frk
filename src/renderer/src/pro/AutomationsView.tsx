import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TriggersTab } from '@/components/triggers/TriggersTab';
import { TriggerHistoryTab } from '@/components/triggers/TriggerHistoryTab';

/**
 * Automations — scheduled missions, context rules and webhooks that run the
 * floor without you at the keyboard, plus the history of what fired. Both are
 * the Classic Command Center panels, given a full screen.
 */
export function AutomationsView() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'rules' | 'history'>('rules');
  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>{t('pro.nav.automations')}</h2>
        <div className="pro-tabs" role="tablist" style={{ marginInlineStart: 8 }}>
          <button role="tab" aria-selected={tab === 'rules'} onClick={() => setTab('rules')}>{t('pro.automations.rules')}</button>
          <button role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}>{t('pro.automations.history')}</button>
        </div>
      </div>
      <div className="pro-card pro-embed" style={{ padding: 0, minHeight: 420, overflow: 'auto' }}>
        {tab === 'rules' ? <TriggersTab /> : <TriggerHistoryTab />}
      </div>
    </div>
  );
}
