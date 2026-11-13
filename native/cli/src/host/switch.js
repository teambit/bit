let switchStatusSession;

/** CheckoutMain loads selected IDs serially, after LaneSwitcher orders main-only before lane IDs. */
async function switchStatusBegin({loadOrder, directory}) {
  if (cliArguments[0] !== 'switch' || switchStatusSession) {
    throw new Error('switch grouped loader session is unavailable');
  }
  const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
  const loader = workspace.componentLoader;
  if (typeof loader.getAndLoadSlotOrdered !== 'function'
      || typeof loader.groupAndUpdateIds !== 'function'
      || typeof loader.buildLoadGroups !== 'function'
      || typeof workspace.get !== 'function') {
    throw new Error('published grouped switch component loader is unavailable');
  }
  const devFiles = (await loadHarmony()).get('teambit.component/dev-files');
  if (typeof devFiles?.getDevFilesForConsumerComp !== 'function') {
    throw new Error('published switch dependency loader is unavailable');
  }
  const { DependenciesLoader } = bitRequire('@teambit/dependencies/dist/dependencies-loader/dependencies-loader.js');
  if (typeof DependenciesLoader?.prototype.getDependenciesDataFromCacheIfPossible !== 'function') {
    throw new Error('published switch dependency cache validation is unavailable');
  }
  const legacy = workspace.consumer;
  const cache = legacy?.componentLoader?.componentsCache;
  if (typeof legacy?.bitMap?.getAllIdsAvailableOnLane !== 'function'
      || typeof legacy.bitMap.getComponent !== 'function'
      || typeof legacy.loadComponents !== 'function'
      || typeof cache?.get !== 'function' || typeof cache?.set !== 'function') {
    throw new Error('published switch legacy component loader is unavailable');
  }
  const available = legacy.bitMap.getAllIdsAvailableOnLane();
  if (!Array.isArray(loadOrder) || new Set(loadOrder).size !== loadOrder.length
      || !loadOrder.every(identity => typeof identity === 'string')
      || typeof directory !== 'string' || !path.isAbsolute(directory)) {
    throw new Error('switch ordered target identities changed');
  }
  const ids = new Map(loadOrder.map(identity => {
    const id = available.find(candidate => candidate.toStringWithoutVersion() === identity);
    if (!id) throw new Error(`switch component identity changed: ${identity}`);
    return [identity, id];
  }));
  const byRow = new Map();
  const byIdentity = new Map();
  const originalLoad = legacy.loadComponents;
  const devFilesLoaded = new Set();
  legacy.loadComponents = async function (requested, ...args) {
    for (const id of requested) {
      const identity = id.toStringWithoutVersion();
      if (ids.has(identity) && !byRow.has(identity)) {
        const session = switchStatusSession;
        let waiting = session.waiting.get(identity);
        if (!waiting) {
          let resume;
          const promise = new Promise(resolve => { resume = resolve; });
          waiting = {promise, resume};
          session.waiting.set(identity, waiting);
          session.notifyNeed?.();
        }
        await waiting.promise;
      }
      const row = byRow.get(identity);
      if (!row) {
        // The published loader can request transitive envs or aspects.
        continue;
      }
      if (row.version && id.version !== row.version) {
        throw new Error(`switch component identity changed: ${identity}`);
      }
      let component = byIdentity.get(identity);
      if (!component) {
        component = await hydrateStatusComponent(row);
        byIdentity.set(identity, component);
        const consumer = component.state._consumer;
        if (!cache.get(consumer.id.toString())) cache.set(consumer.id.toString(), consumer);
      }
      if (row.directory === '.' || devFilesLoaded.has(identity)) continue;
      const consumer = component.state._consumer;
      if (cache.get(consumer.id.toString()) !== consumer) continue;
      consumer.componentMap ??= legacy.bitMap.getComponent(consumer.id, {ignoreVersion: true});
      const dependencies = new DependenciesLoader(consumer, undefined, undefined, undefined,
        workspace.componentLoader.logger);
      if (await dependencies.getDependenciesDataFromCacheIfPossible(workspace, {useDependenciesCache: true})) continue;
      devFilesLoaded.add(identity);
      await devFiles.getDevFilesForConsumerComp(consumer);
    }
    return originalLoad.call(this, requested, ...args);
  };
  statusComponents = [];
  switchStatusSession = { workspace, legacy, originalLoad, ids, loadOrder, byRow, byIdentity,
    next: 0, directory, waiting: new Map(), operation: undefined, notifyNeed: undefined };
  return true;
}

