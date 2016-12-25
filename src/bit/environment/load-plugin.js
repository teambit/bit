/** @Flow */
import path from 'path';
import { PLUGINS_DIR } from '../../constants';
import PluginNotFoundException from '../exceptions/plugin-not-found';

export default (moduleName) => {
  const moduleFullPath = path.join(PLUGINS_DIR, moduleName);
  return new Promise((resolve, reject) => {
    try {
      const module = require(moduleFullPath);
      return resolve(module);
    } catch (e) {
      return reject(new PluginNotFoundException(moduleName));
    }
  });
};
