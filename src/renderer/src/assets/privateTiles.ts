/**
 * Licensed tile art (LimeZu Modern Office / Modern UI), decrypted into
 * assets/private/ at build time by tools/tiles-bundle.cjs. Builds without the
 * key have no such files: callers get null and draw the free art instead.
 */
const urls = import.meta.glob('./private/**/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** The bundled URL for a path inside the tiles bundle (e.g. "office/floor.png"), or null. */
export function privateTileUrl(rel: string): string | null {
  return urls[`./private/${rel}`] ?? null;
}

/** True when this build carries the licensed tiles. */
export const hasPrivateTiles = Object.keys(urls).length > 0;