function switchStatusStageRow({component: row}) {
  const session = switchStatusSession;
  const id = session?.ids.get(row?.identity);
  if (!id || session.byRow.has(row.identity) || (row.version && row.version !== id.version)) {
    throw new Error(`switch component identity changed: ${row.identity}`);
  }
  session.byRow.set(row.identity, row);
  const waiting = session.waiting.get(row.identity);
  if (waiting) {
    session.waiting.delete(row.identity);
    waiting.resume();
  }
  return true;
}

/** One published workspace.get follows one native capture and precedes the next. */
async function switchStatusLoadOne({component: row}) {
  const session = switchStatusSession;
  if (!session || session.operation || row?.identity !== session.loadOrder[session.next]) {
    throw new Error('switch ordered target changed during class loading');
  }
  if (!session.byRow.has(row.identity)) switchStatusStageRow({component: row});
  const id = session.ids.get(row.identity);
  session.operation = session.workspace.get(id).then(component => switchStatusResult(session, row, component));
  return switchStatusResume();
}

async function switchStatusResume() {
  const session = switchStatusSession;
  if (!session?.operation) throw new Error('switch grouped loader continuation is unavailable');
  if (session.waiting.size) return {needsRows: [...session.waiting.keys()]};
  const need = new Promise(resolve => { session.notifyNeed = () => resolve({needsRows: [...session.waiting.keys()]}); });
  try {
    const result = await Promise.race([session.operation, need]);
    if (result.row) session.operation = undefined;
    return result;
  } finally {
    session.notifyNeed = undefined;
  }
}

function switchStatusResult(session, row, component) {
  const native = session.byIdentity.get(row.identity);
  if (!native || component.id.toString() !== native.id.toString()) {
    throw new Error(`switch grouped load changed component identity: ${row.identity}`);
  }
  for (const key of Object.keys(native).filter(key => key.startsWith('__native'))) component[key] = native[key];
  statusComponents.push(component);
  session.next += 1;
  const consumer = component.state._consumer;
  const sources = statusSourceOverlays(component, session.directory, 'current');
  return {row: { identity: row.identity, current: statusMetadata(row.current, consumer),
    files: consumer.files.map(statusRelative), sourceOverlays: sources.overlays,
    sourceOverlayRoot: session.directory, issues: statusIssues(consumer.issues),
    readSet: sources.proofs, originalDependencyIdentities: component.__nativeOriginalDependencyIds,
    dependencyIdentities: [...consumer.dependencies.get(), ...consumer.devDependencies.get(),
      ...consumer.peerDependencies.get()].map(dependency => dependency.id.toString()) }};
}

function switchStatusFinish() {
  const session = switchStatusSession;
  if (!session) return true;
  session.legacy.loadComponents = session.originalLoad;
  switchStatusSession = undefined;
  if (session.operation || session.waiting.size || session.next !== session.loadOrder.length) {
    throw new Error('switch grouped load changed component count');
  }
  return true;
}

async function switchStatusHydrateClasses(rows, workspace, checkout, loadOrder, directory) {
  if (cliArguments[0] !== 'switch' || !checkout) return undefined;
  await switchStatusBegin({loadOrder, directory});
  try {
    for (const row of loadOrder.map(identity => rows.find(row => row.identity === identity))) {
      let result = await switchStatusLoadOne({component: row});
      while (result.needsRows) throw new Error('switch batch loader needs ordered source capture');
    }
    return rows.map(row => statusComponents.find(component =>
      component.id.toStringWithoutVersion() === row.identity));
  } finally {
    switchStatusFinish();
  }
}

