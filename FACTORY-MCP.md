# Factory MCP — profile v0

A standard way to **send work to a software factory** and follow it to the end. In this
profile, a *factory* is any system that takes a task ("build this feature", "fix that bug")
and carries it through its own pipeline, such as planning, development, review, verification,
merge and deploy. It reports progress and stops to ask a human when it needs one.

The profile is plain [MCP](https://modelcontextprotocol.io): a factory is an MCP server that
exposes the tools below, and a *manager* is any MCP client that uses them. Scranton Branch is
one manager. Any MCP client (an IDE, a coding agent, a script) can be another. Nothing in it is
specific to one product.

Status: **v0**. Changes inside v0 are additive only (new optional fields or tools).

## Transport and access

- **MCP over Streamable HTTP** (protocol 2025-06-18 or newer) behind TLS. A local factory may
  also offer stdio.
- **`Authorization: Bearer <token>`**, with one token per client, minted by the factory.
- **Scopes**, carried by the token:

  | Scope | Allows |
  |---|---|
  | `read` | `task_get`, `task_list`, `team_status`, `projects_list`, `memory_search`, `memory_recall`, `context_for_task` |
  | `write` | `read`, plus `task_create`, `task_answer`, `task_comment`, `memory_store` |
  | `admin` | `write`, plus `task_cancel`, `set_pacing` |

  A call outside the token's scope fails with an MCP tool error. Tools a factory does not
  offer are simply absent from `tools/list`.
- **Initialize.** The server's `instructions` include the line `profile: factory-mcp/0`. When
  the factory runs more than one project, they also include `projects: required`.
- **Exposure.** A factory decides where it can be reached. This profile assumes a private
  network (LAN, VPN, tailnet). It does not assume the public internet.

## Tasks

A task has a coarse **state** every client understands and a free-text **stage** that says
where it is in this factory's own pipeline.

| `state` | Meaning |
|---|---|
| `queued` | accepted, not started |
| `working` | in the pipeline (`stage` says where: `planning`, `dev`, `review`, `verify`, `merging`, `deploying`…) |
| `waiting` | blocked on a human: `ask` holds the question or approval |
| `done` | finished. `output` may keep filling in afterwards (see below) |
| `failed` | gave up. `output.summary` says why |
| `cancelled` | cancelled by a client or the factory |

```jsonc
// Task
{
  "task_id": "string",
  "project": "string",            // a projects_list id
  "project_name": "string?",      // its display name, to save a lookup
  "title": "string",
  "state": "queued | working | waiting | done | failed | cancelled",
  "stage": "string?",             // factory-specific, for display only
  "agent": "string?",             // who holds it now
  "attempts": 0,
  "parent_id": "string?",         // set on a part of a split task
  "parts": ["task_id"],           // set on a task the factory split
  "ask": {                        // present while state == "waiting"
    "id": "string",
    "kind": "question | approval",
    "question": "string",
    "options": ["string"]         // optional choices
  },
  "output": {                     // fills in as it happens
    "summary": "string?",
    "repo": "string?",
    "pr_url": "string?",
    "deploy_url": "string?"
  },
  "created_at": "ISO-8601?",
  "state_since": "ISO-8601?",     // entered its current state
  "stage_since": "ISO-8601?",     // entered its current stage
  "updated_at": "ISO-8601"
}
```

**Split tasks.** A factory may split a big task into parts. The parent's `state` and
`output` aggregate its parts. `task_list` returns top-level tasks unless `include_parts` is
true.

**Output after done.** Deploys may be batched, so `output.deploy_url` can arrive after `done`.
Clients re-read the task when they are notified rather than treat `done` as final for output.

### Tools

| Tool | Scope | Input | Result |
|---|---|---|---|
| `task_create` | write | `project`, `title`, `detail`, `priority?` (`normal`\|`urgent`), `depends_on?` (task ids), `client_ref?` | `{ task_id, state }` |
| `task_get` | read | `task_id` | Task |
| `task_list` | read | `project?`, `state?`, `agent?` (exact worker name), `limit?`, `include_parts?` | `{ tasks: Task[], total? }` (may be summarised) |
| `task_answer` | write | `task_id`, `ask_id`, `text?`, `approve?` (bool, for `approval` asks) | `{ ok }` |
| `task_comment` | write | `task_id`, `text` | `{ ok }` |
| `task_cancel` | admin | `task_id`, `reason?` | `{ ok }` |

- **`detail` is required.** A factory plans from it and may reject a task that is too vague. It
  answers with a tool error saying what is missing.
- **`client_ref` makes `task_create` idempotent.** The same `client_ref` from the same client
  returns the existing `{ task_id, state }` instead of a duplicate, so retries over a flaky
  network are safe.

### Notifications

When a client subscribes to the resource `task://{task_id}`, the factory sends
`notifications/resources/updated` whenever that task's state, stage, ask or output changes. A
client that does not subscribe polls `task_get` / `task_list`.

## The factory

| Tool | Scope | Result |
|---|---|---|
| `team_status` | read | `{ agents: [{ name, role, kind: "llm" \| "automation", state, task_id?, since? }], running, capacity, paused?, usage?: { window_5h_pct?, window_7d_pct? }, spent_usd_today? }` |
| `projects_list` | read | `{ projects: [{ id, name, state: "active" \| "paused" \| "done", repo?, url? }] }` |
| `set_pacing` | admin, optional | input `mode`: `normal` \| `paused` \| `forced` → `{ ok }` |

`spent_usd_today` is notional: subscription-equivalent cost, not a bill. Projects are listed
only. Creating one is left to the factory's own process in v0.

## The floor (optional, read)

A factory may also let a manager *watch* it like an office: who is at which desk, what they
are doing, and work moving between them. Two resources, both `read` scope:

**`factory://floor`**: a snapshot that changes every few seconds. The factory sends
`notifications/resources/updated` when it changes; clients may poll instead.

```jsonc
{
  "agents": [{
    "id": "string",                  // stable for the session
    "name": "string",                // role-instance name, as used in events' from/to
    "display_name": "string?",       // a human first name, if the factory gives them
    "role": "string",                // free text
    "role_kind": "planner | orderer | builder | reviewer | qa | automation",  // optional, for sprites and desk types
    "instance_of": "string?",        // a scaled-out instance ("Dev Frontend 2") names its base role
    "hired_at": "ISO-8601?",         // when it joined, so a new desk can appear
    "kind": "llm | automation",
    "team": "string?",
    "state": "idle | working | waiting | resting | away | offline",
    "at": "desk | test_rack | archive | meeting",  // where an `away` agent is
    "waiting_for": "string?",        // also says why an agent is `resting`
    "task": { "id": "string", "title": "string", "stage": "string?" },  // what they do now
    "queue": [{ "id": "string", "title": "string" }],                     // lined up next
    "spent_usd": 0,                  // notional, not a bill
    "history": [{ "task": "string", "step": "string", "result": "ok | failed", "at": "ISO-8601" }]
  }],
  "org": [{ "name": "string", "role": "string", "reports_to": "string?" }],  // for layout
  "board": [{ "id": "string", "title": "string", "project": "string", "state": "string",
              "stage": "string?", "assignee": "string?", "depends_on": ["task_id"] }],
  "pacing": {
    "mode": "string", "reason": "string?", "running": 0, "capacity": 0,
    "window_5h_pct": 0, "window_7d_pct": 0,      // the whole account behind the factory
    "own_5h_pct": 0, "own_7d_pct": 0,            // what the factory itself used
    "ceiling_5h_pct": 0, "ceiling_7d_pct": 0     // where the factory stops (applies to own_*)
  }
}
```

Only `agents` and `board` are required. Every field marked `?` and every array element field
not listed as required may be omitted.

Agent states:

| `state` | Meaning |
|---|---|
| `idle` | at their desk, nothing to do |
| `working` | on `task` |
| `waiting` | blocked on someone. `waiting_for` says on whom, in plain words |
| `resting` | held back by pacing (a usage limit or budget). `waiting_for` says which |
| `away` | working somewhere else for a moment. `at` says where |
| `offline` | not available at all |

Agents do not disappear in the middle of a session. A scaled-out instance that has nothing to
do stays listed as `idle`.

A factory sends `notifications/resources/updated` for the floor at most every 2 seconds. Polling
every 3 seconds is a fine fallback.

**`factory://events?since=<cursor>`**: what happened, in order:
`{ "events": [{ "id", "at", "type", "from"?, "to"?, "task"?, "text"?, "ok"? }], "cursor", "gap" }`.

- **Ids.** They increase monotonically per server. The cursor is an integer sent as a string.
  `at` is ISO-8601.
- **`gap: true`.** The factory keeps a bounded tail, so the cursor can fall off it. When it
  does, `gap` is true and the client re-reads `factory://floor`.
- **Types.** `task.assigned`, `task.handoff` (from one worker to another, e.g. dev → review,
  review → dev on a rejection), `task.verified`, `task.done`, `task.failed`, `merge`,
  `deploy`, `ask.opened`.
- **`from` / `to`.** These are worker names, so a client can animate a hand-off from one desk
  to the next.
- **`ok` on a hand-off.** A hand-off that sends work back (a review rejection, a failed
  verification) has `ok: false` and `text` set to the short reason. A hand-off forward has
  `ok: true`.

A factory that exposes only `read` tools and these resources is a **read-only factory**. A
manager shows it, but sends it nothing. Its questions are answered in the factory's own
channels.

## Memory (optional)

A factory that keeps project knowledge may expose it:

| Tool | Scope | Input | Result |
|---|---|---|---|
| `memory_search` | read | `query`, `scope?` (project), `kinds?`, `limit?` (≤ 10, default 5), `max_distance?` | `{ results: [{ id, scope, kind, text, distance }] }` |
| `memory_recall` | read | `scope`, `id` | `{ id, scope, kind, text }` |
| `memory_store` | write | `scope`, `kind`, `text`, `id?` | `{ id }` (may become searchable after a short delay) |
| `context_for_task` | read | `scope`, `task` | `{ markdown, ids }`: what the factory already knows about it, ready to put in a brief |

## In Scranton Branch

Scranton Branch is a manager:

- **Adding a factory.** Manager → Factories → add one with its URL and token. The token is
  encrypted and held by the app. Agents never receive it. Test runs `initialize` and
  `team_status`.
- **The factory screen.** Send a task (project picked from `projects_list`), follow your tasks
  live, answer questions and approvals inline, open outputs (PR, deploy), and see the team and
  its pacing.
- **The orchestrator.** It can delegate whole jobs to a factory through the app's MCP gateway,
  with `write` scope only. `admin` actions stay with the human.

## Not in v0

Creating projects, a factory pushing tasks to its manager, and mirroring a whole office. That
last one is a separate profile, for offices that work with each other.
