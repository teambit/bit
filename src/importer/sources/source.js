/** @flow */

export default class Source {
  src: string;

  constructor(src: string) {
    this.src = src;
  }

  create(bit: any): Source { // eslint-disable-line
    throw Error('every source must implement a create method');
  }
}