/** ComponentWriter.finalizeWrite compiles once more after installPackagesGracefully. */
async function switchCompile({ installationSucceeded }) {
  if (!laneSwitchCommand) throw new Error('switch compiler adapter outside lane adoption');
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  captureBootstrapProgress(workspace);
  const loader = bitRequire('@teambit/legacy.loader').loader;
  // A retained InstallMain invocation has already made the published loader
  // transitions. Only native package-manager failure needs its state mirrored.
  const canonicalAttempted = canonicalInstallAttempted;
  canonicalInstallAttempted = false;
  const failedBeforePm = laneHistoryCommand && historyInstallationFailedBeforePm;
  if (!installationSucceeded && !failedBeforePm && !canonicalAttempted) loader.off();
  const previous = snapshotBootstrapProgress;
  snapshotBootstrapProgress = failedBeforePm
    ? !cliArguments.some(argument => ['--json', '-j'].includes(argument))
    : loader.isStarted;
  try {
    await loaded.get('teambit.compilation/compiler').compileOnWorkspace();
    return { error: null };
  } catch (error) {
    return { error: error.message };
  } finally {
    snapshotBootstrapProgress = previous;
  }
}
/** Policy aggregation stays native; the published lookup still loads actual aspect classes. */
async function switchConfiguredAspectClasses() {
  if (!laneSwitchCommand) throw new Error('switch policy adapter outside lane adoption');
  const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
  captureBootstrapProgress(workspace);
  const previous = snapshotBootstrapProgress;
  snapshotBootstrapProgress = true;
  try {
    await workspace.getConfiguredUserAspectsPackages({ externalsOnly: true });
    return null;
  } finally {
    snapshotBootstrapProgress = previous;
  }
}

let switchInstallationClasses;
let switchInstallationDirectoryMap;
let switchInstallationEngineIds;
/** Execute the published class load at its native-owned installation boundary. */
async function switchInstallationComponents({ phase, ids }) {
  if (!laneSwitchCommand) throw new Error('installation classes outside lane adoption');
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  captureBootstrapProgress(workspace);
  const previous = snapshotBootstrapProgress;
  snapshotBootstrapProgress = !cliArguments.some(argument => ['--json', '-j'].includes(argument));
  try {
    await loadInstallComponents();
    if (phase === 'initial') {
      laneInstallationPrepared = true;
      return { components: (switchInstallationClasses ?? []).filter(component =>
        workspace.componentDir(component.id) !== workspace.path).map(component => ({
          id: component.id.toString(), directory: workspace.componentDir(component.id)
        })) };
    }
    if (phase === 'linking') {
      const { ComponentID } = bitRequire('@teambit/component-id');
      const previousIds = switchInstallationEngineIds ?? switchInstallationClasses?.filter(component =>
        workspace.componentDir(component.id) !== workspace.path).map(component => component.id);
      const requested = previousIds ?? ids.map(id => ComponentID.fromString(id));
      switchInstallationClasses = requested.length ? await workspace.getMany(requested, {
        idsToNotLoadAsAspects: requested.map(id => id.toString()),
        loadSeedersAsAspects: false, loadExtensions: false
      }) : [];
      return { components: switchInstallationClasses.map(component => ({
        id: component.id.toString(), directory: workspace.componentDir(component.id)
      })) };
    }
    if (phase === 'root-envs' || phase === 'root-apps') {
      if (phase === 'root-envs') {
        await loaded.get('teambit.workspace/install')._getAllUsedEnvIds();
      } else {
        await loaded.get('teambit.harmony/application').listAppsComponents();
      }
      return { components: switchInstallationClasses.map(component => ({
        id: component.id.toString(), directory: workspace.componentDir(component.id)
      })) };
    }
    if (!['manifests', 'engine'].includes(phase)) throw new Error('installation class phase');
    const directoryMap = await loaded.get('teambit.workspace/install').getComponentsDirectory([]);
    switchInstallationClasses = directoryMap.toArray().map(([component]) => component);
    if (phase === 'manifests') switchInstallationDirectoryMap = directoryMap;
    if (phase === 'engine') switchInstallationEngineIds = switchInstallationClasses.map(component => component.id);
    return { components: directoryMap.toArray().map(([component, directory]) => ({
      id: component.id.toString(), directory
    })) };
  } finally {
    snapshotBootstrapProgress = previous;
  }
}

