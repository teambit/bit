/** @flow */
import * as fs from 'fs-extra';
import * as path from 'path';
import AbstractVinyl from './abstract-vinyl';
import { DEFAULT_DIST_DIRNAME } from '../../../constants';
const DEFAULT_SOURCEMAP_VERSION = 3; // TODO - move to constant !

export default class Dist extends AbstractVinyl {
  // TODO: remove this distFilePath?
  distFilePath:string;

  static getFilePath(bitPath: string, fileName: string) {
    return path.join(bitPath, DEFAULT_DIST_DIRNAME, fileName);
  }
}
