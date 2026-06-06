/**
 * Count whitespace-delimited words, tolerant of irregular spacing and newlines.
 * Backs the ≤80-word budget the summarizer holds Claude to.
 *
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}
