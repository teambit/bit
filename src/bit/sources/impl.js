/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import Source from './source';
import createImpl from '../templates/impl.template';
import Bit from '../bit';
import { IMPL_FILE_NAME } from '../../constants';

function composePath(...paths: Array<string>): string {
  // $FlowFixMe
  return path.join(...paths, IMPL_FILE_NAME); 
}

export default class Impl extends Source {
  write(bitPath: string): Promise<any> {
    return new Promise((resolve, reject) =>
      fs.writeFile(composePath(bitPath), this.src, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      })
    );
  }
  
  static load(bitPath: string): Promise<Impl> {
    return new Promise((resolve, reject) => 
      fs.readFile(composePath(bitPath), (err, data) => {
        if (err) return reject(err);
        return resolve(new Impl(data.toString()));
      })
    );
  }

  static create(bit: Bit) {
    return new Impl(createImpl(bit)); 
  }
}
