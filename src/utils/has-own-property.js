/** @flow */
export default function hasOwnProperty(obj: Object, prop: string|number) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}
