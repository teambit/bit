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

  // toString() {
  //   return JSON.stringify(this.serialize());
  // }

  // TODO: This is probably not needed any more
  // If yes, it might be without the JSON.parse
  // It should also be consistence with source-file.js
  // static fromString(str: string) {
  //   try {
  //     return Dist.deserialize(JSON.parse(str));
  //   } catch (e) {
  //     return Dist.deserialize({ src: str });
  //   }
  // }

  // serialize() {
  //   return this.contents;
  // }

  // static deserialize(src): Dist {
  //   return new Dist({contents: src});
  // }
}
