// @flow
import createSymlinkOrCopy from '../utils/fs/create-symlink-or-copy';
import BitId from '../bit-id/bit-id';

export default class Symlink {
  src: string; // current existing path
  dest: string; // new symlink path
  componentId: ?BitId;
  constructor(src: string, dest: string, componentId?: BitId) {
    this.src = src;
    this.dest = dest;
    this.componentId = componentId;
  }
  write() {
    return createSymlinkOrCopy(this.src, this.dest, this.componentId ? this.componentId.toString() : null);
  }
  static makeInstance(src: string, dest: string, componentId?: BitId) {
    return new Symlink(src, dest, componentId);
  }
}
