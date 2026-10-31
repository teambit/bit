/** Published class and extension adapters; native export owns object and workspace state. */
function ignoreExportInterrupt() {}
function exportInterrupt({ enabled }) {
  if (enabled) process.on('SIGINT', ignoreExportInterrupt);
  else process.removeListener('SIGINT', ignoreExportInterrupt);
  return true;
}
async function exportBootstrap() {
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  captureBootstrapProgress(workspace);
  const aspectLoader = loaded.get('teambit.harmony/aspect-loader');
  const aspects = await workspace.loadAspects(aspectLoader.getNotLoadedConfiguredExtensions(), undefined,
    'teambit.workspace/workspace (cli.registerOnStart)',
    { runSubscribers: false, skipDeps: !workspace.config.autoLoadAspectsDeps });
  const componentIds = await workspace.resolveMultipleComponentIds(aspects);
  componentIds.forEach(id => workspace.clearComponentCache(id));
  const modules = bitRequire('@teambit/workspace.modules.node-modules-linker');
  if (typeof modules.linkToNodeModulesByIds !== 'function') throw new Error('published export package adapter unavailable');
  return { ready: true };
}

async function exportPackages({ updatedLocally, exportedLanes }) {
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  // Main export keeps the published consumer/bitmap identity. Invalidate the
  // repository and component caches after Rust advances models and remote refs.
  // Lane export also changes ScopeJson lane markers, which requires reloading.
  if (exportedLanes.length) await workspace._reloadConsumer();
  else await workspace.clearCache();
  const { ComponentID } = bitRequire('@teambit/component-id');
  const ids = updatedLocally.map(id => workspace.consumer.bitMap.updateComponentId(ComponentID.fromString(id), true)).filter(id => id.hasVersion());
  await bitRequire('@teambit/workspace.modules.node-modules-linker').linkToNodeModulesByIds(workspace, ids, true);
  return true;
}

async function exportFinish({ receipt, eject, openBrowser }) {
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  // _reloadConsumer already clears workspace, component and repository caches.
  await workspace._reloadConsumer();
  const { ComponentID } = bitRequire('@teambit/component-id');
  const { LaneId } = bitRequire('@teambit/lane-id');
  const parse = (values, versioned = false) => (values || []).map(id => { const parsed = ComponentID.fromString(id); return versioned ? parsed : parsed.changeVersion(undefined); });
  const ids = parse(receipt.componentsIds);
  for (const id of ids) void id.scope;
  const lanes = await Promise.all((receipt.exportedLanes || []).map(id => workspace.scope.legacyScope.loadLane(LaneId.parse(id))));
  const exporter = loaded.get('teambit.scope/export');
  const ejectResults = eject ? await exporter.ejectExportedComponents(ids) : undefined;
  const { Scope } = bitRequire('@teambit/legacy.scope');
  if (Scope.onPostExport) await Scope.onPostExport(ids, lanes).catch(error => {
    exporter.logger.error('fatal: onPostExport encountered an error (this error does not stop the process)', error);
  });
  const browserOpened = Boolean(openBrowser && !process.env.CI && receipt.rippleJobUrls?.length);
  if (browserOpened) {
    const load = createRequire(bitRequire.resolve('@teambit/export'));
    const open = load('open').default || load('open');
    await open(receipt.rippleJobUrls[0]).catch(() => {});
  }
  const lane = lanes[0];
  const lastExport = {exportedComponents: ids.map(id=>id.toStringWithoutVersion()),
    ...(lane ? {lane:{scope:lane.scope,name:lane.name}} : {})};
  return { componentsIds:ids.map(id=>id.toStringWithoutVersion()), exportedLanes:lanes.map(lane=>lane.toLaneId().toString()), lastExport, browserOpened, ejectResults: ejectResults ?? null, ejectReport: ejectResults ? bitRequire('@teambit/eject').ejectTemplate(ejectResults) : '', jsonResult: {
    componentsIds: ids,
    newIdsOnRemote: parse(receipt.newIdsOnRemote, true),
    nonExistOnBitMap: parse(receipt.nonExistOnBitMap),
    removedIds: parse(receipt.removedIds),
    missingScope: parse(receipt.missingScope),
    ejectResults,
    exportedLanes: lanes,
    rippleJobs: receipt.rippleJobs || [],
    rippleJobUrls: receipt.rippleJobUrls || [],
  } };
}

async function exportFileAction({ path, name, options }) {
  try {
    const value = await bitRequire('@teambit/legacy.scope-api').action(path, name, options);
    return {ok:true,value:value ?? {}};
  } catch (error) {
    return {ok:false,message:String(error.message || error)};
  }
}
