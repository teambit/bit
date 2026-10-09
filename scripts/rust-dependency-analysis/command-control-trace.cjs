// Benchmark-only substitution at the actual compiled graph session boundary.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const { isTraceOwner } = require('./command-trace.cjs');
const metrics = { controlSessions: 0, controlReads: 0, controlParses: 0, controlCacheHits: 0 };
const load = Module._load;
const wrapped = new WeakSet();
Module._load = function (request, parent, isMain) {
  const value = load.apply(this, arguments);
  if (!isTraceOwner || !request.includes('scope') || !value?.acquireRustDependencyScannerSession || wrapped.has(value))
    return value;
  const filename = Module._resolveFilename(request, parent);
  if (!filename.endsWith('/files-dependency-builder/rust-scanner/scope.js')) return value;
  value.acquireRustDependencyScannerSession = function () {
    const { LegacySessionControl } = require('./legacy-session-control.cjs');
    metrics.controlSessions++;
    const session = new LegacySessionControl(metrics);
    return { session, release: () => session.dispose() };
  };
  wrapped.add(value);
  return value;
};
process.on('exit', () => {
  if (!isTraceOwner) return;
  assert.ok(process.env.BIT_COMMAND_CONTROL_TRACE);
  fs.writeFileSync(process.env.BIT_COMMAND_CONTROL_TRACE, JSON.stringify(metrics));
});
