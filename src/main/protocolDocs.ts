/**
 * The hive protocol, as one short file per topic under <hive>/protocol/ and an
 * index in <hive>/PROTOCOL.md.
 *
 * It used to be a single 9 KB PROTOCOL.md. Agents grepped it for the part they
 * needed ("spawn", "outbox", "hire") or read all of it every time, and a worker
 * paid for the orchestrator's sections on every read. Now the index says which
 * file answers which question and who it is for, so an agent opens only that.
 */

export const GENERATED_DOC_NOTICE =
  '<!-- Generated and managed by Munder Difflin. Local edits may be replaced during hive bootstrap. -->';

export interface ProtocolDoc {
  /** File name under <hive>/protocol/. */
  file: string;
  title: string;
  /** Who needs it: every agent, or only the orchestrator. */
  who: 'everyone' | 'orchestrator';
  /** The question it answers, as the index lists it. */
  when: string;
  body: string;
}

export const PROTOCOL_DIR = 'protocol';

export const PROTOCOL_DOCS: ProtocolDoc[] = [
  {
    file: 'workspace.md',
    title: 'Your workspace',
    who: 'everyone',
    when: 'what is in your own folder, and what you may write',
    body: `Your folder is \`agents/<your-id>/\` in the hive:
- \`identity.md\`  — who you are (read-only; the harness writes it).
- \`memory.md\`    — your long-term memory. Read it at the start of a task; append to it as you learn.
- \`inbox/\`       — messages addressed to you. Read them at the start of a task.
- \`inbox/.done/\` — move a message here once you've handled it. Re-reading one there is a no-op.
- \`outbox/\`      — drop messages here to send them (see \`messages.md\`). The harness delivers them.

**Never write into another agent's folder.** Write to your own \`outbox/\`; the harness routes it.
Every file has a single writer, and only the harness runs git.`
  },
  {
    file: 'messages.md',
    title: 'Sending a message',
    who: 'everyone',
    when: 'the message JSON, which acts expect a reply, how to reach the human',
    body: `Write one JSON file into your \`outbox/\` (any filename ending in \`.json\`):

\`\`\`json
{
  "to": "<agent-id> | god | broadcast",
  "act": "request | inform | propose | query | agree | refuse | done",
  "subject": "one-line summary",
  "body": "the details",
  "conversation": "carry this across a thread (optional)",
  "in_reply_to": "<message id you're replying to> (optional)"
}
\`\`\`

The harness fills in \`id\`, \`from\`, \`hops\`, and timestamps.

- Only \`request\`, \`query\` and \`propose\` expect a reply. \`inform\` and \`done\` are terminal — don't
  reply to them, or two agents loop forever.
- For anything ambiguous, cross-cutting, or needing sign-off, message \`god\`, who answers for the
  human whenever possible.
- There is no separate approval queue. A tool that needs permission prompts in your own session
  (the human can approve it from their phone via \`/remote-control\`). For a human decision, write
  to \`god\`; a message \`"to": "human"\` is routed to god too.`
  },
  {
    file: 'tasks.md',
    title: 'The plan and the task cards',
    who: 'everyone',
    when: 'board.md vs tasks.json, and who may edit them',
    body: `Two shared surfaces, both in the hive root:
- \`board.md\` — the freeform narrative plan. God is its sole scribe; others \`propose\` edits to god.
- \`tasks.json\` — the task cards (a kanban: \`todo / doing / blocked / done\`, with title, assignee,
  priority, deps, and \`deliverable\`). Keep the card you're working on in the right status.`
  },
  {
    file: 'services.md',
    title: 'Outside services, secrets and deliverables',
    who: 'everyone',
    when: 'Connections, REST APIs, runners, secrets, where deliverables go',
    body: `Never ask the human for a key, a token or a password: the app holds them and adds them for you.
- **Connections** (GitHub, Database, Notion, Sentry…) are MCP tools named \`munder-<id>\`, for agents
  whose CLI takes the office's MCP servers (Claude Code). Your system prompt lists the ones you
  have and whether they are read-only for you; none listed means none.
- **REST APIs** (Jira, Linear, Stripe, your own…) go through \`bin/md-api.cjs\`: run it with no
  arguments to list the ones you may use right now, then \`md-api <api> GET /path\`. An API the
  human connects later works at once. A refusal says why (switched off, no key, not for you, read-only).
- **Runners** run commands that need secrets: \`bin/md-run.cjs\` with no arguments lists the ones that
  exist now (also ones added after you started), \`md-run <runner>\` runs one. The app executes it
  and masks every secret in the output.
- **The office browser** reads a page with the app's own Chromium when a plain fetch gets nothing
  (403, "enable JavaScript", an empty shell): \`bin/md-browse.cjs <url>\` (\`--links\` for its links),
  \`md-browse --search "<query>"\`; Claude Code agents also have it as the \`munder-browser\` tools. It is
  off when Web is switched off for you. It does not solve captchas or bot challenges: report those.
- **Deliverables** for the human go in \`research/\` (a subfolder per task is fine); say the path
  when you report.`
  },
  {
    file: 'guardrails.md',
    title: 'Circuit breaker and token budgets',
    who: 'everyone',
    when: 'a "Circuit breaker" message reached you, or you worry about spend',
    body: `A circuit breaker watches every agent for runaway behaviour (looping on the same tool, error storms,
overspending). It escalates: \`steer\` → \`constrain\` → \`stop\`. A \`Circuit breaker: steer\` or
\`Circuit breaker: constrain\` message in your inbox means you ARE the problem it caught: stop
repeating, summarise what you tried, and do what it says (constrain = read-only, and god's sign-off
before more tool calls).

Be token-frugal: the floor has a budget and each agent can have its own limit. Prefer references
over pasted content, and \`/compact\` your session when its context gets heavy.`
  },
  {
    file: 'semantic-memory.md',
    title: 'Semantic memory',
    who: 'everyone',
    when: 'recalling what the office already knows (when MemPalace is installed)',
    body: `When \`MEMPALACE_PALACE_PATH\` is set in your environment, the office shares a searchable
MemPalace and you have the \`mempalace\` CLI (Claude Code agents also get it as the
\`munder-memory\` MCP tools):
- \`mempalace search "<query>"\` — recall past knowledge across the whole team by meaning. Add
  \`--wing <agent-id>\` to scope to one agent, \`--results N\` to widen.
- \`mempalace wake-up\` — a short digest of what matters, good at the start of a task.

Every agent's \`memory.md\` is mined into it automatically; you never run \`mine\` yourself.`
  },
  {
    file: 'ask-human.md',
    title: 'Asking the human (the ASK ME card)',
    who: 'orchestrator',
    when: 'a card can only move with the human: how to ask on the card',
    body: `When a card can only move with the human — a question, or an action only they can do (create an
account, approve a spend, hand over credentials, test on their device) — set the card
\`"status": "blocked"\` and append the ask to its \`humanQA\` array:

\`\`\`json
{ "q": "the ask, in markdown", "askedAt": "<iso timestamp>" }
\`\`\`

The ASK ME board shows it; the human's reply lands in the same entry as \`"a"\` and as an inbox
message to you. Keep every past entry: the trail is the card's decision history.

**Short, and in markdown** (the card renders it; over ~700 characters it is a report, not a question):
- open with ONE **bold** sentence saying exactly what you need;
- \`backticks\` for paths, commands, values and identifiers;
- \`-\` bullets or \`1.\` numbers for every option or step;
- a blank line between paragraphs (a single newline is a line break).

Rewrite an ask that comes from another agent's report into that shape; never paste the report. No
separate question files (\`HumanQuestion.md\`), and never sit waiting: move on and pick the answer up
when it arrives.`
  },
  {
    file: 'fleet.md',
    title: 'Watching the floor',
    who: 'orchestrator',
    when: 'who is doing what, live state, costs',
    body: `- \`fleet.json\` — refreshed continuously: each agent's tokens, cost, status, breaker level, last tool,
  last-active time and inbox backlog. Your source of truth for the floor.
- \`registry.json\` — the roster; \`log.jsonl\` — the event feed.
- One agent in depth: its \`agents/<id>/memory.md\` and \`inbox/\`, or send it a \`query\`.

\`claude agents\` does NOT list the office's agents: they are started by the app, not by you.
\`COMMANDS.md\` is the Claude Code command reference (slash commands act only on your own session).`
  },
  {
    file: 'spawn.md',
    title: 'Spawning a temp worker',
    who: 'orchestrator',
    when: 'starting a worker for one job yourself',
    body: `Write ONE JSON file into \`spawn-requests/<id>.json\` in the hive root:

\`\`\`json
{
  "objective": "what the worker must do (required)",
  "cwd": "/absolute/path (required: a registered repo, this office, or an agent's folder)",
  "name": "display name (optional)",
  "provider": "claude | codex | cursor | antigravity | … (optional)",
  "command": "engine CLI (optional; an agent CLI only, no settings/MCP/backend flags)",
  "model": "model override (optional)",
  "isolate": true,
  "tokenCap": 0,
  "slack": { "channel": "C…", "thread_ts": "…" },
  "character": "meredith",
  "accent": "coral"
}
\`\`\`

The harness spawns \`worker-<id>\` and moves the request to \`spawn-requests/.done/\`, or to
\`.failed/\` with a reason. \`isolate\` (default true) gives it its own git worktree; \`slack\` routes its
failures to a thread; \`character\`/\`accent\` set its look (a cast member's name already does).

**It can be switched off** (Settings → Autonomy & Budgets, off by default). While off, a request
waits in \`spawn-requests/\` untouched; raise it with the human instead of retrying. Route work to an
agent already on the floor first either way. A temp is archived when its job is done: for a
permanent member of the office, see \`hire.md\`.`
  },
  {
    file: 'hire.md',
    title: 'Hiring a permanent employee',
    who: 'orchestrator',
    when: 'the human wants a permanent member of the office, not a temp',
    body: `Write a hire manifest to \`research/hires/<name>.json\`. The app opens the Add-Agent review with it
prefilled and the human confirms; the new agent then appears in \`registry.json\` and you dispatch to
its inbox. An invalid file comes back to your inbox as \`[hire manifest rejected]\` with the reason.

\`\`\`json
{
  "spec": "munder-difflin/hire@1",
  "name": "display name (required)",
  "description": "one-line role",
  "goal": "the standing mission",
  "provider": "claude | codex | cursor | antigravity",
  "model": "model id (optional)",
  "character": "office cast sprite, e.g. dwight (optional)",
  "isolate": false,
  "tokenCap": 0
}
\`\`\``
  }
];

