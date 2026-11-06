/** Immutable native objects supply published classes; neither fetching nor publication runs here. */
const forkRemoteComponents = new Map();
async function forkRemoteHydrate({ objects, ids }) {
  const loaded = await loadHarmony();
  const scope = loaded.get('teambit.scope/scope');
  const repository = scope.legacyScope.objects;
  const { BitObject } = bitRequire('@teambit/objects');
  const { ComponentID } = bitRequire('@teambit/component-id');
  for (const object of objects) {
    const parsed = await BitObject.parseObjectWithSize(fs.readFileSync(object.path), object.path);
    repository.objects[object.hash] = parsed.object;
    repository.cache.set(object.hash, parsed.object, parsed.inflatedSize);
  }
  for (const identity of ids) {
    const id = ComponentID.fromString(identity);
    const consumer = await scope.legacyScope.getConsumerComponent(id);
    const component = await scope.componentLoader.getFromConsumerComponent(consumer);
    forkRemoteComponents.set(identity, component);
    forkRemoteComponents.set(component.id.toStringWithoutVersion(), component);
  }
  return true;
}
async function forkSourceFacts({ component: row, remote }) {
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  let component = remote ? forkRemoteComponents.get(row.identity) : identityLoadedComponent(row.identity);
  if (!component && !remote) {
    const native = await hydrateStatusComponent({ ...row, directory: row.directory ?? row.rootDir,
      files: row.files.map(file => typeof file === 'string' ? file : file.relativePath) });
    const consumer = native.state._consumer;
    // A normal Workspace.get groups the seed and populates the shared extension
    // list before DevFiles and the main class independently hydrate this Consumer.
    await workspace.componentLoader.buildLoadGroups(
      await workspace.componentLoader.groupAndUpdateIds([consumer.id]));
    // Native dependency capture has already persisted its cache. Reproduce the real
    // DevFiles class hydration that originally populated this shared Consumer first.
    await loaded.get('teambit.component/dev-files').getDevFilesForConsumerComp(consumer);
    component = await workspace.get(consumer.id, consumer);
    identityLoadedComponents.set(row.identity, component);
  }
  if (!component) throw new Error(`fork source class unavailable: ${row.identity}`);
  const resolver = loaded.get('teambit.dependencies/dependency-resolver');
  // The real loader registers empty onLoad entries too; keep its complete AspectList
  // without replaying callbacks on the native-hydrated retained source class.
  if (!remote) for (const [id] of workspace.onComponentLoadSlot.toArray()) {
    if (!component.state.aspects.get(id)) {
      component.state.aspects.upsertEntry(await workspace.resolveComponentId(id));
    }
  }
  const configs = component.state.aspects.entries.filter(entry => entry.config).map(entry => ({ id: entry.id.toString(), config: entry.config }));
  return {
    configs,
    sourceId: component.id.toObject(),
    dependencies: resolver.getDependencies(component).serialize(),
    excludedComponents: resolver.getCompIdsThatShouldNotBeInPolicy(),
    savePrefix: resolver.config.savePrefix,
    packageName: loaded.get('teambit.pkg/pkg').getPackageName(component),
  };
}
async function forkEnvironment({ env, config }) {
  const tracker = (await loadHarmony()).get('teambit.component/tracker');
  const oldEnv = config['teambit.envs/envs']?.env;
  if (oldEnv) {
    const oldKey = Object.keys(config).find(key => key.startsWith(oldEnv));
    if (oldKey) delete config[oldKey];
  }
  await tracker.addEnvToConfig(env, config);
  return config;
}
/** Only the real registered on-add/compiler slots run after Rust tracks the copy. */
async function forkAdded({ id, compile, deferred, progress = true }) {
  const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
  captureBootstrapProgress(workspace);
  const previous = snapshotBootstrapProgress;
  snapshotBootstrapProgress = progress;
  try {
    await workspace.clearCache();
    const { ComponentID } = bitRequire('@teambit/component-id');
    const parsed = ComponentID.fromString(id);
    const target = ComponentID.fromObject({ name: parsed.fullName }, parsed.scope);
    await workspace.triggerOnComponentAdd(target, { compile }, deferred ? {
      executeLoadSlot: false, loadExtensions: false, loadSeedersAsAspects: false,
    } : undefined);
  } finally {
    snapshotBootstrapProgress = previous;
  }
  return true;
}
async function forkPolicyFacts() {
  return (await loadHarmony()).get('teambit.dependencies/dependency-resolver').config;
}
async function forkPolicyApplied({ config }) {
  const resolver = (await loadHarmony()).get('teambit.dependencies/dependency-resolver');
  Object.assign(resolver.config, config);
  resolver.configAspect.setExtension('teambit.dependencies/dependency-resolver', resolver.config, { mergeIntoExisting: true, ignoreVersion: true });
  resolver.clearCache();
  return true;
}
async function forkAst({ files, pairs, sourceName, targetName, variables }) {
  const typescript = bitRequire('@teambit/typescript');
  const updates = Object.fromEntries(pairs);
  for (const file of files) {
    const input = fs.readFileSync(file.spool, 'utf8');
    const output = await typescript.transformSourceFile(file.filename, input,
      [typescript.importTransformer(updates), typescript.exportTransformer(updates)], undefined, updates);
    fs.writeFileSync(file.spool, output);
  }
  if (variables) await renameAst({ files, sourceName, targetName });
  return true;
}

/** Native capture supplies the Consumer; the published tracker getMany owns fresh load slots. */
let forkTrackingTarget;
function forkTracked(params) {
  forkTrackingTarget = params;
  return true;
}
async function forkLoadTracked(component) {
  const pending = forkTrackingTarget;
  if (!pending || component.id.toStringWithoutVersion() !== pending.id) return undefined;
  forkTrackingTarget = undefined;
  const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
  const consumer = component.state._consumer;
  workspace.consumer.componentLoader.componentsCache.set(consumer.id.toString(), consumer);
  captureBootstrapProgress(workspace);
  const previous = snapshotBootstrapProgress;
  snapshotBootstrapProgress = pending.progress;
  const originalLoad = workspace.consumer.loadComponents;
  let devFilesLoaded = false;
  workspace.consumer.loadComponents = async function(ids, ...args) {
    if (!devFilesLoaded && ids.some(id => id.toStringWithoutVersion() === pending.id)) {
      devFilesLoaded = true;
      const devFiles = (await loadHarmony()).get('teambit.component/dev-files');
      await devFiles.getDevFilesForConsumerComp(consumer);
    }
    return originalLoad.call(this, ids, ...args);
  };
  try {
    const ids = await workspace.resolveMultipleComponentIds([pending.id]);
    const [loaded] = await workspace.getMany(ids, {
      idsToNotLoadAsAspects: ids.map(id => id.toString()),
      loadSeedersAsAspects: false, loadExtensions: false,
    });
    if (!loaded) throw new Error(`fork tracker class unavailable: ${pending.id}`);
    for (const key of Object.keys(component).filter(key => key.startsWith('__native'))) loaded[key] = component[key];
    return loaded;
  } finally {
    workspace.consumer.loadComponents = originalLoad;
    snapshotBootstrapProgress = previous;
  }
}
