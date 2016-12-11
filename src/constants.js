const userHome = require('user-home');
const path = require('path');

function getDirectory() {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Bit');
  }

  return path.join(userHome, '.bit');
}

function getCacheDirectory() {
  if (process.platform === 'darwin') {
    return path.join(userHome, 'Library', 'Caches', 'Bit');
  }

  return getDirectory();
}

/**
 * cache root directory
 */
const CACHE_ROOT = getCacheDirectory();

/**
 * global transpilers directory
 */
const TRANSPILERS_DIR = path.join(CACHE_ROOT, 'transpilers');

module.exports = {
  TRANSPILERS_DIR,
};
