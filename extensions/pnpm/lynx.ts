import getConfig from '@pnpm/config';
import defaultReporter from '@pnpm/default-reporter';
// import createClient from '@pnpm/client'
// import { createFetchFromRegistry } from '@pnpm/fetch';
import { LogBase, streamParser } from '@pnpm/logger';
// import createStore, { ResolveFunction, StoreController } from '@pnpm/package-store';
import { StoreController } from '@pnpm/package-store';
import { createNewStoreController } from '@pnpm/store-connection-manager';
// TODO: this should be taken from - @pnpm/store-connection-manager
// it's not taken from there since it's not exported.
// here is a bug in pnpm about it https://github.com/pnpm/pnpm/issues/2748
import { CreateNewStoreControllerOptions } from '@pnpm/store-connection-manager/lib/createNewStoreController';
// import createFetcher from '@pnpm/tarball-fetcher';
import { MutatedProject, mutateModules } from 'supi';
// import { createResolver } from './create-resolver';

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
  const opts: CreateNewStoreControllerOptions = {
    storeDir,
    rawConfig: pnpmConfig.config.rawConfig,
    verifyStoreIntegrity: true,
  };
  const { ctrl } = await createNewStoreController(opts);
  return ctrl;
}

export async function install(rootPathToManifest, pathsToManifests, storeDir: string, logFn?: (log: LogBase) => void) {
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
    reporter: logFn,
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
