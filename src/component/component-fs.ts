import { MemoryFS } from '@teambit/any-fs';
import { AbstractVinyl } from '../consumer/component/sources';

/**
 * The virtual component filesystem
 */
export default class ComponentFS extends MemoryFS {
  constructor() {
    super({});
  }

  /**
   * hash to represent all contents within this filesystem volume.
   */
  get hash() {
    return '';
  }

  toObject() {}

  toJSON() {}

  static fromVinyls(files: AbstractVinyl[]) {
    const fs = new MemoryFS();
    files.forEach(file => {
      fs.writeFileSync(file.path, file.contents);
    });

    return fs;
  }
}
