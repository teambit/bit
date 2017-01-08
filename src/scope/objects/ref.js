/** @flow */

export default class Ref {
  hash: string;

  constructor(hash: string) {
    this.hash = hash;
  }

  toString() {
    return this.hash;
  }
}
