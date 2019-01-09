// @flow
import fs from 'fs-extra';
import path from 'path';
import AbstractVinyl from './abstract-vinyl';
import Symlink from '../../../links/symlink';
import logger from '../../../logger/logger';

export default class DataToPersist {
  files: AbstractVinyl[];
  symlinks: Symlink[];
  remove: string[];
  constructor(files: AbstractVinyl[], symlinks: Symlink[], remove: string[]) {
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
    remove?: string[]
  }) {
    return new DataToPersist(files, symlinks, remove);
  }
  async persistAll() {
    this._log();
    await this._deletePaths();
    await this._persistFiles();
    await this._persistSymlinks();
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
    this.remove = this.remove.map((removePath) => {
      this._assertRelative(removePath);
      return path.join(basePath, removePath);
    });
  }
  async _persistFiles() {
    return Promise.all(this.files.map(file => file.write()));
  }
  async _persistSymlinks() {
    return Promise.all(this.symlinks.map(symlink => symlink.write()));
  }
  async _deletePaths() {
    return Promise.all(this.remove.map(pathToRemove => fs.remove(pathToRemove)));
  }
  _log() {
    if (this.remove.length) {
      const pathToDeleteStr = this.remove.join('\n');
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
