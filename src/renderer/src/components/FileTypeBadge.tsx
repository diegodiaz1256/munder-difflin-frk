import { extOf, previewKind } from '@shared/deliverables';

/** Background per kind of file, from the design tokens. */
const TONE: Record<string, string> = {
  markdown: 'var(--cth-sky-light)',
  csv: 'var(--cth-mint-light)',
  json: 'var(--cth-lilac-light)',
  html: 'var(--cth-peach-light)',
  image: 'var(--cth-lemon-light)',
  pdf: 'var(--cth-coral-light)',
  text: 'var(--cth-cream-200)',
  binary: 'var(--cth-cream-200)'
};

/** A small tag with a file's extension (MD, PDF, CSV…), tinted by its kind,
 *  so a list of deliverables reads at a glance. */
export function FileTypeBadge({ name }: { name: string }) {
  const ext = extOf(name) || 'file';
  return (
    <span title={ext} style={{
      flexShrink: 0, display: 'inline-block', minWidth: 30, textAlign: 'center',
      padding: '1px 5px', borderRadius: 4, fontFamily: 'var(--cth-font-mono)', fontSize: 10, fontWeight: 600,
      letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--cth-ink-900)',
      background: TONE[previewKind(name)] ?? TONE.binary, boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
    }}>{ext.slice(0, 5)}</span>
  );
}
