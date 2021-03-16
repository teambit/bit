import { MemoryFS } from '@teambit/any-fs';
import type { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { auto } from '@teambit/legacy/dist/utils/eol';
import path from 'path';
import minimatch from 'minimatch';

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

  /**
   * filter all files using an array of glob patterns.
   */
  byGlob(patterns: string[]) {
    return this.files.filter((file) => {
      return patterns.find((pattern) => {
        const match = minimatch(file.relative, pattern);
        return match;
      });
    });
  }

  toObject() {}

  toJSON() {}

  static fromVinyls(files: AbstractVinyl[]) {
    const fs = new ComponentFS(files);
    files.forEach((file) => {
      let dirPath = file.relativeDir;
      if (!dirPath.startsWith('/')) dirPath = path.join('/', dirPath);
      fs.mkdirpSync(dirPath);
      fs.writeFileSync(`/${file.relative}`, auto(file.contents || ''));
    });

    return fs;
  }
}
