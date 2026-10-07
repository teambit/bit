const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const installedRoot = process.env.BIT_LEGACY_ROOT || path.resolve(__dirname, '../..');
const installed = Module.createRequire(path.join(installedRoot, 'package.json'));
const ts = installed('typescript');
const root = process.env.BIT_SCANNER_INTEGRATION_ROOT || path.resolve(__dirname, '../..');
const builder = path.join(root, 'scopes/dependencies/dependencies/files-dependency-builder');
// Real source modules and real installed detector/resolver packages are used.
// Only TypeScript compilation is supplied by this standalone runner.
require.extensions['.ts'] = (target, filename) => {
  target.paths = [...Module._nodeModulePaths(installedRoot), ...target.paths];
  target._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      fileName: filename,
    }).outputText,
    filename
  );
};
const { default: precinct, isRustEligible } = require(path.join(builder, 'precinct/index.ts'));
const generateTree = require(path.join(builder, 'generate-tree-madge.ts')).default;
const { RustDependencyScannerSession } = require(path.join(builder, 'rust-scanner/session.ts'));
const { DetectorHook } = installed('@teambit/dependency-resolver');
const native = process.env.BIT_TEST_NATIVE_SCANNER;

function workspace(context, sources) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-rust-integration-test-'));
  for (const [name, source] of Object.entries(sources)) {
    const file = path.join(directory, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, file: (name) => path.join(directory, name) };
}

function hooks(context, list) {
  const original = DetectorHook.hooks;
  DetectorHook.hooks = list;
  context.after(() => {
    DetectorHook.hooks = original;
  });
}

function config(directory, extra = {}) {
  return { baseDir: directory, detectiveOptions: {}, envDetectors: [], ...extra };
}

async function enabled(executable, run) {
  const old = process.env.BIT_RUST_DEPENDENCY_SCANNER;
  if (executable === undefined) delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
  else process.env.BIT_RUST_DEPENDENCY_SCANNER = executable;
  try {
    return await run();
  } finally {
    if (old === undefined) delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
    else process.env.BIT_RUST_DEPENDENCY_SCANNER = old;
  }
}

function traceSessions(context) {
  const trace = { prefetch: [], source: [], disposed: [] };
  const prototype = RustDependencyScannerSession.prototype;
  for (const [method, key] of [
    ['prefetch', 'prefetch'],
    ['scanSource', 'source'],
    ['dispose', 'disposed'],
  ]) {
    const original = prototype[method];
    prototype[method] = function (...args) {
      trace[key].push({ session: this, args });
      return original.apply(this, args);
    };
    context.after(() => {
      prototype[method] = original;
    });
  }
  return trace;
}

function controlledSession(outcome) {
  const calls = { prefetch: [], source: [], get: [] };
  return {
    calls,
    async prefetch(paths) {
      calls.prefetch.push(paths);
    },
    get(filename) {
      calls.get.push(filename);
      return outcome;
    },
    async scanSource(filename, source) {
      calls.source.push({ filename, source });
      return outcome;
    },
  };
}

function outcome(status, dependencies = {}, diagnostics = []) {
  return { path: 'ignored-by-test-session', status, dependencies, diagnostics };
}

function comparison(result) {
  return {
    ...result,
    errors: Object.fromEntries(Object.entries(result.errors).map(([file, error]) => [file, { code: error.code }])),
  };
}

test('default extraction and custom environment precedence do not invoke native methods', async (context) => {
  hooks(context, []);
  const { file } = workspace(context, { 'entry.ts': `import './legacy';` });
  assert.deepEqual(await precinct.paperwork(file('entry.ts')), ['./legacy']);
  let predicates = 0;
  let detects = 0;
  const session = controlledSession(outcome('ok', { './native': {} }));
  const detector = {
    type: 'custom',
    isSupported: () => {
      predicates++;
      return true;
    },
    detect: () => {
      detects++;
      return ['./custom'];
    },
  };
  assert.deepEqual(
    await precinct.paperwork(file('entry.ts'), { envDetectors: [detector], rustScannerSession: session }),
    ['./custom']
  );
  assert.equal(predicates, 1);
  assert.equal(detects, 1);
  assert.deepEqual(session.calls, { prefetch: [], source: [], get: [] });
});

