const path = require('path');
const locateRepo = require('./repo/locate-repo');
const loadBitFromBitsDir = require('./bit/load-bit');
const assert = require('assert').ok;
const R = require('ramda');
const stackTrace = require('stack-trace');

const BitNotExistsException = require('./exceptions/bit-not-exists');

const loadBitFromPath = (bitName, dirPath) => {
  const bitsDir = locateRepo(dirPath);
  try {
    return loadBitFromBitsDir(bitName, bitsDir);
  } catch (e) {
    if (e instanceof BitNotExistsException) {
      return loadBitFromPath(bitName, path.join(bitsDir, '../..'));
    }

    throw e;
  }
};

const load = (bitName) => {
  assert(bitName, 'missing bit name');
  assert(R.is(String, bitName), 'bit name must be a string');
  const bitPath = stackTrace.get()[1].getFileName();
  console.log('loadFrom: ', path.dirname(bitPath));

  return loadBitFromPath(bitName, path.dirname(bitPath));
};

module.exports = load;
