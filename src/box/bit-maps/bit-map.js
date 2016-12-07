/** @flow */
import * as path from 'path';
import glob from 'glob';
import fs from 'fs';
import Box from '../box';
import { mkdirp } from '../../utils';
import { BIT_DIR_NAME } from '../../constants';
import PartialBit from '../../bit/partial-bit';

function composePath(pathPart: string) {
  return path.join(pathPart, BIT_DIR_NAME);
}

export default class BitMap extends Map<string, PartialBit> {
  box: Box;

  constructor(box: Box, bits: [string, PartialBit][] = []) {
    super(bits);
    this.box = box;
  }
  
  getPath() {
    return composePath(this.box.path);
  }

  list() {
    return new Promise((resolve, reject) =>
      glob(path.join(this.getPath(), '/*'), (err, files) => {
        resolve(files.map(fullPath => path.basename(fullPath)));
        reject(err);
      })
    );
  }

  // remove(bit: PartialBit): Promise<PartialBit> {
  //   return bit.erase(this)
  //   .then(() => { 
  //     this.delete(bit.name);
  //     return bit;
  //   });
  // }

  includes(bitName: string) {
    return new Promise((resolve) => {
      return fs.stat(path.join(this.getPath(), bitName), (err) => {
        if (err) return resolve(false);
        return resolve(true);
      });
    });
  }

  ensureDir(): Promise<boolean> {
    return mkdirp(this.getPath());
  }

  static load(box: Box): BitMap {
    return new BitMap(box, []);
  }
}
