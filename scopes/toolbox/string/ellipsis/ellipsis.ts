/**
 * ellipsis the text.
 * @param str string to cut
 */
export function ellipsis(str: string, maxCharacters: number): string {
  return str.length > maxCharacters ? `${str.substring(0, maxCharacters)}...` : str;
}
