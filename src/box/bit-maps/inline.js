/** @flow */
import * as pathlib from 'path';
import { BIT_INLINE_DIRNAME } from '../../constants';
import BitMap from './bit-map';
import Bit from '../../bit';

function composePath(path: string) {
  return pathlib.join(path, BIT_INLINE_DIRNAME);
}

export default class Inline extends BitMap {
  getPath() {
    return composePath(super.getPath());
  }
}
