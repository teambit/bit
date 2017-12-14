/** @flow */
import path from 'path';
import fs from 'fs-extra';
import Vinyl from 'vinyl';
import logger from '../../../logger/logger';

export default class AbstractVinyl extends Vinyl {
  // Update the base path and keep the relative value to be the same
  updatePaths({ newBase, newRelative, newCwd }: { newBase: string, newRelative?: string, newCwd?: string }) {
    const relative = newRelative || this.relative;
    if (newCwd) this.cwd = newCwd;
    this.base = newBase;
    this.path = path.join(this.base, relative);
  }

  write(path?: string, force?: boolean = true): Promise<any> {
    const filePath = path || this.path;
    logger.debug(`writing a file to the file-system at ${filePath}`);
    if (!force && fs.existsSync(filePath)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      fs.outputFile(filePath, this.contents, (err, res) => {
        if (err) return reject(err);
        return resolve(filePath);
      });
    });
  }

  toReadableString() {
    return {
      relativePath: this.relative,
      content: this.contents.toString()
    };
  }

  static loadFromParsedString(parsedString: Object) {
    if (!parsedString) return;
    const contents = Buffer.isBuffer(parsedString._contents)
      ? parsedString._contents
      : new Buffer(parsedString._contents);
    return {
      cwd: parsedString._cwd,
      path: parsedString.history[parsedString.history.length - 1],
      base: parsedString._base,
      contents
    };
  }

  static loadFromParsedStringArray(arr: Object[]) {
    if (!arr) return;
    return arr.map(this.loadFromParsedString);
  }
}
