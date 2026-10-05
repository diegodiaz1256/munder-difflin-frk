/**
 * Text boxes that "lock": on Windows the page can lose keyboard focus after a
 * native dialog (file or folder picker, message box) while the window itself
 * still looks active. Clicking a text box then does nothing and typing goes
 * nowhere until the user switches away and back. When a click lands on
 * something editable while the page has no focus, ask main to hand focus back
 * and focus the clicked box.
 */

type Focusable = { focus(): void };

/** True for elements a person types into (inputs, textareas, contenteditable). */
export function isEditable(el: unknown): el is Focusable {
  if (!el || typeof el !== 'object') return false;
  const e = el as { tagName?: string; type?: string; isContentEditable?: boolean; disabled?: boolean; readOnly?: boolean };
  if (e.disabled || e.readOnly) return false;
  if (e.isContentEditable) return true;
  const tag = (e.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  const type = (e.type ?? 'text').toLowerCase();
  return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'hidden'].includes(type);
}

/** Install once at startup. Returns a function that removes the listener. */
export function installFocusRescue(
  doc: Document = document,
  refocus: () => Promise<void> = async () => { await window.cth?.refocus?.(); }
): () => void {
  const onDown = (e: MouseEvent): void => {
    const target = e.target as Element | null;
    // contenteditable children: the editable root is an ancestor.
    const el = target && (isEditable(target) ? target : target.closest?.('[contenteditable=""], [contenteditable="true"]'));
    if (!isEditable(el) || doc.hasFocus()) return;
    void refocus().then(() => el.focus(), () => el.focus());
  };
  doc.addEventListener('mousedown', onDown, true);
  return () => doc.removeEventListener('mousedown', onDown, true);
}
