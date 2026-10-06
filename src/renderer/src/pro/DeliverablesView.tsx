import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { deliverablePaths, parseDelimited, previewKind, splitPath, extOf } from '@shared/deliverables';
import type { Agent } from '@/store/store';
import type { KeyedTask } from './data';

/**
 * Deliverables — what the agents made for you, in one place: files linked from
 * task cards, the office's research/ folder, and what each agent wrote this
 * session. Pick one to read it here (Markdown rendered, tables as tables,
 * images shown); anything else opens in your file browser.
 */

type Listing = Awaited<ReturnType<typeof window.cth.deliverablesList>>;
interface Item { abs: string; title: string; sub: string; ts?: number; group: 'tasks' | 'office' | 'agents' }

const fmtSize = (n: number): string => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const fmtWhen = (ts: number): string => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function DeliverablesView({ tasks, roster }: { tasks: KeyedTask[]; roster: Agent[] }) {
  const { t } = useTranslation();
  const [data, setData] = useState<Listing | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => { void window.cth.deliverablesList().then((d) => { if (alive) setData(d); }).catch(() => {}); };
    load();
    // Not faster: on a WSL floor every listing crosses \\wsl.localhost.
    const id = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const items = useMemo<Item[]>(() => {
    if (!data?.root) return [];
    const who = (id?: string) => roster.find((a) => a.id === id)?.name ?? id ?? '';
    const fromTasks = tasks.flatMap((task) => deliverablePaths(task.deliverable, data.root!, data.distro).map((abs) => ({
      abs, group: 'tasks' as const, title: splitPath(abs).name,
      sub: [task.key, task.title, task.assignee && who(task.assignee)].filter(Boolean).join(' · ')
    })));
    const office = data.files.map((f) => ({ abs: f.abs, group: 'office' as const, title: f.rel, sub: `${fmtWhen(f.mtime)} · ${fmtSize(f.size)}`, ts: f.mtime }));
    const officeSet = new Set(office.map((o) => o.abs));
    const agents = data.written.filter((w) => !officeSet.has(w.path)).map((w) => ({
      abs: w.path, group: 'agents' as const, title: splitPath(w.path).name,
      sub: `${w.name} · ${t(w.created ? 'pro.dlv.created' : 'pro.dlv.edited')} ${fmtWhen(w.ts)} · ${w.path}`, ts: w.ts
    }));
    return [...fromTasks, ...office, ...agents];
  }, [data, tasks, roster, t]);

  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((i) => `${i.title} ${i.sub} ${i.abs}`.toLowerCase().includes(q)) : items;
  const current = selected ?? shown[0]?.abs ?? null;

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
            <div className="pro-card" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 0 }}>
              {items.length === 0 && <p className="pro-sub" style={{ margin: 0, padding: 14, fontSize: 12.5 }}>{t('pro.dlv.empty', { dir: data.dir })}</p>}
              {(['tasks', 'office', 'agents'] as const).map((g) => {
                const list = shown.filter((i) => i.group === g);
                if (!list.length) return null;
                return (
                  <section key={g}>
                    <div className="pro-sub" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', padding: '10px 14px 4px' }}>{t(`pro.dlv.group_${g}`)}</div>
                    {list.map((i) => (
                      <button key={`${g}:${i.abs}`} onClick={() => setSelected(i.abs)} aria-current={current === i.abs}
                        style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', textAlign: 'start', padding: '8px 14px', border: 'none', borderBottom: '1px solid var(--pro-line)', cursor: 'pointer',
                          background: current === i.abs ? 'var(--cth-lemon-light)' : 'transparent', font: 'inherit', color: 'inherit' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{i.title}</span>
                        <span className="pro-sub" style={{ fontSize: 11, overflowWrap: 'anywhere' }}>{i.sub}</span>
                      </button>
                    ))}
                  </section>
                );
              })}
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
        <button className="pro-btn" onClick={() => void window.cth.revealPath(abs)}>{t('pro.dlv.showInFolder')}</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 18px 18px' }}>
        {loaded.state === 'loading' && <p className="pro-sub">{t('pro.dlv.loading')}</p>}
        {loaded.state === 'none' && <p className="pro-sub">{loaded.reason}</p>}
        {loaded.state === 'image' && <img src={loaded.url} alt={name} style={{ maxWidth: '100%', imageRendering: 'auto' }} />}
        {loaded.state === 'text' && <TextPreview kind={kind} text={loaded.text} dir={dir} name={name} />}
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
