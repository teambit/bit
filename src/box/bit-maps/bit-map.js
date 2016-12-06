/** @flow */
import * as path from 'path';
import glob from 'glob';
import fs from 'fs';
import Bit from '../../bit';
import Box from '../box';
import { mkdirp } from '../../utils';
import { BIT_DIR_NAME } from '../../constants';

function composePath(pathPart: string) {
  return path.join(pathPart, BIT_DIR_NAME);
}

export default class BitMap extends Map<string, Bit> {
  box: Box;

  constructor(box: Box, bits: [string, Bit][] = []) {
    super(bits);
    this.box = box;
  }
  
  getPath() {
    return composePath(this.box.path);
  }

  add(bit: Bit) {
    return bit.write(this)
    .then(() => this.set(bit.name, bit));
  }

  list() {
    return new Promise((resolve, reject) =>
      glob(path.join(this.getPath(), '/*'), (err, files) => {
        resolve(files.map(fullPath => path.basename(fullPath)));
        reject(err);
      })
    );
  }
  
  listWithMeta() {
    return this.list().then(bitList =>
      bitList.map(bitName => Bit.load(bitName, this.box, { withMeta: true }))
    );
  }

  remove(bit: Bit) {
    return bit.erase(this).then(() => { this.delete(bit.name); });
  }

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
