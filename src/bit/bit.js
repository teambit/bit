/** @flow */
import * as path from 'path';
import fs from 'fs-extra';
import BitFs from '../bit-fs';
import Example from './example';
import { Impl, Specs } from './sources';
import { Box } from '../box';
import { BitMap } from '../box/bit-maps';
import { mkdirp } from '../utils';
import BitNotFoundException from './exceptions/bit-not-found';
import BitAlreadyExistsInternalyException from './exceptions/bit-already-exist-internaly';

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
    return new Promise((resolve, reject) => {
      return fs.stat(this.getPath(map), (err) => {
        if (!err) return reject(new BitAlreadyExistsInternalyException(this.name));
        return mkdirp(this.getPath(map))
        .then(() => this.impl.write(map))
        .then(resolve);
      });
    });
  }

  erase(map: BitMap): Promise<boolean> {
    return new Promise((resolve, reject) => {
      fs.stat(this.getPath(map), (err) => {
        if (err) reject(new BitNotFoundException());
        fs.remove(this.getPath(map), (e) => {
          if (err) return reject(e);
          return resolve(this);
        });
      });
    });
  }

  static resolveBitPath(name: string, box: Box): Promise<string> {
    return new Promise((resolve, reject) => {
      box.inline.includes(name)
        .then((isInline) => {
          if (isInline) return resolve(box.inline.getPath());
          return box.external.includes(name)
            .then((isExternal) => {
              if (isExternal) return resolve(box.external.getPath());
              return reject(new Error('bit not found error'));
            });
        });
    });
  }

  static load(name: string, box: Box): Promise<Bit> {
    function getBitFrom(bitPath) {
      return new Promise((resolve, reject) => {
        fs.readFile(bitPath, (err, data) => {
          if (err) return reject(err);
          return resolve(data.toString());
        });
      });
    }
    
    return this.resolveBitPath(name, box)
      .then(getBitFrom)
      .then((rawBit) => {
        if (!rawBit) throw new BitNotFoundException();
        return new Bit(rawBit);
      });
  }
}
