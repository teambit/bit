// Benchmark-only graph-entry instrumentation, shared by legacy/native commands.
const { isTraceOwner } = require('./command-trace.cjs');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const load = Module._load;
const wrapped = new WeakSet();
let dependencyTreeOperations = 0;
const dependencyTreeEntryFiles = new Set();
Module._load = function (request, parent, isMain) {
  const result = load.apply(this, arguments);
  if (
    request.includes('generate-tree-madge') &&
    result &&
    typeof result.default === 'function' &&
    !wrapped.has(result)
  ) {
    wrapped.add(result);
    const original = result.default;
    result.default = function (...args) {
      dependencyTreeOperations++;
      if (Array.isArray(args[0])) {
        for (const filename of args[0]) dependencyTreeEntryFiles.add(path.relative(process.cwd(), filename));
      }
      return original.apply(this, args);
    };
  }
  return result;
};
process.on('exit', () => {
  const filename = process.env.BIT_COMMAND_BENCH_TRACE;
  if (filename && isTraceOwner && fs.existsSync(filename)) {
    const trace = JSON.parse(fs.readFileSync(filename));
    fs.writeFileSync(
      filename,
      JSON.stringify({ ...trace, dependencyTreeOperations, dependencyTreeEntryFiles: [...dependencyTreeEntryFiles] })
    );
  }
});
