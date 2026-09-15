/** Match the previous editor's ignore-trim-whitespace behavior without changing internal spacing. */
export function normalizeWhitespace(content = '', ignoreWhitespace = false): string {
  if (!ignoreWhitespace) return content;
  return content
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
}
