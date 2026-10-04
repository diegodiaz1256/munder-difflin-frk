#!/usr/bin/env node
/**
 * A pretend software factory speaking Factory MCP v0 (FACTORY-MCP.md), for
 * tests and demos. Workers pick up tasks, hand them on (some get rejected and
 * go back), merge and deploy, a scaled-out builder gets hired under load.
 *
 *   node tools/mock-factory.cjs [--port 8787] [--token secret] [--read-only] [--tick 1500]
 *
 * Then add http://127.0.0.1:8787/mcp with that token in Manager → Factories.
 * In code: const { startMockFactory } = require('./tools/mock-factory.cjs').
 */
'use strict';
const http = require('node:http');
const { McpServer, ResourceTemplate } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');

const STAGES = ['planning', 'dev', 'review', 'verify', 'merging', 'deploying'];
const BY_STAGE = { planning: 'Architect', dev: 'Builder', review: 'Reviewer', verify: 'QA', merging: 'Release', deploying: 'Release' };

function createFactory({ readOnly = false } = {}) {
  const now = () => new Date().toISOString();
  const agents = [
    { id: 'architect', name: 'Architect', display_name: 'Ada', role: 'Architect', role_kind: 'planner', kind: 'llm', state: 'idle' },
    { id: 'planner', name: 'Planner', display_name: 'Pablo', role: 'Planner', role_kind: 'orderer', kind: 'llm', state: 'idle' },
    { id: 'builder', name: 'Builder', display_name: 'Berta', role: 'Developer', role_kind: 'builder', kind: 'llm', state: 'idle' },
    { id: 'reviewer', name: 'Reviewer', display_name: 'Rita', role: 'Reviewer', role_kind: 'reviewer', kind: 'llm', state: 'idle' },
    { id: 'qa', name: 'QA', display_name: 'Quique', role: 'Acceptance', role_kind: 'qa', kind: 'llm', state: 'idle' },
    { id: 'release', name: 'Release', role: 'Release bot', role_kind: 'automation', kind: 'automation', state: 'idle' }
  ].map((a) => ({ ...a, hired_at: now(), queue: [], spent_usd: 0, history: [] }));
  const projects = [{ id: 'shop', name: 'Shop', state: 'active', repo: 'https://example.invalid/shop' }, { id: 'blog', name: 'Blog', state: 'active' }, { id: 'docs', name: 'Docs site', state: 'active' }];
  const tasks = [];
  const events = [];
  let seq = 0;
  let tseq = 0;
  let ticks = 0;
  const emit = (e) => { events.push({ id: String(++seq), at: now(), ...e }); if (events.length > 200) events.shift(); };
  const agentBy = (name) => agents.find((a) => a.name === name);

  function addTask({ project, title, detail, client_ref }) {
    if (client_ref) { const hit = tasks.find((t) => t.client_ref === client_ref); if (hit) return hit; }
    const t = { task_id: `T-${++tseq}`, project, project_name: projects.find((p) => p.id === project)?.name, title, detail, client_ref, state: 'queued', stage: null, agent: null, attempts: 0, output: {}, created_at: now(), state_since: now(), stage_since: now(), updated_at: now() };
    tasks.push(t);
    emit({ type: 'task.created', task: t.task_id, text: title });
    return t;
  }
  {
    // A big task the factory split into parts; the parent follows them.
    const parent = addTask({ project: 'shop', title: 'Customer accounts', detail: 'Accounts end to end.' });
    parent.parts = [];
    for (const title of ['Sign-up form', 'Password reset', 'Account settings page']) {
      const part = addTask({ project: 'shop', title, detail: `${title}, part of Customer accounts.` });
      part.parent_id = parent.task_id;
      parent.parts.push(part.task_id);
    }
  }
  for (const [p, title] of [['shop', 'Checkout with saved cards'], ['shop', 'Order history page'], ['blog', 'RSS feed'], ['blog', 'Dark mode'], ['docs', 'API reference'], ['docs', 'Search box']]) {
    addTask({ project: p, title, detail: `${title}, end to end.` });
  }

  function setAgent(a, state, task) {
    a.state = state;
    a.task = task ? { id: task.task_id, title: task.title, stage: task.stage } : undefined;
    a.waiting_for = undefined;
  }

  /** One step of the line: every in-flight task moves on (or back). */
  function tick() {
    for (const t of tasks) {
      if (t.state === 'done' || t.state === 'failed' || t.state === 'cancelled') continue;
      if (t.parts) {
        const ps = t.parts.map((id) => tasks.find((x) => x.task_id === id));
        const st = ps.every((x) => x.state === 'done') ? 'done' : ps.some((x) => x.state !== 'queued') ? 'working' : 'queued';
        if (st !== t.state) { t.state = st; t.state_since = now(); t.updated_at = now(); if (st === 'done') emit({ type: 'task.done', task: t.task_id, ok: true }); }
        continue;
      }
      // Someone answers in the factory's own channel after a while.
      if (t.state === 'waiting') {
        t.waited = (t.waited ?? 0) + 1;
        if (t.waited > 6 && t.ask) {
          emit({ type: 'ask.answered', task: t.task_id, ok: true });
          t.ask = undefined; t.state = 'working'; t.approved = true;
        }
        continue;
      }
      const from = t.agent ? agentBy(t.agent) : null;
      let next;
      if (t.state === 'queued') next = 'planning';
      else {
        const i = STAGES.indexOf(t.stage);
        // A review sends roughly one task in three back to the builder.
        if (t.stage === 'review' && Math.random() < 0.33) {
          next = 'dev';
          emit({ type: 'task.handoff', task: t.task_id, from: 'Reviewer', to: 'Builder', ok: false, text: 'tests missing for the error path' });
          t.attempts++;
        } else next = STAGES[i + 1];
      }
      if (!next) {
        t.state = 'done'; t.stage = null; t.state_since = now(); t.updated_at = now();
        t.output = { summary: `${t.title} shipped`, pr_url: `https://example.invalid/pr/${t.task_id}`, deploy_url: `https://example.invalid/${t.project}` };
        if (from) setAgent(from, 'idle');
        emit({ type: 'task.done', task: t.task_id, ok: true });
        continue;
      }
      // An approval gate before merging, now and then.
      if (next === 'merging' && !t.approved && Math.random() < 0.25) {
        t.state = 'waiting'; t.state_since = now(); t.updated_at = now();
        t.ask = { id: `A-${t.task_id}`, kind: 'approval', question: `Merge "${t.title}" into main?`, options: ['approve', 'reject'] };
        emit({ type: 'ask.opened', task: t.task_id, text: t.ask.question });
        if (from) setAgent(from, 'waiting'), (from.waiting_for = 'waiting for a human approval');
        continue;
      }
      let worker = agentBy(BY_STAGE[next]);
      // Under load the builder is cloned; the instance stays listed afterwards.
      if (next === 'dev' && worker.state === 'working' && worker.task?.id !== t.task_id) {
        let extra = agents.find((a) => a.instance_of === 'Builder' && a.state === 'idle');
        if (!extra) {
          const n = agents.filter((a) => a.instance_of === 'Builder').length + 2;
          extra = { id: `builder-${n}`, name: `Builder ${n}`, display_name: `Berta ${n}`, role: 'Developer', role_kind: 'builder', kind: 'llm', instance_of: 'Builder', hired_at: now(), state: 'idle', queue: [], spent_usd: 0, history: [] };
          agents.push(extra);
          emit({ type: 'agent.hired', to: extra.name });
        }
        worker = extra;
      } else if (worker.state === 'working' && worker.task?.id !== t.task_id) {
        worker.queue = [...worker.queue.filter((q) => q.id !== t.task_id), { id: t.task_id, title: t.title }].slice(0, 5);
        continue; // waits its turn
      }
      worker.queue = worker.queue.filter((q) => q.id !== t.task_id);
      if (from && from !== worker) {
        setAgent(from, 'idle');
        from.history = [...from.history, { task: t.task_id, step: t.stage, result: 'ok', at: now() }].slice(-5);
        if (!(t.stage === 'review' && next === 'dev')) emit({ type: 'task.handoff', task: t.task_id, from: from.name, to: worker.name, ok: true });
      } else if (!from) emit({ type: 'task.assigned', task: t.task_id, to: worker.name });
      if (t.state !== 'working') t.state_since = now();
      t.state = 'working'; t.stage = next; t.stage_since = now(); t.agent = worker.name; t.updated_at = now();
      setAgent(worker, 'working', t);
      // QA runs the suites at the test rack, away from its desk.
      if (next === 'verify') { worker.state = 'away'; worker.at = 'test_rack'; } else worker.at = undefined;
      worker.spent_usd = Math.round((worker.spent_usd + (worker.kind === 'llm' ? 0.04 : 0)) * 100) / 100;
      if (next === 'merging') emit({ type: 'merge', task: t.task_id });
      if (next === 'deploying') emit({ type: 'deploy', task: t.task_id });
      break; // one move per tick keeps the floor readable
    }
    // Now and then a scaled-out builder is held back by the usage window.
    ticks++;
    for (const a of agents) if (a.instance_of && a.state === 'idle' && ticks % 9 === 0) { a.state = 'resting'; a.waiting_for = 'paused: the 5 h usage window is at 92%'; }
    for (const a of agents) if (a.state === 'resting' && ticks % 9 === 4) { a.state = 'idle'; a.waiting_for = undefined; }
    // Keep the line busy.
    if (tasks.filter((t) => !['done', 'failed', 'cancelled'].includes(t.state)).length < 4) {
      const p = projects[tseq % projects.length];
      addTask({ project: p.id, title: `Improvement #${tseq + 1}`, detail: 'Small improvement.' });
    }
  }

  function floor() {
    return {
      agents: agents.map((a) => ({ ...a, history: a.history.slice(-3) })),
      org: [{ name: 'Architect', role: 'Architect' }, ...agents.filter((a) => a.name !== 'Architect').map((a) => ({ name: a.name, role: a.role, reports_to: 'Architect' }))],
      board: tasks.filter((t) => t.state !== 'cancelled').slice(-20).map((t) => ({ id: t.task_id, title: t.title, project: t.project, state: t.state, stage: t.stage ?? undefined, assignee: t.agent ?? undefined, depends_on: [] })),
      pacing: { mode: 'normal', running: tasks.filter((t) => t.state === 'working').length, capacity: 4, window_5h_pct: 59, window_7d_pct: 37, own_5h_pct: 34, own_7d_pct: 21, ceiling_5h_pct: 55, ceiling_7d_pct: 60 }
    };
  }

  const pub = (t) => {
    const { client_ref: _c, approved: _a, detail: _d, waited: _w, ...rest } = t;
    return { ...rest, stage: t.stage ?? undefined, agent: t.agent ?? undefined };
  };
  return { readOnly, tasks, events, agents, projects, tick, floor, addTask, pub };
}

