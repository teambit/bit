/** @Flow */
import path from 'path';
import { COMPILERS_DIR } from '../../constants';
import CompilerNotFoundException from '../exceptions/compiler-not-found';

export default (moduleName) => {
  const moduleFullPath = path.join(COMPILERS_DIR, moduleName);
  return new Promise((resolve, reject) => {
    try {
      const module = require(moduleFullPath);
      return resolve(module);
    } catch (e) {
      return reject(new CompilerNotFoundException(moduleName));
    }
  });
};
