#!/usr/bin/env node
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { isBuiltin, createRequire } = require('node:module');
const path = require('node:path');
const fixtures = require('./fixtures.cjs');
// Resolve using this checkout, or an explicitly supplied installed Bit checkout.
const load = createRequire(path.resolve(process.env.BIT_LEGACY_ROOT || path.join(__dirname, '../..'), 'package.json'));
const js = load('@teambit/node.deps-detectors.detective-es6').default;
const ts = load('@teambit/typescript.deps-detectors.detective-typescript').default;

function legacy(fixture) {
  if (fixture.fallback) return { status: 'unsupported' };
  if (fixture.source.startsWith('// @bit-no-check') || fixture.source.startsWith('/* @bit-no-check')) {
    return { status: 'ok', dependencies: {} };
  }
  try {
    const isTs = /\.(ts|tsx|mts|cts)$/.test(fixture.path);
    const dependencies = (isTs ? ts : js)(fixture.source, { ...(fixture.options || {}), jsx: fixture.path.endsWith('.tsx') });
    if (fixture.options?.includeCore === false) {
      for (const name of Object.keys(dependencies)) if (isBuiltin(name)) delete dependencies[name];
    }
    return { status: 'ok', dependencies };
  } catch (error) {
    return { status: 'parse_error', diagnostic: error.message };
  }
}

function dependencyRecord(dependencies) {
  if (!Array.isArray(dependencies)) return dependencies;
  const record = {};
  for (const { specifier, kind, ...metadata } of dependencies) {
    assert.equal(typeof specifier, 'string', 'dependency must have a string specifier');
    assert.ok(!Object.hasOwn(record, specifier), `duplicate dependency record: ${specifier}`);
    record[specifier] = metadata;
  }
  return record;
}

function compare(reference, actual) {
  assert.equal(actual.status, reference.status, 'result status');
  if (reference.status !== 'ok') return;
  const dependencies = dependencyRecord(actual.dependencies);
  // Bit's precinct consumes keys; compare order separately from raw metadata.
  assert.deepEqual(Object.keys(dependencies), Object.keys(reference.dependencies), 'precinct dependency names and order');
  assert.deepEqual(dependencies, reference.dependencies, 'raw detector metadata');
}

function main() {
  const executable = process.argv[2];
  if (!executable) {
    const snapshot = fixtures.map((fixture) => ({ name: fixture.name, ...legacy(fixture) }));
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  // One line per option group verifies multiple requests on the same process.
  const requests = fixtures.map(({ path, source, options }) => ({ version: 1, files: [{ path, source }], options: options || {} }));
  const run = spawnSync(executable, process.argv.slice(3), {
    input: requests.map((request) => JSON.stringify(request)).join('\n') + '\n', encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (run.error) throw run.error;
  assert.equal(run.status, 0, run.stderr || `engine exited with ${run.status}`);
  const lines = run.stdout.trim().split('\n').filter(Boolean);
  assert.equal(lines.length, requests.length, 'one response per request');
  let failures = 0;
  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    try {
      const response = JSON.parse(lines[i]);
      assert.equal(response.version, 1);
      assert.equal(response.files.length, 1);
      assert.equal(response.files[0].path, fixture.path);
      compare(legacy(fixture), response.files[0]);
      console.log(`PASS ${fixture.name}${fixture.fallback ? ' (legacy fallback)' : ''}`);
    } catch (error) {
      failures++;
      console.error(`FAIL ${fixture.name}: ${error.message}`);
    }
  }
  console.log(`${fixtures.length - failures}/${fixtures.length} fixtures passed`);
  process.exitCode = failures ? 1 : 0;
}
if (require.main === module) main();
module.exports = { legacy, compare, dependencyRecord };
