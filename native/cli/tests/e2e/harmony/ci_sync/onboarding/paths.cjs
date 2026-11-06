// Observe the released command's path decisions without changing its arguments or results.
const fs = require('node:fs');
const Module = require('node:module');
const log = process.env.BIT_TEST_ONBOARDING_PATHS;
const append = (record) => fs.appendFileSync(log, JSON.stringify(record) + '\n');
const realpath = fs.realpathSync;
fs.realpathSync = Object.assign(function (...args) {
  const result = Reflect.apply(realpath, this, args);
  if (new Error().stack.includes('sync-orchestrator')) append({ realpath: args[0], result });
  return result;
}, realpath);
const load = Module._load;
Module._load = function (...args) {
  const result = Reflect.apply(load, this, args);
  if (args[0] === './init-scaffold' && args[1]?.filename.includes('sync-orchestrator')) {
    const original = result.scaffoldWorkflowFiles;
    result.scaffoldWorkflowFiles = function (...parameters) {
      append({ scaffold: parameters, caller: args[1].filename });
      return Reflect.apply(original, this, parameters);
    };
  }
  return result;
};
