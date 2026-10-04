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
 * LEGACY_ORG_TRIGGER: upstream's "organisation key / clone node" settings saved
 * a key that no transport ever read. This fork's Team (Pro → Team; main/team.ts)
 * is the working version, so the old controls are hidden.
 */
export const LEGACY_ORG_TRIGGER = false;
