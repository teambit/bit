import getConfig from '@pnpm/config';
import semver from 'semver';
import parsePackageName from 'parse-package-name';
import defaultReporter from '@pnpm/default-reporter';
// import createClient from '@pnpm/client'
// import { createFetchFromRegistry } from '@pnpm/fetch';
import { streamParser } from '@pnpm/logger';
// import createStore, { ResolveFunction, StoreController } from '@pnpm/package-store';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// import { PreferredVersions, RequestPackageOptions, StoreController, WantedDependency } from '@pnpm/package-store';
import { StoreController, WantedDependency } from '@pnpm/package-store';
import { createNewStoreController } from '@pnpm/store-connection-manager';
// TODO: this should be taken from - @pnpm/store-connection-manager
// it's not taken from there since it's not exported.
// here is a bug in pnpm about it https://github.com/pnpm/pnpm/issues/2748
import { CreateNewStoreControllerOptions } from '@pnpm/store-connection-manager/lib/createNewStoreController';
import { ResolvedPackageVersion, RegistriesMap } from '@teambit/dependency-resolver';
// import execa from 'execa';
// import createFetcher from '@pnpm/tarball-fetcher';
import { MutatedProject, mutateModules } from 'supi';
// import { ReporterFunction } from 'supi/lib/types';
// import { createResolver } from './create-resolver';
// import {isValidPath} from 'bit-bin/dist/utils';
// import {createResolver} from '@pnpm/default-resolver';
import createResolverAndFetcher from '@pnpm/client';
import pickRegistryForPackage from '@pnpm/pick-registry-for-package';
import getCredentialsByURI from 'credentials-by-uri';
import { Logger } from '@teambit/logger';

async function readConfig() {
  const pnpmConfig = await getConfig({
    cliOptions: {
      // 'global': true,
      // 'link-workspace-packages': true,
    },
    packageManager: {
      name: 'pnpm',
      version: '1.0.0',
    },
  });
  return pnpmConfig;
}

// TODO: DO NOT DELETE - uncomment when this is solved https://github.com/pnpm/pnpm/issues/2910
// function getReporter(logger: Logger): ReporterFunction {
//   return ((logObj) => {
//     // TODO: print correctly not the entire object
//     logger.console(logObj)
//   });
// }

async function createStoreController(storeDir: string): Promise<StoreController> {
  // const fetchFromRegistry = createFetchFromRegistry({});
  // const getCredentials = () => ({ authHeaderValue: '', alwaysAuth: false });
  // const resolver: ResolveFunction = createResolver(fetchFromRegistry, getCredentials, {
  //   metaCache: new Map(),
  //   storeDir,
  // });
  // const fetcher = createFetcher(fetchFromRegistry, getCredentials, {});
  // const { resolve, fetchers } = createClient({
  //   // authConfig,
  //   metaCache: new Map(),
  //   // retry: retryOpts,
  //   storeDir,
  //   // ...resolveOpts,
  //   // ...fetchOpts,
  // })
  // const storeController = await createStore(resolve, fetchers, {
  //   storeDir,
  //   verifyStoreIntegrity: true,
  // });
  const pnpmConfig = await readConfig();
  const opts: CreateNewStoreControllerOptions = {
    storeDir,
    rawConfig: pnpmConfig.config.rawConfig,
    verifyStoreIntegrity: true,
  };
  const { ctrl } = await createNewStoreController(opts);
  return ctrl;
}

async function generateResolverAndFetcher(storeDir: string) {
  const pnpmConfig = await readConfig();

  const opts = {
    authConfig: pnpmConfig.config.rawConfig,
    storeDir,
  };
  const result = createResolverAndFetcher(opts);
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function install(rootPathToManifest, pathsToManifests, storeDir: string, logger?: Logger) {
  const packagesToBuild: MutatedProject[] = []; // supi will use this to install the packages
  const workspacePackages = {}; // supi will use this to link packages to each other

  // eslint-disable-next-line
  for (const rootDir in pathsToManifests) {
    const manifest = pathsToManifests[rootDir];
    packagesToBuild.push({
      buildIndex: 0, // workspace components should be installed before the root
      manifest,
      rootDir,
      mutation: 'install',
    });
    workspacePackages[manifest.name] = workspacePackages[manifest.name] || {};
    workspacePackages[manifest.name][manifest.version] = { dir: rootDir, manifest };
  }
  packagesToBuild.push({
    buildIndex: 1, // install the root package after the workspace components were installed
    manifest: rootPathToManifest.manifest,
    mutation: 'install',
    rootDir: rootPathToManifest.rootDir,
  });
  const opts = {
    storeDir,
    dir: rootPathToManifest.rootDir,
    storeController: await createStoreController(storeDir),
    update: true,
    workspacePackages,
    registries: {
      default: 'https://registry.npmjs.org/',
      '@bit': 'https://node.bit.dev/',
    },
    // TODO: uncomment when this is solved https://github.com/pnpm/pnpm/issues/2910
    // reporter: logger ? getReporter(logger) : undefined,
  };

  defaultReporter({
    context: {
      argv: [],
    },
    reportingOptions: {
      appendOnly: false,
      // logLevel: 'error' as LogLevel,
      // streamLifecycleOutput: opts.config.stream,
      throttleProgress: 200,
    },
    streamParser,
  });
  await mutateModules(packagesToBuild, opts);
}

export async function resolveRemoteVersion(
  packageName: string,
  rootDir: string,
  storeDir: string
): Promise<ResolvedPackageVersion> {
  const { resolve } = await generateResolverAndFetcher(storeDir);
  const resolveOpts = {
    projectDir: rootDir,
    registry: '',
  };
  try {
    const parsedPackage = parsePackageName(packageName);
    const pnpmConfig = await readConfig();
    const registry = pickRegistryForPackage(pnpmConfig.config.registries, parsedPackage);
    const wantedDep: WantedDependency = {
      alias: parsedPackage.name,
      pref: parsedPackage.version,
    };
    const isValidRange = parsedPackage.version ? !!semver.validRange(parsedPackage.version) : false;
    resolveOpts.registry = registry;
    const val = await resolve(wantedDep, resolveOpts);
    const version = isValidRange ? parsedPackage.version : val.manifest.version;
    // const { stdout } = await execa('npm', ['view', packageName, 'version'], {});

    return {
      packageName: val.manifest.name,
      version,
      isSemver: true,
      resolvedVia: val.resolvedVia,
    };
  } catch (e) {
    if (!e.message?.includes('is not a valid string')) {
      throw e;
    }
    // The provided package is probably a git url or path to a folder
    const wantedDep: WantedDependency = {
      alias: undefined,
      pref: packageName,
    };
    const val = await resolve(wantedDep, resolveOpts);
    return {
      packageName: val.manifest.name,
      version: val.normalizedPref,
      isSemver: false,
      resolvedVia: val.resolvedVia,
    };
  }
}

export async function getRegistries(): Promise<RegistriesMap> {
  const config = await readConfig();
  const registriesMap: RegistriesMap = {};
  Object.keys(config.config.registries).forEach((regName) => {
    const uri = config.config.registries[regName];
    const credentials = getCredentialsByURI(config.config.rawConfig, uri);
    registriesMap[regName] = {
      uri,
      alwaysAuth: !!credentials.alwaysAuth,
      authHeaderValue: credentials.authHeaderValue,
    };
  });
  return registriesMap;
}
