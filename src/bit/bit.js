/** @flow */
import * as path from 'path';
import BitFs from '../bit-fs';
import Example from './example';
import { Impl, Specs } from './sources';
import { Box } from '../box';
import { BitMap } from '../box/bit-maps';
import { mkdirp } from '../utils';
import BitNotFoundException from './exceptions/bit-not-found';

export type BitProps = {
  name: string,
  sig: string,
  impl: Impl,
  specs?: Specs,
  version?: number, 
  dependencies?: Bit[],
  env?: string,
  examples?: Example[],
};

export default class Bit {
  name: string;
  sig: string;
  impl: Impl;
  specs: Specs;
  version: number; 
  dependencies: Bit[];
  env: string;
  examples: Example[];

  constructor({ name, version = 1, env = 'node', sig, examples = [], dependencies = [] }: BitProps) {
    this.name = name;
    this.sig = sig;
    this.version = version;
    this.env = env;
    this.dependencies = dependencies;
    this.examples = examples;
  }

  getPath(bitMap: BitMap) {
    return path.join(bitMap.getPath(), this.name);
  }
  
  remove() {

  }

  write(map: BitMap): Promise<boolean> {
    return mkdirp(this.getPath(map))
      .then(this.impl.write)
      .then(this.specs.write);
  }

  static load(name: string, box: Box): Bit {
    const rawBit = BitFs.loadBit(name, box);
    if (!rawBit) throw new BitNotFoundException();
    return new Bit(rawBit);
  }
}