/** <hive>/protocol/<file>: one topic, standalone. */
export function renderProtocolDoc(d: ProtocolDoc): string {
  return `${GENERATED_DOC_NOTICE}\n\n# ${d.title}\n\n_For: ${d.who === 'orchestrator' ? 'the orchestrator (god)' : 'every agent'}._\n\n${d.body}\n`;
}

/** <hive>/PROTOCOL.md: where things are, and which topic file to open. */
export function renderProtocolIndex(): string {
  const row = (d: ProtocolDoc): string => `- \`${PROTOCOL_DIR}/${d.file}\` — ${d.when}.`;
  return [
    GENERATED_DOC_NOTICE,
    '',
    '# Hive protocol — index',
    '',
    'You are one of several agents (Claude Code, Codex, Gemini…) sharing this office. Coordination is',
    'file-based: the harness is the only thing that runs git and moves messages between agents.',
    '',
    '**Open only the topic you need.** Each file below is short and stands alone; you never need to read',
    'them all, and a worker never needs the orchestrator ones.',
    '',
    '## Every agent',
    ...PROTOCOL_DOCS.filter((d) => d.who === 'everyone').map(row),
    '',
    '## Orchestrator (god) only',
    ...PROTOCOL_DOCS.filter((d) => d.who === 'orchestrator').map(row),
    '- `COMMANDS.md` — the Claude Code command reference.',
    '',
    '## Where things are — don\'t search for them',
    'All in this hive folder (paths relative to it); your system prompt gives each one in full.',
    '- `agents/<your-id>/` — your folder (`protocol/workspace.md`).',
    '- `board.md`, `tasks.json` — the plan and the task cards.',
    '- `registry.json`, `fleet.json`, `log.jsonl` — the roster, live state, the event feed.',
    '- `research/` — deliverables for the human; `research/hires/` — hire proposals.',
    '- `lists/` — the human\'s personal lists.',
    '- `spawn-requests/`, `missions.json` — worker requests and scheduled missions.',
    '- `bin/md-api.cjs` (REST APIs), `bin/md-run.cjs` (runners) — no arguments lists what you may use.',
    '',
    'Never hunt for office files or tools across the disk, in other projects, or in Scranton Branch\'s',
    'own installation or source code. If something is not here, in your folder, your working directory',
    'or your prompt, it does not exist for you: ask `god` (god asks the human) instead.',
    ''
  ].join('\n');
}

/** Every protocol file, relative to the hive root. */
export function protocolFiles(): Array<{ filename: string; contents: string }> {
  return [
    { filename: 'PROTOCOL.md', contents: renderProtocolIndex() },
    ...PROTOCOL_DOCS.map((d) => ({ filename: `${PROTOCOL_DIR}/${d.file}`, contents: renderProtocolDoc(d) }))
  ];
}
