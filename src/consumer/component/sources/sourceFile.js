import fs from 'fs-extra';
import path from 'path';
import Vinyl from 'vinyl';
import vinylFile from 'vinyl-file';

import Source from './source';
import FileSourceNotFound from '../exceptions/file-source-not-found';
import { isString } from '../../../utils';
import logger from '../../../logger/logger';

// todo: change the file name to source-file.
// TODO: Remove Source?
export default class SourceFile extends Vinyl {
  distFilePath:?string

  constructor(options) {
    super(options);
  }

  static load(filePath:string, distTarget:string, cwd:string, extendedProps: object): SourceFile|null {
    try {
      const file = new SourceFile(vinylFile.readSync(filePath, { base: cwd }));
      file.distFilePath = path.join(process.cwd(), distTarget, file.relative);
      for (const k in extendedProps) file[k] = extendedProps[k];
      return file;
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
    const bitPath = path.dirname(bitMapFiles[this.relative]);
    return this.write(bitPath, force);
  }

  serialize(): Buffer {
    return this.contents;
  }

  static deserialize(src): SourceFile {
    return new SourceFile(src);
  }
}
