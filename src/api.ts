import { addMany as addManyInternal, build, buildAll as buildAllApi, getScopeComponent } from './api/consumer/index';
import { scopeList } from './api/scope/index';
import { AddProps } from './consumer/component-ops/add-components/add-components';
import { Packer } from './pack';
import HooksManager from './hooks';
// import { registerCoreExtensions } from './extensions/bit';
// import { manifestsMap as coreExtensions } from './extensions/bit';

// export { coreExtensions };

HooksManager.init();

export function show(scopePath: string, id: string, opts?: Record<string, any>) {
  // When using the API programmatically do not use the scope cache by default
  const loadScopeFromCache = opts && opts.loadScopeFromCache !== undefined ? !!opts.loadScopeFromCache : false;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return getScopeComponent({ scopePath, id, allVersions: opts && opts.versions, loadScopeFromCache }).then(
    ({ component }) => {
      if (Array.isArray(component)) {
        return component.map((v) => v.toObject());
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
  return scopeList(scopePath, namespacesUsingWildcards, loadScopeFromCache).then((listScopeResult) =>
    listScopeResult.map((result) => result.id.toString())
  );
}

export async function buildOne(
  id: string,
  noCache = false,
  verbose = false,
  workspaceDir?: string
): Promise<string[] | null | undefined> {
  return build(id, noCache, verbose, workspaceDir);
}

export async function buildAll(id: string, noCache = false, verbose = false): Promise<Record<string, any>> {
  return buildAllApi(noCache, verbose);
}

export async function addMany(components: AddProps[], alternateCwd?: string) {
  return addManyInternal(components, alternateCwd);
}

const packer = new Packer();
export { packer };
