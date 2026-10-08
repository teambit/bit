const { test, assert, fs, os, path, installed, root } = require('./scope-test-support.cjs');
const { DependenciesLoader } = require(
  path.join(root, 'scopes/dependencies/dependencies/dependencies-loader/dependencies-loader.ts')
);
const { DependenciesData } = require(
  path.join(root, 'scopes/dependencies/dependencies/dependencies-loader/dependencies-data.ts')
);
const { IssuesList } = installed('@teambit/component-issues');

function fixture(context, trackedTsconfig = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-dependency-invalidation-'));
  const componentDir = path.join(directory, 'component');
  fs.mkdirSync(componentDir);
  const source = path.join(componentDir, 'index.ts');
  const policy = path.join(componentDir, 'component.json');
  const tsconfig = path.join(componentDir, 'tsconfig.json');
  fs.writeFileSync(source, "import 'pkg';");
  fs.writeFileSync(
    policy,
    JSON.stringify({
      componentId: { scope: 'scope', name: 'component', version: '1' },
      extensions: { 'teambit.dependencies/dependency-resolver': { policy: { dependencies: { pkg: '1.0.0' } } } },
    })
  );
  fs.writeFileSync(tsconfig, '{"compilerOptions":{"strict":false}}');
  const timestamp = Date.now();
  const old = new Date(timestamp - 10000);
  for (const file of [source, policy, tsconfig, componentDir]) fs.utimesSync(file, old, old);
  const cached = new DependenciesData(
    { dependencies: [], devDependencies: [], peerDependencies: [] },
    { packageDependencies: { pkg: '1.0.0' }, devPackageDependencies: {}, peerPackageDependencies: {} },
    new IssuesList(),
    []
  );
  const component = {
    id: { toString: () => 'scope/component@1' },
    componentMap: { getComponentDir: () => 'component' },
    files: [
      { path: source, relative: 'index.ts' },
      ...(trackedTsconfig ? [{ path: tsconfig, relative: 'tsconfig.json' }] : []),
    ],
  };
  let reads = 0;
  const workspace = {
    path: directory,
    consumer: {
      componentFsCache: {
        getDependenciesDataFromCache: async (id) => {
          assert.equal(id, 'scope/component@1');
          reads++;
          return { timestamp, data: cached.serialize() };
        },
      },
    },
  };
  const loader = new DependenciesLoader(component, {}, {}, {}, { trace() {}, debug() {} });
  const cwd = process.cwd();
  process.chdir(directory);
  context.after(() => {
    process.chdir(cwd);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return {
    policy,
    tsconfig,
    cached,
    get reads() {
      return reads;
    },
    read: (useDependenciesCache = true) =>
      loader.getDependenciesDataFromCacheIfPossible(workspace, { useDependenciesCache }),
    edit(file, data) {
      fs.writeFileSync(file, data);
      const fresh = new Date(timestamp + 10000);
      fs.utimesSync(file, fresh, fresh);
    },
  };
}

test('component policy edits invalidate real cached dependency data without changing source', async (context) => {
  const data = fixture(context);
  assert.deepEqual((await data.read()).serialize(), data.cached.serialize());
  data.edit(
    data.policy,
    JSON.stringify({
      componentId: { scope: 'scope', name: 'component', version: '1' },
      extensions: { 'teambit.dependencies/dependency-resolver': { policy: { dependencies: { pkg: '2.0.0' } } } },
    })
  );
  assert.equal(await data.read(), null);
  assert.equal(data.reads, 2);
});

test('tracked TSconfig edits invalidate the component dependency cache', async (context) => {
  const data = fixture(context, true);
  assert.deepEqual((await data.read()).serialize(), data.cached.serialize());
  data.edit(data.tsconfig, '{"compilerOptions":{"strict":true}}');
  assert.equal(await data.read(), null);
});

test('untracked existing TSconfig is not an invalidation input in the legacy cache contract', async (context) => {
  const data = fixture(context);
  data.edit(data.tsconfig, '{"compilerOptions":{"strict":true}}');
  assert.deepEqual((await data.read()).serialize(), data.cached.serialize());
});

test('cache bypass does not inspect or deserialize persistent entries', async (context) => {
  const data = fixture(context);
  assert.equal(await data.read(false), null);
  assert.equal(data.reads, 0);
});