test('matching hook keeps legacy predicate count and bypasses native extraction', async (context) => {
  let predicates = 0;
  const detector = {
    isSupported: () => {
      predicates++;
      return true;
    },
    detect: () => ['./hook'],
  };
  hooks(context, [detector]);
  const { file } = workspace(context, { 'entry.js': `import './legacy';` });
  const baseline = await precinct.paperwork(file('entry.js'));
  const legacyCalls = predicates;
  predicates = 0;
  const session = controlledSession(outcome('ok', { './native': {} }));
  assert.deepEqual(await precinct.paperwork(file('entry.js'), { rustScannerSession: session }), baseline);
  assert.equal(predicates, legacyCalls);
  assert.equal(predicates, 2); // Existing isSupported + getDetector behavior.
  assert.deepEqual(session.calls, { prefetch: [], source: [], get: [] });
});

test('nonmatching predicates execute once and lazy native receives the exact source already read', async (context) => {
  const original = `import './original';`;
  const changed = `import './changed';`;
  const { file } = workspace(context, { 'entry.js': original });
  let envCalls = 0;
  let hookCalls = 0;
  hooks(context, [
    {
      isSupported: () => {
        hookCalls++;
        return false;
      },
      detect: () => assert.fail('nonmatching hook called'),
    },
  ]);
  const detector = {
    isSupported: () => {
      envCalls++;
      fs.writeFileSync(file('entry.js'), changed);
      return false;
    },
    detect: () => assert.fail('nonmatching environment detector called'),
  };
  const session = controlledSession(outcome('ok', { './original': {} }));
  assert.equal(isRustEligible(file('entry.js'), { envDetectors: [detector] }), false);
  assert.deepEqual(
    await precinct.paperwork(file('entry.js'), { envDetectors: [detector], rustScannerSession: session }),
    ['./original']
  );
  assert.equal(envCalls, 1);
  assert.equal(hookCalls, 1);
  assert.deepEqual(session.calls.prefetch, []);
  assert.deepEqual(session.calls.get, []);
  assert.deepEqual(session.calls.source, [{ filename: file('entry.js'), source: original }]);
  assert.equal(fs.readFileSync(file('entry.js'), 'utf8'), changed);
});

test('unsupported and unavailable native outcomes execute legacy extraction; parse_error stays an error', async (context) => {
  hooks(context, []);
  const { file } = workspace(context, { 'entry.ts': `import './legacy';` });
  for (const status of ['unsupported', 'read_error', undefined]) {
    const session = controlledSession(status ? outcome(status, {}, ['fallback reason']) : undefined);
    assert.deepEqual(await precinct.paperwork(file('entry.ts'), { rustScannerSession: session }), ['./legacy']);
  }
  const session = controlledSession(outcome('parse_error', {}, ['native syntax diagnostic']));
  await assert.rejects(
    precinct.paperwork(file('entry.ts'), { rustScannerSession: session }),
    /native syntax diagnostic/
  );
});

test('core filtering stays in precinct and unsupported parser options retain legacy behavior', async (context) => {
  hooks(context, []);
  const { file } = workspace(context, { 'entry.ts': `import './legacy'; import fs from 'node:fs';` });
  const session = controlledSession(outcome('ok', { 'node:fs': {}, './native': {} }));
  assert.deepEqual(await precinct.paperwork(file('entry.ts'), { includeCore: false, rustScannerSession: session }), [
    './native',
  ]);
  const ignored = controlledSession(outcome('ok', { './native': {} }));
  assert.deepEqual(await precinct.paperwork(file('entry.ts'), { ts: { comment: true }, rustScannerSession: ignored }), [
    './legacy',
    'node:fs',
  ]);
  assert.deepEqual(ignored.calls, { prefetch: [], source: [], get: [] });
});

