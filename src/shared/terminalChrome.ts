/**
 * Lines a CLI paints around the conversation (status footer, mode hints,
 * usage warnings) rather than what the agent is doing. The Pro agent cards
 * show the last lines of each terminal; without this they showed Claude Code's
 * "You've used 91% of your session limit" footer on every card.
 */

const CHROME: RegExp[] = [
  /you['’]ve used \d+% of your/i,
  /\bresets? (?:at )?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i,
  /^\s*\(?[A-Za-z]+\/[A-Za-z_]+\)?\s*·?\s*\/upgr/i,
  /bypass permissions on|accept edits on|plan mode on|auto-accept/i,
  /\(shift\+tab to cycle\)|\? for shortcuts|esc to interrupt|ctrl\+c to exit/i,
  /^\s*ctx \d+k?\/\d+k?\b/i,
  /^\s*(?:ad|upgr|upgrade)\s*(?:·.*)?$/i,
  /^\s*·?\s*\d+h \d+%\s*$/
];

/** True for a status/footer line rather than conversation. */
export function isChromeLine(text: string): boolean {
  return CHROME.some((re) => re.test(text));
}

/** The plan-usage warning in a terminal's text, if any ("91%" of the session
 *  or weekly limit), so it can be shown once as a badge. */
export function usageNotice(lines: readonly string[]): { percent: number; window: string } | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /you['’]ve used (\d+)% of your (\w+) limit/i.exec(lines[i]);
    if (m) return { percent: Number(m[1]), window: m[2].toLowerCase() };
  }
  return null;
}
