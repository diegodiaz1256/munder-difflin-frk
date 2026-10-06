import { useTranslation } from 'react-i18next';
import type { HarnessConfig } from '@/store/config';
import { AiEnginesSettings } from '@/components/AiEnginesSettings';

/**
 * AI providers — model API keys, local endpoints, default models and
 * certificates for the BYOK CLI engines (OpenCode, Pi, Crush, Qwen). The same
 * surface as Settings → AI Engines, here beside Connections and Environment so
 * every key the office uses is managed in one place.
 */
export function ProvidersView({ config }: { config: HarnessConfig }) {
  const { t } = useTranslation();
  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>{t('pro.nav.providers')}</h2>
        <span className="pro-sub">{t('pro.prov.sub')}</span>
      </div>
      <p className="pro-text">{t('pro.prov.hint')}</p>
      <div className="pro-card" style={{ flexShrink: 0 }}><AiEnginesSettings config={config} /></div>
    </div>
  );
}
