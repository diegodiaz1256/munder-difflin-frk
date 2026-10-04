/**
 * Pro's sidebar icons: thin strokes on a 16 box in `currentColor`, so they follow
 * the theme like text does. The pixel set (components/Icon.tsx) stays the Classic
 * identity; next to Pro's hairline cards and system type it read as noise.
 */
export type ProIconName =
  | 'tasks' | 'inbox' | 'automations' | 'memory' | 'capabilities' | 'connections' | 'agents' | 'temps';

const PATHS: Record<ProIconName, string> = {
  // a checklist: three rows, the first two ticked
  tasks: 'M2.5 4.2l1 1 1.8-2 M7.5 4.5H13.5 M2.5 8.2l1 1 1.8-2 M7.5 8.5H13.5 M3 12.5h1.5 M7.5 12.5H13.5',
  // a tray with the dip in the middle
  inbox: 'M2.5 9.5h3l1 1.8h3l1-1.8h3 M2.5 9.5l1.6-5.5h7.8l1.6 5.5v3.5h-11z',
  // a bolt
  automations: 'M9 1.8L3.8 9h3.9L7 14.2 12.2 7H8.3z',
  // a spark of four points and a small one
  memory: 'M7 2.5c.4 2.6 1.4 3.6 4 4-2.6.4-3.6 1.4-4 4-.4-2.6-1.4-3.6-4-4 2.6-.4 3.6-1.4 4-4z M12.2 10.5c.2 1 .6 1.4 1.6 1.6-1 .2-1.4.6-1.6 1.6-.2-1-.6-1.4-1.6-1.6 1-.2 1.4-.6 1.6-1.6z',
  // a puzzle piece
  capabilities: 'M3 5.5h2.2a1.3 1.3 0 1 1 2.6 0H10v2.3a1.3 1.3 0 1 1 0 2.6V13H3z M10 5.5h3v3',
  // two links of a chain
  connections: 'M6.8 9.2l2.4-2.4 M7.6 4.6l1.3-1.3a2.4 2.4 0 0 1 3.4 3.4L11 8 M8.4 11.4l-1.3 1.3a2.4 2.4 0 0 1-3.4-3.4L5 8',
  // two people
  agents: 'M6 7.3a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z M2 13c.3-2.4 1.9-3.8 4-3.8s3.7 1.4 4 3.8 M10.6 3.2a2 2 0 0 1 0 3.9 M12 9.4c1.2.4 1.9 1.6 2 3.6',
  // a clock
  temps: 'M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M8 4.8V8l2.2 1.4'
};

export function ProIcon({ name }: { name: ProIconName }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      <path d={PATHS[name]} />
    </svg>
  );
}
