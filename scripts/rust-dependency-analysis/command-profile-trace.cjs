// Benchmark-only read and extraction counters; original functions receive unchanged arguments.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const base = require('./command-trace.cjs');
const owner = base.isTraceOwner;
const root = process.cwd() + path.sep;
const reads = new Map();
const stages = { treeCalls: 0, treeElapsedMs: 0, detectorCalls: 0, detectorElapsedMs: 0 };
const sourceReadTypes = { sync: 0, callback: 0, promise: 0 };
function recordRead(filename, value, kind) {
  if (
    owner &&
    typeof filename === 'string' &&
    filename.startsWith(root) &&
    !filename.includes(`${path.sep}node_modules${path.sep}`) &&
    /\.(?:[cm]?[jt]sx?)$/.test(filename)
  ) {
    const record = reads.get(filename) || { calls: 0, bytes: 0 };
    record.calls++;
    record.bytes += Buffer.byteLength(value);
    reads.set(filename, record);
    sourceReadTypes[kind]++;
  }
}
const originalRead = fs.readFileSync;
fs.readFileSync = function (filename, ...rest) {
  const value = originalRead.call(this, filename, ...rest);
  recordRead(filename, value, 'sync');
  return value;
};
const originalAsyncRead = fs.readFile;
fs.readFile = function (filename, ...rest) {
  const callback = rest[rest.length - 1];
  if (typeof callback !== 'function') return originalAsyncRead.call(this, filename, ...rest);
  rest[rest.length - 1] = function (error, value) {
    if (!error) recordRead(filename, value, 'callback');
    return callback.apply(this, arguments);
  };
  return originalAsyncRead.call(this, filename, ...rest);
};
const originalPromiseRead = fs.promises.readFile;
fs.promises.readFile = function (filename, ...rest) {
  const result = originalPromiseRead.call(this, filename, ...rest);
  result.then(
    (value) => recordRead(filename, value, 'promise'),
    () => {}
  );
  return result;
};
const detectorSources = new Set();
const detectorAstInputs = new WeakSet();
let uniqueDetectorInputs = 0;
const load = Module._load;
const wrapped = new WeakSet();
Module._load = function (request, parent, isMain) {
  const value = load.apply(this, arguments);
  if (!owner) return value;
  if (!request.includes('generate-tree-madge') && !request.includes('detective')) return value;
  let filename;
  try {
    filename = Module._resolveFilename(request, parent);
  } catch {
    return value;
  }
  if (typeof filename !== 'string') return value;
  if (filename.endsWith('/files-dependency-builder/generate-tree-madge.js') && value?.default && !wrapped.has(value)) {
    const original = value.default;
    value.default = async function (...args) {
      stages.treeCalls++;
      const start = performance.now();
      try {
        return await original.apply(this, args);
      } finally {
        stages.treeElapsedMs += performance.now() - start;
      }
    };
    wrapped.add(value);
  }
  const detector = typeof value === 'function' ? value : value?.default;
  if (
    typeof detector === 'function' &&
    /deps-detectors[.\\/](?:detective-typescript|detective-es6)[\\/]/.test(filename) &&
    !wrapped.has(value)
  ) {
    const replacement = function (...args) {
      stages.detectorCalls++;
      const input = args[0];
      if (typeof input === 'string') {
        const digest = createHash('sha256').update(input).digest('hex');
        if (!detectorSources.has(digest)) uniqueDetectorInputs++;
        detectorSources.add(digest);
      } else if (input && typeof input === 'object' && !detectorAstInputs.has(input)) {
        uniqueDetectorInputs++;
        detectorAstInputs.add(input);
      }
      const start = performance.now();
      try {
        return detector.apply(this, args);
      } finally {
        stages.detectorElapsedMs += performance.now() - start;
      }
    };
    wrapped.add(replacement);
    wrapped.add(value);
    if (typeof value === 'function') {
      require.cache[filename].exports = replacement;
      return replacement;
    }
    value.default = replacement;
  }
  return value;
};
process.on('exit', () => {
  if (!owner || !process.env.BIT_COMMAND_PROFILE_TRACE) return;
  const files = [...reads].map(([filename, metrics]) => ({ path: path.relative(process.cwd(), filename), ...metrics }));
  fs.writeFileSync(
    process.env.BIT_COMMAND_PROFILE_TRACE,
    JSON.stringify({
      pid: process.pid,
      cliCpu: process.cpuUsage(),
      ...stages,
      uniqueDetectorInputs,
      repeatedDetectorInputs: stages.detectorCalls - uniqueDetectorInputs,
      detectorIdentity: 'TS source SHA256 and JS AST object identity; not a logical file count',
      sourceReadTypes,
      uniqueSourceReads: reads.size,
      sourceReadCalls: [...reads.values()].reduce((sum, item) => sum + item.calls, 0),
      sourceBytesRead: [...reads.values()].reduce((sum, item) => sum + item.bytes, 0),
      repeatedSourceReadCalls: [...reads.values()].reduce((sum, item) => sum + Math.max(0, item.calls - 1), 0),
      fileRecordsSha256: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
      mostRepeatedFiles: files.sort((a, b) => b.calls - a.calls || a.path.localeCompare(b.path)).slice(0, 50),
    })
  );
});
