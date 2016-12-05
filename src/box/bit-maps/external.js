/** @flow */
import * as pathlib from 'path';
import { BIT_EXTERNAL_DIRNAME } from '../../constants';
import BitMap from './bit-map';

function composePath(path: string) {
  return pathlib.join(path, BIT_EXTERNAL_DIRNAME);
}

export default class External extends BitMap {
  getPath() {
    return composePath(super.getPath());
  }
}
