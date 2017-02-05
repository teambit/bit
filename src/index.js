const R = require('ramda');
const locateConsumer = require('./consumer/locate-consumer');
const assert = require('assert').ok;
const parseBitInlineId = require('./bit-id/parse-bit-inline-id');
const Consumer = require('./consumer/consumer');
const mock = require('mock-require');
const { DEFAULT_BOXNAME } = require('./constants');
const resolveFromFullId = require('./bit-resolver/resolve-from-full-id');

const {
  loadBitInline,
  loadBitAssumingOnlyOne,
  loadBitUsingBitJsons,
  // loadBitUsingDependenciesMap, @TODO - write strategy
} = require('./strategies');

const mockComponents = {};

const load = (bitId) => {
  assert(bitId, 'missing bit id');
  assert(R.is(String, bitId), 'bit id must be a string');

  if (mockComponents[bitId]) return mockComponents[bitId];

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

load.mockComponents = (components) => {
  for (const id in components) { // eslint-disable-line
    const { bitName, boxName } = parseBitInlineId(id);
    if (boxName === DEFAULT_BOXNAME) {
      mockComponents[bitName] = components[id];
      mockComponents[`${boxName}/${bitName}`] = components[id];
    } else {
      mockComponents[id] = components[id];
    }
  }
};

load.mockModules = (modules) => {
  for (const m in modules) { // eslint-disable-line
    mock(m, modules[m]);
  }
};

load.loadExact = resolveFromFullId;

module.exports = load;
