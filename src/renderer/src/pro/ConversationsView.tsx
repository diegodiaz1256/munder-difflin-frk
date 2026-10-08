import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Agent } from '@/store/store';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { openQuestion } from '@/components/TasksKanban';
import { answerOpenQuestion } from '@/components/answerQuestion';
import { isComposingKey } from '@shared/imeGuard';
import { buildThread, dayKey, questionAnchor, summarizeThreads, type ThreadItem, type ThreadMessage } from '@shared/inboxThreads';
import { Avatar, type KeyedTask } from './data';

/**
 * The Inbox as one chat per agent: everything it was told and said, and the
 * questions on its cards with your answers, oldest at the top like any chat.
 * Questions still waiting can be answered right in the thread; the box at the
 * bottom writes to the orchestrator (to a worker, through him, as everywhere
 * else a human dispatches).
 */
export function ConversationsView({ agents, messages, tasks }: { agents: Agent[]; messages: ThreadMessage[]; tasks: KeyedTask[] }) {
  const { t } = useTranslation();
  const god = agents.find((a) => a.isGod);
  const rows = useMemo(() => summarizeThreads(agents, messages, tasks, god?.id), [agents, messages, tasks, god?.id]);
  const [openId, setOpenId] = useState<string | null>(null);
  const current = agents.find((a) => a.id === (openId ?? rows[0]?.agentId));
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const name = (id: string) => (id === 'human' ? t('pro.inbox.you') : id === 'god' ? (god?.name ?? id) : byId.get(id)?.name ?? id);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <aside className="pro-card" style={{ flex: '1 1 220px', maxWidth: 300, minWidth: 0, minHeight: 200, maxHeight: THREAD_HEIGHT, overflowY: 'auto', padding: 0 }}>
        {rows.map((r) => {
          const a = byId.get(r.agentId);
          if (!a) return null;
          return (
            <button key={r.agentId} onClick={() => setOpenId(r.agentId)} aria-current={current?.id === r.agentId}
              className="pro-row"
              style={{ width: '100%', gap: 8, padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--pro-line)', cursor: 'pointer', textAlign: 'start', font: 'inherit', color: 'inherit',
                background: current?.id === r.agentId ? 'var(--pro-sel)' : 'transparent' }}>
              <Avatar agent={a} />
              <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <strong style={{ fontSize: 13 }}>{a.name}</strong>
                <span className="pro-sub" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.last ? preview(r.last, name, t) : t('pro.inbox.noMessages')}
                </span>
              </span>
              {r.waiting > 0 && <span className="pro-count" title={t('pro.inbox.waitingTip')}>{r.waiting}</span>}
            </button>
          );
        })}
      </aside>
      {current
        ? <Thread key={current.id} agent={current} god={god} messages={messages} tasks={tasks} name={name} />
        : <div className="pro-card" style={{ flex: '999 1 360px' }}><p className="pro-sub" style={{ margin: 0 }}>{t('pro.inbox.pickAgent')}</p></div>}
    </div>
  );
}

const LS_INTERNAL = 'cth.inbox.showInternal';

/** The thread scrolls inside itself (the box stays put, like a chat) rather
 *  than growing the page: the window minus the page header and tabs. */
const THREAD_HEIGHT = 'calc(100vh - 150px)';

type Name = (id: string) => string;
type T = ReturnType<typeof useTranslation>['t'];

function preview(it: ThreadItem, name: Name, t: T): string {
  switch (it.kind) {
    case 'message': return `${name(it.message.from)}: ${it.message.subject || it.message.body.slice(0, 80)}`;
    case 'question': return `${t('pro.inbox.questionForYou')}: ${it.q}`;
    case 'answer': return `${t('pro.inbox.you')}: ${it.a}`;
    case 'dismissed': return t('pro.inbox.dismissedQ');
  }
}

