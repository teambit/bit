import R from 'ramda';
import vinylFile from 'vinyl-file';
import AbstractVinyl from './abstract-vinyl';
import FileSourceNotFound from '../exceptions/file-source-not-found';
import logger from '../../../logger/logger';
import { SourceFileModel } from '../../../scope/models/version';
import { PathOsBased } from '../../../utils/path';
import { Repository } from '../../../scope/objects';

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
export default class SourceFile extends AbstractVinyl {
  // TODO: remove this distFilePath?
  distFilePath: string | null | undefined;
  static load(
    filePath: PathOsBased,
    distTarget: PathOsBased,
    base: PathOsBased,
    consumerPath: PathOsBased,
    extendedProps: Record<string, any>
  ): SourceFile | null {
    try {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const file = new SourceFile(vinylFile.readSync(filePath, { base, cwd: consumerPath }));
      const addToFile = (value, key) => (file[key] = value); /* eslint-disable-line no-return-assign */
      R.forEachObjIndexed(addToFile, extendedProps);
      return file;
    } catch (err) {
      logger.errorAndAddBreadCrumb(
        'source-file.load',
        'failed loading file {filePath}. Error: {message}',
        { filePath, message: err.message },
        err
      );
      if (err.code === 'ENOENT' && err.path) {
        throw new FileSourceNotFound(err.path);
      }
      throw err;
    }
  }

  static loadFromParsedString(parsedString: Record<string, any>): SourceFile | null | undefined {
    if (!parsedString) return null;
    const opts = super.loadFromParsedString(parsedString);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new SourceFile(opts);
  }

  static loadFromParsedStringArray(arr: Record<string, any>[]): SourceFile[] | null | undefined {
    if (!arr) return null;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return arr.map(this.loadFromParsedString);
  }

  static async loadFromSourceFileModel(file: SourceFileModel, repository: Repository): Promise<SourceFile> {
    const content = await file.file.load(repository);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new SourceFile({ base: '.', path: file.relativePath, contents: content.contents, test: file.test });
  }

  // @ts-ignore
  clone(): SourceFile {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new SourceFile(this);
  }
}
