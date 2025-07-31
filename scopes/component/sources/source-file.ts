import vinylFile from 'vinyl-file';
import { logger } from '@teambit/legacy.logger';
import type { Repository, SourceFileModel } from '@teambit/objects';
import type { PathOsBased } from '@teambit/toolbox.path.path';
import FileSourceNotFound from './file-source-not-found';
import AbstractVinyl from './abstract-vinyl';
import { forEach } from 'lodash';

export default class SourceFile extends AbstractVinyl {
  static load(
    filePath: PathOsBased,
    base: PathOsBased,
    consumerPath: PathOsBased,
    extendedProps: Record<string, any> = {}
  ): SourceFile {
    try {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const file = new SourceFile(vinylFile.readSync(filePath, { base, cwd: consumerPath }));
      const addToFile = (value, key) => (file[key] = value); /* eslint-disable-line no-return-assign */
      forEach(extendedProps, addToFile);
      return file;
    } catch (err: any) {
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

  static loadFromParsedString(parsedString: Record<string, any>): SourceFile | null {
    if (!parsedString) return null;
    const opts = super.loadFromParsedStringBase(parsedString);
    return new SourceFile(opts);
  }

  static loadFromParsedStringArray(arr: Record<string, any>[]): SourceFile[] | null | undefined {
    if (!arr) return null;
    // @ts-ignore
    return arr.map(this.loadFromParsedString);
  }

  static async loadFromSourceFileModel(file: SourceFileModel, repository: Repository): Promise<SourceFile> {
    const content = await file.file.load(repository);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new SourceFile({ base: '.', path: file.relativePath, contents: content.contents, test: file.test });
  }

  clone(): this {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new SourceFile(this);
  }
}
