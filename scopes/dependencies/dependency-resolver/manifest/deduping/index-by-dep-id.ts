import { forEachObjIndexed } from 'ramda';

import { LIFECYCLE_TYPE_BY_KEY_NAME } from '../../dependencies/constants';
import { ManifestDependenciesKeysNames, DepObjectValue } from '../manifest';
import { DependencyLifecycleType, SemverVersion, PackageName } from '../../dependencies';
import { ComponentDependenciesMap } from '../workspace-manifest-factory';
import { WorkspacePolicy } from '../../policy';

export type PackageNameIndexItem = {
  metadata: PackageNameIndexItemMetadata;
  componentItems: PackageNameIndexComponentItem[];
};

export type PackageNameIndexItemMetadata = {
  preservedVersion?: string;
  preservedLifecycleType?: DependencyLifecycleType;
};

export type PackageNameIndexComponentItem = {
  range: SemverVersion;
  origin: PackageName;
  lifecycleType: DependencyLifecycleType;
};

export type PackageNameIndex = Map<PackageName, PackageNameIndexItem>;

/**
 * This will get the map of dependencies for each component and will create a new index with the dependencyId (package name) as key
 * and all components / ranges as value
 * It used as a pre processing as part of the deduping process
 *
 * @param {ComponentDependenciesMap} componentDependenciesMap
 * @returns {PackageNameIndex}
 */
export function indexByDepId(
  rootPolicy: WorkspacePolicy,
  componentDependenciesMap: ComponentDependenciesMap
): PackageNameIndex {
  const result: PackageNameIndex = new Map();
  componentDependenciesMap.forEach((depsObject, compPackageName) => {
    forEachObjIndexed(addSpecificLifeCycleDepsToIndex(result, compPackageName), depsObject);
    // Only add preserved in case it was defined in any component, otherwise it has no meaning at all
    if (result.has(compPackageName)) {
      addPreservedFromRoot(result, compPackageName, rootPolicy);
    }
  });
  return result;
}

function addPreservedFromRoot(index: PackageNameIndex, depId: PackageName, rootPolicy: WorkspacePolicy): void {
  const entryFromPolicy = rootPolicy.find(depId);
  const metadata: PackageNameIndexItemMetadata = {
    preservedVersion: undefined,
  };
  if (entryFromPolicy && entryFromPolicy.value.preserve) {
    metadata.preservedVersion = entryFromPolicy.value.version;
    metadata.preservedLifecycleType = entryFromPolicy.lifecycleType;
  }
  return setMetadataToIndexItem(index, depId, metadata);
}

function setMetadataToIndexItem(
  index: PackageNameIndex,
  depId: PackageName,
  metadata: PackageNameIndexItemMetadata
): void {
  const existingItem = index.get(depId);
  if (existingItem) {
    existingItem.metadata = metadata;
    return;
  }
  const item: PackageNameIndexItem = {
    componentItems: [],
    metadata,
  };
  index.set(depId, item);
}

/**
 * Mutate the index and add all deps from specific lifecycle type to the index
 *
 * @param {PackageNameIndex} index
 * @param {PackageName} origin
 * @returns
 */
function addSpecificLifeCycleDepsToIndex(index: PackageNameIndex, origin: PackageName) {
  return (deps: DepObjectValue, depKeyName: ManifestDependenciesKeysNames) => {
    const lifecycleType = LIFECYCLE_TYPE_BY_KEY_NAME[depKeyName] as DependencyLifecycleType;
    forEachObjIndexed(addComponentDepToDepIdIndex(index, origin, lifecycleType), deps);
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
function addComponentDepToDepIdIndex(
  index: PackageNameIndex,
  origin: PackageName,
  lifecycleType: DependencyLifecycleType
) {
  return (range: SemverVersion, depId: PackageName) => {
    const componentItem: PackageNameIndexComponentItem = {
      origin,
      range,
      lifecycleType,
    };
    if (!index.has(depId)) {
      const item: PackageNameIndexItem = {
        componentItems: [componentItem],
        metadata: {},
      };
      index.set(depId, item);
      return;
    }
    index.get(depId)?.componentItems.push(componentItem);
  };
}
