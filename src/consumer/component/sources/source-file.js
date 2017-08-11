import fs from 'fs-extra';
import path from 'path';
import AbstractVinyl from './abstract-vinyl';
import vinylFile from 'vinyl-file';
import FileSourceNotFound from '../exceptions/file-source-not-found';
import logger from '../../../logger/logger';

export default class SourceFile extends AbstractVinyl {
  // TODO: remove this distFilePath?
  distFilePath: ?string;

  static load(filePath: string, distTarget: string, base: string = consumerPath, consumerPath: string, extendedProps: Object): SourceFile|null {
    try {
      const file = new SourceFile(vinylFile.readSync(filePath, { base, cwd: consumerPath }));
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

  static loadFromParsedString(parsedString: Object) {
    if (!parsedString) return;
    const opts = super.loadFromParsedString(parsedString);
    return new SourceFile(opts);
  }

  static loadFromParsedStringArray(arr: Object[]) {
    if (!arr) return;
    return arr.map(this.loadFromParsedString);
  }
}
