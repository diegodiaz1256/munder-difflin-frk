/**
 * Ordering and ticket search for the Deliverables list. Pure: the view hands
 * its groups (one per task, then research/ folders, then elsewhere) and gets
 * them back in the order the human picked.
 */

export type DeliverableSort = 'recent' | 'oldest' | 'name' | 'type' | 'author' | 'ticket';
export const DELIVERABLE_SORTS: DeliverableSort[] = ['recent', 'oldest', 'name', 'type', 'author', 'ticket'];

export interface SortItem { name: string; ts?: number; by?: string }
export interface SortGroup<I extends SortItem> { kind: string; ticket?: string; items: I[] }

const ext = (n: string): string => { const i = n.lastIndexOf('.'); return i > 0 ? n.slice(i + 1).toLowerCase() : ''; };
const newest = (g: SortGroup<SortItem>): number => Math.max(0, ...g.items.map((i) => i.ts ?? 0));
const oldest = (g: SortGroup<SortItem>): number => Math.min(Number.MAX_SAFE_INTEGER, ...g.items.map((i) => i.ts ?? Number.MAX_SAFE_INTEGER));
/** "dun-12" → ["dun", 12], so dun-9 comes before dun-12. */
const ticketKey = (t?: string): [string, number] => {
  const m = /^(.*?)-?(\d+)$/.exec(t ?? '');
  return m ? [m[1].toLowerCase(), Number(m[2])] : [(t ?? '￿').toLowerCase(), 0];
};

/** A query that is a ticket key ("DUN-12"): match that ticket exactly, not
 *  every ticket that contains it (DUN-120). */
export function ticketQuery(q: string): string | null {
  const s = q.trim().toLowerCase();
  return /^[a-z][a-z0-9]*-\d+$/.test(s) ? s : null;
}

export function sortDeliverables<I extends SortItem, G extends SortGroup<I>>(groups: G[], sort: DeliverableSort): G[] {
  const byItem = (a: I, b: I): number => {
    switch (sort) {
      case 'oldest': return (a.ts ?? 0) - (b.ts ?? 0);
      case 'name': return a.name.localeCompare(b.name, undefined, { numeric: true });
      case 'type': return ext(a.name).localeCompare(ext(b.name)) || a.name.localeCompare(b.name, undefined, { numeric: true });
      case 'author': return (a.by ?? '￿').localeCompare(b.by ?? '￿') || (b.ts ?? 0) - (a.ts ?? 0);
      default: return (b.ts ?? 0) - (a.ts ?? 0);
    }
  };
  const out = groups.map((g) => ({ ...g, items: [...g.items].sort(byItem) }));
  // Tasks keep their place before the folders; within them, the order picked.
  const rank = (g: G): number => (g.kind === 'task' ? 0 : g.kind === 'office' ? 1 : 2);
  const byGroup = (a: G, b: G): number => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.kind !== 'task') return 0;
    if (sort === 'ticket') {
      const [pa, na] = ticketKey(a.ticket);
      const [pb, nb] = ticketKey(b.ticket);
      return pa.localeCompare(pb) || nb - na;
    }
    if (sort === 'oldest') return oldest(a) - oldest(b);
    if (sort === 'recent') return newest(b) - newest(a);
    return 0;
  };
  return out.map((g, i) => ({ g, i })).sort((x, y) => byGroup(x.g, y.g) || x.i - y.i).map((x) => x.g);
}
