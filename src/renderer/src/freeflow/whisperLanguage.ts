/**
 * The language hint for local Whisper: the app's UI language ("zh-CN" → "zh").
 * Without one, Whisper small guesses from the first seconds and, on a short
 * Spanish dictation, returned only its first word ("Michael,").
 */
export function whisperLanguage(uiLanguage: string | undefined): string | undefined {
  const base = (uiLanguage ?? '').toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(base) ? base : undefined;
}
