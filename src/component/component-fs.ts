import { MemoryFS } from '@teambit/any-fs';
import { AbstractVinyl } from '../consumer/component/sources';
import { eol } from '../utils';

/**
 * The virtual component filesystem
 */
export default class ComponentFS extends MemoryFS {
  /**
   * hash to represent all contents within this filesystem volume.
   */
  get hash() {
    return '';
  }

  toObject() {}

  toJSON() {}

  static fromVinyls(files: AbstractVinyl[]) {
    const fs = new ComponentFS();
    files.forEach(file => {
      // fs.mkdirpSync(file.relativeDir);
      fs.writeFileSync(`/${file.relative}`, eol.auto(file.contents));
    });

    return fs;
  }
}
