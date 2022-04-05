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
    const excludePatterns = patterns.filter((pattern) => pattern.startsWith('!'));
    const includePatterns = patterns.filter((pattern) => !pattern.startsWith('!'));

    const files = this.files.filter((file) => {
      const matchesSome = includePatterns.some((pattern) => {
        const match = minimatch(file.relative, pattern);
        return match;
      });
      const matchesAll = excludePatterns.every((pattern) => {
        const match = minimatch(file.relative, pattern);
        return match;
      });
      return matchesSome && matchesAll;
    });

    return files;
  }

  toObject() {
    return this.files.map((file) => {
      return {
        path: file.path,
        contents: file.contents,
      };
    });
  }

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
