import fs from 'fs-extra';
import * as path from 'path';

import BitId from '../bit-id/bit-id';
import ShowDoctorError from '../error/show-doctor-error';
import createSymlinkOrCopy from '../utils/fs/create-symlink-or-copy';

export default class Symlink {
  src: string; // current existing path
  dest: string; // new symlink path
  componentId: BitId | null | undefined;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  forDistOutsideComponentsDir: boolean;
  constructor(
    src: string,
    dest: string,
    componentId?: BitId,
    forDistOutsideComponentsDir = false,
    private avoidHardLink = false
  ) {
    this.src = src;
    this.dest = dest;
    this.componentId = componentId;
    this.forDistOutsideComponentsDir = forDistOutsideComponentsDir;
  }
  write() {
    this._throwForMissingDistOutsideComponent();
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
    this._throwForMissingDistOutsideComponent();
    // TODO: change to fs.lstatSync(dest, {throwIfNoEntry: false});
    // TODO: this requires to upgrade node to v15.3.0 to have the throwIfNoEntry property (maybe upgrade fs-extra will work as well)
    // TODO: we don't use fs.pathExistsSync since it will return false in case the dest is a symlink which will result error on write
    // const exists = fs.pathExistsSync(dest);
    let exists;
    try {
      exists = fs.lstatSync(dest);
      // eslint-disable-next-line no-empty
    } catch (e) {}
    if (exists) {
      fs.removeSync(dest);
    }
    const dir = path.dirname(dest);
    fs.ensureDirSync(dir);
    return fs.symlinkSync(this.src, dest);
  }

  static makeInstance(src: string, dest: string, componentId?: BitId, avoidHardLink?: boolean) {
    return new Symlink(src, dest, componentId, undefined, avoidHardLink);
  }
  _throwForMissingDistOutsideComponent() {
    if (!this.forDistOutsideComponentsDir) return;
    const srcExists = fs.existsSync(this.src);
    if (!srcExists) {
      const componentId = this.componentId ? this.componentId.toString() : '';
      throw new ShowDoctorError(`unable to link ${componentId}, the file ${this.src} is missing from the filesystem.
it happens when the "dist" directory is set to be outside the components directory, either by changing this settings later or by cloning the project without the dist directory
to rebuild the "dist" directory for all components, please run "bit import --merge".`);
    }
  }
}
