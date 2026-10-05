import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { moveItem, slugify, type PersonalList } from '@shared/lists';

/**
 * Lists the human keeps with the office's help (shared/lists.ts): one card
 * per list, one column per state ("Have", "Want"…). Edit them here; agents
 * update them when told ("I bought the Death Guard box").
 */
export function ListsView() {
  const { t } = useTranslation();
  const [lists, setLists] = useState<PersonalList[]>([]);
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => { void window.cth.listsAll().then(setLists).catch(() => {}); }, []);
  useEffect(() => { load(); const id = setInterval(load, 15_000); return () => clearInterval(id); }, [load]);
  const save = async (l: PersonalList) => {
    setLists((ls) => ls.map((x) => (x.slug === l.slug ? l : x)));
    await window.cth.listsSave(l);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="pro-sub" style={{ margin: 0 }}>
        {t('pro.lists.intro')}
      </p>
      {lists.map((l) => <ListCard key={l.slug} list={l} onChange={(x) => void save(x)} onRemove={async () => {
        if (!(await window.cth.confirm(t('pro.lists.deleteConfirm', { title: l.title }), { ok: t('pro.lists.delete') }))) return;
        await window.cth.listsRemove(l.slug); load();
      }} />)}
      {creating
        ? <NewList existing={lists.map((l) => l.slug)} onDone={(l) => { setCreating(false); if (l) void window.cth.listsSave(l).then(load); }} />
        : <button className="pro-card" onClick={() => setCreating(true)} style={{ borderStyle: 'dashed', cursor: 'pointer', textAlign: 'center', flexShrink: 0 }}><span className="pro-sub">+ {t('pro.lists.new')}</span></button>}
    </div>
  );
}

function ListCard({ list, onChange, onRemove }: { list: PersonalList; onChange: (l: PersonalList) => void; onRemove: () => void }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState<Record<string, string>>({});
  const names = list.sections.map((s) => s.name);
  const update = (fn: (l: PersonalList) => PersonalList) => onChange(fn(structuredClone(list)));
  return (
    <section className="pro-card" style={{ padding: 0, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div className="pro-row" style={{ padding: '10px 12px', borderBottom: '1px solid var(--pro-line)' }}>
        <strong style={{ fontSize: 14 }}>{list.title}</strong>
        <span className="pro-sub" style={{ fontSize: 11 }}>{t('pro.lists.items', { count: list.sections.reduce((n, s) => n + s.items.length, 0) })}</span>
        <button className="pro-btn" style={{ marginInlineStart: 'auto', fontSize: 11 }} onClick={onRemove}>{t('pro.lists.deleteList')}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, list.sections.length)}, minmax(200px, 1fr))`, overflowX: 'auto' }}>
        {list.sections.map((s, si) => (
          <div key={s.name} style={{ borderInlineStart: si ? '1px solid var(--pro-line)' : undefined, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="pro-sub" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.name} · {s.items.length}</div>
            {s.items.map((it, ii) => (
              <div key={`${it.text}-${ii}`} className="pro-row" style={{ gap: 6, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={it.done} aria-label={t('pro.lists.doneAria', { text: it.text })}
                  onChange={() => update((l) => { l.sections[si].items[ii].done = !it.done; return l; })} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.4, textDecoration: it.done ? 'line-through' : undefined, color: it.done ? 'var(--cth-ink-500)' : undefined }}>
                  {it.text}{it.note && <span className="pro-sub" style={{ fontSize: 11 }}> — {it.note}</span>}
                </span>
                {names.length > 1 && (
                  <select className="pro-input" aria-label={t('pro.lists.moveTo')} value="" style={{ width: 28, padding: 0, fontSize: 11 }}
                    onChange={(e) => { const to = e.target.value; if (to) onChange(moveItem(list, it.text, to)); }}>
                    <option value="">⇄</option>
                    {names.filter((n) => n !== s.name).map((n) => <option key={n} value={n}>→ {n}</option>)}
                  </select>
                )}
                <button className="pro-btn" aria-label={t('pro.lists.removeAria', { text: it.text })} style={{ padding: '0 6px', fontSize: 11 }}
                  onClick={() => update((l) => { l.sections[si].items.splice(ii, 1); return l; })}>×</button>
              </div>
            ))}
            <input className="pro-input" placeholder={t('pro.lists.addTo', { name: s.name })} value={adding[s.name] ?? ''} style={{ fontSize: 12, marginTop: 4 }}
              onChange={(e) => setAdding((a) => ({ ...a, [s.name]: e.target.value }))}
              onKeyDown={(e) => {
                const v = (adding[s.name] ?? '').trim();
                if (e.key !== 'Enter' || e.nativeEvent.isComposing || !v) return;
                const [text, ...note] = v.split(/\s+[—–-]\s+/);
                update((l) => { l.sections[si].items.push({ text, done: false, ...(note.length ? { note: note.join(' — ') } : {}) }); return l; });
                setAdding((a) => ({ ...a, [s.name]: '' }));
              }} />
          </div>
        ))}
      </div>
    </section>
  );
}

function NewList({ existing, onDone }: { existing: string[]; onDone: (l: PersonalList | null) => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState(() => t('pro.lists.defaultSections'));
  const slug = slugify(title);
  const taken = existing.includes(slug);
  return (
    <section className="pro-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
      <input className="pro-input" placeholder={t('pro.lists.namePlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input className="pro-input" placeholder={t('pro.lists.sectionsPlaceholder')} value={sections} onChange={(e) => setSections(e.target.value)} />
      <span className="pro-sub" style={{ fontSize: 11 }}>{t('pro.lists.sectionsHint')}</span>
      {taken && <span className="pro-sub" style={{ fontSize: 11, color: 'var(--cth-coral)' }}>{t('pro.lists.taken')}</span>}
      <div className="pro-row" style={{ gap: 8 }}>
        <button className="pro-btn pro-btn-primary" disabled={!title.trim() || taken} onClick={() => onDone({
          slug, title: title.trim(),
          sections: sections.split(',').map((x) => x.trim()).filter(Boolean).map((name) => ({ name, items: [] }))
        })}>{t('pro.lists.create')}</button>
        <button className="pro-btn" onClick={() => onDone(null)}>{t('common.cancel')}</button>
      </div>
    </section>
  );
}
