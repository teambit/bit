import path from 'path';
import { MemoryFS } from '@teambit/any-fs';
import { AbstractVinyl } from '../../consumer/component/sources';
import { eol } from '../../utils';

/**
 * The virtual component filesystem
 */
export default class ComponentFS extends MemoryFS {
  constructor(
    /**
     * array of all fs files.
     */
    readonly files: AbstractVinyl[]
  ) {
    super();
  }
  /**
   * hash to represent all contents within this filesystem volume.
   */
  get hash() {
    return '';
  }

  /**
   * filter all component files by regex.
   */
  byRegex(extension: RegExp): AbstractVinyl[] {
    return this.files.filter((file) => file.path.match(extension));
  }

  toObject() {}

  toJSON() {}

  static fromVinyls(files: AbstractVinyl[]) {
    const fs = new ComponentFS(files);
    files.forEach((file) => {
      let dirPath = file.relativeDir;
      if (!dirPath.startsWith('/')) dirPath = path.join('/', dirPath);
      fs.mkdirpSync(dirPath);
      fs.writeFileSync(`/${file.relative}`, eol.auto(file.contents || ''));
    });

    return fs;
  }
}
