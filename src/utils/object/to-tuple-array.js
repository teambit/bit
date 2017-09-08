/** @flow */
import forEach from '../object/foreach';

/**
 * cast an object to tupple array.
 * @name objectToTupleArray
 * @param {*} obj 
 * @returns [[string, *]] tuple array representing given object 
 * @example
 * ```js
 *  objectToTupleArray({foo: 'bar', bar: 'foo'}) // => [['foo', 'bar'], ['bar', 'foo']]
 * ```
 */
export default function objectToTupleArray(obj: { [string]: any }): [string, any][] {
  const arr = [];
  forEach(obj, (val, key) => {
    arr.push([key, val]);
  });
  return arr;
}
