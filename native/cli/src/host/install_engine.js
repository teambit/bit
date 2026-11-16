/** Suspend only the published pnpm engine call; all Bit installation classes keep running. */
let installEngineSession;
let installEngineBaseline;

function installEngineTrace(reason) {
  if (process.env.BIT_NATIVE_TRACE) process.stderr.write(`bit-native: install engine ${reason}\n`);
}

/** Called by installCanonicalSupport before workspace providers can replace methods. */
function installEngineInitialize() {
  if (installEngineBaseline !== undefined) return;
  try {
    const lynx = bitRequire('@teambit/pnpm/dist/lynx.js');
    const { PnpmPackageManager } = bitRequire('@teambit/pnpm/dist/pnpm.package-manager.js');
    const { DependencyInstaller } = bitRequire('@teambit/dependency-resolver/dist/dependency-installer.js');
    const { InstallMain } = bitRequire('@teambit/install/dist/install.main.runtime.js');
    const { Registries } = bitRequire('@teambit/pkg.entities.registry/dist/registries.js');
    const { Registry } = bitRequire('@teambit/pkg.entities.registry/dist/registry.js');
    const { pnpmErrorToBitError } = bitRequire('@teambit/pnpm/dist/pnpm-error-to-bit-error.js');
    if (typeof lynx.install !== 'function' || typeof PnpmPackageManager?.prototype?.install !== 'function'
      || typeof DependencyInstaller?.prototype?.installComponents !== 'function'
      || typeof InstallMain?.prototype?._installModulesProfiled !== 'function'
      || typeof Registries?.prototype?.toMap !== 'function'
      || typeof Registry !== 'function'
      || typeof pnpmErrorToBitError !== 'function') {
      installEngineTrace('published methods unavailable');
      installEngineBaseline = null;
      return;
    }
    installEngineBaseline = {
      lynx, original: lynx.install,
      pmConstructor: PnpmPackageManager,
      pmInstall: PnpmPackageManager.prototype.install,
      installerConstructor: DependencyInstaller,
      componentInstall: DependencyInstaller.prototype.installComponents,
      installConstructor: InstallMain,
      modulesInstall: InstallMain.prototype._installModulesProfiled,
      registriesConstructor: Registries,
      registryConstructor: Registry,
      registriesToMap: Registries.prototype.toMap,
      convertError: pnpmErrorToBitError,
    };
  } catch {
    installEngineTrace('published module resolution failed');
    installEngineBaseline = null;
  }
}

function installEngineSupport() {
  return installEngineBaseline ?? null;
}

function installEnginePlain(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  if (require('node:util').types.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) return false;
  seen.add(value);
  const valid = Reflect.ownKeys(value).every(key => {
    if (typeof key !== 'string') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value')
      && (descriptor.value === undefined || installEnginePlain(descriptor.value, seen));
  });
  seen.delete(value);
  return valid;
}

/** Convert the actual lynx arguments only when no behavior is lost in JSON. */
function installEnginePayload(args, support) {
  if (args.length !== 9) {
    installEngineTrace('lynx argument count');
    return null;
  }
  const [rootDir, manifestsByPaths, storeDir, cacheDir, registries,
    proxyConfig, networkConfig, options] = args;
  if (typeof rootDir !== 'string' || typeof storeDir !== 'string' || typeof cacheDir !== 'string'
    || !installEngineRegistries(support, registries) || !installEnginePlain(manifestsByPaths)
    || !installEnginePlain(proxyConfig) || !installEnginePlain(networkConfig)
    || !installEnginePlain(options)) {
    installEngineTrace('lynx argument shape');
    return null;
  }
  if (options?.reportOptions?.outputStream != null) {
    installEngineTrace('custom reporter output stream');
    return null;
  }
  const registryMap = registries.toMap();
  const authHeaderByUri = installEngineAuth(registries);
  const proxy = installEngineProxy(proxyConfig);
  const network = installEngineNetwork(networkConfig);
  if (authHeaderByUri === null || !installEnginePlain(registryMap)
    || !installEnginePlain(authHeaderByUri) || !installEnginePlain(proxy)
    || !installEnginePlain(network)) {
    installEngineTrace('registry or network shape');
    return null;
  }
  return {
    rootDir, manifestsByPaths, storeDir, cacheDir, registryMap, authHeaderByUri,
    proxyConfig: proxy, networkConfig: network, options, bitDir,
    environment: { ...process.env }, cwd: process.cwd(), umask: installEngineUmask(),
  };
}

