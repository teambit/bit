/** @flow */
import * as pathlib from 'path';
import { BIT_INLINE_DIRNAME } from '../../constants';
import Drawer from './drawer';

function composePath(path: string) {
  return pathlib.join(path, BIT_INLINE_DIRNAME);
}

export default class Inline extends Drawer {
  getPath() {
    return composePath(super.getPath());
  }
}
