// const path = require('path');
// const BitNotExistsException = require('./exceptions/bit-not-exists');
// const loadBitFromBitsDir = require('./bit/load-bit');

const R = require('ramda');
const locateConsumer = require('./consumer/locate-consumer');
const assert = require('assert').ok;
const parseBitInlineId = require('./bit-id/parse-bit-inline-id');
const Consumer = require('./consumer/consumer');

const {
  loadBitInline,
  loadBitAssumingOnlyOne,
  loadBitUsingDependenciesMap,
} = require('./strategies');

const load = (bitId) => {
  assert(bitId, 'missing bit id');
  assert(R.is(String, bitId), 'bit id must be a string');

  let loaded;
  const { bitName, boxName } = parseBitInlineId(bitId);
  const consumerPath = locateConsumer(process.cwd());
  const consumer = new Consumer(consumerPath);

  const strategies = [
    loadBitInline,
    loadBitAssumingOnlyOne,
    loadBitUsingDependenciesMap,
  ];

  for (let i = 0; i < strategies; i += 1) {
    const result = strategies[i](consumer, boxName, bitName);
    if (result) {
      loaded = result;
      break;
    }
  }

  // const locateBitAssumingOnlyOne = require('./bit-locators/assume-only-one-locator');
  // const stackTrace = require('stack-trace');
  // try {
  //   bitPath = locateBitAssumingOnlyOne(bitsDir, boxName, bitName);
  // } catch (e) {
  //   // in case there are conflicts (e.g. two bits by the same name)
  //   const callerDirectory = stackTrace.get()[1].getFileName();
  // }

  if (loaded) return loaded;
  throw new Error(`could not find the required Bit - ${bitId}`);
};

module.exports = load;
