// @flow
import vinylFile from 'vinyl-file';
import AbstractVinyl from './abstract-vinyl';
import FileSourceNotFound from '../exceptions/file-source-not-found';
import logger from '../../../logger/logger';
import type { PathOsBased } from '../../../utils/path';

export default class SourceFile extends AbstractVinyl {
  // TODO: remove this distFilePath?
  distFilePath: ?string;

  static load(
    filePath: PathOsBased,
    distTarget: PathOsBased,
    base: PathOsBased = consumerPath,
    consumerPath: PathOsBased,
    extendedProps: Object
  ): SourceFile | null {
    try {
      const file = new SourceFile(vinylFile.readSync(filePath, { base, cwd: consumerPath }));
      for (const k in extendedProps) file[k] = extendedProps[k];
      return file;
    } catch (err) {
      logger.error(`failed loading file ${filePath}. Error: ${err}`);
      if (err.code === 'ENOENT' && err.path) {
        throw new FileSourceNotFound(err.path);
      }
      throw err;
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

  clone() {
    return new SourceFile(this);
  }
}
