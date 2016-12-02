/** @flow */
import * as pathlib from 'path';
import { mkdirp } from '../../utils';
import { BIT_INLINE_DIRNAME } from '../../constants';
import BitMap from './bit-map';

function composePath(path: string) {
  return pathlib.join(path, BIT_INLINE_DIRNAME);
}

export default class Inline extends BitMap {
  getPath() {
    return composePath(super.getPath());
  }

  write(): Promise<boolean> {
    return mkdirp(this.getPath());
  }
}
