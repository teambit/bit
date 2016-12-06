/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import Source from './source';
import createImpl from '../templates/impl.template';
import Bit from '../bit';
import { BIT_IMPL_FILE_NAME } from '../../constants';

function composePath(...paths: Array<string>): string {
  // $FlowFixMe
  return path.join(...paths, BIT_IMPL_FILE_NAME); 
}

export default class Impl extends Source {

  write(bitPath: string, bit?: Bit): Promise<any> {
    return new Promise((resolve, reject) =>
      fs.writeFile(composePath(bitPath), bit ? this.getTemplate(bit): this.src, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      })
    );
  }
  
  static load(bitPath: string): Promise<Impl> {
    return new Promise((resolve, reject) => 
      fs.readFile(composePath(bitPath), (err, data) => {
        if (err) return reject(err);
        return resolve(new Impl({ src: data.toString() }));
      })
    );
  }

  getTemplate(bit: Bit): string {
    return createImpl(bit);
  }
}
