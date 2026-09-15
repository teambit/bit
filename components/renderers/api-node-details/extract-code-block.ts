/**
 * Extracts the code block and its language specifier enclosed between triple backticks (```) from a given text string.
 *
 * @param text - The text string from which to extract the code block.
 *
 * @returns An object containing the extracted code and language specifier, or null if no match is found.
 */
export function extractCodeBlock(text: string): { lang: string; code: string } | null {
  let processedText = text;
  if (text.endsWith(';') && !text.endsWith('```')) {
    processedText = text.slice(0, -1) + '```';
  }
  // Consume horizontal fence padding and at most one line break. A broad `\s*` here would also
  // consume indentation belonging to the first code line.
  const regex = /```([\w+-]*)[^\S\r\n]*(?:\r?\n)?([\s\S]*?)```/;

  const match = processedText.match(regex);

  if (match) {
    const lang = match[1];
    const code = match[2];
    return { lang, code };
  }
  return null;
}
