import fs from 'fs-extra';
import * as path from 'path';
import { ComponentID } from '@teambit/component-id';
import { createLinkOrSymlink } from '@teambit/toolbox.fs.link-or-symlink';

export class Symlink {
  src: string; // current existing path
  dest: string; // new symlink path
  componentId: ComponentID | null | undefined;
  constructor(
    src: string,
    dest: string,
    componentId?: ComponentID,
    readonly avoidHardLink = false
  ) {
    this.src = src;
    this.dest = dest;
    this.componentId = componentId;
  }
  write() {
    return createLinkOrSymlink(this.src, this.dest, this.componentId?.toString(), this.avoidHardLink);
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
    } catch {}
    if (exists) {
      fs.removeSync(dest);
    }
    const dir = path.dirname(dest);
    fs.ensureDirSync(dir);
    return fs.symlinkSync(this.src, dest);
  }

  static makeInstance(src: string, dest: string, componentId?: ComponentID, avoidHardLink?: boolean) {
    return new Symlink(src, dest, componentId, avoidHardLink);
  }
}
