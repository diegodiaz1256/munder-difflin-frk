import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { canOpenExternally, deliverablePaths, parseDelimited, previewKind, splitPath, extOf } from '@shared/deliverables';
import { useStore, type Agent } from '@/store/store';
import type { KeyedTask } from './data';
import { useProStore } from './proStore';

/**
 * Deliverables — what the agents made for you, in one place: files linked from
 * task cards, the office's research/ folder, and what each agent wrote this
 * session. Pick one to read it here (Markdown rendered, tables as tables,
 * images shown); anything else opens in your file browser.
 */

type Listing = Awaited<ReturnType<typeof window.cth.deliverablesList>>;
interface Item { abs: string; title: string; sub: string; ts?: number }
interface Group { key: string; label: string; items: Item[] }

const fmtSize = (n: number): string => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const fmtWhen = (ts: number): string => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const pathKey = (p: string): string => p.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();

export function DeliverablesView({ tasks, roster }: { tasks: KeyedTask[]; roster: Agent[] }) {
  const { t } = useTranslation();
  const [data, setData] = useState<Listing | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  // Arriving from a task's "Open": show that task's deliverables only.
  const focusTask = useProStore((s) => s.focusTask);
  const setFocusTask = useProStore((s) => s.setFocusTask);

  useEffect(() => {
    let alive = true;
    const load = () => { void window.cth.deliverablesList().then((d) => { if (alive) setData(d); }).catch(() => {}); };
    load();
    // Not faster: on a WSL floor every listing crosses \\wsl.localhost.
    const id = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  /** One group per task that has deliverables (from its card's field or linked
   *  automatically when its agent wrote into research/), then research/ files
   *  with no task, then what agents wrote elsewhere this session. */
  const groups = useMemo<Group[]>(() => {
    if (!data?.root) return [];
    // The orchestrator is not in every roster list: fall back to the whole floor.
    const who = (id?: string) => (roster.find((a) => a.id === id) ?? useStore.getState().agents.find((a) => a.id === id))?.name ?? id ?? '';
    const office = new Map(data.files.map((f) => [pathKey(f.abs), f]));
    const placed = new Set<string>();
    const describe = (abs: string): Item => {
      const f = office.get(pathKey(abs));
      return f
        ? { abs: f.abs, title: f.rel, sub: `${fmtWhen(f.mtime)} · ${fmtSize(f.size)}`, ts: f.mtime }
        : { abs, title: splitPath(abs).name, sub: abs };
    };
    const out: Group[] = [];
    for (const task of tasks) {
      const paths = [...deliverablePaths(task.deliverable, data.root!, data.distro), ...data.links.filter((l) => l.taskId === task.id).map((l) => l.path)];
      const items: Item[] = [];
      for (const abs of paths) {
        const k = pathKey(abs);
        if (items.some((i) => pathKey(i.abs) === k)) continue;
        items.push(describe(abs));
        placed.add(k);
      }
      if (items.length) out.push({ key: `task:${task.id}`, label: [task.key, task.title, task.assignee && who(task.assignee)].filter(Boolean).join(' · '), items });
    }
    const unlinked = data.files.filter((f) => !placed.has(pathKey(f.abs))).map((f) => describe(f.abs));
    if (unlinked.length) out.push({ key: 'office', label: t('pro.dlv.group_office'), items: unlinked });
    const elsewhere = data.written.filter((w) => !office.has(pathKey(w.path)) && !placed.has(pathKey(w.path))).map((w) => ({
      abs: w.path, title: splitPath(w.path).name, ts: w.ts,
      sub: `${w.name} · ${t(w.created ? 'pro.dlv.created' : 'pro.dlv.edited')} ${fmtWhen(w.ts)} · ${w.path}`
    }));
    if (elsewhere.length) out.push({ key: 'agents', label: t('pro.dlv.group_agents'), items: elsewhere });
    return out;
  }, [data, tasks, roster, t]);

  const q = query.trim().toLowerCase();
  const shown = groups
    .filter((g) => !focusTask || g.key === `task:${focusTask}`)
    .map((g) => ({ ...g, items: q ? g.items.filter((i) => `${g.label} ${i.title} ${i.sub} ${i.abs}`.toLowerCase().includes(q)) : g.items }))
    .filter((g) => g.items.length);
  const all = shown.flatMap((g) => g.items);
  const current = selected && all.some((i) => i.abs === selected) ? selected : all[0]?.abs ?? null;
  const focused = focusTask ? tasks.find((x) => x.id === focusTask) : undefined;

  return (
    <div className="pro-page">
      <div className="pro-head">
        <h2>{t('pro.nav.deliverables')}</h2>
        <span className="pro-sub">{t('pro.dlv.sub')}</span>
        {data?.dir && (
          <div className="pro-head-end">
            <button className="pro-btn" onClick={() => void window.cth.revealPath(data.dir!)}>{t('pro.dlv.openFolder')}</button>
          </div>
        )}
      </div>

      {!data?.root ? <p className="pro-sub">{t('pro.dlv.noOffice')}</p> : (
        <div style={{ flex: 1, minHeight: 480, display: 'flex', gap: 12 }}>
          <aside style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
            <input className="pro-input" placeholder={t('pro.dlv.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
            {focusTask && (
              <div className="pro-row" style={{ gap: 6 }}>
                <span className="pro-chip pro-chip-on" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 250 }}>{focused ? [focused.key, focused.title].filter(Boolean).join(' · ') : focusTask}</span>
                <button className="pro-btn" style={{ padding: '2px 8px' }} onClick={() => setFocusTask(null)}>{t('pro.dlv.showAll')}</button>
              </div>
            )}
            <div className="pro-card" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 0 }}>
              {all.length === 0 && <p className="pro-sub" style={{ margin: 0, padding: 14, fontSize: 12.5 }}>{t(focusTask ? 'pro.dlv.noneForTask' : 'pro.dlv.empty', { dir: data.dir })}</p>}
              {shown.map((g) => (
                <section key={g.key}>
                  <div className={g.key.startsWith('task:') ? undefined : 'pro-sub'}
                    style={g.key.startsWith('task:')
                      ? { fontSize: 12, fontWeight: 600, padding: '10px 14px 4px', background: 'var(--cth-cream-100)', borderBottom: '1px solid var(--pro-line)' }
                      : { fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', padding: '10px 14px 4px' }}>{g.label}</div>
                  {g.items.map((i) => (
                    <button key={`${g.key}:${i.abs}`} onClick={() => setSelected(i.abs)} aria-current={current === i.abs}
                      style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', textAlign: 'start', padding: '8px 14px', border: 'none', borderBottom: '1px solid var(--pro-line)', cursor: 'pointer',
                        background: current === i.abs ? 'var(--cth-lemon-light)' : 'transparent', font: 'inherit', color: 'inherit' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{i.title}</span>
                      <span className="pro-sub" style={{ fontSize: 11, overflowWrap: 'anywhere' }}>{i.sub}</span>
                    </button>
                  ))}
                </section>
              ))}
            </div>
          </aside>
          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
            {current ? <Preview key={current} abs={current} /> : <div className="pro-card" style={{ flex: 1 }}><p className="pro-sub" style={{ margin: 0 }}>{t('pro.dlv.pick')}</p></div>}
          </div>
        </div>
      )}
    </div>
  );
}

type Loaded =
  | { state: 'loading' }
  | { state: 'text'; text: string }
  | { state: 'image'; url: string }
  | { state: 'none'; reason: string };

function Preview({ abs }: { abs: string }) {
  const { t } = useTranslation();
  const { dir, name } = splitPath(abs);
  const kind = previewKind(name);
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [copied, setCopied] = useState(false);
  // Markdown and tables: as rendered, or the file as it is.
  const [source, setSource] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const external = canOpenExternally(name);

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    if (kind === 'image') {
      void window.cth.readBinary(dir, name).then((r) => {
        if (!alive) return;
        if (!r.ok) { setLoaded({ state: 'none', reason: r.error }); return; }
        url = URL.createObjectURL(new Blob([r.bytes], { type: extOf(name) === 'svg' ? 'image/svg+xml' : r.mime }));
        setLoaded({ state: 'image', url });
      });
    } else if (kind === 'pdf' || kind === 'binary') {
      setLoaded({ state: 'none', reason: t('pro.dlv.cannotPreview') });
    } else {
      void window.cth.readFile(dir, name).then((r) => {
        if (!alive) return;
        setLoaded(r.ok ? { state: 'text', text: r.content } : { state: 'none', reason: r.error });
      });
    }
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [abs, dir, name, kind, t]);

  return (
    <section className="pro-card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: 0, minHeight: 0 }}>
      <div className="pro-row" style={{ padding: '10px 14px', borderBottom: '1px solid var(--pro-line)', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{name}</strong>
        <span className="pro-sub pro-mono" style={{ fontSize: 11, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={abs}>{abs}</span>
        <button className="pro-btn" onClick={() => { void navigator.clipboard.writeText(abs).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }); }}>{copied ? t('pro.conn.copied') : t('pro.dlv.copyPath')}</button>
        {(kind === 'markdown' || kind === 'csv' || kind === 'json') && loaded.state === 'text' && (
          <div className="pro-switch" role="group" aria-label={t('pro.dlv.view')}>
            <button aria-pressed={!source} onClick={() => setSource(false)}>{t('pro.dlv.rendered')}</button>
            <button aria-pressed={source} onClick={() => setSource(true)}>{t('pro.dlv.source')}</button>
          </div>
        )}
        <button className="pro-btn" onClick={() => void window.cth.revealPath(abs)}>{t('pro.dlv.showInFolder')}</button>
        <button className="pro-btn pro-btn-primary" disabled={!external}
          title={external ? t('pro.dlv.openOutsideTip') : t('pro.dlv.openOutsideNo')}
          onClick={() => { setOpenError(null); void window.cth.deliverablesOpenExternal(abs).then((r) => { if (!r.ok) setOpenError(r.error ?? t('pro.dlv.openFailed')); }); }}>
          {t('pro.dlv.openOutside')}
        </button>
        {openError && <span className="pro-text" style={{ color: 'var(--cth-coral)', fontSize: 12, flexBasis: '100%' }}>{openError}</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 18px 18px' }}>
        {loaded.state === 'loading' && <p className="pro-sub">{t('pro.dlv.loading')}</p>}
        {loaded.state === 'none' && <p className="pro-sub">{loaded.reason}</p>}
        {loaded.state === 'image' && <img src={loaded.url} alt={name} style={{ maxWidth: '100%', imageRendering: 'auto' }} />}
        {loaded.state === 'text' && <TextPreview kind={source ? 'text' : kind} text={loaded.text} dir={dir} name={name} />}
      </div>
    </section>
  );
}

function TextPreview({ kind, text, dir, name }: { kind: ReturnType<typeof previewKind>; text: string; dir: string; name: string }) {
  const { t } = useTranslation();
  if (kind === 'markdown') return <MarkdownPreview source={text} root={dir} baseRel={name} />;
  if (kind === 'csv') {
    const rows = parseDelimited(text, extOf(name) === 'tsv' ? '\t' : ',');
    if (!rows.length) return <p className="pro-sub">{t('pro.dlv.emptyFile')}</p>;
    const [head, ...body] = rows;
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12.5, marginTop: 10 }}>
          <thead><tr>{head.map((h, i) => <th key={i} style={{ textAlign: 'start', padding: '6px 10px', borderBottom: '2px solid var(--pro-line)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
          <tbody>{body.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ padding: '5px 10px', borderBottom: '1px solid var(--pro-line)', verticalAlign: 'top' }}>{c}</td>)}</tr>)}</tbody>
        </table>
        {rows.length >= 200 && <p className="pro-sub" style={{ fontSize: 11 }}>{t('pro.dlv.firstRows')}</p>}
      </div>
    );
  }
  let body = text;
  if (kind === 'json') { try { body = JSON.stringify(JSON.parse(text), null, 2); } catch { /* show as is */ } }
  return (
    <>
      {kind === 'html' && <p className="pro-sub" style={{ fontSize: 11 }}>{t('pro.dlv.htmlSource')}</p>}
      <pre className="pro-mono" style={{ fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '10px 0 0' }}>{body}</pre>
    </>
  );
}
