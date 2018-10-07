/** @flow */
import fs from 'fs-extra';
import path from 'path';
import Source from './source';
import { LICENSE_FILENAME } from '../../../constants';

export default class License extends Source {
  write(bitPath: string, force?: boolean = true): Promise<any> {
    const filePath = path.join(bitPath, LICENSE_FILENAME);
    if (!force && fs.existsSync(filePath)) return Promise.resolve();
    return fs.writeFile(filePath, this.src);
  }

  serialize() {
    return this.src;
  }

  static deserialize(str: string) {
    return new License(str);
  }
}
