/** @flow */
import * as path from 'path';
import fs from 'fs-extra';
import { Impl, Specs } from './sources';
import BitJson from '../box/bit-json/bit-json';
import { Box } from '../box';
import { BitMap } from '../box/bit-maps';
import BitNotFoundException from './exceptions/bit-not-found';
import Bit from './bit';

export type PartialBitProps = {
  name: string,
  bitMap: BitMap; 
};

export default class PartialBit {
  name: string;
  bitMap: BitMap; 

  constructor(bitProps: PartialBitProps) {
    this.name = bitProps.name;
    this.bitMap = bitProps.bitMap;
  }

  getPath() {
    return path.join(this.bitMap.getPath(), this.name);
  }

  erase(): Promise<PartialBit> {
    return new Promise((resolve, reject) => {
      return fs.stat(this.getPath(), (err) => {
        if (err) reject(new BitNotFoundException());
        return fs.remove(this.getPath(), (e) => {
          if (e) return reject(e);
          return resolve(this);
        });
      });
    });
  }

  loadFull(): Promise<Bit> {
    return Promise.all([
      BitJson.load(this.getPath(), true),
      Impl.load(this.getPath()),
      Specs.load(this.getPath())
    ]).then(([ bitJson, impl, specs ]) => 
      new Bit({
        name: this.name,
        bitMap: this.bitMap,
        bitJson,
        impl,
        specs
      })
    );
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

  static load(name: string, box: Box): Promise<PartialBit> {  
    return this.resolveBitMap(name, box)
      .then((bitMap) => {
        return new PartialBit({ name, bitMap });
      });
  }
}
