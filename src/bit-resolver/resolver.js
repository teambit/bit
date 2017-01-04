/** @flow */
import path from 'path';
import fs from 'fs';
import BitId from '../bit-id';
import BitJson from '../bit-json';
import { DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME } from '../constants';
import EnvBitNotExist from './exceptions/env-bit-not-exists';

export default (bitsDir: string, bitId: BitId): Promise<any> => {
  return new Promise((resolve, reject) => {
    const box = bitId.box;
    const name = bitId.name;
    const scope = bitId.scope;
    const version = bitId.version;
    const bitPath = path.join(bitsDir, box, name, scope, version);
    
    if (!fs.existsSync(bitPath)) return reject(new EnvBitNotExist());

    return BitJson.load(bitPath)
    .then((bitJson) => {
      const distFile = path.join(bitPath, DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME);
      if (fs.existsSync(distFile)) {
        try {
          // $FlowFixMe
          return resolve(require(distFile));
        } catch (e) { return reject(e); }
      }
      
      const implFile = path.join(bitPath, bitJson.getImplBasename());
      try {
        // $FlowFixMe
        return resolve(require(implFile));
      } catch (e) { return reject(e); }
    });
  });
};
