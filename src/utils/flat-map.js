/** @flow */

export default function flatMap(cb: Function) {
  return Array.prototype.concat.apply([], this.map(cb));
}
