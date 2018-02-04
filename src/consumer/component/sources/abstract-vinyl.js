/** @flow */
import path from 'path';
import fs from 'fs-extra';
import Vinyl from 'vinyl';
import logger from '../../../logger/logger';
import type { PathOsBased } from '../../../utils/path';

export default class AbstractVinyl extends Vinyl {
  base: PathOsBased;
  path: PathOsBased;
  relative: PathOsBased;

  // Update the base path and keep the relative value to be the same
  updatePaths({ newBase, newRelative, newCwd }: { newBase: string, newRelative?: string, newCwd?: string }) {
    const relative = newRelative || this.relative;
    if (newCwd) this.cwd = newCwd;
    this.base = newBase;
    this.path = path.join(this.base, relative);
  }

  write(writePath?: string, force?: boolean = true): Promise<any> {
    const filePath = writePath || this.path;
    logger.debug(`writing a file to the file-system at ${filePath}`);
    if (!force && fs.existsSync(filePath)) return Promise.resolve();
    return fs.outputFile(filePath, this.contents).then(() => filePath);
  }

  toReadableString() {
    return {
      relativePath: this.relative,
      content: this.contents.toString()
    };
  }

  static loadFromParsedString(parsedString: Object) {
    if (!parsedString) return undefined;
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
    if (!arr) return undefined;
    return arr.map(this.loadFromParsedString);
  }
}