/** An MCP server over one factory's state. */
function buildServer(f) {
  const server = new McpServer(
    { name: 'mock-factory', version: '0.1.0' },
    { instructions: 'profile: factory-mcp/0\nprojects: required', capabilities: { resources: { subscribe: false } } }
  );
  const json = (v) => ({ content: [{ type: 'text', text: JSON.stringify(v) }], structuredContent: v });
  server.registerTool('task_get', { description: 'One task', inputSchema: { task_id: z.string() } }, ({ task_id }) => {
    const t = f.tasks.find((x) => x.task_id === task_id);
    if (!t) return { isError: true, content: [{ type: 'text', text: `no task ${task_id}` }] };
    return json(f.pub(t));
  });
  server.registerTool('task_list', { description: 'Tasks', inputSchema: { project: z.string().optional(), state: z.string().optional(), limit: z.number().optional(), include_parts: z.boolean().optional(), agent: z.string().optional() } }, ({ project, state, limit, include_parts, agent }) => {
    const hits = f.tasks.filter((t) => (!project || t.project === project) && (!state || t.state === state) && (include_parts || !t.parent_id) && (!agent || t.agent === agent));
    return json({ tasks: hits.slice(-(limit ?? 1000)).map(f.pub), total: hits.length });
  });
  server.registerTool('team_status', { description: 'The team', inputSchema: {} }, () => json({
    agents: f.agents.map((a) => ({ name: a.name, role: a.role, kind: a.kind, state: a.state, task_id: a.task?.id })),
    running: f.tasks.filter((t) => t.state === 'working').length, capacity: 4, usage: { window_5h_pct: 41, window_7d_pct: 23 }, spent_usd_today: 1.2
  }));
  server.registerTool('projects_list', { description: 'Projects', inputSchema: {} }, () => json({ projects: f.projects }));
  if (!f.readOnly) {
    server.registerTool('task_create', {
      description: 'Send the factory a task',
      inputSchema: { project: z.string(), title: z.string(), detail: z.string(), priority: z.enum(['normal', 'urgent']).optional(), depends_on: z.array(z.string()).optional(), client_ref: z.string().optional() }
    }, (a) => {
      if (!f.projects.some((p) => p.id === a.project)) return { isError: true, content: [{ type: 'text', text: `unknown project ${a.project}` }] };
      if (a.detail.trim().length < 10) return { isError: true, content: [{ type: 'text', text: 'detail is too vague: say what to build and how to tell it works' }] };
      const t = f.addTask(a);
      return json({ task_id: t.task_id, state: t.state });
    });
    server.registerTool('task_answer', { description: 'Answer an ask', inputSchema: { task_id: z.string(), ask_id: z.string(), text: z.string().optional(), approve: z.boolean().optional() } }, (a) => {
      const t = f.tasks.find((x) => x.task_id === a.task_id && x.ask?.id === a.ask_id);
      if (!t) return { isError: true, content: [{ type: 'text', text: 'no such open ask' }] };
      t.ask = undefined;
      if (a.approve === false) { t.state = 'cancelled'; } else { t.state = 'working'; t.approved = true; }
      return json({ ok: true });
    });
  }
  server.registerResource('floor', 'factory://floor', { mimeType: 'application/json' }, (uri) => ({
    contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(f.floor()) }]
  }));
  server.registerResource('events', new ResourceTemplate('factory://events{?since}', { list: undefined }), { mimeType: 'application/json' }, (uri, vars) => {
    const since = Number(vars.since ?? 0);
    const first = f.events[0] ? Number(f.events[0].id) : seq0(f);
    const out = f.events.filter((e) => Number(e.id) > since);
    const cursor = f.events.length ? f.events[f.events.length - 1].id : String(since);
    return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ events: out, cursor, gap: since > 0 && since < first - 1 }) }] };
  });
  return server;
}
const seq0 = () => 0;

