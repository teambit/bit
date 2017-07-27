import fs from 'fs-extra';
import path from 'path';
import AbstractVinyl from './abstract-vinyl';
import vinylFile from 'vinyl-file';
import FileSourceNotFound from '../exceptions/file-source-not-found';
import logger from '../../../logger/logger';

// TODO: Remove Source?
export default class SourceFile extends AbstractVinyl {
  // TODO: remove this distFilePath?
  distFilePath: ?string;

  static load(filePath: string, distTarget: string, base: string = consumerPath, consumerPath: string, extendedProps: Object): SourceFile|null {
    try {
      const file = new SourceFile(vinylFile.readSync(filePath, { base, cwd: consumerPath}));
      // TODO: remove this distFilePath?
      file.distFilePath = path.join(consumerPath, distTarget, file.relative);
      for (const k in extendedProps) file[k] = extendedProps[k];
      return file;
    } catch (err) {
      logger.error(`failed loading file ${filePath}. Error: ${err}`);
      if (err.code === 'ENOENT' && err.path) {
        throw new FileSourceNotFound(err.path);
      }
      return null;
    }
  }

  // writeUsingBitMap(bitMapFiles: Object<string>, force?: boolean = true) {
  //   if (!bitMapFiles[this.relative]) {
  //     logger.error(`could not write the file "${this.basename}" as it does not appear in the bit.map file`);
  //     return Promise.resolve();
  //   }
  //   const bitPath = path.dirname(bitMapFiles[this.relative]);
  //   return this.write(bitPath, force);
  // }

  // serialize(): Buffer {
  //   return this.contents;
  // }

  // static deserialize(src): SourceFile {
  //   return new SourceFile({contents: src});
  // }
}
