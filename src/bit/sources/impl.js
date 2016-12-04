/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import Source from './source';
import { BitMap } from '../../box';
import implTpl from '../templates/impl.template';

function composePath(...paths: Array<string>): string {
  // $FlowFixMe
  return path.join(...paths, 'impl.js'); 
}

export default class Impl extends Source {
  write(map: BitMap): Promise<boolean> {
    return new Promise((resolve, reject) => {
      fs.writeFile(composePath(map.getPath(), this.bit.name), this.getTemplate(), (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    });
  }

  getTemplate(): string {
    return implTpl(this.bit);
  }
}
