import { forEach, omit, pick } from 'lodash';
import { LIFECYCLE_TYPE_BY_KEY_NAME } from '../../dependencies/constants';
import type { ManifestDependenciesKeysNames, DepObjectValue, ManifestDependenciesObject } from '../manifest';
import type { DependencyLifecycleType, SemverVersion, PackageName } from '../../dependencies';
import type { ComponentDependenciesMap } from '../workspace-manifest-factory';
import type { WorkspacePolicy } from '../../policy';

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
  componentDependenciesMap: ComponentDependenciesMap,
  hoistedDepFields?: ManifestDependenciesKeysNames[]
): PackageNameIndex {
  const result: PackageNameIndex = new Map();
  /**
   * Record<ManifestDependenciesKeysNames, DepObjectValue>
   * depsObject: {
   *   dependencies: { depId: version },
   *   devDependencies: { depId: version },
   * }
   */
  componentDependenciesMap.forEach((depsObject: ManifestDependenciesObject, compPackageName) => {
    if (hoistedDepFields) {
      depsObject = pick(depsObject, hoistedDepFields);
    } else {
      depsObject = omit(depsObject, ['peerDependenciesMeta']);
    }
    forEach(
      depsObject as Record<ManifestDependenciesKeysNames, DepObjectValue>,
      (deps: DepObjectValue, depKeyName: string) => {
        const lifecycleType = LIFECYCLE_TYPE_BY_KEY_NAME[depKeyName] as DependencyLifecycleType;
        forEach(deps, addComponentDepToDepIdIndex(result, compPackageName, lifecycleType));
      }
    );
  });
  addPreservedFromRoot(result, rootPolicy);
  return result;
}

function addPreservedFromRoot(index: PackageNameIndex, rootPolicy: WorkspacePolicy): void {
  // In case the preserve is undefined we want it to be true by default
  // to ensure workspace root policy versions are installed in the root node_modules by default
  const preserved = rootPolicy.filter((entry) => entry.value.preserve ?? true);
  preserved.forEach((entry) => {
    const metadata: PackageNameIndexItemMetadata = {
      preservedVersion: entry.value.version,
      preservedLifecycleType: entry.lifecycleType,
    };
    setMetadataToExistingIndexItem(index, entry.dependencyId, metadata);
  });
}

function setMetadataToExistingIndexItem(
  index: PackageNameIndex,
  depId: PackageName,
  metadata: PackageNameIndexItemMetadata
): void {
  const existingItem = index.get(depId);
  // only change existing items
  if (existingItem) {
    existingItem.metadata = metadata;
  }
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
