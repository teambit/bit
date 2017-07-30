/** @flow */

/**
 * determines whether `val` is a numeric value
 * @name isNumeric
 * @param {*} val
 * @return {boolean}
 */
export default function isNumeric(val: any) {
  return !isNaN(parseFloat(val)) && isFinite(val);
}
