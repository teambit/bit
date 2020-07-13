import harmony from '@teambit/harmony';
import pWaitFor from 'p-wait-for';
import { getScopeComponent, addMany as addManyInternal, build, buildAll as buildAllApi } from './api/consumer/index';
import { AddProps } from './consumer/component-ops/add-components/add-components';
import { scopeList } from './api/scope/index';
import HooksManager from './hooks';
import { ConfigExt } from './extensions/config';
import { BitExt, registerCoreExtensions } from './extensions/bit';
import { manifestsMap as coreExtensions } from './extensions/bit';

export * from '@teambit/harmony';
export { default as harmony } from '@teambit/harmony';
export { coreExtensions };

HooksManager.init();
let harmonyLoaded = false;
let harmonyCurrentlyLoading = false;

type LoadCoreExtensionsOptions = {
  cwd?: string;
  timeout?: number;
};

export function show(scopePath: string, id: string, opts?: Record<string, any>) {
  // When using the API programmatically do not use the scope cache by default
  const loadScopeFromCache = opts && opts.loadScopeFromCache !== undefined ? !!opts.loadScopeFromCache : false;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return getScopeComponent({ scopePath, id, allVersions: opts && opts.versions, loadScopeFromCache }).then(
    ({ component }) => {
      if (Array.isArray(component)) {
        return component.map(v => v.toObject());
      }
      return component.toObject();
    }
  );
}
export function list(
  scopePath: string,
  namespacesUsingWildcards?: string,
  opts: { loadScopeFromCache?: boolean } = {}
) {
  // When using the API programmatically do not use the scope cache by default
  const loadScopeFromCache = opts && opts.loadScopeFromCache !== undefined ? !!opts.loadScopeFromCache : false;
  return scopeList(scopePath, namespacesUsingWildcards, loadScopeFromCache).then(listScopeResult =>
    listScopeResult.map(result => result.id.toString())
  );
}

export async function buildOne(
  id: string,
  noCache = false,
  verbose = false,
  workspaceDir?: string
): Promise<string[] | undefined> {
  return build(id, noCache, verbose, workspaceDir);
}

export async function buildAll(id: string, noCache = false, verbose = false): Promise<Record<string, any>> {
  return buildAllApi(noCache, verbose);
}

export async function addMany(components: AddProps[], alternateCwd?: string) {
  return addManyInternal(components, alternateCwd);
}

/**
 * Make sure harmony is loaded in specific cwd (to simulate like you run the cli in a workspace/scope)
 * This will return the harmony instance after load all core extensions
 *
 * @export
 * @param {string} [cwd]
 * @returns
 */
export async function loadCoreExtensions(options: LoadCoreExtensionsOptions = {}) {
  // Sometime different code can ask for loading the extensions
  // for example if you call getLoadedCoreExtension in a promise.all
  // this make sure we are wait for harmony to load if it's already in load process before we send response back
  if (harmonyCurrentlyLoading) {
    await pWaitFor(() => harmonyCurrentlyLoading === false, { timeout: options.timeout || 10000 });
  }
  if (harmonyLoaded) {
    return harmony;
  }

  harmonyCurrentlyLoading = true;

  const originalCwd = process.cwd();
  if (options.cwd) {
    process.chdir(options.cwd);
  }
  registerCoreExtensions();
  await harmony.run(ConfigExt);
  await harmony.set([BitExt]);
  process.chdir(originalCwd);
  harmonyLoaded = true;
  harmonyCurrentlyLoading = false;
  return harmony;
}

/**
 * Make sure harmony is loaded in specific cwd (to simulate like you run the cli in a workspace/scope)
 * Then return the loaded extension.
 * this return the actual initialized extension
 *
 * @export
 * @param {string} extensionId
 * @param {string} [cwd]
 * @returns
 */
export async function getLoadedCoreExtension(extensionId: string, options: LoadCoreExtensionsOptions = {}) {
  await loadCoreExtensions(options);
  return harmony.get(extensionId);
}

/**
 * Get the deceleration (manifest) of a core extension
 * This is used in order to put the extension as dependency for other extension
 *
 * @export
 * @param {string} extensionId
 * @returns
 */
export function getDeclarationCoreExtension(extensionId: string) {
  return coreExtensions[extensionId];
}
