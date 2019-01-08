// @flow
import AbstractVinyl from './abstract-vinyl';
import Symlink from '../../../links/symlink';

export default class DataToPersist {
  files: AbstractVinyl[];
  symlinks: Symlink[];
  constructor(files: AbstractVinyl[], symlinks: Symlink[]) {
    this.files = files;
    this.symlinks = symlinks;
  }
  static makeInstance({ files, symlinks }: { files: AbstractVinyl[], symlinks: Symlink[] }) {
    return new DataToPersist(files, symlinks);
  }
  async persistAll() {
    await this._persistFiles();
    await this._persistSymlinks();
  }
  async _persistFiles() {
    return Promise.all(this.files.map(file => file.write()));
  }
  async _persistSymlinks() {
    return Promise.all(this.symlinks.map(symlink => symlink.write()));
  }
}
