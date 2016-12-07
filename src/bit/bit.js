/** @flow */
import * as path from 'path';
import fs from 'fs-extra';
import Example from './example';
import { Impl, Specs } from './sources';
import BitJson from '../box/bit-json/bit-json';
import { Box } from '../box';
import { BitMap } from '../box/bit-maps';
import { mkdirp } from '../utils';
import BitNotFoundException from './exceptions/bit-not-found';
import BitAlreadyExistsInternalyException from './exceptions/bit-already-exist-internaly';
import { HIDDEN_BIT_JSON } from '../constants';

export type BitProps = {
  name: string,
  bitMap: BitMap; 
  sig?: string,
  impl?: Impl,
  bitJson?: BitJson;
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
  bitJson: BitJson;
  version: number; 
  dependencies: Bit[];
  env: string;
  action: string;
  examples: Example[];
  bitMap: BitMap; 

  constructor(bitProps: BitProps) {
    this.name = bitProps.name;
    this.sig = bitProps.sig || `${bitProps.name}()`;
    this.version = bitProps.version || 1;
    this.env = bitProps.env || 'node';
    this.dependencies = bitProps.dependencies || [];
    this.examples = bitProps.examples || [];
    this.impl = bitProps.impl;
    this.specs = bitProps.specs;
    this.bitJson = bitProps.bitJson;
    this.bitMap = bitProps.bitMap;
  }

  getPath() {
    return path.join(this.bitMap.getPath(), this.name);
  }

  // getMetaData(bitMap: BitMap): Promise<Bit> {
  //   return new Promise((resolve, reject) => {
  //     fs.readFile(path.join(this.getPath(bitMap), HIDDEN_BIT_JSON), (err, data) => {
  //       if (err) return reject(err);
  //       return resolve(data.toString());
  //     });
  //     return resolve(this);
  //   });
  // }

  validate(): boolean {
    return this.bitJson.validate();
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
        const bitPath = this.getPath(map); 

        return mkdirp(bitPath)
        .then(() => this.impl ? this.impl.write(bitPath, this) : Impl.create(this).write(bitPath, this))
        .then(() => this.bitJson ? this.bitJson.write.write({ dirPath: bitPath }) : 
          BitJson.create({ hidden: true }).write({ dirPath: bitPath }))
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

  loadBitJson(): Promise<Bit> {
    return BitJson.load(this.getPath(), true)
    .then((bitJson) => {
      this.bitJson = bitJson;
      return this;
    });
  }

  loadImpl(): Promise<Bit> {
    return Impl.load(this.getPath())
    .then((impl) => {
      this.impl = impl;
      return this;
    });
  }

  loadSpecs(): Promise<Bit> {
    return Specs.load(this.getPath())
    .then((specs) => {
      this.specs = specs;
      return this;
    });
  }

  static resolveBitMap(name: string, box: Box): Promise<BitMap> {
    return new Promise((resolve, reject) => {
      box.inline.includes(name)
        .then((isInline) => {
          if (isInline) return resolve(box.inline);
          return box.external.includes(name)
            .then((isExternal) => {
              if (isExternal) return resolve(box.external);
              return reject(new Error('bit not found error'));
            });
        });
    });
  }

  static load(name: string, box: Box): Promise<Bit> {  
    return this.resolveBitMap(name, box)
      .then((bitMap) => {
        return new Bit({ name, bitMap });
      });
  }
}
