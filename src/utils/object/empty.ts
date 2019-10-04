import hasOwnProperty from './has-own-property';

/**
 * determines whether `obj` reference is empty (empty array, empty object and/or falsy values)
 * @name empty
 * @param {*} name
 * @returns {boolean}
 * @example
 * ```js
 *  empty([]) // => true
 *  empty({}) // => true
 *  empty(1) // => false
 *  empty('') // => false
 *  empty('foo') // => true
 * ```
 */
export default function empty(obj: any): boolean {
  for (const n in obj) if (hasOwnProperty(obj, n) && obj[n]) return false; // eslint-disable-line
  return true;
}
