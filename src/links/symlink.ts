import fs from 'fs-extra';
import * as path from 'path';

import BitId from '../bit-id/bit-id';
import createSymlinkOrCopy from '../utils/fs/create-symlink-or-copy';

export default class Symlink {
  src: string; // current existing path
  dest: string; // new symlink path
  componentId: BitId | null | undefined;
  constructor(src: string, dest: string, componentId?: BitId, private avoidHardLink = false) {
    this.src = src;
    this.dest = dest;
    this.componentId = componentId;
  }
  write() {
    return createSymlinkOrCopy(
      this.src,
      this.dest,
      this.componentId ? this.componentId.toString() : null,
      this.avoidHardLink
    );
  }

  /**
   * @deprecated use write() instead, it was fixed to use the native fs.symlinkSync for non-windows
   */
  writeWithNativeFS() {
    const dest = this.dest;
    // TODO: change to fs.lstatSync(dest, {throwIfNoEntry: false});
    // TODO: this requires to upgrade node to v15.3.0 to have the throwIfNoEntry property (maybe upgrade fs-extra will work as well)
    // TODO: we don't use fs.pathExistsSync since it will return false in case the dest is a symlink which will result error on write
    // const exists = fs.pathExistsSync(dest);
    let exists;
    try {
      exists = fs.lstatSync(dest);
      // eslint-disable-next-line no-empty
    } catch (e: any) {}
    if (exists) {
      fs.removeSync(dest);
    }
    const dir = path.dirname(dest);
    fs.ensureDirSync(dir);
    return fs.symlinkSync(this.src, dest);
  }

  static makeInstance(src: string, dest: string, componentId?: BitId, avoidHardLink?: boolean) {
    return new Symlink(src, dest, componentId, avoidHardLink);
  }
}
