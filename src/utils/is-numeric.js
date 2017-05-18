/** @flow */
export default function isNumeric(val: any) {
  return !isNaN(parseFloat(val)) && isFinite(val);
}
