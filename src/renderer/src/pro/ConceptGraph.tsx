import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConceptGraph as Graph, MemoryDoc } from '@shared/memoryGraph';
import { forceLayout, type LayoutEdge, type LayoutNode } from '@/components/memoryGraph/forceLayout';

/**
 * The office's memory as a picture: concepts (circles, sized by how many notes
 * mention them), linked when they appear in the same note; agents (squares)
 * and documents (pages) attached to what they mention. Click a concept to read
 * the notes behind it.
 */
export function ConceptGraph({ graph, docs, selected, onSelect, trail }: {
  graph: Graph; docs: MemoryDoc[]; selected: string | null; onSelect: (conceptId: string | null) => void;
  /** A search's path: the concepts it went through and the agents/documents its
   *  results came from (`c:<id>`, `d:<docId>`). Lit up, everything else dimmed. */
  trail?: Set<string> | null;
}) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 420 });
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(320, el.clientWidth), h: Math.max(320, el.clientHeight) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sources = useMemo(() => docs.filter((d) => (graph.mentions[d.id] ?? []).length > 0), [docs, graph]);
  const layout = useMemo(() => {
    const nodes: LayoutNode[] = [
      ...graph.concepts.map((c) => ({ id: `c:${c.id}`, gravityBias: 1 + Math.min(2, c.count / 6) })),
      ...sources.map((d) => ({ id: `d:${d.id}`, gravityBias: 0.6 }))
    ];
    const edges: LayoutEdge[] = [
      ...graph.edges.map((e) => ({ source: `c:${e.a}`, target: `c:${e.b}`, strength: Math.min(2, 0.6 + e.weight / 3) })),
      ...sources.flatMap((d) => (graph.mentions[d.id] ?? []).map((c) => ({ source: `d:${d.id}`, target: `c:${c}`, strength: 0.25 })))
    ];
    const raw = forceLayout(nodes, edges, { width: size.w, height: size.h, iterations: 320, padding: 40, maxSpacing: 60 });
    // The layout settles into the middle of the box. Shrink it to fit the
    // panel if needed, the same on both axes, and keep it centred: a
    // small map stays a small cluster instead of being flung into the corners
    // (margins leave room for labels and the legend).
    const pts = [...raw.values()];
    const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
    const mx = 70, mt = 34, mb = 48;
    const fx = maxX > minX ? (size.w - 2 * mx) / (maxX - minX) : Infinity;
    const fy = maxY > minY ? (size.h - mt - mb) / (maxY - minY) : Infinity;
    const k = Math.min(1, fx, fy);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const ox = size.w / 2, oy = mt + (size.h - mt - mb) / 2;
    const pos = new Map([...raw].map(([id, p]) => [id, { x: ox + (p.x - cx) * k, y: oy + (p.y - cy) * k }]));
    return { pos, edges };
  }, [graph, sources, size.w, size.h]);

  const focus = hover ?? (selected ? `c:${selected}` : null);
  const focusNear = useMemo(() => {
    if (!focus) return null;
    const s = new Set([focus]);
    for (const e of layout.edges) {
      if (e.source === focus) s.add(e.target);
      if (e.target === focus) s.add(e.source);
    }
    return s;
  }, [focus, layout.edges]);
  // Hover or a picked concept wins; otherwise a search shows its path.
  const near = focusNear ?? (trail && trail.size ? trail : null);
  const dim = (id: string) => (near && !near.has(id) ? 0.25 : 1);
  // Label the top ~18 concepts by default.
  const labelMin = graph.concepts.length > 18 ? graph.concepts[17].count : 0;

  if (!graph.concepts.length) {
    return <div ref={box} style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
      <p className="pro-sub" style={{ maxWidth: 360, textAlign: 'center' }}>{t('pro.graph.empty')}</p>
    </div>;
  }

  return (
    <div ref={box} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg width={size.w} height={size.h} style={{ display: 'block' }} onClick={() => onSelect(null)}>
        {layout.edges.map((e, i) => {
          const a = layout.pos.get(e.source); const b = layout.pos.get(e.target);
          if (!a || !b) return null;
          const docEdge = e.source.startsWith('d:');
          const on = near ? near.has(e.source) && near.has(e.target) : false;
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={on ? 'var(--cth-ink-700)' : 'var(--cth-ink-300)'} strokeWidth={docEdge ? 0.8 : 1 + (e.strength ?? 1) * 0.6}
            strokeDasharray={docEdge ? '3 3' : undefined} opacity={near && !on ? 0.15 : docEdge ? 0.5 : 0.8} />;
        })}
        {sources.map((d) => {
          const p = layout.pos.get(`d:${d.id}`);
          if (!p) return null;
          const id = `d:${d.id}`;
          const agent = d.kind === 'agent';
          return (
            <g key={id} transform={`translate(${p.x},${p.y})`} opacity={dim(id)} onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}>
              <rect x={-7} y={-7} width={14} height={agent ? 14 : 16} rx={agent ? 3 : 1}
                fill={agent ? 'var(--cth-mint-light)' : 'var(--cth-sky-light)'} stroke={agent ? 'var(--cth-mint)' : 'var(--cth-sky)'} />
              <text y={22} textAnchor="middle" fontSize={10} fill="var(--cth-ink-500)">{d.label.length > 22 ? `${d.label.slice(0, 21)}…` : d.label}</text>
            </g>
          );
        })}
        {graph.concepts.map((c) => {
          const id = `c:${c.id}`;
          const p = layout.pos.get(id);
          if (!p) return null;
          const r = 5 + Math.sqrt(c.count) * 3.5;
          const sel = selected === c.id;
          // Names on the concepts that matter; the rest on hover or when related to the focus.
          const labelled = sel || c.count >= labelMin || (near ? near.has(id) : false);
          return (
            <g key={id} transform={`translate(${p.x},${p.y})`} opacity={dim(id)} style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}
              onClick={(e) => { e.stopPropagation(); onSelect(sel ? null : c.id); }}>
              <circle r={r} fill={sel ? 'var(--cth-lemon)' : 'var(--cth-lemon-light)'} stroke={sel ? 'var(--cth-ink-900)' : 'var(--cth-lemon)'} strokeWidth={sel ? 2 : 1.2} />
              {labelled && <text y={-r - 4} textAnchor="middle" fontSize={c.count > 3 ? 12 : 11} fontWeight={c.count > 3 ? 600 : 400}
                fill="var(--cth-ink-900)" style={{ paintOrder: 'stroke', stroke: 'var(--pro-bg, var(--cth-cream-100))', strokeWidth: 3 }}>{c.label}</text>}
            </g>
          );
        })}
      </svg>
      <div className="pro-sub" style={{ position: 'absolute', insetInlineStart: 10, bottom: 8, fontSize: 11, display: 'flex', gap: 12 }}>
        <span>● {t('pro.graph.concept')}</span><span>■ {t('pro.graph.agent')}</span><span>▯ {t('pro.graph.document')}</span>
      </div>
    </div>
  );
}
