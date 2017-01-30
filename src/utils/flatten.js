/** @flow */

/**
 * 
 */
export default function flatten(arrays: Array<any>): Array<any> {
  const concat = [].concat;
  return concat.apply([], arrays);
}
