/**
 * splits an array to two chunks using a conditional predicate function.
 * @name splitBy
 * @param {[*]} array array to split.
 * @param {() => boolean} fn predicate function to test each element of the array.
 * @returns {[[], []]} two new arrays with the elements that failed the test from the left.
 * @example
 * ```js
 *  splitBy([1, 2, 3, 4, 5], isEven) // => [[1, 3, 5], [2, 4]]
 * ```
 */
export default function splitBy(array: any[], fn: (elm: any) => boolean): [Array<any>, Array<any>] {
  const truthy: any = [];
  const falsy: any = [];

  array.forEach((elm) => {
    if (fn(elm)) truthy.push(elm);
    else falsy.push(elm);
  });

  return [falsy, truthy];
}