function dayLabel(iso: string, t: T): string {
  const k = dayKey(iso);
  const now = new Date();
  if (k === dayKey(now.toISOString())) return t('pro.inbox.today');
  if (k === dayKey(new Date(now.getTime() - 86_400_000).toISOString())) return t('pro.inbox.yesterday');
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function Thread({ agent, god, messages, tasks, name }: { agent: Agent; god?: Agent; messages: ThreadMessage[]; tasks: KeyedTask[]; name: Name }) {
  const { t } = useTranslation();
  const items = useMemo(() => buildThread(agent.id, !!agent.isGod, messages, tasks, god?.id), [agent.id, agent.isGod, messages, tasks, god?.id]);
  const scroller = useRef<HTMLDivElement>(null);
  // Follow the bottom like a chat, unless you scrolled up to read.
  const pinned = useRef(true);
  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  // Messages between agents (not to or from you) fold into one line per run,
  // opened one by one or all at once; the choice is remembered.
  const [showInternal, setShowInternal] = useState<boolean>(() => {
    try { return window.localStorage.getItem(LS_INTERNAL) === '1'; } catch { return false; }
  });
  const toggleInternal = () => setShowInternal((v) => { try { window.localStorage.setItem(LS_INTERNAL, v ? '0' : '1'); } catch { /* noop */ } return !v; });
  const [openRuns, setOpenRuns] = useState<Set<number>>(new Set());
  const blocks = useMemo(() => {
    const out: Array<{ kind: 'item'; it: ThreadItem; prev?: ThreadItem } | { kind: 'run'; start: number; items: ThreadItem[] }> = [];
    let run: ThreadItem[] = [];
    let runStart = 0;
    const flush = () => { if (run.length) out.push({ kind: 'run', start: runStart, items: run }); run = []; };
    items.forEach((it, i) => {
      if (isInternal(it)) { if (!run.length) runStart = i; run.push(it); return; }
      flush();
      out.push({ kind: 'item', it, prev: items[i - 1] });
    });
    flush();
    return out;
  }, [items]);
  const internalCount = items.filter(isInternal).length;

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setNote(null);
    const full = agent.isGod ? body : `${body}\n\n${t('commandCenter.dispatchSuggestion', { name: agent.name, id: agent.id })}`;
    const res = await window.cth.hiveSend({ to: 'god', act: 'request', subject: t('commandCenter.taskFromHuman'), body: full }, 'human');
    setSending(false);
    if (res.ok) { setDraft(''); pinned.current = true; } else setNote(t('pro.inbox.notSent'));
  };

  let lastDay = '';
  return (
    <section className="pro-card" style={{ flex: '999 1 360px', minWidth: 0, minHeight: 360, height: THREAD_HEIGHT, display: 'flex', flexDirection: 'column', padding: 0 }}>
      <div className="pro-row" style={{ gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--pro-line)' }}>
        <Avatar agent={agent} />
        <strong>{agent.name}</strong>
        {(agent.description || agent.goal) && <span className="pro-sub" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{agent.description || agent.goal}</span>}
        {internalCount > 0 && (
          <label className="pro-sub" style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexShrink: 0, cursor: 'pointer' }}>
            <input type="checkbox" checked={showInternal} onChange={toggleInternal} />
            {t('pro.inbox.showInternal', { count: internalCount })}
          </label>
        )}
      </div>
      <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 && <p className="pro-sub" style={{ margin: 0 }}>{t('pro.inbox.threadEmpty', { name: agent.name })}</p>}
        {blocks.map((b, bi) => {
          const first = b.kind === 'item' ? b.it : b.items[0];
          const d = dayKey(first.ts);
          const sep = d && d !== lastDay ? <div key={`d${bi}`} className="pro-sub" style={{ alignSelf: 'center', fontSize: 11, padding: '4px 0' }}>{dayLabel(first.ts, t)}</div> : null;
          if (b.kind === 'item') {
            if (d) lastDay = d;
            return [sep, <Item key={`i${bi}`} it={b.it} prev={b.prev} tasks={tasks} name={name} />];
          }
          const last = b.items[b.items.length - 1];
          const lastDayOfRun = dayKey(last.ts);
          if (lastDayOfRun) lastDay = lastDayOfRun;
          if (showInternal || openRuns.has(b.start)) {
            return [sep,
              !showInternal && (
                <button key={`c${bi}`} className="pro-sub" onClick={() => setOpenRuns((s) => { const n = new Set(s); n.delete(b.start); return n; })}
                  style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 11, padding: 0 }}>▾ {t('pro.inbox.hideRun')}</button>
              ),
              ...b.items.map((it, k) => <Item key={`r${bi}-${k}`} it={it} prev={k ? b.items[k - 1] : undefined} tasks={tasks} name={name} />)];
          }
          const people = [...new Set(b.items.flatMap((it) => (it.kind === 'message' ? [it.message.from, it.message.to] : [])).filter((x) => x !== 'broadcast'))];
          // In this agent's chat: who it talked with ("with Dwight, Oscar and
          // webhook"), not a chain that reads as Dwight talking to Oscar.
          const others = people.includes(agent.id) ? people.filter((p) => p !== agent.id) : null;
          const summary = others && others.length
            ? t('pro.inbox.runWith', { count: b.items.length, people: listNames(others.map(name), t) })
            : t('pro.inbox.runSummary', { count: b.items.length, people: people.map(name).join(' ↔ ') });
          const from = time(first.ts);
          const to = time(last.ts);
          return [sep, (
            <button key={`s${bi}`} onClick={() => setOpenRuns((s) => new Set(s).add(b.start))}
              style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'stretch', padding: '5px 10px', border: '1px dashed var(--pro-line)', borderRadius: 8, background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 12, color: 'var(--pro-muted)', textAlign: 'start', minWidth: 0 }}>
              <span>▸</span>
              <span style={{ flexShrink: 0 }}>{summary}</span>
              {last.kind === 'message' && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>· {last.message.subject}</span>}
              <span style={{ marginInlineStart: 'auto', flexShrink: 0, fontSize: 11 }}>{from === to ? from : `${from}–${to}`}</span>
            </button>
          )];
        })}
      </div>
      <div style={{ borderTop: '1px solid var(--pro-line)', padding: 10, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea className="pro-input" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder={agent.isGod ? t('pro.inbox.composePh', { name: agent.name }) : t('pro.inbox.composeViaGod', { name: agent.name, god: god?.name ?? 'god' })}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !isComposingKey(e)) { e.preventDefault(); void send(); } }}
          style={{ flex: 1, resize: 'vertical', minHeight: 40 }} />
        <button className="pro-btn pro-btn-primary" disabled={!draft.trim() || sending} onClick={() => void send()}>{sending ? t('pro.inbox.sending') : t('pro.inbox.send')}</button>
      </div>
      {note && <span className="pro-text" style={{ color: 'var(--cth-coral)', fontSize: 12, padding: '0 12px 8px' }}>{note}</span>}
    </section>
  );
}

