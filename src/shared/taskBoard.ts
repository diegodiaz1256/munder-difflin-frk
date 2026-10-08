/**
 * Board columns with subtasks hanging under their parent card. A subtask in
 * the same column as its parent sits under it; one in another column stands
 * alone there (its card names the parent).
 */

export interface BoardCard { id: string; parent?: string }

/** The cards of a column that are not a subtask of another card in it. */
export function columnRoots<T extends BoardCard>(cards: readonly T[]): T[] {
  const here = new Set(cards.map((c) => c.id));
  return cards.filter((c) => !(c.parent && c.parent !== c.id && here.has(c.parent)));
}

/** The subtasks of `id` among `cards`, in their order. */
export function subtasksIn<T extends BoardCard>(cards: readonly T[], id: string): T[] {
  return cards.filter((c) => c.parent === id && c.id !== id);
}
