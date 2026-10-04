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
