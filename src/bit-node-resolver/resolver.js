/** @flow */
import path from 'path';
import fs from 'fs';
import BitJson from '../bit-json';
import { DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME } from '../constants';
import EnvBitNotExist from './exceptions/env-bit-not-exists';

export default (bitPath: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(bitPath)) return reject(new EnvBitNotExist());

    const distFile = path.join(bitPath, DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME);
    if (fs.existsSync(distFile)) {
      try {
        // $FlowFixMe
        return resolve(require(distFile));
      } catch (e) { return reject(e); }
    }
      
    return BitJson.load(bitPath)
    .then((bitJson) => {
      const implFile = path.join(bitPath, bitJson.getImplBasename());
      try {
        // $FlowFixMe
        return resolve(require(implFile));
      } catch (e) { return reject(e); }
    });
  });
};
