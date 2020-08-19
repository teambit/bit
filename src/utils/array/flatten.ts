/**
 * flatten arrays to a single dimension.
 * @name flatten
 * @param {[[*]]} arrays
 * @returns [*] a flatten array
 * @example
 * ```js
 *  flatten([[1], [2], [3]]) // => [1, 2, 3]
 * ```
 */
export default function flatten<T>(arrays: T[][]): T[] {
  const concat = ([] as T[]).concat;
  return concat.apply([], arrays);
}