test('leading no-check still bypasses lazy custom dispatch and parsing invalid source', async (context) => {
  let predicates = 0;
  hooks(context, [
    {
      isSupported: () => {
        predicates++;
        return false;
      },
    },
  ]);
  const { file } = workspace(context, { 'entry.js': '// @bit-no-check\nconst = invalid;' });
  const session = controlledSession(outcome('ok', { './native': {} }));
  assert.deepEqual(await precinct.paperwork(file('entry.js'), { rustScannerSession: session }), []);
  assert.equal(predicates, 0);
  assert.deepEqual(session.calls, { prefetch: [], source: [], get: [] });
});

test(
  'real native and legacy extraction produce identical resolved trees, path maps, missing imports and filters',
  { skip: !native },
  async (context) => {
    hooks(context, []);
    const { directory, file } = workspace(context, {
      'entry.ts': `import './child'; import './blocked'; import './missing'; import fs from 'node:fs'; import 'pkg';`,
      'child.ts': `import './leaf';`,
      'leaf.ts': `import './child'; export const leaf = 1;`,
      'blocked.ts': 'const value: = invalid;',
      'node_modules/pkg/package.json': '{"name":"pkg","main":"index.js"}',
      'node_modules/pkg/index.js': 'module.exports = 1;',
    });
    const makeConfig = () =>
      config(directory, { includeNpm: true, dependencyFilter: (dependency) => !dependency.endsWith('blocked.ts') });
    const legacy = await enabled(undefined, () => generateTree([file('entry.ts')], makeConfig()));
    const trace = traceSessions(context);
    const accelerated = await enabled(native, () => generateTree([file('entry.ts')], makeConfig()));
    assert.deepEqual(comparison(accelerated), comparison(legacy));
    assert.deepEqual(accelerated.madgeTree, {
      'child.ts': ['leaf.ts'],
      'entry.ts': ['child.ts', 'node_modules/pkg/index.js'],
      'leaf.ts': ['child.ts'],
    });
    const prefetched = trace.prefetch.flatMap(({ args }) => args[0]);
    assert.ok(prefetched.includes(file('child.ts')) && prefetched.includes(file('leaf.ts')));
    assert.ok(!prefetched.includes(file('blocked.ts')));
    assert.ok(!prefetched.includes(file('node_modules/pkg/index.js')));
    assert.equal(trace.source.length, 0);
    assert.equal(trace.disposed.length, 1);
    assert.equal(trace.disposed[0].session.get(file('entry.ts')), undefined);
  }
);

test('visited graph cache skips native extraction completely', { skip: !native }, async (context) => {
  hooks(context, []);
  const { directory, file } = workspace(context, {
    'entry.ts': `import './child';`,
    'child.ts': 'export const child = 1;',
  });
  const visited = {};
  const baseline = await enabled(undefined, () => generateTree([file('entry.ts')], config(directory, { visited })));
  const trace = traceSessions(context);
  const accelerated = await enabled(native, () => generateTree([file('entry.ts')], config(directory, { visited })));
  assert.deepEqual(comparison(accelerated), comparison(baseline));
  assert.deepEqual(
    trace.prefetch.flatMap(({ args }) => args[0]),
    []
  );
  assert.equal(trace.source.length, 0);
  assert.equal(trace.disposed.length, 1);
});

test('native TS parse errors preserve PARSING_ERROR issues and final disposal', { skip: !native }, async (context) => {
  hooks(context, []);
  const { directory, file } = workspace(context, { 'invalid.ts': 'const value: = invalid;' });
  const baseline = await enabled(undefined, () => generateTree([file('invalid.ts')], config(directory)));
  const trace = traceSessions(context);
  const accelerated = await enabled(native, () => generateTree([file('invalid.ts')], config(directory)));
  assert.deepEqual(comparison(accelerated), comparison(baseline));
  assert.equal(accelerated.errors['invalid.ts'].code, 'PARSING_ERROR');
  assert.equal(trace.disposed.length, 1);
});

