/** @flow */
import * as fs from 'fs-extra';
import * as path from 'path';
import Vinyl from 'vinyl';
import { DEFAULT_DIST_DIRNAME } from '../../../constants';
const DEFAULT_SOURCEMAP_VERSION = 3; // TODO - move to constant !

export default class Dist extends Vinyl {
  distFilePath:string;

  constructor(options) {
    super(options);
  }

  static getFilePath(bitPath: string, fileName: string) {
    return path.join(bitPath, DEFAULT_DIST_DIRNAME, fileName);
  }

  write(bitPath: string, force?: boolean = true): Promise<string> {
    const filePath = this.distFilePath || path.join(bitPath, this.basename);
    return new Promise((resolve, reject) => {
      if (!force && fs.existsSync(filePath)) return resolve();
      return fs.outputFile(filePath, this.contents, (err, res) => {
        if (err) return reject(err);
        return resolve(filePath);
      });
    });
  }

  toString() {
    return JSON.stringify(this.serialize());
  }

  // TODO: This is probably not needed any more
  // If yes, it might be without the JSON.parse
  // It should also be consistence with source-file.js
  static fromString(str: string) {
    try {
      return Dist.deserialize(JSON.parse(str));
    } catch (e) {
      return Dist.deserialize({ src: str });
    }
  }

  serialize() {
    return this.contents;
  }

  static deserialize(src): Dist {
    return new Dist({contents: src});
  }
}
