/** @flow */
import * as path from 'path';
import fs from 'fs-extra';
import { Impl, Specs } from './sources';
import BitJson from '../bit-json';
import { Consumer } from '../consumer';
import BitNotFoundException from './exceptions/bit-not-found';
import Bit from './bit';

export type PartialBitProps = {
  name: string;
  bitDir: string;
};

export default class PartialBit {
  name: string;
  bitDir: string; 

  constructor(bitProps: PartialBitProps) {
    this.name = bitProps.name;
    this.bitDir = bitProps.bitDir;
  }

  getPath() {
    return path.join(this.bitDir, this.name);
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
        bitDir: this.bitDir,
        bitJson,
        impl,
        specs
      })
    );
  }

  static resolveDir(name: string, consumer: Consumer): Promise<string> {
    return new Promise((resolve, reject) => {
      consumer.inline.includes(name)
        .then((isInline) => {
          if (isInline) return resolve(consumer.inline.getPath());
          return consumer.external.includes(name)
            .then((isExternal) => {
              if (isExternal) return resolve(consumer.external.getPath());
              return reject(new Error('bit not found error'));
            });
        });
    });
  }

  static load(name: string, consumer: Consumer): Promise<PartialBit> {  
    return this.resolveDir(name, consumer)
      .then((bitDir) => {
        return new PartialBit({ name, bitDir });
      });
  }
}
