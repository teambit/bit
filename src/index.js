// const path = require('path');
const locateBitsDir = require('./consumer/locate-bits-directory');
// const loadBitFromBitsDir = require('./bit/load-bit');
const assert = require('assert').ok;
const R = require('ramda');
// const stackTrace = require('stack-trace');
const parseBitInlineId = require('./bit-id/parse-bit-inline-id');
// const BitNotExistsException = require('./exceptions/bit-not-exists');
const locateBitAssumingOnlyOne = require('./bit-locators/assume-only-one-locator');

const load = (bitId) => {
  assert(bitId, 'missing bit id');
  assert(R.is(String, bitId), 'bit id must be a string');

  let bitPath;
  const { bitName, boxName } = parseBitInlineId(bitId);
  try {
    const bitsDir = locateBitsDir(process.cwd());
    bitPath = locateBitAssumingOnlyOne(bitsDir, boxName, bitName);
  } catch (e) {
    // in case there are conflicts (e.g. two bits by the same name)
    // const callerDirectory = stackTrace.get()[1].getFileName();
    // const bitJson = getBitJson(callerDirectory);
    // bitPath = locateBitUsingBitJson(bitJson);
  }

  return require(bitPath); // eslint-disable-line
};

module.exports = load;
