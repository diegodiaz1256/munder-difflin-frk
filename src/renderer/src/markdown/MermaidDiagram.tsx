import { useEffect, useState } from 'react';
import { useAppTheme } from '@/design/theme';

/**
 * A Mermaid diagram (a .mmd deliverable, or a ```mermaid block in Markdown).
 * Mermaid is a few MB, so it loads the first time a diagram is shown, never
 * at start-up. `securityLevel: 'strict'` keeps a diagram's text from running
 * script or adding click handlers: agents write these files. A diagram that
 * does not parse shows its source and the error instead.
 */
let ready: Promise<typeof import('mermaid').default> | null = null;
let seq = 0;

export function MermaidDiagram({ source }: { source: string }) {
  const theme = useAppTheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setSvg(null); setError(null);
    ready ??= import('mermaid').then((m) => m.default);
    void ready
      .then((mermaid) => {
        // The app's theme, not the system's: set before each render (cheap).
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: theme === 'dark' ? 'dark' : 'default', fontFamily: 'inherit' });
        return mermaid.render(`md-mermaid-${++seq}`, source.trim());
      })
      .then((r) => { if (alive) setSvg(r.svg); })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [source, theme]);
  if (error) {
    return (
      <div>
        <p className="pro-sub" style={{ fontSize: 11.5, color: 'var(--cth-coral)' }}>Mermaid: {error.split('\n')[0]}</p>
        <pre className="pro-mono" style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{source}</pre>
      </div>
    );
  }
  if (!svg) return <p className="pro-sub" style={{ fontSize: 12 }}>…</p>;
  // Mermaid's own strict-mode output (sanitised by its DOMPurify pass).
  return <div className="cth-mermaid" style={{ overflowX: 'auto', margin: '10px 0' }} dangerouslySetInnerHTML={{ __html: svg }} />;
}
