const userHome = require('user-home');
const path = require('path');

const getDirectory = () => {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Bit');
  }

  return path.join(userHome, '.bit');
};

const getCacheDirectory = () => {
  if (process.platform === 'darwin') {
    return path.join(userHome, 'Library', 'Caches', 'Bit');
  }

  return getDirectory();
};

/**
 * cache root directory
 */
export const CACHE_ROOT = getCacheDirectory();

export const BITS_DIRNAME = 'components';

export const INLINE_BITS_DIRNAME = 'inline_components';

export const BIT_JSON_NAME = 'bit.json';

export const LATEST_VERSION = 'latest';

export const LOCAL_SCOPE_DIRNAME = '.bit';

export const DEFAULT_BOXNAME = 'global';

export const VERSION_DELIMITER = '::';

export const ID_DELIMITER = '/';

export const NO_PLUGIN_TYPE = 'none';

export const DEFAULT_BUNDLE_FILENAME = 'dist.js';

export const DEFAULT_DIST_DIRNAME = 'dist';

export const DEPENDENCIES_MAP_NAME = 'dependencies.json';