/** Start an HTTP Factory MCP server; resolves to { url, close, factory }. */
async function startMockFactory({ port = 0, token = 'test-token', readOnly = false, tick = 1500 } = {}) {
  const f = createFactory({ readOnly });
  const timer = tick > 0 ? setInterval(() => f.tick(), tick) : null;
  const httpServer = http.createServer(async (req, res) => {
    if (!req.url?.startsWith('/mcp')) { res.writeHead(404).end(); return; }
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"unauthorized"}'); return; }
    let body = '';
    for await (const c of req) body += c;
    // Stateless: a fresh server + transport per request, as the SDK recommends
    // when no session state is needed.
    const server = buildServer(f);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
  });
  await new Promise((r) => httpServer.listen(port, '127.0.0.1', r));
  const url = `http://127.0.0.1:${httpServer.address().port}/mcp`;
  return { url, factory: f, close: () => new Promise((r) => { if (timer) clearInterval(timer); httpServer.close(() => r()); httpServer.closeAllConnections(); }) };
}

module.exports = { startMockFactory, createFactory };

if (require.main === module) {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
  startMockFactory({
    port: Number(arg('port', 8787)), token: arg('token', 'test-token'),
    readOnly: process.argv.includes('--read-only'), tick: Number(arg('tick', 1500))
  }).then(({ url }) => console.log(`[mock-factory] ${url}  (token: ${arg('token', 'test-token')}${process.argv.includes('--read-only') ? ', read-only' : ''})`));
}
