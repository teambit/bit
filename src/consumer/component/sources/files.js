import fs from 'fs-extra';
import path from 'path';
import Vinyl from 'vinyl';
import Source from './source';
import FileSourceNotFound from '../exceptions/file-source-not-found';
import { isString } from '../../../utils';
import logger from '../../../logger/logger';

// todo: change the file name to source-file.
// TODO: Remove Source?
export default class SourceFile extends Vinyl {

  constructor(options) {
    super(options);
  }

  static load(filePaths: Object<string>): SourceFile|null {
    try {
      const files = Object.keys(filePaths).map((file) => {
        return {
          name: file,
          content: fs.readFileSync(filePaths[file])
        };
      });
      return new SourceFile(files);
    } catch (err) {
      if (err.code === 'ENOENT' && err.path) {
        throw new FileSourceNotFound(err.path);
      }
      return null;
    }
  }

  write(bitPath: string, force?: boolean = true): Promise<any> {
    const filePath = path.join(bitPath, this.basename);
    return new Promise((resolve, reject) => {
      if (!force && fs.existsSync(filePath)) return resolve();
      return fs.outputFile(filePath, this.contents, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    });
  }

  writeUsingBitMap(bitMapFiles: Object<string>, force?: boolean = true) {
    if (!bitMapFiles[this.relative]) {
      logger.error(`could not write the file "${this.basename}" as it does not appear in the bit.map file`);
      return Promise.resolve();
    }
    return this.write(this.path, force);
  }

  serialize(): Buffer {
    return this.contents;
  }

  static deserialize(src): SourceFile {
    return new SourceFile(src);
  }
}
