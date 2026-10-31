/** The published InstallMain owns its slots, mutable installer callbacks and finalization. */
let canonicalInstallWriterPending = false;
let canonicalInstallAttempted = false;
function prepareNativeBuildScriptsPath() {
  const helper = '@teambit/pnpm/dist/build-scripts-path.js';
  try {
    const modulePath = bitRequire.resolve(helper);
    bitRequire(modulePath).prepareBuildScriptsPath();
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
  }
  return process.env.PATH;
}
function installCanonicalSupport() {
  try {
    const { InstallMain } = bitRequire('@teambit/install/dist/install.main.runtime.js');
    installEngineInitialize();
    return typeof InstallMain === 'function' && typeof InstallMain.prototype.install === 'function';
  } catch {
    return false;
  }
}

/** Inspect the retained provider registry before Rust begins installation. */
async function installCanonicalNeeded({ coreIds }) {
  if (!Array.isArray(coreIds) || !coreIds.every(id => typeof id === 'string')) return true;
  try {
    const core = new Set(coreIds);
    const custom = id => typeof id !== 'string' || !core.has(id.split('@')[0]);
    const loaded = await loadHarmony();
    const workspace = loaded.get('teambit.workspace/workspace');
    if (cliArguments[0] === 'import' && workspace.consumer.bitMap.components.some(row => row.noFilesError)) {
      return true;
    }
    const loader = loaded.get('teambit.harmony/aspect-loader');
    const configured = loader.getNotLoadedConfiguredExtensions();
    // A custom configured aspect is handled by the static workspace preflight.
    // Do not load it here: the parent command owns provider registration order.
    if (!Array.isArray(configured) || configured.some(custom)) return true;
    const install = loaded.get('teambit.workspace/install');
    const resolver = loaded.get('teambit.dependencies/dependency-resolver');
    const slots = [
      install?.preLinkSlot, install?.preInstallSlot, install?.postInstallSlot,
      resolver?.preInstallSlot, resolver?.postInstallSlot,
      resolver?.packageManagerSlot, resolver?.addPackagesToLinkSlot,
    ];
    if (slots.some(slot => !slot || typeof slot.toArray !== 'function')) return true;
    return slots.some(slot => slot.toArray().some(([id]) => custom(id)));
  } catch {
    return true;
  }
}

async function installCanonical({ options, writer = false, loaderText }) {
  if (!installCanonicalSupport() || !options || typeof options !== 'object' || Array.isArray(options)) {
    return { error: 'published InstallMain.install unavailable' };
  }
  const invocation = { ...options };
  canonicalInstallAttempted = true;
  canonicalInstallWriterPending = writer;
  if (writer && !Object.hasOwn(invocation, 'dependenciesGraph')) invocation.dependenciesGraph = undefined;
  try {
    const loaded = await loadHarmony();
    const workspace = loaded.get('teambit.workspace/workspace');
    captureBootstrapProgress(workspace);
    const componentLogger = workspace.componentLoader.logger;
    const capturedStatusLine = componentLogger.setStatusLine;
    if (typeof componentLogger.__nativeSetStatusLine === 'function') {
      componentLogger.setStatusLine = componentLogger.__nativeSetStatusLine;
    }
    const loader = bitRequire('@teambit/legacy.loader').loader.on();
    if (typeof loaderText === 'string' && loaderText.length <= 4096) loader.setText(loaderText);
    const install = loaded.get('teambit.workspace/install');
    if (!install || typeof install.install !== 'function') {
      throw new Error('published InstallMain.install unavailable');
    }
    return await installEngineBegin(async () => {
      try {
        await install.install(undefined, invocation);
        return { error: null, loaderStarted: loader.isStarted };
      } catch (error) {
        return { error: error?.message ?? String(error), loaderStarted: loader.isStarted };
      } finally {
        componentLogger.setStatusLine = capturedStatusLine;
      }
    }, install);
  } catch (error) {
    // Parent operations catch installation errors and may compile once afterward.
    return { error: error?.message ?? String(error),
      loaderStarted: bitRequire('@teambit/legacy.loader').loader.isStarted };
  }
}

/** Import's published ComponentWriter catches and logs installation before compiling. */
async function installImportWriter({ ids, skipWriteConfigFiles }) {
  if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string' && id)) {
    throw new Error('import writer component ids');
  }
  const loaded = await loadHarmony();
  const workspace = loaded.get('teambit.workspace/workspace');
  const writer = loaded.get('teambit.component/component-writer');
  if (typeof writer?.installPackagesGracefully !== 'function') {
    throw new Error('published ComponentWriter.installPackagesGracefully unavailable');
  }
  const { ComponentID } = bitRequire('@teambit/component-id');
  const componentIds = ids.map(id => ComponentID.fromString(id));
  captureBootstrapProgress(workspace);
  const componentLogger = workspace.componentLoader.logger;
  const capturedStatusLine = componentLogger.setStatusLine;
  if (typeof componentLogger.__nativeSetStatusLine === 'function') {
    componentLogger.setStatusLine = componentLogger.__nativeSetStatusLine;
  }
  canonicalInstallWriterPending = true;
  bitRequire('@teambit/legacy.loader').loader.on();
  const install = loaded.get('teambit.workspace/install');
  return installEngineBegin(async () => {
    try {
      const error = await writer.installPackagesGracefully(componentIds, skipWriteConfigFiles === true);
      return { error: error?.message ?? null };
    } finally {
      componentLogger.setStatusLine = capturedStatusLine;
    }
  }, install);
}

/** ComponentWriter.finalizeWrite compiles after its gracefully caught install error. */
async function installCanonicalFinalize() {
  if (!canonicalInstallWriterPending) return { error: null, skipped: true };
  canonicalInstallWriterPending = false;
  const loaded = await loadHarmony();
  const writer = loaded.get('teambit.component/component-writer');
  if (!writer || typeof writer.compileGracefully !== 'function') {
    throw new Error('published ComponentWriter.compileGracefully unavailable');
  }
  const componentLogger = loaded.get('teambit.workspace/workspace').componentLoader.logger;
  const capturedStatusLine = componentLogger.setStatusLine;
  if (typeof componentLogger.__nativeSetStatusLine === 'function') {
    componentLogger.setStatusLine = componentLogger.__nativeSetStatusLine;
  }
  try {
    const error = await writer.compileGracefully();
    return { error: error?.message ?? null, skipped: false };
  } finally {
    componentLogger.setStatusLine = capturedStatusLine;
  }
}
