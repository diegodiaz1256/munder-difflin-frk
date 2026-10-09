/**
 * The body of an agent-written hive message. Agents do not always use `body`:
 * a temp reported its whole answer as `"result": "…"` and the message reached
 * the orchestrator empty, so it redid the job itself. When `body` is empty the
 * first text under a field agents commonly use instead is taken; a structured
 * body is kept as JSON rather than dropped.
 */
const ALTERNATIVES = ['result', 'summary', 'message', 'text', 'content', 'answer', 'output', 'details', 'detail', 'report'] as const;

export function messageBody(partial: Record<string, unknown>): string {
  const show = (v: unknown): string => {
    if (typeof v === 'string') return v;
    if (v === null || v === undefined) return '';
    try { return JSON.stringify(v, null, 2); } catch { return ''; }
  };
  const body = show(partial.body);
  if (body.trim()) return body;
  for (const key of ALTERNATIVES) {
    const v = show(partial[key]);
    if (v.trim()) return v;
  }
  return '';
}
