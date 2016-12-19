/** @flow */
export default function flatten(arrays: [[]]) {
  return [].concat.apply([], arrays);
}
