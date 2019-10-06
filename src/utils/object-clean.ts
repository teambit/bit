import forEach from './object/foreach';

/**
 * Cleans all object's properties that contains a falsy value
 * and returns a new object without them.
 * @name clean
 * @param {object} obj object to clean
 * @returns {object}
 * @example new cleaned object
 * ```js
 *  clean({ foo: null, bar: 'foo' }) // => { bar: 'foo' }
 * ```
 */
export default function clean(obj: { [key: string]: any }) {
  const newObj = {};

  forEach(obj, (val, key) => {
    if (!val) return;
    newObj[key] = val;
  });

  return newObj;
}
