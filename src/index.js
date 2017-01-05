const R = require('ramda');
const locateConsumer = require('./consumer/locate-consumer');
const assert = require('assert').ok;
const parseBitInlineId = require('./bit-id/parse-bit-inline-id');
const Consumer = require('./consumer/consumer');

const {
  loadBitInline,
  loadBitAssumingOnlyOne,
  loadBitUsingBitJsons,
  // loadBitUsingDependenciesMap, @TODO - write strategy
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
    loadBitUsingBitJsons,
    // loadBitUsingDependenciesMap,
  ];

  for (let i = 0; i < strategies.length; i += 1) {
    const result = strategies[i](consumer, boxName, bitName);
    if (result) {
      loaded = result;
      break;
    }
  }

  if (loaded) return loaded;
  throw new Error(`could not find the required Bit - ${bitId}`);
};

module.exports = load;
