// @flow
import fs from 'fs-extra';
import path from 'path';
import AbstractVinyl from './abstract-vinyl';
import Symlink from '../../../links/symlink';

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
    await this._deletePaths();
    await this._persistFiles();
    await this._persistSymlinks();
  }
  async addBasePath(basePath: string) {
    this.files.forEach(file => file.updatePaths({ newBase: path.join(basePath, file.base) }));
    this.symlinks.forEach((symlink) => {
      symlink.src = path.join(basePath, symlink.src);
      symlink.dest = path.join(basePath, symlink.dest);
    });
    this.remove = this.remove.map(removePath => path.join(basePath, removePath));
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
}
