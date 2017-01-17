/** @flow */
import Bit from '../../component';

export default class Source {
  src: string;

  constructor(src: string) {
    this.src = src;
  }
  
  create(bit: Bit): Source { // eslint-disable-line
    throw Error('every source must implelement a create method');
  }
}
