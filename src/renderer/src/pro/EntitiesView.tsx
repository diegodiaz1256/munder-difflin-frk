import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entity } from '@shared/memoryEntities';
import { scoreOf } from '@shared/memoryEntities';
import type { MemoryNote } from '@shared/memoryGraph';

/**
 * The entities in the office's deliverables (shared/memoryEntities.ts): a
 * list grouped as the tables group them, and one profile at a time with
 * every attribute (scores as bars), where each came from, and the notes that
 * mention it.
 */
export function EntitiesView({ entities, notesFor, focus }: {
  entities: Entity[];
  /** An entity to open (a search that named it). */
  focus?: string | null;
  notesFor: (key: string) => Array<MemoryNote & { source: string }>;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string | null>(focus ?? entities[0]?.key ?? null);
  useEffect(() => { if (focus) { setPicked(focus); setQ(''); const k = entities.find((e) => e.key === focus)?.kind; if (k) setKind(k); } }, [focus, entities]);
  const kinds = useMemo(() => [...new Set(entities.map((e) => e.kind))], [entities]);
  const [kind, setKind] = useState<string>(kinds[0] ?? '');
  const shown = entities.filter((e) => (!kind || e.kind === kind) && (!q.trim() || e.name.toLowerCase().includes(q.trim().toLowerCase())));
  const groups = new Map<string, Entity[]>();
  for (const e of shown) groups.set(e.group ?? '', [...(groups.get(e.group ?? '') ?? []), e]);
  const sel = entities.find((e) => e.key === picked) ?? shown[0];

  return (
    <div style={{ flex: 1, minHeight: 460, display: 'flex', gap: 12 }}>
      <aside className="pro-card" style={{ width: 280, flexShrink: 0, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '1px solid var(--pro-line)' }}>
          {kinds.length > 1 && (
            <div className="pro-row" style={{ gap: 4, flexWrap: 'wrap' }}>
              {kinds.map((k) => <button key={k} className={`pro-chip${k === kind ? ' pro-chip-on' : ''}`} onClick={() => setKind(k)}>{k}</button>)}
            </div>
          )}
          <input className="pro-input" placeholder={t('pro.entities.filter', { kind: kind.toLowerCase() || t('pro.entities.entities') })} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {[...groups.entries()].map(([g, list]) => (
            <div key={g || '-'}>
              {g && <div className="pro-sub" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', padding: '10px 12px 4px' }}>{g}</div>}
              {list.map((e) => (
                <button key={e.key} onClick={() => setPicked(e.key)}
                  style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', padding: '6px 12px', fontSize: 13,
                    background: sel?.key === e.key ? 'var(--cth-lemon-light)' : undefined }}>
                  {e.name}
                </button>
              ))}
            </div>
          ))}
          {shown.length === 0 && <p className="pro-sub" style={{ padding: 12 }}>{t('pro.entities.nothing')}</p>}
        </div>
      </aside>
      {sel ? <Profile e={sel} notes={notesFor(sel.key)} /> : null}
    </div>
  );
}

function Profile({ e, notes }: { e: Entity; notes: Array<MemoryNote & { source: string }> }) {
  const { t } = useTranslation();
  const scores = e.attrs.filter((a) => scoreOf(a.value) !== null);
  const text = e.attrs.filter((a) => scoreOf(a.value) === null);
  return (
    <section className="pro-card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
      <div>
        <div className="pro-sub" style={{ fontSize: 11 }}>{e.kind}{e.group ? ` · ${e.group}` : ''}</div>
        <h3 style={{ margin: '2px 0 0', fontSize: 20 }}>{e.name}</h3>
        {e.aliases.length > 0 && <div className="pro-sub" style={{ fontSize: 12 }}>{t('pro.entities.also', { names: e.aliases.join(', ') })}</div>}
      </div>
      {scores.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, auto) 1fr auto', gap: '6px 12px', alignItems: 'center', maxWidth: 560 }}>
          {scores.map((a) => {
            const v = scoreOf(a.value) ?? 0;
            return [
              <span key={`${a.label}-l`} style={{ fontSize: 13 }}>{a.label}</span>,
              <span key={`${a.label}-b`} style={{ height: 8, background: 'var(--cth-cream-200)', position: 'relative' }}>
                <span style={{ position: 'absolute', inset: 0, width: `${(v / 5) * 100}%`, background: 'var(--cth-lemon)' }} />
              </span>,
              <span key={`${a.label}-v`} className="pro-mono" style={{ fontSize: 12 }}>{a.value}</span>
            ];
          })}
        </div>
      )}
      {text.map((a, i) => (
        <div key={i}>
          <div className="pro-sub" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>{a.label}</div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{a.value}</div>
          <div className="pro-sub" style={{ fontSize: 11 }}>{a.source}</div>
        </div>
      ))}
      {notes.length > 0 && (
        <div>
          <div className="pro-sub" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{t('pro.entities.mentionedIn')}</div>
          <ul style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {notes.slice(0, 8).map((n, i) => <li key={i} style={{ fontSize: 13, lineHeight: 1.45 }}>{n.text} <span className="pro-sub" style={{ fontSize: 11 }}>— {n.source}</span></li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
