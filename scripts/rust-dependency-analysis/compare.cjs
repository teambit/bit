#!/usr/bin/env node
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { isBuiltin, createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const fixtures = require('./fixtures.cjs');
// Resolve using this checkout, or an explicitly supplied installed Bit checkout.
const load = createRequire(path.resolve(process.env.BIT_LEGACY_ROOT || path.join(__dirname, '../..'), 'package.json'));
const js = load('@teambit/node.deps-detectors.detective-es6').default;
const ts = load('@teambit/typescript.deps-detectors.detective-typescript').default;
const getModuleType = load('module-definition');
const Walker = load('node-source-walk');

function legacy(fixture) {
  if (fixture.fallback) return { status: 'unsupported' };
  if (fixture.source.startsWith('// @bit-no-check') || fixture.source.startsWith('/* @bit-no-check')) {
    return { status: 'ok', dependencies: {} };
  }
  const isTs = /\.(ts|tsx|mts|cts)$/.test(fixture.path);
  if (!isTs && !/\.(js|jsx|cjs|mjs)$/.test(fixture.path)) return { status: 'unsupported' };
  try {
    let dependencies;
    if (isTs) {
      // Precinct passes only options.ts to the detective, adding jsx for TSX.
      const tsOptions = { ...fixture.options?.ts };
      if (fixture.path.endsWith('.tsx')) tsOptions.jsx = true;
      dependencies = ts(fixture.source, tsOptions);
    } else {
      // Precinct classifies JS before dispatch: AMD uses another detective and unclassified modules have no deps.
      const ast = new Walker().parse(fixture.source);
      const type = getModuleType.fromSource(ast);
      if (type === 'amd') return { status: 'unsupported' };
      dependencies = type === 'es6' || type === 'commonjs' ? js(ast, fixture.options?.[type]) : {};
    }
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
  // Undefined fields from Babel (e.g. string-named imports) cannot cross JSON.
  assert.deepEqual(dependencies, JSON.parse(JSON.stringify(reference.dependencies)), 'raw detector metadata');
}

function invoke(executable, requests, args = []) {
  const run = spawnSync(executable, args, {
    input: requests.map((request) => typeof request === 'string' ? request : JSON.stringify(request)).join('\n') + '\n',
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error) throw run.error;
  assert.equal(run.status, 0, run.stderr || `engine exited with ${run.status}`);
  const lines = run.stdout.trim().split('\n').filter(Boolean);
  assert.equal(lines.length, requests.length, 'one response per request');
  return lines.map((line) => JSON.parse(line));
}

function selectCorpus(repoRoot, paths = []) {
  if (paths.length) return paths.map((file) => path.resolve(repoRoot, file));
  const git = spawnSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' });
  if (git.error) throw git.error;
  assert.equal(git.status, 0, git.stderr);
  return git.stdout.split('\0').filter((file) => /\.(js|jsx|cjs|mjs|ts|tsx|mts|cts)$/.test(file)).sort().map((file) => path.resolve(repoRoot, file));
}

function corpus(executable, paths, snapshot = false) {
  const root = path.resolve(__dirname, '../..');
  const files = selectCorpus(root, paths);
  const counts = { selected: files.length, compared: 0, unsupported: 0, failed: 0, referenceParseErrors: 0 };
  const fallbackReasons = {};
  const examples = [];
  // Bound both request size and output memory independently of repository size.
  for (let start = 0; start < files.length; start += 32) {
    const batch = files.slice(start, start + 32).map((file) => ({ path: file }));
    const response = snapshot ? undefined : invoke(executable, [{ version: 1, id: start, files: batch }])[0];
    if (response) {
      assert.equal(response.version, 1);
      assert.equal(response.id, start);
      assert.equal(response.files.length, batch.length);
    }
    batch.forEach((file, index) => {
      const name = path.relative(root, file.path);
      let reference;
      try {
        reference = legacy({ ...file, source: fs.readFileSync(file.path, 'utf8') });
      } catch (error) {
        reference = { status: 'read_error', diagnostic: error.message };
      }
      if (reference.status === 'parse_error') counts.referenceParseErrors++;
      if (snapshot) {
        console.log(JSON.stringify({ path: name, ...reference }));
        return;
      }
      const actual = response.files[index];
      try {
        assert.equal(actual.path, file.path);
        if (actual.status === 'unsupported') {
          assert.deepEqual(actual.dependencies, {}, 'fallback must discard partial dependencies');
          assert.ok(actual.diagnostics?.length, 'fallback must explain its reason');
          counts.unsupported++;
          const reason = actual.diagnostics[0];
          fallbackReasons[reason] = (fallbackReasons[reason] || 0) + 1;
          if (examples.length < 12) examples.push({ path: name, reason, referenceStatus: reference.status });
        } else {
          compare(reference, actual);
          counts.compared++;
        }
      } catch (error) {
        counts.failed++;
        console.error(`FAIL ${name}: ${error.message}`);
      }
    });
  }
  if (!snapshot) console.log(JSON.stringify({ counts, fallbackReasons, fallbackExamples: examples }, null, 2));
  process.exitCode = counts.failed ? 1 : 0;
}

function protocol(executable) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-rust-dependency-protocol-'));
  try {
    const valid = path.join(directory, 'valid.ts');
    const missing = path.join(directory, 'missing.ts');
    const subdirectory = path.join(directory, 'directory.ts');
    fs.writeFileSync(valid, `import type { Value } from './types';`);
    fs.mkdirSync(subdirectory);
    const requests = [
      { version: 1, id: 'disk', files: [{ path: valid }, { path: missing }, { path: subdirectory }, { path: missing, source: `import './inline';` }] },
      '{malformed',
      { version: 99, files: [] },
      { version: 1, files: [{ path: valid, unexpected: true }] },
      { version: 1, id: 'after-errors', files: [] },
    ];
    const responses = invoke(executable, requests);
    assert.equal(responses[0].id, 'disk');
    const files = responses[0].files;
    assert.equal(files.length, 4);
    assert.deepEqual(files.map((file) => file.path), [valid, missing, subdirectory, missing]);
    compare(legacy({ path: valid, source: fs.readFileSync(valid, 'utf8') }), files[0]);
    for (const file of files.slice(1, 3)) {
      assert.equal(file.status, 'read_error');
      assert.deepEqual(file.dependencies, {});
      assert.ok(file.diagnostics.length);
    }
    compare(legacy({ path: missing, source: `import './inline';` }), files[3]);
    for (const response of responses.slice(1, 4)) {
      assert.equal(response.version, 1);
      assert.equal(response.status, 'invalid_request');
      assert.ok(response.diagnostics.length);
    }
    assert.equal(responses[4].id, 'after-errors');
    assert.deepEqual(responses[4].files, []);
    console.log('PASS disk reads, missing/directory errors, inline-source precedence, invalid-request recovery');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv[2] === '--protocol') return protocol(process.argv[3]);
  if (process.argv[2] === '--corpus' || process.argv[2] === '--corpus-reference') {
    const snapshot = process.argv[2] === '--corpus-reference';
    return corpus(snapshot ? undefined : process.argv[3], process.argv.slice(snapshot ? 3 : 4), snapshot);
  }
  const executable = process.argv[2];
  if (!executable) {
    const snapshot = fixtures.map((fixture) => ({ name: fixture.name, ...legacy(fixture) }));
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  // One line per option group verifies multiple requests on the same process.
  const groups = [...fixtures.map((fixture) => [fixture]), fixtures.filter((fixture) => !fixture.options)];
  const requests = groups.map((group, id) => ({ version: 1, id, files: group.map(({ path, source }) => ({ path, source })), options: group[0].options || {} }));
  const run = spawnSync(executable, process.argv.slice(3), {
    input: requests.map((request) => JSON.stringify(request)).join('\n') + '\n', encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (run.error) throw run.error;
  assert.equal(run.status, 0, run.stderr || `engine exited with ${run.status}`);
  const lines = run.stdout.trim().split('\n').filter(Boolean);
  assert.equal(lines.length, requests.length, 'one response per request');
  let failures = 0;
  let checks = 0;
  for (let i = 0; i < groups.length; i++) {
    try {
      const response = JSON.parse(lines[i]);
      assert.equal(response.version, 1);
      assert.equal(response.id, i, 'request id echo');
      assert.equal(response.files.length, groups[i].length);
      for (let j = 0; j < groups[i].length; j++) {
        const fixture = groups[i][j];
        checks++;
        try {
          assert.equal(response.files[j].path, fixture.path);
          compare(fixture.expectFallback ? { status: 'unsupported' } : legacy(fixture), response.files[j]);
          console.log(`PASS ${fixture.name}${groups[i].length > 1 ? ' (batch)' : ''}${fixture.fallback || fixture.expectFallback ? ' (legacy fallback)' : ''}`);
        } catch (error) {
          failures++;
          console.error(`FAIL ${fixture.name}: ${error.message}`);
        }
      }
    } catch (error) {
      failures++;
      console.error(`FAIL response ${i}: ${error.message}`);
    }
  }
  console.log(`${checks} fixture comparisons; ${failures} failures`);
  process.exitCode = failures ? 1 : 0;
}
if (require.main === module) main();
module.exports = { legacy, compare, dependencyRecord, invoke, selectCorpus };
