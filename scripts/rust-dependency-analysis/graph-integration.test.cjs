const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { source, installed } = require('../rust-object-import/load-source.cjs');
const prefix = 'scopes/dependencies/dependencies/files-dependency-builder/';
const load = (name) =>
  process.env.BIT_TEST_SCANNER_COMPILED
    ? installed('@teambit/dependencies/dist/files-dependency-builder/' + name + '.js')
    : source(prefix + name + '.ts');
const generateTree = load('generate-tree-madge').default;
const { RustDependencyScannerSession: Session } = load('rust-scanner/session');
const { DetectorHook } = installed('@teambit/dependency-resolver');
assert.ok(process.env.BIT_TEST_WORKSPACE_ADDON && process.env.BIT_TEST_OBJECT_IMPORT, 'actual addon required');
function fixture(t) {
  const env = { ...process.env },
    hooks = DetectorHook.hooks;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-native-whole-graph-'));
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = process.env.BIT_TEST_OBJECT_IMPORT;
  delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
  DetectorHook.hooks = [];
  const calls = [];
  for (const name of ['dependencyGraph', 'prefetch', 'scanSource', 'resolveDependencies']) {
    const original = Session.prototype[name];
    Session.prototype[name] = async function (...args) {
      const result = await original.apply(this, args);
      calls.push({ name, args, result });
      return result;
    };
    t.after(() => {
      Session.prototype[name] = original;
    });
  }
  t.after(() => {
    process.env = env;
    DetectorHook.hooks = hooks;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const write = (file, body) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
    return target;
  };
  return {
    root,
    calls,
    write,
    config: (extra = {}) => ({ baseDir: root, envDetectors: [], detectiveOptions: {}, ...extra }),
  };
}
function snapshot(result, config) {
  return {
    result: {
      ...result,
      errors: Object.fromEntries(
        Object.entries(result.errors).map(([file, error]) => [
          file,
          { name: error.name, message: error.message, code: error.code },
        ])
      ),
    },
    visited: config.visited,
    options: config.detectiveOptions,
    hookFilenames: DetectorHook.hooks.map((hook) => [Object.hasOwn(hook, 'currentFilename'), hook.currentFilename]),
    optionKeys: Object.keys(config.detectiveOptions || {}),
    missingAliases: Object.entries(config.visited || {})
      .filter(([, row]) => row.missing)
      .map(([file, row]) => [file, result.skipped[file] === row.missing]),
    visitedKeys: Object.keys(config.visited || {}),
    aliases: result.pathMap.map((row) => result.pathMap.indexOf(row)),
    visitedAliases: Object.entries(config.visited || {}).map(([file, row]) => [
      file,
      result.pathMap.indexOf(row.pathMap),
      Object.hasOwn(row, 'missing'),
      Object.hasOwn(row, 'error'),
    ]),
  };
}
async function compare(f, files, configure = () => f.config(), accepted = true) {
  f.calls.length = 0;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  const nativeConfig = configure();
  const paths = [...require.main.paths];
  const actual = await generateTree(files, nativeConfig);
  const actualSnapshot = snapshot(actual, nativeConfig);
  const nativePaths = [...require.main.paths];
  const calls = [...f.calls];
  for (const added of nativePaths.filter((item) => !paths.includes(item)))
    require('node:module')
      .createRequire(installed.resolve('@teambit/typescript.deps-lookups.lookup-typescript'))('app-module-path')
      .removePath(added);
  require.main.paths.splice(0, require.main.paths.length, ...paths);
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  const legacyConfig = configure();
  const expected = await generateTree(files, legacyConfig);
  assert.deepEqual(actualSnapshot, snapshot(expected, legacyConfig));
  assert.deepEqual(require.main.paths, nativePaths, 'lookup search-path mutations retain order');
  if (accepted) {
    assert.equal(
      calls.filter((call) => call.name === 'dependencyGraph' && call.result).length,
      1,
      'whole native graph must succeed'
    );
    assert.deepEqual(
      calls.map((call) => call.name),
      ['dependencyGraph'],
      'accepted graphs must avoid per-file native requests'
    );
    assert.ok(
      !JSON.stringify(calls[0].args).includes('SOURCE_BODY_SENTINEL'),
      'bridge contains metadata, never source bodies'
    );
  } else
    assert.ok(!calls.some((call) => call.name === 'dependencyGraph' && call.result), 'unsupported graphs must decline');
  return actual;
}

test('whole graphs preserve mixed source order, cycles, shared aliases, npm, builtins and non-detectors', async (t) => {
  const f = fixture(t);
  const first = f.write(
    'src/first.js',
    "require('./shared'); require('./second'); require('fs'); require('node:path'); require('pkg'); require('./plain.txt'); // SOURCE_BODY_SENTINEL"
  );
  const second = f.write('src/second.js', "require('./shared'); require('./first');");
  f.write('src/shared.ts', 'export const value: number = 1;');
  f.write('src/plain.txt', 'SOURCE_BODY_SENTINEL unparsed content');
  f.write('node_modules/pkg/package.json', '{"main":"index.js"}');
  f.write('node_modules/pkg/index.js', 'module.exports = 1;');
  for (const includeNpm of [false, true]) {
    for (const cached of [false, true])
      await compare(f, [first, second, first], () => f.config({ includeNpm, ...(cached ? { visited: {} } : {}) }));
  }
  await compare(f, [first], () => f.config({ excludeRegExp: ['shared'] }));
});

test('native traversal replays supplied path maps and missing array identities exactly', async (t) => {
  const f = fixture(t);
  const first = f.write('first.js', "require('./cached'); require('./leaf');");
  const cached = f.write('cached.js', 'this should not be parsed');
  const leaf = f.write('leaf.js', 'module.exports = 1;');
  await compare(f, [first, cached], () =>
    f.config({
      visited: {
        [cached]: {
          pathMap: {
            file: cached,
            dependencies: [
              {
                importSource: './leaf',
                resolvedDep: leaf,
                importSpecifiers: [{ mainFile: { name: 'value', isDefault: false } }],
              },
            ],
          },
          missing: ['retained-missing'],
        },
      },
    })
  );
});

test('new calls observe source and package mutation without stale graph caches', async (t) => {
  const f = fixture(t);
  const entry = f.write('entry.js', "require('pkg');");
  f.write('node_modules/pkg/package.json', '{"main":"first.js"}');
  f.write('node_modules/pkg/first.js', 'module.exports = 1;');
  f.write('node_modules/pkg/second.js', 'module.exports = 2;');
  await compare(f, [entry], () => f.config({ includeNpm: true }));
  f.write('node_modules/pkg/package.json', '{"main":"second.js"}');
  f.write('entry.js', "require('pkg'); require('./new');");
  f.write('new.js', 'module.exports = 3;');
  const actual = await compare(f, [entry], () => f.config({ includeNpm: true }));
  assert.ok(actual.madgeTree['entry.js'].includes('node_modules/pkg/second.js'));
});

test('missing imports, parse errors and unsupported detectives preserve canonical fallback', async (t) => {
  const f = fixture(t);
  for (const [name, body] of [
    ['missing.js', "require('./absent');"],
    ['broken.js', 'const = ;'],
    ['style.css', '@import "./other.css";'],
  ]) {
    const entry = f.write(name, body);
    await compare(f, [entry], () => f.config(), false);
  }
});

test('custom detectors and dependency filters retain callbacks and mutation ordering', async (t) => {
  const f = fixture(t);
  const entry = f.write('entry.js', "require('./leaf');");
  const leaf = f.write('leaf.js', 'module.exports = 1;');
  const calls = [];
  const detector = {
    isSupported: () => true,
    detect: (file) => {
      calls.push(['detect', file]);
      return [];
    },
  };
  await compare(f, [entry], () => f.config({ envDetectors: [detector] }), false);
  assert.equal(calls.length, 2);
  calls.length = 0;
  const filter = (dependency, from) => {
    calls.push([dependency, from]);
    return true;
  };
  await compare(f, [entry], () => f.config({ dependencyFilter: filter }), false);
  assert.deepEqual(calls, [
    [leaf, entry],
    [leaf, entry],
  ]);
});

test('TSX preserves canonical detector option mutations', async (t) => {
  const f = fixture(t);
  const entry = f.write('entry.tsx', 'export const view = <div />;');
  await compare(f, [entry]);
});

test('integer package names retain JavaScript object key order at its boundaries', async (t) => {
  const f = fixture(t);
  const names = ['10', '2', '01', '4294967295', '4294967294'];
  const entry = f.write('entry.js', names.map((name) => `require('${name}');`).join('\n'));
  for (const name of names) f.write(`node_modules/${name}/index.js`, 'module.exports = 1;');
  await compare(f, [entry], () => f.config({ includeNpm: true }), false);
  f.write('entry.js', "require('01'); require('4294967295');");
  await compare(f, [entry], () => f.config({ includeNpm: true }));
});

test('shared command sessions refresh graphs and fully cached roots retain canonical replay', async (t) => {
  const f = fixture(t);
  const { withRustDependencyScannerScope } = load('rust-scanner/scope');
  const entry = f.write('entry.js', "require('./child');");
  const child = f.write('child.js', 'module.exports = 1;');
  const visited = {};
  await withRustDependencyScannerScope(async () => {
    const first = await compare(f, [entry], () => f.config());
    f.write('child.js', "require('./new');");
    f.write('new.js', 'module.exports = 2;');
    const second = await compare(f, [entry], () => f.config());
    assert.notDeepEqual(first.madgeTree, second.madgeTree);
    process.env.BIT_RUST_CLIENT_VCS = 'on';
    const cached = await generateTree([entry], f.config({ visited }));
    f.calls.length = 0;
    const replay = await generateTree([entry], f.config({ visited }));
    assert.deepEqual(replay, cached);
    assert.ok(!f.calls.some((row) => row.name === 'dependencyGraph'), 'fully cached roots bypass native traversal');
    assert.equal(
      replay.pathMap.find((row) => row.file === child),
      visited[child].pathMap
    );
  });
});

test('registered detector predicates and lookup callbacks keep canonical invocation order', async (t) => {
  const f = fixture(t);
  const entry = f.write('entry.js', 'SOURCE_BODY_SENTINEL custom syntax');
  const leaf = f.write('leaf.js', 'SOURCE_BODY_SENTINEL child');
  const events = [];
  DetectorHook.hooks = [
    {
      isSupported: ({ filename }) => {
        events.push(['support', filename]);
        return true;
      },
      detect: (body) => {
        events.push(['detect', body]);
        return body.includes('custom') ? ['./forced'] : [];
      },
      dependencyLookup: ({ filename, dependency }) => {
        events.push(['lookup', filename, dependency]);
        return leaf;
      },
    },
  ];
  await compare(f, [entry], () => f.config(), false);
  assert.ok(events.some(([kind]) => kind === 'lookup'));
  assert.equal(events.length % 2, 0);
  assert.deepEqual(events.slice(0, events.length / 2), events.slice(events.length / 2));
});

test('declined graph byte budgets cannot partially mutate shared cache or resolver state', async (t) => {
  const f = fixture(t);
  const entry = f.write('entry.js', "require('./child');");
  f.write('child.js', 'module.exports = 1;');
  const config = f.config({ visited: {} });
  const options = config.detectiveOptions;
  const paths = [...require.main.paths];
  const session = new Session({
    executable: process.env.BIT_TEST_OBJECT_IMPORT,
    workspaceAddon: process.env.BIT_TEST_WORKSPACE_ADDON,
    cwd: f.root,
    maxResponseBytes: 128,
  });
  t.after(() => session.dispose());
  const { tryRustDependencyGraph } = load('rust-scanner/graph');
  assert.equal(await tryRustDependencyGraph([entry], config, session), undefined);
  assert.deepEqual(config.visited, {});
  assert.equal(config.detectiveOptions, options);
  assert.deepEqual(options, {});
  assert.deepEqual(require.main.paths, paths);
  await compare(f, [entry]);
});

test('canonical env.jsonc hooks allow ordinary graphs but preserve matching and overridden dispatch', async (t) => {
  const f = fixture(t);
  const { EnvJsoncDetector } = process.env.BIT_TEST_SCANNER_COMPILED
    ? installed('@teambit/envs/dist/env-jsonc.detector.js')
    : source('scopes/envs/envs/env-jsonc.detector.ts');
  const entry = f.write('entry.js', "require('./child');");
  f.write('child.js', 'module.exports = 1;');
  DetectorHook.hooks = [new EnvJsoncDetector()];
  await compare(f, [entry]);
  const env = f.write('env.jsonc', '{}');
  await compare(f, [env], () => f.config(), false);
  class CustomDetector extends EnvJsoncDetector {}
  DetectorHook.hooks = [new CustomDetector()];
  await compare(f, [entry], () => f.config(), false);
  const hook = new EnvJsoncDetector();
  hook.isSupported = () => false;
  DetectorHook.hooks = [hook];
  await compare(f, [entry], () => f.config(), false);
  const predicate = EnvJsoncDetector.prototype.isSupported;
  t.after(() => {
    EnvJsoncDetector.prototype.isSupported = predicate;
  });
  EnvJsoncDetector.prototype.isSupported = () => false;
  DetectorHook.hooks = [new EnvJsoncDetector()];
  await compare(f, [entry], () => f.config(), false);
});

test('canonical MDX hook records the same last fresh filename and respects custom predicates', async (t) => {
  const f = fixture(t);
  const { MDXDependencyDetector } = process.env.BIT_TEST_SCANNER_COMPILED
    ? installed('@teambit/mdx/dist/mdx.detector.js')
    : source('scopes/mdx/mdx/mdx.detector.ts');
  const entry = f.write('entry.js', "require('./child'); require('./plain.txt');");
  f.write('child.js', 'module.exports = 1;');
  f.write('plain.txt', 'not parsed');
  const hook = new MDXDependencyDetector(['.md', '.mdx']);
  DetectorHook.hooks = [hook];
  await compare(f, [entry], () => f.config({ visited: {} }));
  assert.equal(hook.currentFilename, path.join(f.root, 'child.js'));
  const child = path.join(f.root, 'child.js');
  await compare(f, [entry], () => f.config({ visited: { [child]: { pathMap: { file: child, dependencies: [] } } } }));
  assert.equal(hook.currentFilename, path.join(f.root, 'plain.txt'));
  const noCheck = f.write('ignored.js', '// @bit-no-check\nunsupported custom syntax');
  await compare(f, [entry, noCheck]);
  assert.equal(hook.currentFilename, child, 'no-check does not invoke detector predicates');
  DetectorHook.hooks = [new MDXDependencyDetector(['.txt'])];
  await compare(f, [path.join(f.root, 'plain.txt')], () => f.config(), false);
  DetectorHook.hooks = [hook];
  hook.isSupported = () => false;
  await compare(f, [entry], () => f.config(), false);
  class CustomDetector extends MDXDependencyDetector {}
  DetectorHook.hooks = [new CustomDetector(['.mdx'])];
  await compare(f, [entry], () => f.config(), false);
});
