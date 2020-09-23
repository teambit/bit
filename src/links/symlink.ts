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
  constructor(src: string, dest: string, componentId?: BitId) {
    this.src = src;
    this.dest = dest;
    this.componentId = componentId;
  }
  write() {
    this._throwForMissingDistOutsideComponent();
    return createSymlinkOrCopy(this.src, this.dest, this.componentId ? this.componentId.toString() : null);
  }

  writeWithNativeFS() {
    const dest = this.dest;
    this._throwForMissingDistOutsideComponent();
    const exists = fs.pathExistsSync(dest);
    if (exists) {
      fs.unlinkSync(dest);
    }
    const dir = path.dirname(dest);
    fs.ensureDirSync(dir);
    return fs.symlinkSync(this.src, dest);
  }

  static makeInstance(src: string, dest: string, componentId?: BitId) {
    return new Symlink(src, dest, componentId);
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
