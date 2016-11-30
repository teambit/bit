/** @flow */
import BitFs from '../bit-fs';
import Bit from '../bit';

export default class Box {
  path: string;
  createdNow: boolean;

  static load(path: string, created: boolean): ?Box {
    if (!created) {
      const repoPath = BitFs.locateBox(path);
      if (!repoPath) return null;
      return new Box(repoPath, false);
    }

    return new Box(path, created);
  }

  constructor(path: string, createdNow: boolean) {
    this.path = path;
    this.createdNow = createdNow;
  }

  addBit(name: string, withTests: boolean = true): Bit {
    return Bit.create(this, name);
  }

  loadBit(name: string): Bit {
    return Bit.load(this, name);
  }

  static create(path: string): Box {
    const created = BitFs.initiateBox(path);
    const repo = this.load(path, created);
    if (!repo) throw new Error('could not find box...');
    
    return repo; 
  }
}
