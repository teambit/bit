/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import Source from './source';
import { LICENSE_FILENAME } from '../../../constants';

export default class License extends Source {
  
  write(bitPath: string): Promise<any> {
    return new Promise((resolve, reject) =>
      fs.writeFile(path.join(bitPath, LICENSE_FILENAME), this.src, (err, res) => {
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
