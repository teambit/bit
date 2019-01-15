// @flow
import path from 'path';
import AbstractVinyl from './abstract-vinyl';
import Symlink from '../../../links/symlink';
import logger from '../../../logger/logger';
import RemovePath from './remove-path';
import removeFilesAndEmptyDirsRecursively from '../../../utils/fs/remove-files-and-empty-dirs-recursively';

export default class DataToPersist {
  files: AbstractVinyl[];
  symlinks: Symlink[];
  remove: RemovePath[];
  constructor(files: AbstractVinyl[], symlinks: Symlink[], remove: RemovePath[]) {
    this.files = files;
    this.symlinks = symlinks;
    this.remove = remove;
  }
  static makeInstance({
    files = [],
    symlinks = [],
    remove = []
  }: {
    files?: AbstractVinyl[],
    symlinks?: Symlink[],
    remove?: RemovePath[]
  }) {
    return new DataToPersist(files, symlinks, remove);
  }
  addFile(file: AbstractVinyl) {
    if (!file) throw new Error('failed adding an empty file into DataToPersist');
    if (!file.path) throw new Error('failed adding a file into DataToPersist as it does not have a path property');
    this.files.push(file);
  }
  removePath(pathToRemove: RemovePath) {
    if (!pathToRemove) throw new Error('failed adding a path to remove into DataToPersist');
    this.remove.push(pathToRemove);
  }
  addSymlink(symlink: Symlink) {
    this.symlinks.push(symlink);
  }
  merge(dataToPersist: ?DataToPersist) {
    if (!dataToPersist) return;
    this.files.push(...dataToPersist.files);
    this.remove.push(...dataToPersist.remove);
    this.symlinks.push(...dataToPersist.symlinks);
  }
  async persistAllToFS() {
    this._log();
    this._validate();
    await this._deletePathsFromFS();
    await this._persistFilesToFS();
    await this._persistSymlinksToFS();
  }
  async persistAllToCapsule() {
    throw new Error('not implemented yet');
  }
  addBasePath(basePath: string) {
    this.files.forEach((file) => {
      this._assertRelative(file.base);
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
  async _persistFilesToFS() {
    return Promise.all(this.files.map(file => file.write()));
  }
  async _persistSymlinksToFS() {
    return Promise.all(this.symlinks.map(symlink => symlink.write()));
  }
  async _deletePathsFromFS() {
    const pathWithRemoveItsDirIfEmptyEnabled = this.remove.filter(p => p.removeItsDirIfEmpty).map(p => p.path);
    const restPaths = this.remove.filter(p => !p.removeItsDirIfEmpty);
    await removeFilesAndEmptyDirsRecursively(pathWithRemoveItsDirIfEmptyEnabled);
    return Promise.all(restPaths.map(removePath => removePath.persistToFS()));
  }
  _validate() {
    // it's important to make sure that all paths are absolute before writing them to the
    // filesystem. relative paths won't work when running bit commands from an inner dir
    const validateAbsolutePath = (pathToValidate) => {
      if (!path.isAbsolute(pathToValidate)) {
        throw new Error(`DataToPersist expects ${pathToValidate} to be absolute, got relative`);
      }
    };
    this.files.forEach((file) => {
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
  _log() {
    if (this.remove.length) {
      const pathToDeleteStr = this.remove.map(r => r.path).join('\n');
      logger.debug(`DateToPersist, paths-to-delete:\n${pathToDeleteStr}`);
    }
    if (this.files.length) {
      const filesToWriteStr = this.files.map(f => f.path).join('\n');
      logger.debug(`DateToPersist, paths-to-write:\n${filesToWriteStr}`);
    }
    if (this.symlinks.length) {
      const symlinksStr = this.symlinks.map(symlink => `src: ${symlink.src}, dest: ${symlink.dest}`).join('\n');
      logger.debug(`DateToPersist, symlinks:\n${symlinksStr}`);
    }
  }
  _assertRelative(pathToCheck: string) {
    if (path.isAbsolute(pathToCheck)) {
      throw new Error(`DataToPersist expects ${pathToCheck} to be relative, but found it absolute`);
    }
  }
}
