// @flow
import Bit from '../../component';

export default class Source {
  src: string;

  constructor(src: string) {
    this.src = src;
  }

  create(bit: Bit): Source {
    throw Error('every source must implement a create method');
  }
}
