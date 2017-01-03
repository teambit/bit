/** @flow */
import * as path from 'path';
import * as fs from 'fs';
import { BitId } from '../bit-id';
import { CacheNotFound } from './exceptions';
import { GLOBAL_BIT_CACHE } from '../constants';

function composeDest(bit: BitId) {
  return path.join(GLOBAL_BIT_CACHE, bit.composeTarFileName());
}

export function set(bit: BitId, readStream: any) {
  return new Promise((resolve, reject) => {
    readStream
      .on('end', () => resolve(get(bit)))
      .on('error', reject);

    readStream.pipe(fs.createWriteStream(composeDest(bit)));
  });
} 

export function get(id: BitId) {
  return new Promise((resolve, reject) => {
    fs.readFile(composeDest(id), (err, res) => {
      if (err && err.code === 'ENOENT') return reject(new CacheNotFound(id));
      else if (err) return reject(err);
      return resolve({
        id,
        tarball: res
      });
    });
  });
} 
