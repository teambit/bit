import harmony from '@teambit/harmony';
import { getScopeComponent, addMany as addManyInternal, build, buildAll as buildAllApi } from './api/consumer/index';
import { AddProps } from './consumer/component-ops/add-components/add-components';
import { scopeList } from './api/scope/index';
import HooksManager from './hooks';
import { ConfigExt } from './extensions/config';
import { BitExt } from './extensions/bit';
import { manifestsMap as coreExtensions } from './extensions/bit';

export * from '@teambit/harmony';
export { default as harmony } from '@teambit/harmony';
export { coreExtensions };

HooksManager.init();
let harmonyLoaded = false;

export function show(scopePath: string, id: string, opts?: Record<string, any>) {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return getScopeComponent({ scopePath, id, allVersions: opts && opts.versions }).then(({ component }) => {
    if (Array.isArray(component)) {
      return component.map(v => v.toObject());
    }
    return component.toObject();
  });
}
export function list(scopePath: string) {
  return scopeList(scopePath).then(listScopeResult => listScopeResult.map(result => result.id.toString()));
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
export async function loadCoreExtensions(cwd?: string) {
  if (harmonyLoaded) {
    return harmony;
  }

  const originalCwd = process.cwd();
  if (cwd) {
    process.chdir(cwd);
  }
  await harmony.run(ConfigExt);
  await harmony.set([BitExt]);
  process.chdir(originalCwd);
  harmonyLoaded = true;
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
export async function getLoadedCoreExtension(extensionId: string, cwd?: string) {
  await loadCoreExtensions(cwd);
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
export function getCoreExtension(extensionId: string) {
  return coreExtensions[extensionId];
}
