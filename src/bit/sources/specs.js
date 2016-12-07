/** @flow */
import * as fs from 'fs';
import * as path from 'path';
import Source from './source';
import createSpecs from '../templates/specs.template';
import Bit from '../bit';
import { BIT_SPECS_FILE_NAME } from '../../constants';

function composePath(...paths: Array<string>): string {
  // $FlowFixMe
  return path.join(...paths, BIT_SPECS_FILE_NAME); 
}

export default class Specs extends Source {
  
  write(bitPath: string): Promise<any> {
    return new Promise((resolve, reject) =>
      fs.writeFile(composePath(bitPath), this.src, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      })
    );
  }
  
  static load(bitPath: string): Promise<?Specs> {
    return new Promise(resolve => 
      fs.readFile(composePath(bitPath), (err, data) => {
        if (err) return resolve(); // when cant load specs it's ok, just return undefined';
        return resolve(new Specs(data.toString()));
      })
    );
  }

  static create(bit: Bit) {
    return new Specs(createSpecs(bit)); 
  }
}
