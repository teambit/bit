/** @flow */
import * as pathlib from 'path';
import Bit from '../../bit';
import Box from '../box';
import { mkdirp } from '../../utils';
import { BIT_DIR_NAME } from '../../constants';

function composePath(path: string) {
  return pathlib.join(path, BIT_DIR_NAME);
}

export default class BitMap extends Map<string, Bit> {
  box: Box;

  constructor(box: Box, bits: [string, Bit][] = []) {
    super(bits);
    this.box = box;
  }
  
  getPath() {
    return composePath(this.box.path);
  }

  add(bit: Bit) {
    return bit.write(this).then(() => this.set(bit.name, bit));
  }

  remove(bit: Bit) {
    return bit.erase(this).then(() => { this.delete(bit.name); });
  }

  ensureDir(): Promise<boolean> {
    return mkdirp(this.getPath());
  }

  static load(box: Box): BitMap {
    return new BitMap(box, []);
  }
}
