import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * A PDF deliverable, drawn by pdf.js into the app's own page: continuous pages
 * on the app's background, and the app's own toolbar (page, zoom, fit width).
 * pdf.js loads on the first PDF opened (a lazy chunk, like Mermaid). Pages are
 * drawn as they come near the view, at the screen's pixel density.
 */
const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3];

export function PdfPreview({ bytes, name }: { bytes: Uint8Array; name: string }) {
  const { t } = useTranslation();
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** null = fit the width of the pane. */
  const [zoom, setZoom] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
  const [base, setBase] = useState<{ w: number; h: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    let loaded: PDFDocumentProxy | null = null;
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        // A copy: pdf.js transfers the buffer to its worker.
        loaded = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
        const first = await loaded.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        if (!alive) { void loaded.destroy(); return; }
        setBase({ w: vp.width, h: vp.height });
        setDoc(loaded);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { alive = false; void loaded?.destroy(); };
  }, [bytes]);

  // The pane's width, for "fit width".
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [doc]);

  const scale = zoom ?? (base && width ? Math.max(0.3, (width - 48) / base.w) : 1);

  // Which page is in view, for the counter.
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const pages = [...el.querySelectorAll<HTMLElement>('[data-page]')];
    const mid = el.scrollTop + el.clientHeight / 3;
    const cur = pages.find((p) => p.offsetTop + p.offsetHeight > mid);
    if (cur) setPage(Number(cur.dataset.page));
  };
  const goTo = (n: number) => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-page="${n}"]`);
    el?.scrollIntoView({ block: 'start' });
  };
  const step = (dir: 1 | -1) => {
    const i = ZOOMS.findIndex((z) => z >= scale - 0.001);
    const next = dir > 0 ? ZOOMS.find((z) => z > scale + 0.001) : [...ZOOMS].reverse().find((z) => z < scale - 0.001);
    setZoom(next ?? ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i))]);
  };

  if (error) return <p className="pro-sub">{t('pro.dlv.pdfFailed', { error })}</p>;
  if (!doc || !base) return <p className="pro-sub">{t('pro.dlv.loading')}</p>;

  return (
    <div className="pro-pdf">
      <div className="pro-pdf-bar">
        <button className="pro-btn" disabled={page <= 1} onClick={() => goTo(page - 1)} aria-label={t('pro.dlv.pdfPrev')}>‹</button>
        <span className="pro-pdf-count">{t('pro.dlv.pdfPage', { page, count: doc.numPages })}</span>
        <button className="pro-btn" disabled={page >= doc.numPages} onClick={() => goTo(page + 1)} aria-label={t('pro.dlv.pdfNext')}>›</button>
        <span className="pro-pdf-gap" />
        <button className="pro-btn" onClick={() => step(-1)} aria-label={t('pro.dlv.pdfZoomOut')}>−</button>
        <span className="pro-pdf-count">{Math.round(scale * 100)}%</span>
        <button className="pro-btn" onClick={() => step(1)} aria-label={t('pro.dlv.pdfZoomIn')}>+</button>
        <button className="pro-btn" aria-pressed={zoom === null} onClick={() => setZoom(null)}>{t('pro.dlv.pdfFit')}</button>
      </div>
      <div ref={scroller} className="pro-pdf-pages" onScroll={onScroll} aria-label={name}>
        {Array.from({ length: doc.numPages }, (_, i) => (
          <PdfPage key={i + 1} doc={doc} n={i + 1} scale={scale} base={base} root={scroller} />
        ))}
      </div>
    </div>
  );
}

/** One page: sized at once (so scrolling is stable), drawn when near the view. */
function PdfPage({ doc, n, scale, base, root }: {
  doc: PDFDocumentProxy; n: number; scale: number; base: { w: number; h: number }; root: React.RefObject<HTMLDivElement>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(n <= 2);
  const [size, setSize] = useState({ w: base.w * scale, h: base.h * scale });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setNear(true); }, { root: root.current, rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    if (!near) { setSize({ w: base.w * scale, h: base.h * scale }); return; }
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    void (async () => {
      const p = await doc.getPage(n);
      if (cancelled || !canvas.current) return;
      const vp = p.getViewport({ scale });
      const dpr = window.devicePixelRatio || 1;
      const c = canvas.current;
      c.width = Math.floor(vp.width * dpr);
      c.height = Math.floor(vp.height * dpr);
      setSize({ w: vp.width, h: vp.height });
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const r = p.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      task = r;
      await r.promise.catch(() => { /* cancelled by a newer zoom */ });
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, n, scale, near, base]);

  return (
    <div ref={box} data-page={n} className="pro-pdf-page" style={{ width: size.w, height: size.h }}>
      <canvas ref={canvas} style={{ width: size.w, height: size.h, display: near ? 'block' : 'none' }} />
    </div>
  );
}
