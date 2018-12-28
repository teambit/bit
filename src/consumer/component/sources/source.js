// @flow
import type Component from '../../component/consumer-component';

export default class Source {
  src: string;

  constructor(src: string) {
    this.src = src;
  }

  create(bit: Component): Source {
    // eslint-disable-line
    throw Error('every source must implement a create method');
  }
}
