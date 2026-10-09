const {
  test,
  assert,
  path,
  installed,
  root,
  withRustDependencyScannerScope,
  generateTree,
  native,
  workspace,
  enabled,
  observe,
  noHooks,
  treeConfig,
} = require('./scope-test-support.cjs');
const { ComponentLoader } = require(path.join(root, 'components/legacy/consumer-component/component-loader.ts'));
const { ComponentID, ComponentIdList } = installed('@teambit/component-id');

test('dependency aspect explicitly registers the component-load scope adapter', async (context) => {
  const published = installed('@teambit/legacy.consumer-component').ComponentLoader;
  const oldScope = published.runDependencyLoadScope;
  const oldLoadDeps = published.loadDeps;
  context.after(() => {
    published.runDependencyLoadScope = oldScope;
    published.loadDeps = oldLoadDeps;
  });
  const { DependenciesMain } = require(
    path.join(root, 'scopes/dependencies/dependencies/dependencies.main.runtime.ts')
  );
  const main = await DependenciesMain.provider([
    { register() {} },
    {},
    {},
    {},
    {},
    {},
    {},
    { createLogger: () => ({}) },
  ]);
  assert.equal(published.runDependencyLoadScope, withRustDependencyScannerScope);
  assert.equal(typeof published.loadDeps, 'function');
  assert.ok(main instanceof DependenciesMain);
});

test(
  'component loadMany shares scope across cold sequential components and leaves warm cache untouched',
  { skip: !native },
  async (context) => {
    noHooks(context);
    const { directory, file } = workspace(context, { 'a.ts': 'export const a = 1;', 'b.ts': 'export const b = 2;' });
    const events = observe(context);
    const ids = ComponentIdList.fromArray(
      ['a', 'b'].map((name) => ComponentID.fromObject({ scope: 'test', name, version: '0.0.1' }))
    );
    const consumer = {
      getPath: () => directory,
      scope: { getPath: () => path.join(directory, '.bit') },
      config: { path: path.join(directory, 'workspace.jsonc') },
      bitmapIdsFromCurrentLaneIncludeRemoved: ids,
    };
    const loader = new ComponentLoader(consumer);
    // Preserve the actual shouldRunInParallel decision: an empty dependency cache
    // must keep cold components sequential. Component loading itself is isolated.
    loader.invalidateDependenciesCacheIfNeeded = async () => {};
    loader.componentFsCache.listDependenciesDataCache = async () => ({});
    let active = 0;
    let maximum = 0;
    loader.loadOne = async (id) => {
      active++;
      maximum = Math.max(maximum, active);
      await generateTree([file(id.name + '.ts')], treeConfig(directory));
      active--;
      return { id };
    };
    const oldScope = ComponentLoader.runDependencyLoadScope;
    ComponentLoader.runDependencyLoadScope = withRustDependencyScannerScope;
    context.after(() => {
      ComponentLoader.runDependencyLoadScope = oldScope;
    });
    await enabled(native, async () => {
      const first = await loader.loadMany(ids);
      assert.equal(first.components.length, 2);
      assert.equal(maximum, 1);
      assert.equal(events.children.length, 1);
      assert.equal(events.disposed.length, 1);
      const second = await loader.loadMany(ids);
      assert.equal(second.components.length, 2);
      assert.equal(events.children.length, 1);
      assert.equal(events.disposed.length, 1);
    });
  }
);

test(
  'nested component loadMany retains the outer helper until parent loading completes',
  { skip: !native },
  async (context) => {
    noHooks(context);
    const { directory, file } = workspace(context, { 'a.ts': 'export const a = 1;', 'b.ts': 'export const b = 2;' });
    const events = observe(context);
    const ids = ['a', 'b'].map((name) => ComponentID.fromObject({ scope: 'test', name, version: '0.0.1' }));
    const consumer = {
      getPath: () => directory,
      scope: { getPath: () => path.join(directory, '.bit') },
      config: { path: path.join(directory, 'workspace.jsonc') },
      bitmapIdsFromCurrentLaneIncludeRemoved: ComponentIdList.fromArray(ids),
    };
    const loader = new ComponentLoader(consumer);
    loader.invalidateDependenciesCacheIfNeeded = async () => {};
    loader.componentFsCache.listDependenciesDataCache = async () => ({});
    loader.loadOne = async (id) => {
      await generateTree([file(id.name + '.ts')], treeConfig(directory));
      if (id.name === 'a') {
        await loader.loadMany(ComponentIdList.fromArray([ids[1]]));
        assert.equal(events.disposed.length, 0);
      }
      return { id };
    };
    const oldScope = ComponentLoader.runDependencyLoadScope;
    ComponentLoader.runDependencyLoadScope = withRustDependencyScannerScope;
    context.after(() => {
      ComponentLoader.runDependencyLoadScope = oldScope;
    });
    await enabled(native, () => loader.loadMany(ComponentIdList.fromArray([ids[0]])));
    assert.equal(events.children.length, 1);
    assert.equal(events.disposed.length, 1);
  }
);
