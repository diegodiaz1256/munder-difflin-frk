/**
 * What this fork ships differently from upstream, in one place.
 *
 * PRODUCT_ANALYTICS: upstream sends anonymous usage events to its PostHog
 * project (main/analytics.ts, TELEMETRY.md). This fork sends nothing: the build
 * injects no key (electron.vite.config.ts pins it empty, whatever the
 * environment says), so the client never starts, and the UI does not offer a
 * "share usage stats" switch that would do nothing.
 */
export const PRODUCT_ANALYTICS = false;

/**
 * The fork's own name. Munder Difflin stays the company in the office theme;
 * this app is its Scranton Branch. Installs separately from upstream's app (own
 * app id, data folder and keychain entry; see main/legacyMigration.ts for the
 * move from the old name).
 */
export const APP_NAME = 'Scranton Branch';
/** The two layouts, as the title-bar switch names them. */
export const LAYOUT_LABELS = { classic: 'Floor', pro: 'Manager' } as const;

/**
 * LEGACY_ORG_TRIGGER: upstream's "organisation key / clone node" settings saved
 * a key that no transport ever read. This fork's Team (Manager → Team; main/team.ts)
 * is the working version, so the old controls are hidden.
 */
export const LEGACY_ORG_TRIGGER = false;