/** Scroll a question into view and flash it, so an answer shows what it answered. */
function jumpTo(anchor: string): void {
  const el = document.getElementById(anchor);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.animate([{ outline: '2px solid var(--cth-peach)' }, { outline: '2px solid transparent' }], { duration: 1600 });
}

/** "Dwight", "Dwight and Oscar", "Dwight, Oscar and webhook". */
function listNames(names: string[], t: (k: string, o?: Record<string, unknown>) => string): string {
  if (names.length <= 1) return names.join('');
  return t('pro.inbox.listAnd', { list: names.slice(0, -1).join(', '), last: names[names.length - 1] });
}

const time = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };

/** A bubble: yours on the end side, everyone else's on the start side. */
function Bubble({ mine, who, when, tone, anchor, children }: { mine: boolean; who: string; when: string; tone?: 'ask' | 'muted'; anchor?: string; children: React.ReactNode }) {
  return (
    <div id={anchor} style={{ scrollMarginTop: 12, alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: 'min(640px, 92%)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="pro-sub" style={{ fontSize: 11, alignSelf: mine ? 'flex-end' : 'flex-start' }}>{who} · {when}</span>
      <div style={{
        padding: '8px 11px', borderRadius: 10, fontSize: 13, overflowWrap: 'anywhere',
        border: '1px solid var(--pro-line)',
        background: tone === 'ask' ? 'var(--cth-peach-light)' : mine ? 'var(--cth-lemon-light)' : 'var(--cth-paper-100)',
        opacity: tone === 'muted' ? 0.6 : 1
      }}>{children}</div>
    </div>
  );
}

/** A message between agents: neither to nor from the human. */
function isInternal(it: ThreadItem): boolean {
  return it.kind === 'message' && it.message.from !== 'human' && it.message.to !== 'human';
}

function Item({ it, prev, tasks, name }: { it: ThreadItem; prev?: ThreadItem; tasks: KeyedTask[]; name: Name }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (it.kind === 'message') {
    const m = it.message;
    const long = m.body.length > 600;
    return (
      <Bubble mine={m.from === 'human'} who={`${name(m.from)} → ${name(m.to)}`} when={time(it.ts)} anchor={`msg-${m.id}`}>
        {/* Only when what it answers is not right above it; click to go there. */}
        {it.replyTo && !(prev?.kind === 'message' && prev.message.id === it.replyTo.id) && (
          <button onClick={() => jumpTo(`msg-${it.replyTo!.id}`)} className="pro-sub"
            style={{ display: 'block', border: 'none', background: 'transparent', padding: 0, marginBottom: 4, font: 'inherit', fontSize: 11, cursor: 'pointer', textAlign: 'start' }}>
            ↪ {t('pro.inbox.replyTo', { subject: it.replyTo.subject })}
          </button>
        )}
        {m.subject && <strong style={{ display: 'block', marginBottom: m.body ? 4 : 0 }}>{m.subject}</strong>}
        {m.body && (
          <div style={long && !expanded ? { maxHeight: 180, overflow: 'hidden' } : undefined}>
            <MarkdownPreview source={m.body} variant="card" />
          </div>
        )}
        {long && <button className="pro-btn" style={{ marginTop: 6, padding: '1px 8px', fontSize: 11 }} onClick={() => setExpanded((v) => !v)}>{expanded ? t('pro.inbox.showLess') : t('pro.inbox.showMore')}</button>}
        {m.requires_reply && <div className="pro-sub" style={{ fontSize: 11, marginTop: 4 }}>{t('pro.inbox.needsReply')}</div>}
      </Bubble>
    );
  }
  if (it.kind === 'question') {
    const task = tasks.find((x) => x.id === it.taskId);
    const open = task ? openQuestion(task) : undefined;
    const waiting = !!open && open.q === it.q;
    return (
      <Bubble mine={false} who={`${name(it.askedBy)} · ${t('pro.inbox.questionForYou')}`} when={time(it.ts)} tone={waiting ? 'ask' : undefined} anchor={questionAnchor(it.taskId, it.q)}>
        <div className="pro-sub" style={{ fontSize: 11, marginBottom: 4 }}>{it.taskLabel}</div>
        <MarkdownPreview source={it.q} variant="card" />
        {waiting && task && open && <AnswerBox task={task} open={open} />}
      </Bubble>
    );
  }
  if (it.kind === 'answer') {
    return (
      <Bubble mine who={`${t('pro.inbox.you')} · ${t('pro.inbox.yourAnswer')}`} when={time(it.ts)}>
        {/* What this answers: the question, quoted; click to jump to it. */}
        <button onClick={() => jumpTo(questionAnchor(it.taskId, it.q))} title={t('pro.inbox.jumpToQuestion')}
          style={{ display: 'block', width: '100%', textAlign: 'start', border: 'none', borderInlineStart: '3px solid var(--cth-peach)', background: 'var(--cth-cream-100)', borderRadius: 4, padding: '4px 8px', marginBottom: 6, font: 'inherit', fontSize: 12, color: 'var(--cth-ink-700)', cursor: 'pointer' }}>
          <span className="pro-sub" style={{ display: 'block', fontSize: 10.5 }}>↪ {it.taskLabel}</span>
          <span style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-wrap' }}>{it.q}</span>
        </button>
        <span style={{ whiteSpace: 'pre-wrap' }}>{it.a}</span>
      </Bubble>
    );
  }
  return (
    <Bubble mine who={t('pro.inbox.you')} when={time(it.ts)} tone="muted">
      {t('pro.inbox.dismissedQ')}
    </Bubble>
  );
}

function AnswerBox({ task, open }: { task: KeyedTask; open: NonNullable<ReturnType<typeof openQuestion>> }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submit = async () => {
    const a = text.trim();
    if (!a || busy) return;
    setBusy(true);
    setFailed(false);
    try { if (!(await answerOpenQuestion(task, open, a))) setFailed(true); else setText(''); }
    catch { setFailed(true); }
    setBusy(false);
  };
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'flex-end' }}>
      <textarea className="pro-input" rows={2} value={text} placeholder={t('pro.inbox.answerPh')} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !isComposingKey(e)) { e.preventDefault(); void submit(); } }}
        style={{ flex: 1, resize: 'vertical', minHeight: 36 }} />
      <button className="pro-btn pro-btn-primary" disabled={!text.trim() || busy} onClick={() => void submit()}>{busy ? t('pro.inbox.sending') : t('pro.inbox.answer')}</button>
      {failed && <span className="pro-text" style={{ color: 'var(--cth-coral)', fontSize: 12 }}>{t('pro.inbox.answerFailed')}</span>}
    </div>
  );
}
