/**
 * Text boxes that stop taking input. On Windows a native dialog (or a window
 * switch while one was open) can hand the window back with the page itself
 * unfocused: inputs still look normal, but a click no longer puts a caret in
 * them until the human switches windows. The renderer notices a click on a text
 * field while the document has no focus and asks main to focus the page again.
 */

export interface EditableLike {
  tagName?: string;
  isContentEditable?: boolean;
  type?: string;
  disabled?: boolean;
  readOnly?: boolean;
  closest?: (sel: string) => unknown;
}

const NOT_TEXT = new Set(['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'image', 'color', 'range', 'hidden']);

/** A field the human types into (input, textarea, contenteditable, xterm's helper). */
export function isTextField(el: EditableLike | null | undefined): boolean {
  if (!el || el.disabled) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? '').toLowerCase();
  if (tag === 'textarea') return true;
  if (tag === 'input') return !NOT_TEXT.has((el.type ?? 'text').toLowerCase());
  return !!el.closest?.('.xterm, .monaco-editor');
}

/** Whether a press on `target` should ask main to give the page its keyboard back. */
export function needsRefocus(target: EditableLike | null | undefined, documentHasFocus: boolean): boolean {
  return !documentHasFocus && isTextField(target);
}
