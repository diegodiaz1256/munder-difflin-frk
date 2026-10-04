/**
 * Ticket keys — a short, stable handle for every card on the board (`bmt-12`).
 *
 * tasks.json ids are whatever the writer chose (god writes the ledger by hand,
 * so ids range from slugs to timestamps). A key is assigned by the harness the
 * first time it sees a task and is stored in its own ledger, `taskKeys.json`,
 * which no agent writes, so a god rewriting tasks.json can never renumber the
 * board. Numbers are never reused: a deleted task keeps its slot.
 *
 * Pure and dependency-free so main and the renderer share one implementation.
 */

export interface TaskKeyLedger {
  /** Next number to hand out. */
  next: number;
  /** task id → number. */
  keys: Record<string, number>;
}

export const EMPTY_TASK_KEY_LEDGER: TaskKeyLedger = { next: 1, keys: {} };

/** Prefix derived from a hive folder name: the first three letters or digits,
 *  lower-cased (`Big Mountain Tech` → `big`). Falls back to `md`. */
export function taskKeyPrefix(folderName: string | undefined | null): string {
  const clean = (folderName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean.slice(0, 3) || 'md';
}

/** Normalize anything read from disk into a usable ledger. */
export function normalizeTaskKeyLedger(raw: unknown): TaskKeyLedger {
  if (!raw || typeof raw !== 'object') return { next: 1, keys: {} };
  const r = raw as Partial<TaskKeyLedger>;
  const keys: Record<string, number> = {};
  let max = 0;
  if (r.keys && typeof r.keys === 'object') {
    for (const [id, n] of Object.entries(r.keys)) {
      if (typeof n === 'number' && Number.isInteger(n) && n > 0) {
        keys[id] = n;
        if (n > max) max = n;
      }
    }
  }
  const next = typeof r.next === 'number' && Number.isInteger(r.next) && r.next > max ? r.next : max + 1;
  return { next, keys };
}

/**
 * Give every task that has no key the next number, oldest first (createdAt,
 * then id, so two tasks created in the same millisecond still order the same
 * way on every machine). Returns the ledger and whether it changed.
 */
export function assignTaskKeys(
  ledger: TaskKeyLedger,
  tasks: ReadonlyArray<{ id: string; createdAt?: string }>
): { ledger: TaskKeyLedger; changed: boolean } {
  const missing = tasks
    .filter((t) => typeof t.id === 'string' && t.id && !(t.id in ledger.keys))
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id));
  if (missing.length === 0) return { ledger, changed: false };
  const keys = { ...ledger.keys };
  let next = ledger.next;
  for (const t of missing) {
    if (t.id in keys) continue; // duplicate id in the ledger file
    keys[t.id] = next++;
  }
  return { ledger: { next, keys }, changed: true };
}

export function formatTaskKey(prefix: string, n: number | undefined): string | undefined {
  return n ? `${prefix}-${n}` : undefined;
}
