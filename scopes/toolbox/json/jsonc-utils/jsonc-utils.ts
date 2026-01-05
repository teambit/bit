import detectIndent from 'detect-indent';
import detectNewline from 'detect-newline';
import { parse, stringify } from 'comment-json';

export type JsoncFormatting = {
  indent: string;
  newline: string;
};

/**
 * Detects the indentation and newline style from a JSONC file content.
 * Defaults to 2 spaces and LF if not detected.
 */
export function detectJsoncFormatting(content: string): JsoncFormatting {
  const indent = detectIndent(content).indent || '  ';
  const newline = detectNewline(content) || '\n';
  return { indent, newline };
}

/**
 * Parses JSONC content and detects its formatting.
 */
export function parseJsoncWithFormatting(content: string): { data: any; formatting: JsoncFormatting } {
  const data = parse(content);
  const formatting = detectJsoncFormatting(content);
  return { data, formatting };
}

/**
 * Stringifies a JSONC object with the given formatting.
 * Handles CRLF newlines by replacing LF with CRLF after stringification.
 */
export function stringifyJsonc(data: any, formatting: JsoncFormatting): string {
  const stringified = stringify(data, null, formatting.indent);
  return formatting.newline === '\r\n' ? stringified.replace(/\n/g, '\r\n') : stringified;
}

/**
 * Updates a JSONC file content while preserving its original formatting (indentation, newlines, and comments).
 * 
 * @param originalContent - The original JSONC file content
 * @param updateFn - Function that receives the parsed data and returns the updated data
 * @returns The stringified updated content with preserved formatting
 * 
 * @example
 * ```typescript
 * const updatedContent = updateJsoncPreservingFormatting(originalContent, (data) => {
 *   data.someField = 'new value';
 *   return data;
 * });
 * ```
 */
export function updateJsoncPreservingFormatting<T>(
  originalContent: string,
  updateFn: (data: T) => T
): string {
  const { data, formatting } = parseJsoncWithFormatting(originalContent);
  const updatedData = updateFn(data);
  return stringifyJsonc(updatedData, formatting);
}
