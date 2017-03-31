/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import Source from './source';
import { LICENSE_FILENAME } from '../../../constants';

export default class License extends Source {

  write(bitPath: string, force: boolean = true): Promise<any> {
    const filePath = path.join(bitPath, LICENSE_FILENAME);
    if (!force && fs.existsSync(filePath)) return Promise.resolve();
    return new Promise((resolve, reject) =>
      fs.writeFile(filePath, this.src, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      })
    );
  }

  serialize() {
    return this.src;
  }

  static deserialize(str: string) {
    return new License(str);
  }

}
