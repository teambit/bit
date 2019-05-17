// @flow
import fs from 'fs-extra';
import createSymlinkOrCopy from '../utils/fs/create-symlink-or-copy';
import BitId from '../bit-id/bit-id';
import GeneralError from '../error/general-error';

export default class Symlink {
  src: string; // current existing path
  dest: string; // new symlink path
  componentId: ?BitId;
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
  static makeInstance(src: string, dest: string, componentId?: BitId) {
    return new Symlink(src, dest, componentId);
  }
  _throwForMissingDistOutsideComponent() {
    if (!this.forDistOutsideComponentsDir) return;
    const srcExists = fs.existsSync(this.src);
    if (!srcExists) {
      const componentId = this.componentId ? this.componentId.toString() : '';
      throw new GeneralError(`unable to link ${componentId}, the file ${this.src} is missing from the filesystem.
it happens when the "dist" directory is set to be outside the components directory, either by changing this settings later or by cloning the project without the dist directory
to rebuild the "dist" directory for all components, please run "bit import --merge".`);
    }
  }
}
