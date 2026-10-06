import type { TFunction } from 'i18next';

/**
 * The MCP catalog (src/shared/mcpCatalog.ts) is shared with main, so its words
 * stay English there; the UI looks each one up under `mcpCatalog.<id>` and
 * falls back to the catalog's own text for a server the locales don't know.
 */
export const mcpDescription = (t: TFunction, id: string, fallback: string): string =>
  t(`mcpCatalog.${id}.desc`, { defaultValue: fallback });

/** A key field's label or help: `mcpCatalog.<id>.<ENV>.label|help`. */
export const mcpField = (t: TFunction, id: string, env: string, part: 'label' | 'help', fallback: string): string =>
  t(`mcpCatalog.${id}.${env}.${part}`, { defaultValue: fallback });