/** NodeModuleLinker invalidates dependency/class caches only after changed package manifests. */
async function switchInstallationLinked({ ids }) {
  if (!laneSwitchCommand) throw new Error('installation link cache outside lane adoption');
  const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
  const components = switchInstallationClasses.filter(component =>
    workspace.componentDir(component.id) !== workspace.path);
  if (components.length !== ids.length || components.some((component, index) =>
    component.id.toString() !== ids[index])) throw new Error('installation link class inventory changed');
  await Promise.all(components.map(component => workspace.consumer.componentFsCache
    .deleteDependenciesDataCache(component.state._consumer.id.toString())));
  workspace.clearAllComponentsCache();
  return null;
}

let switchSubscriberContext;
/** Rust owns the package operation; subscribers receive the actual retained receiver/classes. */
async function switchInstallSubscribers(request) {
  if (!laneSwitchCommand) throw new Error('switch subscriber adapter outside lane adoption');
  const loaded = await loadHarmony();
  const resolver = loaded.get('teambit.dependencies/dependency-resolver');
  if (request.phase === 'pre') switchSubscriberContext = await switchSubscriberInputs(request, loaded, resolver);
  const context = switchSubscriberContext;
  if (!context || !['pre', 'post'].includes(request.phase)) throw new Error('switch subscriber phase');
  const subscribers = request.phase === 'pre' ? context.installer.preInstallSubscriberList : context.installer.postInstallSubscriberList;
  for (const subscriber of subscribers) await subscriber(context.installer, context.args);
  if (request.phase === 'pre') return switchSubscriberEffective(context);
  if (request.phase === 'post') switchSubscriberContext = undefined;
  return null;
}

async function switchSubscriberInputs(request, loaded, resolver) {
  const workspace = loaded.get('teambit.workspace/workspace');
  const { ComponentID } = bitRequire('@teambit/component-id');
  const { ComponentMap } = bitRequire('@teambit/component');
  const { WorkspacePolicy } = bitRequire('@teambit/dependency-resolver');
  const entries = switchInstallationDirectoryMap ? [] : request.components.map(row => {
    const component = workspace.componentLoader.getFromCache(ComponentID.fromString(row.id), {
      loadExtensions: false, executeLoadSlot: false, loadSeedersAsAspects: false, resolveExtensionsVersions: false
    });
    if (!component) throw new Error(`switch subscriber class missing: ${row.id}`);
    return [component.id.toString(), [component, row.directory]];
  });
  const rootPolicy = new WorkspacePolicy(request.rootPolicy.map(row => ({
    dependencyId: row.name, lifecycleType: row.lifecycle,
    value: {version: row.version, ...(row.preserve == null ? {} : {preserve: row.preserve})}
  })));
  const componentDirectoryMap = switchInstallationDirectoryMap ?? new ComponentMap(new Map(entries));
  const actual = componentDirectoryMap.toArray();
  if (actual.length !== request.components.length || actual.some(([component, directory], index) =>
    component.id.toString() !== request.components[index].id || !installationDirectoryEquals(directory, request.components[index].directory))) {
    throw new Error('switch subscriber directory inventory changed');
  }
  const args = {componentDirectoryMap, options: request.options,
    packageManagerOptions: request.packageManagerOptions, rootDir: request.rootDir, rootPolicy};
  const installer = resolver.getInstaller({});
  const originals = {componentDirectoryMap: args.componentDirectoryMap, options: args.options,
    packageManagerOptions: args.packageManagerOptions, rootDir: args.rootDir, rootPolicy};
  return {installer, args, originals,
    initialOptions: JSON.parse(JSON.stringify(originals.options)),
    initialManager: installer.packageManager,
    initialManagerName: installer.packageManager.name,
    initialManagerInstall: installer.packageManager.install,
    initialInstallingContext: JSON.stringify(installer.installingContext),
    initialPatchResolver: installer.resolvePatchPaths,
    initialExtensions: installer.withBuiltInPackageExtensions,
    initialPackageOptions: JSON.parse(JSON.stringify(originals.packageManagerOptions)),
    initialReceiver: JSON.parse(JSON.stringify(switchSubscriberReceiver(installer)))};
}

