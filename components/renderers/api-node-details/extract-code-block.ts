/**
 * Extracts the code block and its language specifier enclosed between triple backticks (```) from a given text string.
 *
 * @param text - The text string from which to extract the code block.
 *
 * @returns An object containing the extracted code and language specifier, or null if no match is found.
 */
export function extractCodeBlock(text: string): { lang: string; code: string } | null {
  const regex = /```([\w+-]*)\n([\s\S]*?)```/;
  const match = text.match(regex);

  if (match) {
    const lang = match[1];
    const code = match[2];
    return { lang, code };
  }
  return null;
}

// export function extractCodeBlock(text: string): { lang: string; code: string } | null {
//   // The (?<lang>[\w+-]*) captures the optional language specifier (like 'typescript', 'javascript', etc.)
//   // The (?<code>[\s\S]*?) captures the actual code block
//   const regex = /```(?<lang>[\w+-]*)\n(?<code>[\s\S]*?)```/;
//   const match = text.match(regex);

//   if (match && match.groups) {
//     const { lang, code } = match.groups;
//     return { lang, code };
//   }
//   return null;
// }
