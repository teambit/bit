import Bluebird from 'bluebird';
import fs from 'fs-extra';
import * as path from 'path';
import Capsule from '../../../../legacy-capsule/core/capsule';
import Symlink from '../../../links/symlink';
import logger from '../../../logger/logger';
import { concurrentIOLimit } from '../../../utils/concurrency';
import removeFilesAndEmptyDirsRecursively from '../../../utils/fs/remove-files-and-empty-dirs-recursively';
import AbstractVinyl from './abstract-vinyl';
import RemovePath from './remove-path';

export default class DataToPersist {
  files: AbstractVinyl[];
  symlinks: Symlink[];
  remove: RemovePath[];
  constructor() {
    this.files = [];
    this.symlinks = [];
    this.remove = [];
  }
  addFile(file: AbstractVinyl) {
    if (!file) throw new Error('failed adding an empty file into DataToPersist');
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!file.path) {
      throw new Error('failed adding a file into DataToPersist as it does not have a path property');
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const existingFileIndex = this.files.findIndex((existingFile) => existingFile.path === file.path);
    if (existingFileIndex !== -1) {
      if (file.override) {
        // delete existing file
        this.files.splice(existingFileIndex, 1);
      } else {
        // don't push this one. keep the existing file
        return;
      }
    }
    this._throwForDirectoryCollision(file);
    this.files.push(file);
  }
  addManyFiles(files: AbstractVinyl[] = []) {
    files.forEach((file) => this.addFile(file));
  }
  removePath(pathToRemove: RemovePath) {
    if (!pathToRemove) throw new Error('failed adding a path to remove into DataToPersist');
    if (!this.remove.includes(pathToRemove)) {
      this.remove.push(pathToRemove);
    }
  }
  removeManyPaths(pathsToRemove: RemovePath[] = []) {
    pathsToRemove.forEach((pathToRemove) => this.removePath(pathToRemove));
  }
  addSymlink(symlink: Symlink) {
    if (!symlink.src) throw new Error('failed adding a symlink into DataToPersist, src is empty');
    if (!symlink.dest) throw new Error('failed adding a symlink into DataToPersist, dest is empty');
    this.symlinks.push(symlink);
  }
  addManySymlinks(symlinks: Symlink[] = []) {
    symlinks.forEach((symlink) => this.addSymlink(symlink));
  }
  merge(dataToPersist: DataToPersist | null | undefined) {
    if (!dataToPersist) return;
    this.addManyFiles(dataToPersist.files);
    this.removeManyPaths(dataToPersist.remove);
    this.addManySymlinks(dataToPersist.symlinks);
  }
  async persistAllToFS() {
    this._log();
    this._validateAbsolute();
    // the order is super important. first remove, then create and finally symlink
    await this._deletePathsFromFS();
    await this._persistFilesToFS();
    await this._persistSymlinksToFS();
  }
  async persistAllToCapsule(capsule: any, opts = { keepExistingCapsule: false }) {
    this._log();
    this._validateRelative();
    if (!opts.keepExistingCapsule) {
      await Promise.all(this.remove.map((pathToRemove) => capsule.removePath(pathToRemove.path)));
    }
    await Promise.all(
      this.files.map((file) =>
        this._writeFileToCapsule(capsule, file, { overwriteExistingFile: !!opts.keepExistingCapsule })
      )
    );
    await Promise.all(this.symlinks.map((symlink) => this.atomicSymlink(capsule, symlink)));
  }
  async _writeFileToCapsule(capsule: Capsule, file: AbstractVinyl, opts = { overwriteExistingFile: false }) {
    // overwriteExistingFile: if a file with the same name exists in the capsule, overwrite it
    if (opts.overwriteExistingFile) {
      await capsule.removePath(file.path);
      return capsule.outputFile(file.path, file.contents, {});
    }
    if (file.override === false) {
      // @todo, capsule hack. use capsule.fs once you get it as a component.
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const capsulePath = capsule.container.getPath();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const absPath = path.join(capsulePath, file.path);
      try {
        await fs.lstat(absPath); // if no errors have been thrown, the file exists
        logger.debug(`skip file ${absPath}, it already exists`);
        return null;
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return capsule.outputFile(file.path, file.contents);
  }
  async atomicSymlink(capsule: Capsule, symlink: Symlink) {
    try {
      await capsule.symlink(symlink.src, symlink.dest);
    } catch (e) {
      // On windows when the link already created by npm we got EPERM error
      // TODO: We should handle this better and avoid creating the symlink if it's already exists
      if (e.code !== 'EEXIST' && e.code !== 'EPERM') {
        throw e;
      } else {
        logger.debug(`ignoring ${e.code} error on atomicSymlink creation`);
      }
    }
  }
  addBasePath(basePath: string) {
    this.files.forEach((file) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      this._assertRelative(file.base);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      file.updatePaths({ newBase: path.join(basePath, file.base) });
    });
    this.symlinks.forEach((symlink) => {
      this._assertRelative(symlink.src);
      this._assertRelative(symlink.dest);
      symlink.src = path.join(basePath, symlink.src);
      symlink.dest = path.join(basePath, symlink.dest);
    });
    this.remove.forEach((removePath) => {
      this._assertRelative(removePath.path);
      removePath.path = path.join(basePath, removePath.path);
    });
  }
  /**
   * helps for debugging
   */
  toConsole() {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    console.log(`\nfiles: ${this.files.map((f) => f.path).join('\n')}`); // eslint-disable-line no-console
    console.log(`\nsymlinks: ${this.symlinks.map((s) => `src: ${s.src}, dest: ${s.dest}`).join('\n')}`); // eslint-disable-line no-console
    console.log(`remove: ${this.remove.map((r) => r.path).join('\n')}`); // eslint-disable-line no-console
  }
  filterByPath(filterFunc: Function): DataToPersist {
    const dataToPersist = new DataToPersist();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    dataToPersist.addManyFiles(this.files.filter((f) => filterFunc(f.path)));
    dataToPersist.removeManyPaths(this.remove.filter((r) => filterFunc(r.path)));
    dataToPersist.addManySymlinks(this.symlinks.filter((s) => filterFunc(s.dest)));
    return dataToPersist;
  }
  async _persistFilesToFS() {
    const concurrency = concurrentIOLimit();
    return Bluebird.map(this.files, (file) => file.write(), { concurrency });
  }
  async _persistSymlinksToFS() {
    const concurrency = concurrentIOLimit();
    return Bluebird.map(this.symlinks, (symlink) => symlink.write(), { concurrency });
  }
  async _deletePathsFromFS() {
    const pathWithRemoveItsDirIfEmptyEnabled = this.remove.filter((p) => p.removeItsDirIfEmpty).map((p) => p.path);
    const restPaths = this.remove.filter((p) => !p.removeItsDirIfEmpty);
    if (pathWithRemoveItsDirIfEmptyEnabled.length) {
      await removeFilesAndEmptyDirsRecursively(pathWithRemoveItsDirIfEmptyEnabled);
    }
    const concurrency = concurrentIOLimit();
    return Bluebird.map(restPaths, (removePath) => removePath.persistToFS(), { concurrency });
  }
  _validateAbsolute() {
    // it's important to make sure that all paths are absolute before writing them to the
    // filesystem. relative paths won't work when running bit commands from an inner dir
    const validateAbsolutePath = (pathToValidate) => {
      if (!path.isAbsolute(pathToValidate)) {
        throw new Error(`DataToPersist expects ${pathToValidate} to be absolute, got relative`);
      }
    };
    this.files.forEach((file) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      validateAbsolutePath(file.path);
    });
    this.remove.forEach((removePath) => {
      validateAbsolutePath(removePath.path);
    });
    this.symlinks.forEach((symlink) => {
      validateAbsolutePath(symlink.src);
      validateAbsolutePath(symlink.dest);
    });
  }
  _validateRelative() {
    // it's important to make sure that all paths are relative before writing them to the capsule
    const validateRelativePath = (pathToValidate) => {
      if (path.isAbsolute(pathToValidate)) {
        throw new Error(`DataToPersist expects ${pathToValidate} to be relative, got absolute`);
      }
    };
    this.files.forEach((file) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      validateRelativePath(file.path);
    });
    this.remove.forEach((removePath) => {
      validateRelativePath(removePath.path);
    });
    this.symlinks.forEach((symlink) => {
      validateRelativePath(symlink.src);
      validateRelativePath(symlink.dest);
    });
  }
  _log() {
    if (this.remove.length) {
      const pathToDeleteStr = this.remove.map((r) => r.path).join('\n');
      logger.debug(`DateToPersist, paths-to-delete:\n${pathToDeleteStr}`);
    }
    if (this.files.length) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const filesToWriteStr = this.files.map((f) => f.path).join('\n');
      logger.debug(`DateToPersist, paths-to-write:\n${filesToWriteStr}`);
    }
    if (this.symlinks.length) {
      const symlinksStr = this.symlinks
        .map((symlink) => `src (existing): ${symlink.src}\ndest (new): ${symlink.dest}`)
        .join('\n');
      logger.debug(`DateToPersist, symlinks:\n${symlinksStr}`);
    }
  }
  _assertRelative(pathToCheck: string) {
    if (path.isAbsolute(pathToCheck)) {
      throw new Error(`DataToPersist expects ${pathToCheck} to be relative, but found it absolute`);
    }
  }
  /**
   * prevent adding a file which later on will cause an error "EEXIST: file already exists, mkdir {dirname}".
   * this happens one a file is a directory name of the other file.
   * e.g. adding these two files, will cause the error above: "bar/foo" and "bar"
   *
   * to check for this possibility, we need to consider two scenarios:
   * 1) "bar/foo" is there and now adding "bar" => check whether one of the files starts with "bar/"
   * 2) "bar" is there and now adding "bar/foo" => check whether this file "bar/foo" starts with one of the files with '/'
   * practically, it runs `("bar/foo".startsWith("bar/"))` for both cases above.
   */
  _throwForDirectoryCollision(file: AbstractVinyl) {
    const directoryCollision = this.files.find(
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      (f) => f.path.startsWith(`${file.path}${path.sep}`) || `${file.path}`.startsWith(`${f.path}${path.sep}`)
    );
    if (directoryCollision) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      throw new Error(`unable to add the file "${file.path}", because another file "${directoryCollision.path}" is going to be written.
one of them is a directory of the other one, and is not possible to have them both`);
    }
  }
}
