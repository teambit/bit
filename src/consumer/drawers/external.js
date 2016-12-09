/** @flow */
import * as pathlib from 'path';
import { BIT_EXTERNAL_DIRNAME } from '../../constants';
import Drawer from './drawer';

function composePath(path: string) {
  return pathlib.join(path, BIT_EXTERNAL_DIRNAME);
}

export default class External extends Drawer {
  getPath() {
    return composePath(super.getPath());
  }
}
