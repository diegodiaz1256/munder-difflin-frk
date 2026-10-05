/**
 * A question an agent's CLI is asking in its terminal: Claude Code's
 * numbered menus ("❯ 1. Yes / 2. No … Enter to confirm · Esc to cancel"),
 * a trust-this-folder prompt, a /remote-control confirmation. No hook fires
 * for these, so the agent just sits there until someone opens its terminal.
 * Read from the bottom of its rendered screen (xterm), the card says it is
 * asking you.
 */

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g;
const FOOTER = /Enter to (?:select|confirm|continue)|Esc to (?:cancel|go back|exit)|\(y\/n\)|\[y\/N\]|\[Y\/n\]/i;
const OPTION = /^\s*(?:[❯›>↓↑]\s*)?\d+\.\s+\S/;

export interface TerminalMenu { question: string }

/** The menu showing at the bottom of the screen `tail`, or null. */
export function detectMenu(tail: string): TerminalMenu | null {
  const text = tail.replace(ANSI, '').replace(/\r(?!\n)/g, '\n');
  // Box borders read as blank lines, which is what separates the paragraphs.
  const rows = text.split('\n').map((l) => l.replace(/[│╭╮╰╯─]+/g, ' ').trimEnd());
  while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
  const win = rows.slice(-22);
  const last = win.filter((l) => l.trim()).slice(-14);
  const footerAt = last.findIndex((l) => FOOTER.test(l));
  const options = last.filter((l) => OPTION.test(l)).length;
  // A numbered list in an answer is not a menu: it needs the footer or the cursor.
  const cursor = last.some((l) => /^\s*[❯›]\s*\d+\./.test(l));
  if (footerAt < 0 && !(cursor && options >= 2)) return null;
  // Work output after the footer means it was answered.
  if (footerAt >= 0 && last.slice(footerAt + 1).some((l) => /\b(?:Crunching|Thinking|Reading|Running|Searched|Wrote|Read \d)/.test(l))) return null;
  // The question: the paragraph just above the options (or the footer). A
  // line ending in "?" if it has one, else its first line, the title.
  let end = win.findIndex((l) => OPTION.test(l));
  if (end < 0) end = win.findIndex((l) => FOOTER.test(l));
  let i = end - 1;
  while (i >= 0 && !win[i].trim()) i--;
  const para: string[] = [];
  for (; i >= 0 && win[i].trim(); i--) para.unshift(win[i].trim());
  const asked = win.slice(Math.max(0, end - 8), Math.max(0, end)).reverse().find((l) => /\?$/.test(l.trim()))?.trim();
  const question = asked ?? para[0] ?? '';
  return { question: question.slice(0, 160) };
}