/** Linux exposes umask without changing the process-wide mask during pnpm work. */
function installEngineUmask() {
  if (process.platform !== 'linux') return null;
  try {
    const status = fs.readFileSync('/proc/self/status', 'utf8');
    const match = /^Umask:\s*([0-7]{1,4})\s*$/m.exec(status);
    return match ? Number.parseInt(match[1], 8) : null;
  } catch {
    return null;
  }
}

function installEngineRegistries(support, registries) {
  const scopes = registries?.scopes;
  if (registries?.constructor !== support.registriesConstructor
    || registries.toMap !== support.registriesToMap
    || !scopes || Object.getPrototypeOf(scopes) !== Object.prototype
    || !Reflect.ownKeys(scopes).every(key => typeof key === 'string'
      && Object.hasOwn(Object.getOwnPropertyDescriptor(scopes, key), 'value'))) return false;
  const values = [registries.defaultRegistry, ...Object.values(scopes)];
  return values.every(registry => {
    if (registry?.constructor !== support.registryConstructor) return false;
    return ['uri', 'authHeaderValue'].every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(registry, key);
      return descriptor && Object.hasOwn(descriptor, 'value')
        && (descriptor.value === undefined || typeof descriptor.value === 'string');
    });
  });
}

function installEngineProxy(config) {
  return { httpProxy: config.httpProxy, httpsProxy: config.httpsProxy, noProxy: config.noProxy };
}

function installEngineNetwork(config) {
  return {
    ca: config.ca, cert: config.cert, key: config.key, localAddress: config.localAddress,
    strictSsl: config.strictSSL, maxSockets: config.maxSockets,
    networkConcurrency: config.networkConcurrency, fetchRetries: config.fetchRetries,
    fetchRetryFactor: config.fetchRetryFactor, fetchRetryMintimeout: config.fetchRetryMintimeout,
    fetchRetryMaxtimeout: config.fetchRetryMaxtimeout, fetchTimeout: config.fetchTimeout,
    userAgent: config.userAgent,
  };
}

/** `buildAuthHeaderByUri` in the published lynx module. */
function installEngineAuth(registries) {
  if (!registries || !registries.scopes || !registries.defaultRegistry) return null;
  const nerfDart = bitRequire('nerf-dart');
  const result = {};
  for (const registry of Object.values(registries.scopes)) {
    if (registry.uri && registry.authHeaderValue) result[nerfDart(registry.uri)] = registry.authHeaderValue;
  }
  const defaultRegistry = registries.defaultRegistry;
  if (defaultRegistry.authHeaderValue) {
    if (defaultRegistry.uri) result[nerfDart(defaultRegistry.uri)] = defaultRegistry.authHeaderValue;
    result[''] = defaultRegistry.authHeaderValue;
  }
  return result;
}

function installEngineEligible(support, install) {
  const pm = install?.dependencyResolver?.getPackageManager?.();
  if (support.lynx.install !== support.original) {
    installEngineTrace('lynx function replaced');
    return false;
  }
  if (install?.constructor !== support.installConstructor
    || install._installModulesProfiled !== support.modulesInstall) {
    installEngineTrace('InstallMain methods replaced');
    return false;
  }
  if (pm?.constructor !== support.pmConstructor || pm.install !== support.pmInstall) {
    installEngineTrace('package manager replaced');
    return false;
  }
  if (support.installerConstructor.prototype.installComponents !== support.componentInstall) {
    installEngineTrace('DependencyInstaller method replaced');
    return false;
  }
  return true;
}

function installEngineDeferred() {
  let resolve;
  const promise = new Promise(fulfill => { resolve = fulfill; });
  return { promise, resolve };
}

function installEngineDone(value) {
  if (value.kind === 'error') throw value.error;
  if (value.kind === 'done') return value.value;
  return { needsEngine: value.payload };
}

async function installEngineBegin(operation, install) {
  if (installEngineSession) throw new Error('an installation engine call is already suspended');
  const support = installEngineSupport();
  if (!support) {
    installEngineTrace('stock baseline unavailable');
    return operation();
  }
  if (!installEngineEligible(support, install)) return operation();
  const next = installEngineDeferred();
  const session = { support, install, next, pending: null, completion: null };
  installEngineSession = session;
  const interceptor = (...args) => installEngineIntercept(session, args);
  session.interceptor = interceptor;
  support.lynx.install = interceptor;
  session.completion = Promise.resolve().then(operation).then(
    value => ({ kind: 'done', value }), error => ({ kind: 'error', error }),
  ).finally(() => {
    if (support.lynx.install === interceptor) support.lynx.install = support.original;
    installEngineSession = null;
  });
  return installEngineDone(await Promise.race([session.next.promise, session.completion]));
}

