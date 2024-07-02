/**
 * determines whether `val` is a numeric value
 * @name isNumeric
 * @param {*} val
 * @return {boolean}
 */
export default function isNumeric(val: any) {
  return !Number.isNaN(parseFloat(val)) && Number.isFinite(val);
}
