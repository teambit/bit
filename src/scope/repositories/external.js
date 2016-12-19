/** @flow */
import path from 'path';
import { BIT_EXTERNAL_DIRNAME } from '../../constants';
import Repository from '../repository';
import Bit from '../../bit';

export default class External extends Repository {
  getPath(): string {
    return path.join(super.getPath(), BIT_EXTERNAL_DIRNAME);
  }

  store(bits: Bit[]) {
    // const externalBits = bits.filter(bit => bit.isLocal());
    return bits;
  }

  setExternal() {

  }
}
