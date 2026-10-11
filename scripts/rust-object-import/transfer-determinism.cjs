// Qualification-only export lock IDs; the preload runs only in disposable CLI processes.
require('./merge-state-determinism.cjs');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const originalLoad = Module._load;
let ordinal = 0;
Module._load = function (request, parent, ...args) {
  const value = originalLoad.call(this, request, parent, ...args);
  if (!['crypto', 'node:crypto'].includes(request) || !/[\\/]export\.main\.runtime\.js$/.test(parent?.filename || ''))
    return value;
  return {
    ...value,
    randomBytes(size, callback) {
      if (size !== 8 || callback) return value.randomBytes(size, callback);
      return createHash('sha256')
        .update(`${process.env.BIT_SNAPSHOT_QUALIFICATION_SEED}:export:${ordinal++}`)
        .digest()
        .subarray(0, size);
    },
  };
};
