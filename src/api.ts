import { getScopeComponent, addMany as addManyInternal } from './api/consumer/index';
import { AddProps } from './consumer/component-ops/add-components/add-components';
import { scopeList } from './api/scope/index';
import Extension from './extensions/extension';
import HooksManager from './hooks';
import { BaseLoadArgsProps } from './extensions/base-extension';

HooksManager.init();

export function show(scopePath: string, id: string, opts?: Object) {
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
export async function addMany(components: AddProps[], alternateCwd?: string) {
  return addManyInternal(components, alternateCwd);
}

/**
 * Load extension programmatically
 */
export async function loadExtension(args: BaseLoadArgsProps): Promise<Extension> {
  const extension = await Extension.load(args);
  return Promise.resolve(extension);
}
