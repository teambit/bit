/** @flow */
import BitFs from '../bit-fs';
import BoxFs from '../bit-fs/box-fs';
import Example from './example';
import { Box } from '../box';
import BitNotFoundException from './exceptions/bit-not-found';

export type BitProps = {
  name: string,
  path: string,
  sig: string,
  box: Box,
  version?: number, 
  dependencies?: Bit[],
  env?: string,
  examples?: Example[],
};

export default class Bit {
  name: string;
  version: number; 
  dependencies: Bit[];
  box: Box;
  path: string;
  env: string;
  sig: string;
  examples: Example[];

  constructor({ name, version = 1, env = 'node', path, box, sig, examples = [], dependencies = [] }: BitProps) {
    this.name = name;
    this.path = path;
    this.sig = sig;
    this.version = version;
    this.env = env;
    this.dependencies = dependencies;
    this.box = box;
    this.examples = examples;
  }

  static remove(box: Box, bitName: string): Bit {
    const removedBitPath = BitFs.removeBit(bitName, box);
    return new Bit({
      name: bitName,
      box,
      path: removedBitPath
    });
  }

  static load(name: string, box: Box): Bit {
    const rawBit = BitFs.loadBit(name, box);
    if (!rawBit) throw new BitNotFoundException();
    return new Bit(rawBit);
  }

  static create(box: Box, bitName: string): Bit {
    const path = BitFs.createBit(bitName, box);
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

  static listBits(box: Box): Bit[] {
    const inlineBits = BoxFs.listInlineNames(box.path).map(name => this.load(name, box));
    return inlineBits;
  }

  static edit() {
    
  }
}
