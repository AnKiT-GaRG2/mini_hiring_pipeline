/**
 * Prefix-tolerant matching against a small, fixed vocabulary — what lets the
 * quick search bar start predicting a few letters in ("hir" → "hired", "int"
 * → "interview") instead of only ever recognizing a fully-typed word.
 */

/** `text` if it is a single alphabetic word, else undefined. */
export function soleWord(text: string): string | undefined {
  const w = text.trim().toLowerCase();
  return /^[a-z]+$/.test(w) ? w : undefined;
}

/**
 * `word` against `vocabulary`: an exact match always wins; otherwise, from 3
 * letters on, a prefix that names exactly one entry counts (so a prefix two
 * entries could both continue, like "of" for "offer" and nothing else here,
 * stays ambiguous and matches nothing until it's typed further). Returns the
 * matched vocabulary entry, not the typed fragment.
 */
export function matchOneOf(word: string, vocabulary: readonly string[]): string | undefined {
  if (vocabulary.includes(word)) return word;
  if (word.length < 3) return undefined;
  const hits = vocabulary.filter((entry) => entry.startsWith(word));
  return hits.length === 1 ? hits[0] : undefined;
}
