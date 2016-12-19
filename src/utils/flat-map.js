/** @flow */

export default function flatMap(cb) {
  return Array.prototype.concat.apply([], this.map(cb));
}
