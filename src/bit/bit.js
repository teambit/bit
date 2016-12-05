/** @flow */
import * as path from 'path';
import BitFs from '../bit-fs';
import fs from 'fs-extra';
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
  examples?: Example[]
};

export default class Bit {
  name: string;
  sig: string;
  impl: Impl;
  specs: Specs;
  version: number; 
  dependencies: Bit[];
  env: string;
  action: string;
  examples: Example[];

  constructor(bitProps: BitProps) {
    this.name = bitProps.name;
    this.sig = bitProps.sig || `${bitProps.name}()`;
    this.version = bitProps.version || 1;
    this.env = bitProps.env || 'node';
    this.dependencies = bitProps.dependencies || [];
    this.examples = bitProps.examples || [];
    this.impl = bitProps.impl || new Impl({ bit: this });
  }

  getPath(bitMap: BitMap) {
    return path.join(bitMap.getPath(), this.name);
  }

  validate() {

  }
  
  export() {
    return Promise.resolve();
    // this.validate();
    // this.push();
    // @TODO
  }

  write(map: BitMap): Promise<boolean> {
    const writeImpl = () => this.impl.write(map);

    return mkdirp(this.getPath(map))
      .then(writeImpl);
  }

  erase(map: BitMap): Promise<boolean> {
    return new Promise((resolve, reject) => {
      fs.remove(this.getPath(map), (err) => {
        if (err) return reject(err);
        return resolve(this);
      });
    });
  }

  static load(name: string, box: Box): Bit {
    const rawBit = BitFs.loadBit(name, box);
    if (!rawBit) throw new BitNotFoundException();
    return new Bit(rawBit);
  }
}
