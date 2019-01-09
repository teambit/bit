// @flow
import fs from 'fs-extra';
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
