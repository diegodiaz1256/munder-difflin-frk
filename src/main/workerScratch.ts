import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Clear a finished temp's hive folder (agents/<id>). What it learned outlives
 * it: Memory reads agents/<id>/memory.md for every agent in the registry,
 * archived temps included, so memory.md stays when it holds notes and the rest
 * (inbox, outbox, settings) goes. A memory that is only the empty template goes
 * too, with the folder.
 */
export function clearWorkerScratch(dir: string): void {
  let keep = false;
  try { keep = /^\s*[-*]\s+\S/m.test(readFileSync(join(dir, 'memory.md'), 'utf8')); } catch { /* no memory */ }
  if (!keep) { rmSync(dir, { recursive: true, force: true }); return; }
  for (const name of readdirSync(dir)) {
    if (name !== 'memory.md') rmSync(join(dir, name), { recursive: true, force: true });
  }
}
