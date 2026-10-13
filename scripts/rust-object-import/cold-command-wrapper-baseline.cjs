// Qualification-only baseline: retain native kernels but bypass the newly added cold command owner.
const assert = require('node:assert/strict');
const Module = require('node:module');
assert.equal(process.env.BIT_COLD_COMMAND_WRAPPER_BASELINE, '1');
const originalLoad = Module._load;
Module._load = function (request, parent, ...args) {
  const value = originalLoad.call(this, request, parent, ...args);
  if (/[\\/]rust-workspace-command(?:\.js)?$/.test(request)) {
    assert.equal(typeof value.runRustWorkspaceCommand, 'function');
    return { ...value, runRustWorkspaceCommand: async () => false };
  }
  return value;
};
