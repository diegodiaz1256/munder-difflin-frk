/** Name tags for a factory's workers (FactoryScene.tsx). Pure, for tests. */
interface Named { name: string; display_name?: string }

/** A name tag short enough not to run into the next desk's (desks are two
 *  tiles apart). A first name when the factory gives one; otherwise the
 *  worker's name without the first word it shares with others ("Dev Frontend 3"
 *  → "Frontend 3", "Revisor Seguridad" → "Seguridad"), kept to ~11 characters,
 *  instance number always kept. The full name and role are in the Line view and
 *  the worker's panel. Exported for tests. */
export function tagFor(a: Named, all: Array<Pick<Named, 'name'>> = []): string {
  const MAX = 11;
  if (a.display_name) return clip(a.display_name, MAX);
  const words = a.name.trim().split(/\s+/);
  const num = /^\d+$/.test(words[words.length - 1]) && words.length > 1 ? words.pop()! : '';
  const first = words[0]?.toLowerCase();
  const shared = all.filter((o) => o.name.trim().split(/\s+/)[0]?.toLowerCase() === first).length > 1;
  const base = shared && words.length > 1 ? words.slice(1).join(' ') : words.join(' ');
  return num ? `${clip(base, MAX - num.length - 1)} ${num}` : clip(base, MAX);
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s;
}
