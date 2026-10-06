/**
 * The size a new process starts at under a PTY id that already has a terminal.
 *
 * A pooled terminal outlives its process: a restart, a model change, or the
 * relaunch after a missing CLI was installed all spawn a new process under the
 * same id. Started at the spawn's default (100x30) instead of the size the
 * terminal was last fitted to, the program drew for 30 rows while xterm showed
 * about 20; every row past the bottom landed on the last one, and Claude's
 * first-run theme menu read "o✓cLightmmode((ANSIccolorsoonly)ly)". The view
 * does not resize again, because its own size never changed.
 */
export interface PtySize { cols: number; rows: number }

export const DEFAULT_PTY_SIZE: PtySize = { cols: 100, rows: 30 };

export function spawnSize(requested: Partial<PtySize>, lastFitted: PtySize | undefined): PtySize {
  if (lastFitted && lastFitted.cols > 0 && lastFitted.rows > 0) return lastFitted;
  return { cols: requested.cols ?? DEFAULT_PTY_SIZE.cols, rows: requested.rows ?? DEFAULT_PTY_SIZE.rows };
}
