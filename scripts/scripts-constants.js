// Put some constants required by different scripts here
// because the regular constants has import syntax which might not be supported
const { platform } = require('process');
const path = require('path');

const DEFAULT_BINARY_FILE_NAMES = {
  linux: 'bit-bin',
  win32: 'bit-bin.exe',
  darwin: 'bit-bin'
};
const BINARY_FILE_NAMES = {
  linux: 'bit-bin-linux',
  win32: 'bit-bin-win.exe',
  darwin: 'bit-bin-macos'
};

const BINARY_FINAL_FILE_NAME = platform === 'win32' ? 'bit.exe' : 'bit';

const IS_WINDOWS = platform === 'win32';
const BINARY_DIR = path.join(__dirname, '..', 'releases');
const CURRENT_DEFAULT_BINARY_FILE_NAME = DEFAULT_BINARY_FILE_NAMES[platform];
const CURRENT_BINARY_FILE_NAME = BINARY_FILE_NAMES[platform];
const CURRENT_DEFAULT_BINARY_PATH = path.join(BINARY_DIR, CURRENT_DEFAULT_BINARY_FILE_NAME);
const CURRENT_BINARY_PATH = path.join(BINARY_DIR, CURRENT_BINARY_FILE_NAME);

module.exports = {
  platform,
  DEFAULT_BINARY_FILE_NAMES,
  BINARY_FILE_NAMES,
  BINARY_FINAL_FILE_NAME,
  CURRENT_DEFAULT_BINARY_FILE_NAME,
  CURRENT_BINARY_FILE_NAME,
  BINARY_DIR,
  CURRENT_DEFAULT_BINARY_PATH,
  CURRENT_BINARY_PATH,
  IS_WINDOWS
};
