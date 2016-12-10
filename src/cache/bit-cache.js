/** @flow */
import * as path from 'path';
import * as fs from 'fs';
import Bit from '../bit';
import { GLOBAL_BIT_CACHE } from '../constants';

function composeDest(bit: Bit) {
  return path.join(GLOBAL_BIT_CACHE, bit.composeTarFileName());
}

export function set(bit: Bit, readStream: any) {
  return new Promise((resolve, reject) => {
    readStream
      .on('end', () => resolve(get(bit)))
      .on('error', reject);

    readStream.pipe(fs.createWriteStream(composeDest(bit)));
  });
} 

export function get(bit: Bit) {
  return new Promise((resolve, reject) => {
    fs.readFile(composeDest(bit), (err, res) => {
      if (err) return reject(err);
      return resolve(res);
    });
  });
} 
