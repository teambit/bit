import vinylFile from 'vinyl-file';
import fs from 'fs-extra';
import { logger } from '@teambit/legacy.logger';
import { registerRustSnapshotTransactionClass, type Repository, type SourceFileModel } from '@teambit/objects';
import type { PathOsBased } from '@teambit/toolbox.path.path';
import FileSourceNotFound from './file-source-not-found';
import AbstractVinyl from './abstract-vinyl';
import * as definingSourceFile from './source-file';
import { forEach } from 'lodash';
import { inheritRustWorkspaceFileSnapshot } from './rust-workspace-identity';
import { inheritRustHistorySourceSnapshot } from './rust-checkout-source';
import { cloneRustCheckoutPlanSourceFile, registerRustCheckoutPlanSourceClass } from './rust-checkout-plan-source';

export default class SourceFile extends AbstractVinyl {
  static load(
    filePath: PathOsBased,
    base: PathOsBased,
    consumerPath: PathOsBased,
    extendedProps: Record<string, any> = {}
  ): SourceFile {
    try {
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
    const planned = cloneRustCheckoutPlanSourceFile(this);
    if (planned) return planned as this;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const clone = new SourceFile(this);
    inheritRustWorkspaceFileSnapshot(this, clone);
    inheritRustHistorySourceSnapshot(this, clone);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return clone;
  }
}

registerRustCheckoutPlanSourceClass(SourceFile);

const defaultSourceFileLoad = SourceFile.load;
registerRustSnapshotTransactionClass('SourceFile', SourceFile);
const defaultReadSync = vinylFile.readSync;
const defaultModelLoad = SourceFile.loadFromSourceFileModel;
/** Native reads must not bypass a custom SourceFile or Vinyl reader. */
export function canReadWorkspaceFilesNatively(): boolean {
  return (
    Object.getOwnPropertyDescriptor(definingSourceFile, 'default')?.value === SourceFile &&
    SourceFile.load === defaultSourceFileLoad &&
    SourceFile.loadFromSourceFileModel === defaultModelLoad &&
    vinylFile.readSync === defaultReadSync &&
    ['contents', 'path', 'relative', 'base', 'stat'].every(
      (name) => !Object.hasOwn(SourceFile.prototype, name) && !Object.hasOwn(AbstractVinyl.prototype, name)
    )
  );
}

/** Preserve Vinyl metadata and public missing-file errors after a native body read. */
export function sourceFileFromWorkspaceRead(
  read: { path: string; contents: Buffer },
  base: string,
  consumerPath: string,
  extendedProps: Record<string, any> = {}
): SourceFile {
  let stat;
  try {
    stat = fs.statSync(read.path);
  } catch {
    return SourceFile.load(read.path, base, consumerPath, extendedProps);
  }
  const file = new SourceFile({ base, cwd: consumerPath, path: read.path, contents: read.contents, stat });
  for (const [key, value] of Object.entries(extendedProps)) file[key] = value;
  return file;
}