function installEngineIntercept(session, args) {
  const { support, install } = session;
  const pm = install?.dependencyResolver?.getPackageManager?.();
  if (session.pending || support.lynx.install !== session.interceptor
    || install?.constructor !== support.installConstructor
    || pm?.constructor !== support.pmConstructor
    || support.installerConstructor.prototype.installComponents !== support.componentInstall
    || install._installModulesProfiled !== support.modulesInstall) {
    installEngineTrace('methods changed before lynx');
    return support.original(...args);
  }
  let payload;
  try { payload = installEnginePayload(args, support); } catch {
    installEngineTrace('payload conversion failed');
    return support.original(...args);
  }
  if (!payload) return session.support.original(...args);
  const promise = new Promise((resolve, reject) => {
    session.pending = { args, payload, resolve, reject, prepared: false };
  });
  session.next.resolve({ kind: 'handoff', payload });
  return promise;
}

/** Complete one engine invocation; the original InstallMain promise then continues. */
async function installCanonicalResume({ engine }) {
  const session = installEngineSession;
  const pending = session?.pending;
  if (!pending || !engine || typeof engine !== 'object') throw new Error('no suspended installation');
  session.pending = null;
  session.next = installEngineDeferred();
  if (typeof engine.stdout === 'string' && engine.stdout) process.stdout.write(engine.stdout);
  if (engine.supported === false && !pending.prepared) {
    Promise.resolve().then(() => session.support.original(...pending.args))
      .then(pending.resolve, pending.reject);
  } else if (typeof engine.error === 'string' && pending.prepared) {
    pending.reject(installEngineError(session, pending, engine));
  } else if (engine.supported === true && pending.prepared && installEngineResult(engine.result)) {
    const result = {
      dependenciesChanged: engine.result.dependenciesChanged,
      rebuild: pending.rebuild,
      storeDir: engine.result.storeDir,
      depsRequiringBuild: engine.result.depsRequiringBuild ?? undefined,
    };
    pending.resolve(result);
  } else {
    pending.reject(new Error('invalid native installation engine receipt'));
  }
  return installEngineDone(await Promise.race([session.next.promise, session.completion]));
}

function installEngineError(session, pending, engine) {
  const native = engine.nativeError;
  if (!native || typeof native.message !== 'string') {
    return new Error('invalid native installation engine error receipt');
  }
  const error = new Error(native.message);
  if (typeof native.code === 'string') error.code = native.code;
  if (typeof native.hint === 'string') error.hint = native.hint;
  const logger = pending.args[8];
  logger?.warn?.('got an error from the pnpm install function', error);
  return session.support.convertError(error);
}

/** Run the real lynx prefix once, retaining its genuine rebuild closure. */
async function installCanonicalEnginePrepare() {
  const session = installEngineSession;
  const pending = session?.pending;
  if (!pending || pending.prepared) throw new Error('no unprepared installation engine call');
  try {
    const args = pending.args.slice();
    args[7] = new Proxy(args[7], {
      get(target, key, receiver) {
        if (key === 'dryRun') return true;
        return Reflect.get(target, key, receiver);
      },
    });
    const dryRun = await session.support.original(...args);
    if (typeof dryRun?.rebuild !== 'function') {
      throw new Error('published pnpm dry run did not return rebuild');
    }
    pending.rebuild = dryRun.rebuild;
    bitRequire('@teambit/pnpm/dist/build-scripts-path.js').prepareBuildScriptsPath(pending.args[8]);
    const path = process.env.PATH;
    pending.prepared = true;
    return { path };
  } catch (error) {
    session.pending = null;
    session.next = installEngineDeferred();
    pending.reject(error);
    const receipt = installEngineDone(await Promise.race([session.next.promise, session.completion]));
    return { receipt };
  }
}

function installEngineResult(result) {
  return result && typeof result.dependenciesChanged === 'boolean'
    && typeof result.storeDir === 'string'
    && (result.depsRequiringBuild == null
      || (Array.isArray(result.depsRequiringBuild)
        && result.depsRequiringBuild.every(value => typeof value === 'string')));
}
