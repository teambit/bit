/** @flow */
import fs from 'fs-extra';
import path from 'path';
import * as bitCache from '../cache';
import { pack } from '../tar';
import { Impl, Specs } from './sources';
import BitJson from '../bit-json';
import BitNotFoundException from './exceptions/bit-not-found';
import Bit from './bit';

export type PartialBitProps = {
  name: string;
  bitDir: string;
  bitJson: BitJson;
};

export default class PartialBit {
  name: string;
  bitDir: string;
  bitJson: BitJson;

  constructor(bitProps: PartialBitProps) {
    this.name = bitProps.name;
    this.bitDir = bitProps.bitDir;
    this.bitJson = bitProps.bitJson;
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

  getArchiveFiles() {
    const bitPath = this.getPath();

    return [
      `${bitPath}/${this.bitJson.impl}`,
      `${bitPath}/${this.bitJson.spec}`,
      this.bitJson.getPath(bitPath)
    ];
  }
  
  composeTarFileName() {
    return `${this.name}_${this.bitJson.version}.tar`;
  }

  toTar() {
    return bitCache.get(this)
      .catch((err) => {
        if (err.code !== 'ENOENT') throw err;
        return bitCache.set(this, pack(this.getArchiveFiles())); 
      });
  }

  loadFull(): Promise<Bit> {
    return Promise.all([
      Impl.load(this.getPath()),
      Specs.load(this.getPath())
    ]).then(([impl, specs ]) => 
      new Bit({
        name: this.name,
        bitDir: this.bitDir,
        bitJson: this.bitJson,
        impl,
        specs
      })
    );
  }

  static load(name: string, bitDir: string): Promise<PartialBit> {  
    return BitJson.load(bitDir)
      .then(bitJson => new PartialBit({ name, bitDir, bitJson }));
  }
}
