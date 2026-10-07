import { useStore, type Agent } from '@/store/store';
import { Avatar } from './data';

/** Up to two initials of a name ("Dwight" → "DW", "Kevin Malone" → "KM"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

/** The office agent a commit author name refers to, if any. */
export function agentNamed(name: string, agents: Agent[]): Agent | undefined {
  const n = name.trim().toLowerCase();
  return agents.find((a) => a.name.trim().toLowerCase() === n);
}

/** One person as a circle: the agent's face when it is on the floor, else
 *  its initials. */
export function AuthorCircle({ name, size = 22 }: { name: string; size?: number }) {
  const agents = useStore((s) => s.agents);
  const agent = agentNamed(name, agents);
  return (
    <span title={name} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: agent ? 'var(--cth-cream-200)' : 'var(--cth-lilac-light)',
      boxShadow: '0 0 0 2px var(--pro-bg, var(--cth-paper-100)), inset 0 0 0 1px var(--cth-ink-300)',
      fontSize: Math.round(size * 0.42), fontWeight: 700, color: 'var(--cth-ink-900)', lineHeight: 1
    }}>
      {/* Whole-number scale keeps the pixel art crisp. */}
      {agent ? <Avatar agent={agent} scale={Math.max(1, Math.floor(size / 16))} /> : initials(name)}
    </span>
  );
}

/** Everyone who changed a file, most recent first, overlapping like a stack. */
export function AuthorAvatars({ names, max = 3, size = 22 }: { names: string[]; max?: number; size?: number }) {
  if (!names.length) return null;
  const shown = names.slice(0, max);
  return (
    <span title={names.join(', ')} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      {shown.map((n, i) => (
        <span key={n} style={{ marginInlineStart: i ? -Math.round(size / 3) : 0, zIndex: shown.length - i, display: 'inline-flex' }}>
          <AuthorCircle name={n} size={size} />
        </span>
      ))}
      {names.length > max && <span className="pro-sub" style={{ fontSize: 11, marginInlineStart: 4 }}>+{names.length - max}</span>}
    </span>
  );
}
