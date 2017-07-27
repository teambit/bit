/** @flow */
import path from 'path';
import fs from 'fs-extra';
import Vinyl from 'vinyl';

export default class AbstractVinyl extends Vinyl {
  // Update the base path and keep the relative value to be the same
  updatePaths({newBase, newRelative, newCwd}: {newBase: string, newRelative?: string, newCwd?: string}){
    const relative = newRelative || this.relative;
    if (newCwd) this.cwd = newCwd
    this.base = newBase;
    this.path = path.join(this.base, relative);
  }

  write(path?: string, force?: boolean = true): Promise<any> {
    const filePath = path || this.path;
    if (!force && fs.existsSync(filePath)) return Promise.resolve();
    return fs.outputFile(filePath, this.contents, (err, res) => {
      if (err) return Promise.reject(err);
      return Promise.resolve(res);
    });
  }
}
