/** @flow */
import * as path from 'path';
import glob from 'glob';
import fs from 'fs';
import Box from '../box';
import { mkdirp } from '../../utils';
import { BIT_DIR_NAME } from '../../constants';

function composePath(pathPart: string) {
  return path.join(pathPart, BIT_DIR_NAME);
}

export default class Drawer {
  box: Box;

  constructor(box: Box) {
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
}
