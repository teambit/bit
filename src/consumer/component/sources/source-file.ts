// @flow
import R from 'ramda';
import vinylFile from 'vinyl-file';
import AbstractVinyl from './abstract-vinyl';
import FileSourceNotFound from '../exceptions/file-source-not-found';
import logger from '../../../logger/logger';
import { SourceFileModel } from '../../../scope/models/version';
import { PathOsBased } from '../../../utils/path';
import { Repository } from '../../../scope/objects';

export default class SourceFile extends AbstractVinyl {
  // TODO: remove this distFilePath?
  distFilePath: ?string;

  static load(
    filePath: PathOsBased,
    distTarget: PathOsBased,
    base: PathOsBased = consumerPath, // TODO: change params order to fix lint error
    consumerPath: PathOsBased,
    extendedProps: Object
  ): SourceFile | null {
    try {
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

  static loadFromParsedString(parsedString: Object): ?SourceFile {
    if (!parsedString) return null;
    const opts = super.loadFromParsedString(parsedString);
    return new SourceFile(opts);
  }

  static loadFromParsedStringArray(arr: Object[]): ?(SourceFile[]) {
    if (!arr) return null;
    return arr.map(this.loadFromParsedString);
  }

  static async loadFromSourceFileModel(file: SourceFileModel, repository: Repository): Promise<SourceFile> {
    // $FlowFixMe
    const content = await file.file.load(repository);
    return new SourceFile({ base: '.', path: file.relativePath, contents: content.contents, test: file.test });
  }

  clone(): SourceFile {
    return new SourceFile(this);
  }
}