test(
  'unsupported JS classification and unavailable executable fall back to identical resolved trees',
  { skip: !native },
  async (context) => {
    hooks(context, []);
    const { directory, file } = workspace(context, {
      'entry.js': `module.exports = require('./child');`,
      'child.js': 'module.exports = 1;',
    });
    const baseline = await enabled(undefined, () => generateTree([file('entry.js')], config(directory)));
    const trace = traceSessions(context);
    const fallback = await enabled(native, () => generateTree([file('entry.js')], config(directory)));
    const unavailable = await enabled(path.join(directory, 'missing-scanner'), () =>
      generateTree([file('entry.js')], config(directory))
    );
    assert.deepEqual(comparison(fallback), comparison(baseline));
    assert.deepEqual(comparison(unavailable), comparison(baseline));
    assert.equal(trace.disposed.length, 2);
  }
);

test(
  'registered nonmatching hook uses real native inline extraction without extra predicates',
  { skip: !native },
  async (context) => {
    let calls = 0;
    hooks(context, [
      {
        isSupported: ({ ext }) => {
          calls++;
          return ext === '.mdx';
        },
        detect: () => assert.fail('MDX hook on TS'),
      },
    ]);
    const { directory, file } = workspace(context, {
      'entry.ts': `import './child';`,
      'child.ts': 'export const child = 1;',
    });
    const baseline = await enabled(undefined, () => generateTree([file('entry.ts')], config(directory)));
    const baselineCalls = calls;
    calls = 0;
    const trace = traceSessions(context);
    const result = await enabled(native, () => generateTree([file('entry.ts')], config(directory)));
    assert.deepEqual(result.madgeTree, { 'child.ts': [], 'entry.ts': ['child.ts'] });
    assert.equal(calls, baselineCalls);
    assert.deepEqual(comparison(result), comparison(baseline));
    assert.deepEqual(
      trace.prefetch.flatMap(({ args }) => args[0]),
      []
    );
    assert.equal(trace.source.length, 2);
    assert.equal(trace.disposed.length, 1);
  }
);

test(
  'lazy native uses the authoritative read snapshot rather than prefetched or later disk contents',
  { skip: !native },
  async (context) => {
    hooks(context, []);
    const { directory, file } = workspace(context, { 'entry.js': `import './prefetched';` });
    const session = new RustDependencyScannerSession({ executable: native, cwd: directory });
    context.after(() => session.dispose());
    await session.prefetch([file('entry.js')]);
    assert.deepEqual(Object.keys(session.get(file('entry.js')).dependencies), ['./prefetched']);
    fs.writeFileSync(file('entry.js'), `import './read-snapshot';`);
    let calls = 0;
    const detector = {
      isSupported: () => {
        calls++;
        fs.writeFileSync(file('entry.js'), `import './after-predicate';`);
        return false;
      },
      detect: () => assert.fail('nonmatching detector called'),
    };
    assert.deepEqual(
      await precinct.paperwork(file('entry.js'), { envDetectors: [detector], rustScannerSession: session }),
      ['./read-snapshot']
    );
    assert.equal(calls, 1);
    assert.deepEqual(Object.keys(session.get(file('entry.js')).dependencies), ['./prefetched']);
    assert.equal(fs.readFileSync(file('entry.js'), 'utf8'), `import './after-predicate';`);
  }
);

test(
  'filter exceptions preserve recorded failure and dispose the native operation',
  { skip: !native },
  async (context) => {
    hooks(context, []);
    const { directory, file } = workspace(context, {
      'entry.ts': `import './child';`,
      'child.ts': 'export const child = 1;',
    });
    const trace = traceSessions(context);
    const result = await enabled(native, () =>
      generateTree(
        [file('entry.ts')],
        config(directory, {
          dependencyFilter: () => {
            throw new Error('filter callback failed');
          },
        })
      )
    );
    assert.equal(result.errors['entry.ts'].message, 'filter callback failed');
    assert.equal(trace.disposed.length, 1);
    assert.equal(trace.disposed[0].session.get(file('entry.ts')), undefined);
  }
);
