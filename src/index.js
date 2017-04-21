import { lifecycleHooks } from './importer/importer';

const assert = require('assert').ok;
const R = require('ramda');
const chalk = require('chalk');
const path = require('path');
const stackTrace = require('stack-trace');
const locateBitEnvironment = require('./consumer/locate-bit-environment');
const parseBitInlineId = require('bit-scope-client/bit-id').parseBitInlineId;
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

const load = (bitId, opts) => {
  assert(bitId, 'missing bit id');
  assert(R.is(String, bitId), 'bit id must be a string');
  const callerFile = stackTrace.get()[1].getFileName();
  const callerDirectory = path.dirname(callerFile);

  try {
    if (mockComponents[bitId]) return mockComponents[bitId];

    let loaded;
    const { bitName, boxName } = parseBitInlineId(bitId);
    const consumerPath = locateBitEnvironment(callerDirectory);
    const consumer = new Consumer(consumerPath);

    const strategies = [
      loadBitInline,
      loadBitAssumingOneScopeOneVersion,
      loadBitUsingBitJsons,
      loadLatestBitAssumingOneScope,
      loadBitMultipleScopes,
    ];

    for (let i = 0; i < strategies.length; i += 1) {
      const result = strategies[i](consumer, boxName, bitName, opts);
      if (result) {
        loaded = result;
        break;
      }
    }

    if (loaded) return loaded;
    throw new ComponentNotExistsException(bitId);
  } catch (e) {
    process.stderr.write(bitError(`please check the bit function call at - ${chalk.bold(callerFile)}`));
    if (e.code) {
      process.stderr.write(bitError(`\ncode: ${e.code}\n`));
    }
    process.stderr.write(bitError(e.stack));
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

load.loadExact = resolveFromFullId;

load.resolve = bitId => load(bitId, { pathOnly: true });

// TODO: get rid of the entire "load" object, expose only the lifeCycleHooks.
load.lifecycleHooks = lifecycleHooks;

module.exports = load;
