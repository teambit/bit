/** @flow */
import Bit from '../bit';

export type SourceProps = {
  bit: Bit
};

export default class Source {
  bit: Bit;

  constructor({ bit }: SourceProps) {
    this.bit = bit;
  }
}
