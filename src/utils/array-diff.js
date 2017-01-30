/** @flow */

/**
 * compute the difference between two array references. 
 * @param {[]} firstArray 
 * @param {[]} secondArray
 * @returns {[]} returns an array representing the difference between the two arrays
 * @example
 * ```js
 *  diff([1,2,3], [1,2,3,4,5]) // => [4,5]
 * ```
 */
export default function diff(firstArray: any[], secondArray: any[]): any[] {
  return firstArray.concat(secondArray).filter((val) => {
    return !(firstArray.includes(val) && secondArray.includes(val));
  });
}
