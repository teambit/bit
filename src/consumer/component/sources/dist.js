/** @flow */
import * as fs from 'fs-extra';
import * as path from 'path';
import Source from './source';
import { DEFAULT_BUNDLE_FILENAME, DEFAULT_DIST_DIRNAME } from '../../../constants';

export default class Dist extends Source {
  write(bitPath: string): Promise<any> {
    const filePath = path.join(bitPath, DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME);
    return new Promise((resolve, reject) =>
      fs.outputFile(filePath, this.src, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      })
    );
  }

  serialize() {
    return this.src;
  }

  static deserialize(str: string) {
    return new Dist(str);
  }
}
