/** @flow */
import BitFs from '../bit-fs';
import { Box } from '../box';

export default class Bit {
  name: string;
  version: string; 
  dependencies: Bit[];
  box: Box;
  path: string;
  env: string;
  sig: string;
  examples: string;

  constructor({ name, version, env, path, box, sig, examples, dependencies }: any) {
    this.name = name;
    this.version = version;
    this.env = env;
    this.dependencies = dependencies;
    this.path = path;
    this.box = box;
    this.sig = sig;
    this.examples = examples;
  }

  remove(box: Box, bitName: string) {
    const removedBitPath = BitFs.removeBit(bitName, box);
    return new Bit({
      name: bitName,
      box,
      path: removedBitPath
    });
  }

  static load(name: string, box: Box): ?Bit {
    const rawBit = BitFs.loadBit(name, box);
    if (!rawBit) return null;
    return new Bit(rawBit);
  }

  static create(box: Box, bitName: string): Bit {
    const path = BitFs.addBit(bitName, box);
    return new Bit({
      name: bitName,
      box,
      path
    });
  }

  static export(box: Box, bitName: string): Bit {
    const exportedPath = BitFs.exportBit(bitName, box);
    
    return new Bit({
      name: bitName,
      box,
      path: exportedPath
    });
  }
  static edit() {
    
  }
}
