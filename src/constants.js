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

/**
 * global transpilers directory
 */
export const TRANSPILERS_DIR = path.join(CACHE_ROOT, 'transpilers');

export const BIT_DIR_NAME = 'bits';

export const LOCAL_BIT_JSON_NAME = '.bit.json';
