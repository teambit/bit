/** @flow */
import BitFs from '../bit-fs';
import Bit from '../bit';
import BoxNotFound from './exceptions/box-not-found';

export default class Box {
  path: string;
  createdNow: boolean;

  static load(path: string, created: boolean): ?Box {
    if (!created) {
      const repoPath = BitFs.locateBox(path);
      if (!repoPath) throw new BoxNotFound();
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

  removeBit(name: string): Bit {
    return Bit.remove(this, name);
  }

  loadBit(name: string): Bit {
    return Bit.load(this, name);
  }

  exportBit(name: string): Bit {
    return Bit.export(this, name);
  }

  listBits(): Bit[] {
    return Bit.listBits(this);
  }

  static create(path: string): Box {
    const created = BitFs.initiateBox(path);
    const repo = this.load(path, created);
    if (!repo) throw new BoxNotFound();
    
    return repo; 
  }
}
