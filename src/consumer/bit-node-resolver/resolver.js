/** @flow */
import path from 'path';
import fs from 'fs';
import BitJson from '../bit-json';
import { DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME } from '../../constants';
import EnvBitNotExist from './exceptions/env-bit-not-exists';

export default (bitPath: string, opts: ?{ onlyPath: ?bool }): any => {
  if (!fs.existsSync(bitPath)) throw new EnvBitNotExist();

  const distFile = path.join(bitPath, DEFAULT_DIST_DIRNAME, DEFAULT_BUNDLE_FILENAME);
  if (fs.existsSync(distFile)) {
    try {
      // $FlowFixMe
      return require(distFile);
    } catch (e) { throw e; }
  }
    
  const bitJson = BitJson.loadSync(bitPath);
  const implFile = path.join(bitPath, bitJson.getImplBasename());
  try {
    if (opts && opts.onlyPath) return implFile;
    // $FlowFixMe
    return require(implFile);
  } catch (e) { throw e; }
};
