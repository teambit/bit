/** Actual identity classes are reused by get/list/link/compiler, as WorkspaceComponentLoader does. */
const identityLoadedComponents = new Map();

/** WorkspaceComponentLoader.getMany returns newly loaded classes before cache hits. */
async function identityListOrder({ ids }) {
  const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
  const available = workspace.consumer.bitMap.getAllIdsAvailableOnLane();
  const options = { loadExtensions: false, executeLoadSlot: false, loadSeedersAsAspects: true, resolveExtensionsVersions: false };
  const fresh = [], cached = [];
  for (const identity of ids) {
    const id = available.find(id => id.toStringWithoutVersion() === identity);
    if (!id) throw new Error(`scope rename list identity missing: ${identity}`);
    if (workspace.componentLoader.getFromCache(id, options)) cached.push(identity);
    else fresh.push(id);
  }
  if (!fresh.length) return cached;
  const loader = workspace.componentLoader;
  const groups = await loader.buildLoadGroups(await loader.groupAndUpdateIds(fresh));
  const requested = new Set(fresh.map(id => id.toStringWithoutVersion()));
  const ordered = groups.filter(group => group.seeders)
    .flatMap(group => {
      const loaded = [], pending = [];
      for (const id of group.workspaceIds) {
        (workspace.consumer.componentLoader.componentsCache.get(id.toString()) ? loaded : pending).push(id);
      }
      return [...pending, ...loaded, ...group.scopeIds];
    })
    .map(id => id.toStringWithoutVersion()).filter(id => requested.has(id));
  return [...new Set([...ordered, ...cached])];
}

function identityLoadedComponent(identity) {
  return identityRenameCommand ? identityLoadedComponents.get(identity) : undefined;
}

async function identityUseCached({ components }) {
  if (!identityRenameCommand) return true;
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  const envs = loaded.get('teambit.envs/envs');
  const resolver = loaded.get('teambit.dependencies/dependency-resolver');
  for (const row of components) {
    let component = identityLoadedComponents.get(row.identity);
    if (!component) {
      component = await hydrateStatusComponent(row);
      await statusApplyLoadCallbacks(component, { workspace, envs, resolver });
      identityLoadedComponents.set(row.identity, component);
    }
    const consumer = component.state._consumer;
    consumer.componentMap = workspace.consumer.bitMap.getComponent(component.id, { ignoreVersion: true });
    workspace.componentLoader.saveInCache(component, { loadExtensions: true, executeLoadSlot: true });
    workspace.consumer.componentLoader.componentsCache.set(consumer.id.toString(), consumer);
  }
  return true;
}

/** Preserve seed-before-environment lookup ordering with one metadata protocol frame. */
async function identityLinkFacts({ components, ids }) {
  await identityUseCached({ components });
  return identityEnvironments({ ids });
}

async function identityEnvironments({ ids }) {
  const envs = (await loadHarmony()).get('teambit.envs/envs');
  return Object.fromEntries(ids.map(id => [id, (envs.getEnvDefinitionByStringId(id) ?? envs.getDefaultEnv()).id]));
}

/** Rust supplies exact path changes; SourceFile objects remain the same callback-visible objects. */
async function identityMaterialized({ identity, directory, mainFile, files }) {
  const changes = new Map(files.map(file => [path.resolve(file.from), path.resolve(file.to)]));
  for (const component of identityLoadedComponents.values()) {
    const consumer = component.state._consumer;
    const base = component.id.toStringWithoutVersion() === identity ? path.join(root, directory) : consumer.writtenPath;
    for (const file of consumer.files) {
      const destination = changes.get(path.resolve(file.path));
      if (!destination) continue;
      file.updatePaths({ newBase: base, newRelative: path.relative(base, destination) });
      file.contents = fs.readFileSync(destination);
    }
    if (component.id.toStringWithoutVersion() === identity) {
      consumer.writtenPath = base;
      consumer.mainFile = mainFile;
    }
  }
  return true;
}

/** ComponentStatusLoader loads a legacy Consumer before a later workspace getMany. */
let identityConsumerOnly = false;
const identityConsumers = new Map();
function identityConsumerMode({ enabled }) {
  if (enabled) identityConsumers.clear();
  identityConsumerOnly = enabled;
  return true;
}
