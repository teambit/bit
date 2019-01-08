// @flow
import createSymlinkOrCopy from '../utils/fs/create-symlink-or-copy';

export default class Symlink {
  src: string;
  dest: string;
  componentId: ?string;
  constructor(src: string, dest: string, componentId?: string) {
    this.src = src;
    this.dest = dest;
    this.componentId = componentId;
  }
  write() {
    return createSymlinkOrCopy(this.src, this.dest, this.componentId);
  }
  static makeInstance(src: string, dest: string, componentId?: string) {
    return new Symlink(src, dest, componentId);
  }
}
