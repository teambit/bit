import { forEachObjIndexed } from 'ramda';

import { LIFECYCLE_TYPE_BY_KEY_NAME } from '../../constants';
import { DependencyLifecycleType, DepObjectKeyName, DepObjectValue, PackageName, SemverVersion } from '../../types';
import { ComponentDependenciesMap } from '../workspace-manifest';

export type PackageNameIndexItem = {
  range: SemverVersion;
  origin: PackageName;
  lifecycleType: DependencyLifecycleType;
};
export type PackageNameIndex = Map<PackageName, PackageNameIndexItem[]>;

/**
 * This will get the map of dependencies for each component and will create a new index with the dependencyId (package name) as key
 * and all components / ranges as value
 * It used as a pre processing as part of the deduping process
 *
 * @param {ComponentDependenciesMap} componentDependenciesMap
 * @returns {PackageNameIndex}
 */
export function indexByDepId(componentDependenciesMap: ComponentDependenciesMap): PackageNameIndex {
  const result: PackageNameIndex = new Map();
  componentDependenciesMap.forEach((depsObject, compPackageName) => {
    forEachObjIndexed(addSpecificLifeCycleDepsToIndex(result, compPackageName), depsObject);
  });
  return result;
}

/**
 * Mutate the index and add all deps from specific lifecycle type to the index
 *
 * @param {PackageNameIndex} index
 * @param {PackageName} origin
 * @returns
 */
function addSpecificLifeCycleDepsToIndex(index: PackageNameIndex, origin: PackageName) {
  return (deps: DepObjectValue, depKeyName: DepObjectKeyName) => {
    const lifecycleType = LIFECYCLE_TYPE_BY_KEY_NAME[depKeyName] as DependencyLifecycleType;
    forEachObjIndexed(addDepToDepIdIndex(index, origin, lifecycleType), deps);
  };
}

/**
 * Mutate the index and add specific package into it
 *
 * @param {PackageNameIndex} index
 * @param {PackageName} origin
 * @param {DependencyLifecycleType} lifecycleType
 * @returns
 */
function addDepToDepIdIndex(index: PackageNameIndex, origin: PackageName, lifecycleType: DependencyLifecycleType) {
  return (range: SemverVersion, depId: PackageName) => {
    const item: PackageNameIndexItem = {
      origin,
      range,
      lifecycleType,
    };
    if (!index.has(depId)) {
      index.set(depId, [item]);
      return;
    }
    index.get(depId)?.push(item);
  };
}
