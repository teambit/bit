/** ComponentWriter.finalizeWrite compiles once more after installPackagesGracefully. */
async function switchCompile({ installationSucceeded }) {
  if (!laneSwitchCommand) throw new Error('switch compiler adapter outside lane adoption');
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  captureBootstrapProgress(workspace);
  const loader = bitRequire('@teambit/legacy.loader').loader;
  // Pnpm turns the loader off before its engine and restores it only on success.
  // Rust ran that engine; preserve its failed-install loader state for the real compiler.
  const failedBeforePm = laneHistoryCommand && historyInstallationFailedBeforePm;
  if (!installationSucceeded && !failedBeforePm) loader.off();
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
