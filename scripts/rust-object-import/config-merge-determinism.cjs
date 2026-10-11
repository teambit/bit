// Clock and IDs are fixed only inside disposable qualification CLI processes.
require('./merge-state-determinism.cjs');
const Module = require('node:module');
const original = Module._load;
Module._load = function (request, parent, ...args) {
  const value = original.call(this, request, parent, ...args);
  if (request !== '@teambit/legacy.consumer' || !/[\\/]workspace-config\.js$/.test(parent?.filename || ''))
    return value;
  return {
    ...value,
    currentDateAndTimeToFileName() {
      const date = new Date(Number(process.env.BIT_SNAPSHOT_QUALIFICATION_CLOCK));
      return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`;
    },
  };
};
