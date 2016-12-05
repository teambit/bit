/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import Source from './source';
import { BitMap } from '../../box';
import implTpl from '../templates/impl.template';
import { BIT_IMPL_FILE_NAME } from '../../constants';

function composePath(...paths: Array<string>): string {
  // $FlowFixMe
  return path.join(...paths, BIT_IMPL_FILE_NAME); 
}

export default class Config extends Source {
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
