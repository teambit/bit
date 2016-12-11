/** @Flow */
import path from 'path';
import { TRANSPILERS_DIR } from '../../constants';
import TranspilerNotFoundException from '../exceptions/transpiler-not-found';

export default (moduleName) => {
  const moduleFullPath = path.join(TRANSPILERS_DIR, moduleName);
  return new Promise((resolve, reject) => {
    try {
      const module = require(moduleFullPath);
      return resolve(module);
    } catch (e) {
      return reject(new TranspilerNotFoundException(moduleName));
    }
  });
};
