/** @Flow */
import path from 'path';
import { PLUGINS_DIR } from '../../constants';
import PluginNotFoundException from '../exceptions/plugin-not-found';

export default (moduleName) => {
  const moduleFullPath = path.join(PLUGINS_DIR, moduleName);
  try {
    return require(moduleFullPath);
  } catch (e) {
    throw new PluginNotFoundException(moduleName);
  }
};
