import path from 'path';
import { MemoryFS } from '@teambit/any-fs';
import { AbstractVinyl } from 'bit-bin/dist/consumer/component/sources';
import { eol } from 'bit-bin/dist/utils';

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
      let dirPath = file.relativeDir;
      if (!dirPath.startsWith('/')) dirPath = path.join('/', dirPath);
      fs.mkdirpSync(dirPath);
      fs.writeFileSync(`/${file.relative}`, eol.auto(file.contents));
    });

    return fs;
  }
}
