/**
 * The floors on this computer: the main profile plus every `floors/<id>`
 * profile New Floor created (floorProfile.ts). Read from disk each time, so a
 * floor another process just created or switched shows up as it is.
 */
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { officeHolder } from './officeLock';

export interface FloorEntry {
  /** null = the main profile (the app started normally). */
  id: string | null;
  /** The office it opens, or null when it has not picked one yet. */
  office: string | null;
  /** The office folder's name, for menus and titles. */
  name: string | null;
  /** When its settings last changed (ms), as "last used". */
  lastUsed: number;
  /** Another process is running its office right now. */
  running: boolean;
  /** This process. */
  current: boolean;
}

function readOffice(profile: string): { office: string | null; lastUsed: number } | null {
  try {
    const file = join(profile, 'config.json');
    const cfg = JSON.parse(readFileSync(file, 'utf8')) as { harnessHome?: unknown };
    const office = typeof cfg.harnessHome === 'string' && cfg.harnessHome ? cfg.harnessHome : null;
    return { office, lastUsed: statSync(file).mtimeMs };
  } catch { return null; }
}

export function listFloors(base: string, currentId: string | null, holder: (home: string) => number | null = officeHolder): FloorEntry[] {
  const entry = (id: string | null, profile: string): FloorEntry | null => {
    const r = readOffice(profile);
    if (!r) return null;
    const current = id === currentId;
    return {
      id,
      office: r.office,
      name: r.office ? basename(r.office) : null,
      lastUsed: r.lastUsed,
      running: !current && !!r.office && holder(resolve(r.office)) !== null,
      current
    };
  };
  const out: FloorEntry[] = [];
  const main = entry(null, base);
  if (main) out.push(main);
  let ids: string[] = [];
  try { ids = readdirSync(join(base, 'floors')).filter((d) => /^[0-9a-f]{6,32}$/.test(d)); } catch { /* none yet */ }
  for (const id of ids) {
    const e = entry(id, join(base, 'floors', id));
    if (e) out.push(e);
  }
  return out.sort((a, b) => (a.id === null ? -1 : b.id === null ? 1 : b.lastUsed - a.lastUsed));
}

/** Forget a floor: its profile folder (settings, window state). Its office
 *  folder, with the agents' work, is never touched. Refused while it runs. */
export function removeFloor(base: string, id: string, currentId: string | null, holder: (home: string) => number | null = officeHolder): { ok: boolean; error?: string } {
  if (!/^[0-9a-f]{6,32}$/.test(id)) return { ok: false, error: 'unknown floor' };
  if (id === currentId) return { ok: false, error: 'This is the floor you are on.' };
  const f = listFloors(base, currentId, holder).find((x) => x.id === id);
  if (!f) return { ok: false, error: 'unknown floor' };
  if (f.running) return { ok: false, error: 'That floor is open. Close its window first.' };
  try { rmSync(join(base, 'floors', id), { recursive: true, force: true }); return { ok: true }; }
  catch (e) { return { ok: false, error: `That floor is still in use (${(e as NodeJS.ErrnoException).code ?? 'busy'}). Close its window first.` }; }
}
