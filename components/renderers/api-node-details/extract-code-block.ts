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
  const regex = /```([\w+-]*)\s*([\s\S]*?)```/;

  const match = processedText.match(regex);

  if (match) {
    const lang = match[1];
    const code = match[2];
    return { lang, code };
  }
  return null;
}
