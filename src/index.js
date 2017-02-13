const assert = require('assert').ok;
const R = require('ramda');
const chalk = require('chalk');
const path = require('path');
const mock = require('mock-require');
const stackTrace = require('stack-trace');
const locateConsumer = require('./consumer/locate-consumer');
const parseBitInlineId = require('./bit-id/parse-bit-inline-id');
const Consumer = require('./consumer/consumer');
const { DEFAULT_BOXNAME } = require('./constants');
const resolveFromFullId = require('./bit-resolver/resolve-from-full-id');
const { ComponentNotExistsException } = require('./exceptions');

function bitError(message) {
  return chalk.red(
    message.split('\n') // eslint-disable-line
    .map(m => `bit ERR! ${m}`)
    .join('\n') + '\n',
  );
}

const {
  loadBitInline,
  loadBitAssumingOneScopeOneVersion,
  loadBitUsingBitJsons,
  loadLatestBitAssumingOneScope,
  loadBitMultipleScopes,
} = require('./strategies');

const mockComponents = {};

const load = (bitId) => {
  assert(bitId, 'missing bit id');
  assert(R.is(String, bitId), 'bit id must be a string');
  try {
    const callerFile = stackTrace.get()[1].getFileName();
    const callerDirectory = path.dirname(callerFile);

    if (mockComponents[bitId]) return mockComponents[bitId];

    let loaded;
    const { bitName, boxName } = parseBitInlineId(bitId);
    const consumerPath = locateConsumer(callerDirectory);
    const consumer = new Consumer(consumerPath);

    const strategies = [
      loadBitInline,
      loadBitAssumingOneScopeOneVersion,
      loadBitUsingBitJsons,
      loadLatestBitAssumingOneScope,
      loadBitMultipleScopes,
    ];

    for (let i = 0; i < strategies.length; i += 1) {
      const result = strategies[i](consumer, boxName, bitName);
      if (result) {
        loaded = result;
        break;
      }
    }

    if (loaded) return loaded;
    throw new ComponentNotExistsException(bitId, callerFile);
  } catch (e) {
    process.stderr.write(bitError(e.stack));
    if (e.code) process.stderr.write(bitError(`code: ${e.code}`));
    return undefined;
  }
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
