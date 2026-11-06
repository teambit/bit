/** Actual loaded class/policy facts; native Rust owns selection, aggregation and publication. */
async function importWriteDependencyFacts() {
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  const resolver = loaded.get('teambit.dependencies/dependency-resolver');
  captureBootstrapProgress(workspace);
  const previous = snapshotBootstrapProgress;
  snapshotBootstrapProgress = !cliArguments.some(argument => ['--json', '-j'].includes(argument));
  try {
    const { componentPolicies, variantPoliciesByPatterns } = importDependencyPolicies ?? {};
    const classes = importDependencyClasses;
    if (!classes || !componentPolicies) throw new Error('import dependency classes were not captured');
    importDependencyClasses = undefined;
    importDependencyPolicies = undefined;
    return {
      rootPolicy: { entries: resolver.getWorkspacePolicyFromConfig().entries },
      variantPoliciesByPatterns,
      componentPolicies: componentPolicies.map(({ componentId, policy }) => ({ componentId: componentId.toString(), policy })),
      components: classes.map(component => ({
        identity: component.id.toString(),
        packageName: resolver.getPackageName(component),
        dependencies: resolver.getDependencies(component).map(dep => ({
          name: typeof dep.getPackageName === 'function' ? dep.getPackageName() : null,
          version: dep.version, isAuto: dep.source === 'auto',
          isExtension: Boolean(dep.isExtension), lifecycleType: dep.lifecycle,
        })),
      })),
    };
  } finally {
    snapshotBootstrapProgress = previous;
  }
}

let importClassMode;
let importClassIds;
let importDependencyClasses;
let importGraphClasses;
const importNativeMetadata = new Map();
let importDependencyPolicies;
function importClassLoad({ mode, ids }) {
  if (!['graph', 'writeDeps', null].includes(mode)) throw new Error('invalid import class phase');
  importClassMode = mode;
  importClassIds = ids;
  return true;
}
async function importHydrateClasses(rows) {
  if (!importClassMode) return undefined;
  const mode = importClassMode;
  const requested = importClassIds;
  importClassMode = undefined;
  importClassIds = undefined;
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  if (importWorkspaceIds) await importApplyWorkspaceOrder(workspace);
  const native = await Promise.all(rows.map(async row => {
    const component = await hydrateStatusComponent(row);
    await importHydrateModel(component, row);
    return component;
  }));
  const byId = new Map(native.map(component => [component.id.toStringWithoutVersion(), component]));
  for (const component of native) {
    importNativeMetadata.set(component.id.toString(), Object.fromEntries(
      Object.keys(component).filter(key => key.startsWith('__native')).map(key => [key, component[key]])
    ));
    const consumer = component.state._consumer;
    workspace.consumer.componentLoader.componentsCache.set(consumer.id.toString(), consumer);
  }
  if (mode === 'writeDeps') importDependencyPolicies = {
    componentPolicies: await workspace.getComponentsWithDependencyPolicies(),
    variantPoliciesByPatterns: workspace.variantPatternsToDepPolicesDict(),
  };
  const originalLoad = workspace.consumer.loadComponents;
  const devFilesLoaded = new Set();
  workspace.consumer.loadComponents = async function(ids, ...args) {
    for (const id of ids) {
      const key = id.toStringWithoutVersion();
      const component = byId.get(key);
      if (component && !devFilesLoaded.has(key)) {
        devFilesLoaded.add(key);
        await loaded.get('teambit.component/dev-files').getDevFilesForConsumerComp(component.state._consumer);
      }
    }
    return originalLoad.call(this, ids, ...args);
  };
  captureBootstrapProgress(workspace);
  const previous = snapshotBootstrapProgress;
  snapshotBootstrapProgress = !cliArguments.some(argument => ['--json', '-j'].includes(argument));
  try {
    let components;
    let requestedIds;
    if (mode === 'graph') {
      requestedIds = native.map(component => component.id);
      components = [];
      for (const component of native) components.push(await workspace.get(component.id));
    } else {
      const available = workspace.consumer.bitMap.getAllIdsAvailableOnLane();
      const ids = requested.map(identity => {
        const id = available.find(id => id.toStringWithoutVersion() === identity);
        if (!id) throw new Error('import class requested identity missing');
        return id;
      });
      requestedIds = ids;
      components = await workspace.getMany(ids);
    }
    const expected = new Set(requestedIds.map(id => id.toString()));
    const seen = new Set();
    for (const component of components) {
      const identity = component.id.toString();
      const metadata = importNativeMetadata.get(identity);
      if (!expected.has(identity) || seen.has(identity) || !metadata) throw new Error('import class identity changed');
      seen.add(identity);
      Object.assign(component, metadata);
    }
    if (seen.size !== expected.size) throw new Error('import class requested identity missing');
    if (mode === 'writeDeps') importDependencyClasses = components;
    else importGraphClasses = components;
    return components.filter(component => byId.has(component.id.toStringWithoutVersion()));
  } finally {
    workspace.consumer.loadComponents = originalLoad;
    snapshotBootstrapProgress = previous;
  }
}

/** The resolver intersects current missing imports with this tracked model's metadata. */
async function importHydrateModel(component, row) {
  const version = row.scope?.currentVersion;
  if (!version) return;
  const { ComponentID } = bitRequire('@teambit/component-id');
  const { ConsumerComponent, Dependency } = bitRequire('@teambit/legacy.consumer-component');
  const id = component.id;
  component.state._consumer.componentFromModel = await ConsumerComponent.fromObject({
    ...version, name: id.fullName, scope: id.scope, version: row.version, files: [],
    dependencies: (version.dependencies ?? []).map(dependency => Dependency.deserialize(dependency)),
    devDependencies: (version.devDependencies ?? []).map(dependency => Dependency.deserialize(dependency)),
    peerDependencies: (version.peerDependencies ?? []).map(dependency => Dependency.deserialize(dependency)),
    extensions: (version.extensions ?? []).map(extension => ({
      ...extension,
      extensionId: extension.extensionId ? ComponentID.fromObject(extension.extensionId) : undefined,
    })),
  });
}

async function importGraphDependencyFacts() {
  if (!importGraphClasses) throw new Error('import graph classes were not captured');
  const resolver = (await loadHarmony()).get('teambit.dependencies/dependency-resolver');
  const classes = importGraphClasses;
  importGraphClasses = undefined;
  return classes.map(component => ({
    identity: component.id.toStringWithoutVersion(),
    resolvedDependencies: resolver.getComponentDependencies(component).map(dependency => dependency.serialize()),
  }));
}

async function importCompleteClassLoad() {
  if (importClassMode) await importHydrateClasses([]);
  return true;
}

let importWorkspaceIds;
async function importWorkspaceOrder({ ids, defer = false }) {
  importWorkspaceIds = ids;
  if (!defer && ids.length) await importApplyWorkspaceOrder((await loadHarmony()).get('teambit.workspace/workspace'));
  return true;
}
async function importApplyWorkspaceOrder(workspace) {
  if (!importWorkspaceIds.length) return;
  const bitmap = workspace.consumer.bitMap;
  const rows = new Map(bitmap.components.map(component => [component.id.toStringWithoutVersion(), component]));
  if (rows.size !== importWorkspaceIds.length) throw new Error('import workspace order count changed');
  const ordered = importWorkspaceIds.map(identity => {
    const row = rows.get(identity);
    if (!row) throw new Error('import workspace order identity changed');
    rows.delete(identity);
    return row;
  });
  if (rows.size) throw new Error('import workspace order incomplete');
  bitmap.components = ordered;
  bitmap._invalidateCache();
}
