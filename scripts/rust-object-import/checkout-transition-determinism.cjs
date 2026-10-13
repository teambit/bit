// Qualification-only deterministic identities; enabled exclusively in disposable CLI processes.
const assert = require('node:assert/strict');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const seed = process.env.BIT_CHECKOUT_TRANSITION_QUALIFICATION_SEED;
const clock = Number(process.env.BIT_CHECKOUT_TRANSITION_QUALIFICATION_CLOCK);
assert.ok(seed && Number.isSafeInteger(clock));
Date.now = () => clock;
const originalLoad = Module._load;
const ordinals = new Map();
Module._load = function (request, parent, ...args) {
  const value = originalLoad.call(this, request, parent, ...args);
  // Fix only elapsed UI presentation: correctness and paired timing still use actual hrtime/performance clocks.
  if (
    process.env.BIT_CHECKOUT_TRANSITION_DISPLAY_DURATION === 'deterministic' &&
    request === 'pretty-time' &&
    /[\\/]((loader)|(long-process-logger))\.js$/.test(parent?.filename || '')
  )
    return () => '0ms';
  if (
    request !== 'uuid' ||
    !/[\\/]((version-maker)|(new-snap-hash)|(version)|(lane)|(lane-history))\.js$/.test(parent?.filename || '')
  )
    return value;
  return {
    ...value,
    v4: () => {
      // Disposable comparison Versions must not change the identities of persisted snaps.
      // Both command implementations use the same durable scalar helpers and stream.
      const stream = /[\\/]((version-maker)|(new-snap-hash))\.js$/.test(parent?.filename || '') ? 'snap' : 'model';
      const ordinal = ordinals.get(stream) || 0;
      ordinals.set(stream, ordinal + 1);
      const bytes = createHash('sha256').update(`${seed}:${stream}:${ordinal}`).digest('hex').slice(0, 32);
      return `${bytes.slice(0, 8)}-${bytes.slice(8, 12)}-4${bytes.slice(13, 16)}-8${bytes.slice(17, 20)}-${bytes.slice(20)}`;
    },
  };
};
