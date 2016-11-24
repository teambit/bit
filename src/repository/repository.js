/** @flow */
import BitFs from '../bit-fs';
import Bit from '../bit';

export default class Repository {
  path: string;
  createdNow: boolean;

  static load(path: string, created: boolean): ?Repository {
    if (!created) {
      const repoPath = BitFs.locateRepository(path);
      if (!repoPath) return null;
      return new Repository(repoPath, false);
    }

    return new Repository(path, created);
  }

  constructor(path: string, createdNow: boolean) {
    this.path = path;
    this.createdNow = createdNow;
  }

  addBit(name: string): Bit {

  }

  static create(path: string): Repository {
    const created = BitFs.initiateRepository(path);
    return this.load(path, created); 
  }
}
