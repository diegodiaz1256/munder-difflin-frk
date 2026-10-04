/**
 * The orchestrator manages Automations (scheduled missions) the same way it
 * hires temps: by dropping a JSON request file that the main process validates
 * and applies. This module is the pure half — parse one request, apply it to
 * the mission list, say what happened — so it can be tested without electron.
 *
 * Request shape (one per file, in <hive>/agents/<god>/schedule/):
 *   { "op": "create", "label": "Nightly regression", "to": "angela",
 *     "body": "Run the billing suite…", "every": "1d" }
 *   { "op": "create", …, "weekly": { "days": ["mon","fri"], "time": "09:00" } }
 *   { "op": "update", "id": "<mission id>", "enabled": false }
 *   { "op": "delete", "id": "<mission id>" }
 *
 * Built-in missions (the standup, heartbeat, compaction) are the user's
 * settings: they may be switched on/off and re-timed, never rewritten or deleted.
 */
import { normalizeWeekly, type WeeklySchedule } from './weeklySchedule';

export interface MissionLike {
  id: string;
  label: string;
  intervalMs: number;
  weekly?: WeeklySchedule;
  to: string;
  body: string;
  enabled: boolean;
  kind?: 'dispatch' | 'heartbeat' | 'compact';
  lastFiredAt?: number;
  [key: string]: unknown;
}

export const BUILT_IN_MISSIONS = new Set(['ops-standup', 'heartbeat', 'compact-maintenance']);
/** No tighter than this: a mission is a prompt to an agent, i.e. spend. */
export const MIN_MISSION_INTERVAL_MS = 5 * 60_000;
const MAX_MISSIONS = 50;

export type MissionRequestResult =
  | { ok: true; missions: MissionLike[]; message: string }
  | { ok: false; message: string };

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** "30m", "2h", "1d", "1w" or a number of ms → ms. */
export function parseEvery(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v !== 'string') return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(m|min|h|d|w)\s*$/i.exec(v);
  if (!m) return null;
  const unit = m[2].toLowerCase();
  const mult = unit.startsWith('m') ? 60_000 : unit === 'h' ? 3_600_000 : unit === 'd' ? 86_400_000 : 604_800_000;
  return Math.round(parseFloat(m[1]) * mult);
}

/** { days: ["mon","fri"] | [1,5], time: "09:00" } → a WeeklySchedule, or null. */
export function parseWeekly(v: unknown): WeeklySchedule | null {
  if (!v || typeof v !== 'object') return null;
  const raw = v as { days?: unknown; time?: unknown; minute?: unknown };
  const days = Array.isArray(raw.days)
    ? raw.days.map((d) => (typeof d === 'string' ? DAY_NAMES.indexOf(d.trim().slice(0, 3).toLowerCase()) : d))
    : raw.days;
  let minute = raw.minute;
  if (typeof raw.time === 'string') {
    const t = /^(\d{1,2}):(\d{2})$/.exec(raw.time.trim());
    minute = t ? Number(t[1]) * 60 + Number(t[2]) : -1;
  }
  return normalizeWeekly({ days, minute });
}

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null;

function slug(label: string, taken: Set<string>): string {
  const base = 'agent-' + (label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'mission');
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  return id;
}

/**
 * Apply one request. `agents` are the ids a mission may be addressed to (the
 * registry, plus 'god'). Never throws; a refusal explains itself so the
 * orchestrator can fix the request.
 */
export function applyMissionRequest(missions: MissionLike[], req: unknown, agents: Set<string>): MissionRequestResult {
  if (!req || typeof req !== 'object') return { ok: false, message: 'Not a JSON object.' };
  const r = req as Record<string, unknown>;
  const op = r.op;

  const timing = (): { intervalMs?: number; weekly?: WeeklySchedule | null } | string => {
    const out: { intervalMs?: number; weekly?: WeeklySchedule | null } = {};
    if (r.every !== undefined) {
      const ms = parseEvery(r.every);
      if (ms === null) return '"every" must look like "30m", "2h", "1d" or "1w".';
      if (ms < MIN_MISSION_INTERVAL_MS) return 'Missions run at most every 5 minutes.';
      out.intervalMs = ms;
    }
    if (r.weekly !== undefined) {
      if (r.weekly === null) out.weekly = null;
      else {
        const w = parseWeekly(r.weekly);
        if (!w) return '"weekly" needs days (e.g. ["mon","fri"]) and a time like "09:00".';
        out.weekly = w;
      }
    }
    return out;
  };

  if (op === 'create') {
    if (missions.length >= MAX_MISSIONS) return { ok: false, message: `There are already ${MAX_MISSIONS} missions; delete one first.` };
    const label = str(r.label, 80);
    const to = str(r.to, 80);
    const body = str(r.body, 4000);
    if (!label) return { ok: false, message: '"label" is required (up to 80 characters).' };
    if (!to || !agents.has(to)) return { ok: false, message: `"to" must be an agent on the floor (${[...agents].join(', ')}).` };
    if (!body) return { ok: false, message: '"body" is required (the prompt the agent receives, up to 4000 characters).' };
    const t = timing();
    if (typeof t === 'string') return { ok: false, message: t };
    if (t.intervalMs === undefined && !t.weekly) return { ok: false, message: 'Give "every" (e.g. "1d") or "weekly".' };
    const id = slug(label, new Set(missions.map((m) => m.id)));
    const mission: MissionLike = {
      id, label, to, body,
      intervalMs: t.intervalMs ?? 86_400_000,
      ...(t.weekly ? { weekly: t.weekly } : {}),
      enabled: r.enabled !== false
    };
    return { ok: true, missions: [...missions, mission], message: `Created "${label}" (${id}) for ${to}.` };
  }

  const id = str(r.id, 120);
  const current = id ? missions.find((m) => m.id === id) : undefined;
  if (op !== 'update' && op !== 'delete') return { ok: false, message: '"op" must be "create", "update" or "delete".' };
  if (!current) return { ok: false, message: `No mission with id "${id ?? ''}". Read missions.json for the ids.` };
  const builtIn = BUILT_IN_MISSIONS.has(current.id);

  if (op === 'delete') {
    if (builtIn) return { ok: false, message: `"${current.label}" is built in: switch it off with {"op":"update","id":"${current.id}","enabled":false} instead.` };
    return { ok: true, missions: missions.filter((m) => m.id !== current.id), message: `Deleted "${current.label}".` };
  }

  const next: MissionLike = { ...current };
  if (r.enabled !== undefined) {
    if (typeof r.enabled !== 'boolean') return { ok: false, message: '"enabled" must be true or false.' };
    next.enabled = r.enabled;
  }
  const t = timing();
  if (typeof t === 'string') return { ok: false, message: t };
  if (t.intervalMs !== undefined) next.intervalMs = t.intervalMs;
  if (t.weekly === null) delete next.weekly;
  else if (t.weekly) next.weekly = t.weekly;
  for (const key of ['label', 'to', 'body'] as const) {
    if (r[key] === undefined) continue;
    if (builtIn) return { ok: false, message: `"${current.label}" is built in: only "enabled" and its timing can change.` };
    const v = str(r[key], key === 'body' ? 4000 : 80);
    if (!v) return { ok: false, message: `"${key}" cannot be empty.` };
    if (key === 'to' && !agents.has(v)) return { ok: false, message: `"to" must be an agent on the floor (${[...agents].join(', ')}).` };
    next[key] = v;
  }
  return { ok: true, missions: missions.map((m) => (m.id === current.id ? next : m)), message: `Updated "${next.label}".` };
}
