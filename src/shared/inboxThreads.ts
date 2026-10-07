/**
 * The Inbox as conversations: one thread per agent, oldest first, that reads
 * like a chat. It merges the two places a conversation lives:
 *   - hive messages (every inbox/outbox copy, deduped by id in main), and
 *   - the questions asked of the human on task cards (`humanQA`), each shown
 *     as a question and, once given, its answer.
 * Pure: the renderer feeds it what it already polls.
 */

export interface ThreadMessage {
  id: string;
  conversation?: string;
  from: string;
  to: string;
  act: string;
  subject: string;
  body: string;
  requires_reply: boolean;
  in_reply_to?: string | null;
  created_at: string;
}

export interface ThreadTask {
  id: string;
  key?: string;
  title: string;
  assignee?: string;
  status?: string;
  humanQA?: Array<{ q: string; a?: string; askedAt?: string; answeredAt?: string; dismissedAt?: string }>;
}

export type ThreadItem =
  | { kind: 'message'; ts: string; message: ThreadMessage; /** a reply to an earlier message in this thread */ replyTo?: ThreadMessage }
  | { kind: 'question'; ts: string; taskId: string; taskLabel: string; q: string; askedBy: string }
  | { kind: 'answer'; ts: string; taskId: string; taskLabel: string; a: string; /** the question it answers */ q: string }
  | { kind: 'dismissed'; ts: string; taskId: string; taskLabel: string; q: string };

export interface ThreadSummary {
  agentId: string;
  count: number;
  lastTs?: string;
  last?: ThreadItem;
  /** Questions on its cards still waiting for the human. */
  waiting: number;
}

/** Senders that are the harness talking to itself, not conversation. */
export const SYSTEM_SENDERS: ReadonlySet<string> = new Set(['heartbeat', 'scheduler', 'breaker', 'system']);

/** True when `id` names this agent in a message's from/to. The orchestrator is
 *  also addressed as "god"; a broadcast reaches everyone. */
function addressed(field: string, agentId: string, isGod: boolean): boolean {
  return field === agentId || (isGod && field === 'god');
}

/** The answer mail the app sends the orchestrator when the human answers a
 *  card's question (components/answerQuestion.ts), read back into its parts,
 *  or null for any other message. */
export function parseAnswerMail(m: ThreadMessage): { taskId: string; title: string; q: string; a: string } | null {
  if (m.from !== 'human' || !m.subject.startsWith('HUMAN ANSWER on task')) return null;
  const id = /open question on task (\S+) \(/.exec(m.body);
  const qAt = m.body.indexOf('\nQ: ');
  const aAt = m.body.lastIndexOf('\nA: ');
  if (!id || qAt < 0 || aAt <= qAt) return null;
  const endAt = m.body.indexOf('\nThe answer is also recorded', aAt);
  const title = /^HUMAN ANSWER on task "(.*)"$/.exec(m.subject)?.[1] ?? id[1];
  return {
    taskId: id[1],
    title,
    q: m.body.slice(qAt + 4, aAt).trim(),
    a: m.body.slice(aAt + 4, endAt < 0 ? undefined : endAt).trim()
  };
}

/** Every item of one agent's conversation, oldest first. Questions on task
 *  cards land in the assignee's thread and in the orchestrator's, who asks
 *  them. The answer mail the app sends him shows as the answer it carries. */
export function buildThread(
  agentId: string,
  isGod: boolean,
  messages: readonly ThreadMessage[],
  tasks: readonly ThreadTask[],
  godId?: string
): ThreadItem[] {
  const items: ThreadItem[] = [];
  const mine = messages.filter((m) => !SYSTEM_SENDERS.has(m.from)
    && (addressed(m.from, agentId, isGod) || addressed(m.to, agentId, isGod) || (m.to === 'broadcast' && !addressed(m.from, agentId, isGod))));
  const byId = new Map(mine.map((m) => [m.id, m]));
  const answered = new Set<string>();
  for (const task of tasks) {
    if (task.assignee !== agentId && !isGod) continue;
    const taskLabel = [task.key, task.title].filter(Boolean).join(' · ');
    for (const qa of task.humanQA ?? []) {
      const askedAt = qa.askedAt ?? '';
      items.push({ kind: 'question', ts: askedAt, taskId: task.id, taskLabel, q: qa.q, askedBy: godId ?? 'god' });
      if (qa.a) {
        items.push({ kind: 'answer', ts: qa.answeredAt || askedAt, taskId: task.id, taskLabel, a: qa.a, q: qa.q });
        answered.add(`${task.id}\n${qa.q.trim()}`);
      }
      else if (qa.dismissedAt) items.push({ kind: 'dismissed', ts: qa.dismissedAt, taskId: task.id, taskLabel, q: qa.q });
    }
  }
  for (const m of mine) {
    const mail = parseAnswerMail(m);
    if (mail) {
      // Already shown from the card itself: skip the mail that carried it.
      if (answered.has(`${mail.taskId}\n${mail.q}`)) continue;
      const task = tasks.find((t) => t.id === mail.taskId);
      const taskLabel = task ? [task.key, task.title].filter(Boolean).join(' · ') : mail.title;
      items.push({ kind: 'answer', ts: m.created_at, taskId: mail.taskId, taskLabel, a: mail.a, q: mail.q });
      continue;
    }
    const replyTo = m.in_reply_to ? byId.get(m.in_reply_to) : undefined;
    items.push({ kind: 'message', ts: m.created_at, message: m, ...(replyTo ? { replyTo } : {}) });
  }
  // Stable: equal timestamps keep insertion order (a question before its answer).
  return items
    .map((it, i) => ({ it, i }))
    .sort((x, y) => (x.it.ts === y.it.ts ? x.i - y.i : x.it.ts.localeCompare(y.it.ts)))
    .map(({ it }) => it);
}

/** One row per agent for the conversation list, most recent first; agents
 *  with nothing yet go last, in roster order. */
export function summarizeThreads(
  agents: ReadonlyArray<{ id: string; isGod?: boolean }>,
  messages: readonly ThreadMessage[],
  tasks: readonly ThreadTask[],
  godId?: string
): ThreadSummary[] {
  const rows = agents.map((a, order) => {
    const thread = buildThread(a.id, !!a.isGod, messages, tasks, godId);
    const last = thread[thread.length - 1];
    const waiting = tasks
      .filter((t) => t.assignee === a.id || (!t.assignee && a.isGod))
      .reduce((n, t) => n + (t.humanQA ?? []).filter((qa) => !qa.a && !qa.dismissedAt).length, 0);
    return { order, row: { agentId: a.id, count: thread.length, lastTs: last?.ts, last, waiting } };
  });
  return rows
    .sort((x, y) => {
      if (x.row.waiting !== y.row.waiting) return y.row.waiting - x.row.waiting;
      if (x.row.lastTs && y.row.lastTs) return y.row.lastTs.localeCompare(x.row.lastTs);
      if (x.row.lastTs || y.row.lastTs) return x.row.lastTs ? -1 : 1;
      return x.order - y.order;
    })
    .map(({ row }) => row);
}

/** The calendar day of an ISO timestamp, for "Today / Yesterday / date" separators. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** A stable DOM id for one question in a thread, so an answer can point at it. */
export function questionAnchor(taskId: string, q: string): string {
  let h = 0;
  for (let i = 0; i < q.length; i++) h = (h * 31 + q.charCodeAt(i)) | 0;
  return `q-${taskId.replace(/[^A-Za-z0-9_-]/g, '_')}-${(h >>> 0).toString(36)}`;
}
