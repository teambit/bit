// @flow
import path from 'path';
import AbstractVinyl from './abstract-vinyl';
import Symlink from '../../../links/symlink';
import logger from '../../../logger/logger';
import RemovePath from './remove-path';

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
  async persistAllToFS() {
    this._log();
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
    return Promise.all(this.remove.map(removePath => removePath.persistToFS()));
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