function switchSubscriberReceiver(installer) {
  return Object.fromEntries(['cacheRootDir','nodeLinker','packageImportMethod','sideEffectsCache',
    'nodeVersion','engineStrict','peerDependencyRules','neverBuiltDependencies','allowScripts',
    'dangerouslyAllowAllScripts','preferOffline','minimumReleaseAge','minimumReleaseAgeExclude',
    'patchedDependencies','packageExtensions'].map(key => [key, installer[key]]));
}

function switchSubscriberEffective(context) {
  const { originals, installer, initialPackageOptions, initialReceiver } = context;
  if (installer.packageManager !== context.initialManager || installer.packageManager.name !== context.initialManagerName
      || installer.packageManager.install !== context.initialManagerInstall
      || JSON.stringify(installer.installingContext) !== context.initialInstallingContext
      || installer.resolvePatchPaths !== context.initialPatchResolver
      || installer.withBuiltInPackageExtensions !== context.initialExtensions) {
    throw new Error('native lane installation subscriber receiver replacement is not yet supported');
  }
  for (const key of new Set([...Object.keys(context.initialOptions), ...Object.keys(originals.options)])) {
    if (!['linkedDependencies', 'forcedHarmonyVersion'].includes(key)
        && JSON.stringify(context.initialOptions[key]) !== JSON.stringify(originals.options[key])) {
      throw new Error(`native lane installation subscriber option mutation is not yet supported: ${key}`);
    }
  }
  const packageManagerChanges = {};
  const receiver = switchSubscriberReceiver(installer);
  for (const key of new Set([...Object.keys(initialPackageOptions), ...Object.keys(originals.packageManagerOptions)])) {
    const value = originals.packageManagerOptions[key];
    if (typeof value === 'function') throw new Error(`native lane installation subscriber function option is not yet supported: ${key}`);
    if (JSON.stringify(value) !== JSON.stringify(initialPackageOptions[key])
        || (key === 'throttleProgress' && typeof value === 'number' && !Number.isFinite(value))) {
      let effective = value === undefined ? receiver[key] : value;
      // Preserve N-API ToUint32 for NaN/Infinity before JSON would turn them into null.
      if (key === 'throttleProgress') {
        if (typeof effective === 'number') effective = effective >>> 0;
        else if (effective === undefined) effective = null;
      }
      if (effective !== undefined) packageManagerChanges[key] = effective;
    }
  }
  for (const [key, value] of Object.entries(receiver)) {
    if (!Object.hasOwn(originals.packageManagerOptions, key) && JSON.stringify(value) !== JSON.stringify(initialReceiver[key])) {
      packageManagerChanges[key] = value;
    }
  }
  return {options: originals.options, packageManagerChanges,
    cleanComponents: !originals.packageManagerOptions.rootComponents && !originals.packageManagerOptions.keepExistingModulesDir,
    componentDirectories: originals.componentDirectoryMap.toArray().map(([component, directory]) => ({id: component.id.toString(), directory}))};
}

let historyInstallationFailedBeforePm = false;
/** InstallMain.calculateLinks loads the same live Consumers before publishing any links. */
async function historyInstallationComponents({ aspectIds }) {
  if (!laneHistoryCommand) throw new Error('history class load outside lane restoration');
  const workspace = (await loadHarmony()).get('teambit.workspace/workspace');
  captureBootstrapProgress(workspace);
  const previous = snapshotBootstrapProgress;
  historyInstallationFailedBeforePm = false;
  snapshotBootstrapProgress = !cliArguments.some(argument => ['--json', '-j'].includes(argument));
  try {
    await prepareInstall(aspectIds);
    await loadInstallComponents();
    laneInstallationPrepared = true;
    return { error: null };
  } catch (error) {
    // ComponentWriter catches installation failures and then compiles in this same session.
    // A protocol-level failure would retire the Host and replay provider startup.
    historyInstallationFailedBeforePm = true;
    return { error: error.message };
  } finally {
    snapshotBootstrapProgress = previous;
  }
}
