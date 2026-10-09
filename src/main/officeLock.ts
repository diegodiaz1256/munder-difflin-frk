/**
 * One process per office.
 *
 * Each floor is its own app process (floorProfile.ts), and an office is a
 * folder on disk that only ONE process may run: two would each start an
 * orchestrator, route the same inbox twice and commit the hive's git history
 * over each other. The process that opens an office leaves its pid in a small
 * file at the office root; another process seeing a live pid there leaves the
 * office alone. A pid that is gone (a crash, a power cut) holds nothing.
 *
 * The file sits at the office root, not under hive/, so the hive's git history
 * never picks it up.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const OFFICE_LOCK_FILE = '.scranton-open.json';

function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}

function readHolder(home: string): number | null {
  try {
    const pid = Number((JSON.parse(readFileSync(join(home, OFFICE_LOCK_FILE), 'utf8')) as { pid?: unknown }).pid);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch { return null; }
}

/** The pid of ANOTHER live process running this office, or null. */
export function officeHolder(home: string, alive: (pid: number) => boolean = pidAlive): number | null {
  const pid = readHolder(home);
  return pid !== null && pid !== process.pid && alive(pid) ? pid : null;
}

/** Take the office for this process, unless another live one has it. */
export function claimOffice(home: string, alive: (pid: number) => boolean = pidAlive): { ok: true } | { ok: false; pid: number } {
  const other = officeHolder(home, alive);
  if (other !== null) return { ok: false, pid: other };
  try { writeFileSync(join(home, OFFICE_LOCK_FILE), JSON.stringify({ pid: process.pid, at: new Date().toISOString() })); }
  catch { /* a read-only office still opens; it just is not guarded */ }
  return { ok: true };
}

/** Give the office back (quit, relaunch, switch). Only our own claim. */
export function releaseOffice(home: string | null | undefined): void {
  if (!home || readHolder(home) !== process.pid) return;
  try { rmSync(join(home, OFFICE_LOCK_FILE), { force: true }); } catch { /* gone */ }
}
