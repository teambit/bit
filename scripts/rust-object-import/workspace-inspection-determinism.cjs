// Qualification-only deterministic identities; enabled exclusively in disposable CLI processes.
const assert = require('node:assert/strict');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const seed = process.env.BIT_INSPECTION_QUALIFICATION_SEED;
const clock = Number(process.env.BIT_INSPECTION_QUALIFICATION_CLOCK);
assert.ok(seed && Number.isSafeInteger(clock));
Date.now = () => clock;
const originalLoad = Module._load;
let ordinal = 0;
Module._load = function (request, parent, ...args) {
  const value = originalLoad.call(this, request, parent, ...args);
  if (request !== 'uuid' || !/[\\/]((version-maker)|(new-snap-hash)|(version)|(lane)|(lane-history)|(new-lane-history-key))\.js$/.test(parent?.filename || ''))
    return value;
  return {
    ...value,
    v4: () => {
      const bytes = createHash('sha256').update(`${seed}:${ordinal++}`).digest('hex').slice(0, 32);
      return `${bytes.slice(0, 8)}-${bytes.slice(8, 12)}-4${bytes.slice(13, 16)}-8${bytes.slice(17, 20)}-${bytes.slice(20)}`;
    },
  };
};
