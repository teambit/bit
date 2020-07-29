import { SemVer } from 'semver';
import { forEachObjIndexed } from 'ramda';
import {
  DependenciesObjectDefinition,
  DependencyLifecycleType,
  DepObjectKeyName,
  PackageName,
  DepObjectValue,
  ComponentsManifestsMap,
} from '../types';
import { Manifest } from './manifest';
import { ComponentManifest } from './component-manifest';
import { Component } from '../../component';
import componentIdToPackageName from '../../../utils/bit/component-id-to-package-name';
import { DependencyGraph } from '../dependency-graph';
import { RUNTIME_DEP_LIFECYCLE_TYPE, DEV_DEP_LIFECYCLE_TYPE, PEER_DEP_LIFECYCLE_TYPE } from '../constants';

type conflictedComponent = {
  componentPackageName: PackageName;
  range: SemVer;
};

export type DedupedDependenciesPeerConflicts = {
  packageName: PackageName;
  conflictedComponents: conflictedComponent[];
};

export type DedupedDependenciesIssues = {
  peerConflicts: DedupedDependenciesPeerConflicts[];
};

export type DedupedDependencies = {
  rootDependencies: DependenciesObjectDefinition;
  componentDependenciesMap: ComponentDependenciesMap;
  issus?: DedupedDependenciesIssues;
};

type ComponentDependenciesMap = Map<PackageName, DependenciesObjectDefinition>;

type PackageNameIndexItem = {
  range: SemVer;
  origin: PackageName;
  lifecycleType: DependencyLifecycleType;
};
type PackageNameIndex = Map<PackageName, PackageNameIndexItem[]>;

export class WorkspaceManifest extends Manifest {
  constructor(
    public name: string,
    public version: SemVer,
    public dependencies: DependenciesObjectDefinition,
    private rootDir: string,
    public componentsManifestsMap: ComponentsManifestsMap
  ) {
    super(name, version, dependencies);
  }

  get dir() {
    return this.rootDir;
  }

  static createFromComponents(
    name: string,
    version: SemVer,
    dependencies: DependenciesObjectDefinition,
    rootDir: string,
    components: Component[]
  ): WorkspaceManifest {
    const componentDependenciesMap: ComponentDependenciesMap = buildComponentDependenciesMap(components);
    const dedupedDependencies = dedupeDependencies(dependencies, componentDependenciesMap);
    const componentsManifestsMap = getComponentsManifests(dedupedDependencies, components);
    const workspaceManifest = new WorkspaceManifest(name, version, dependencies, rootDir, componentsManifestsMap);
    return workspaceManifest;
  }
}

/**
 * Get the components manifests based on the calculated dedupedDependencies
 *
 * @param {DedupedDependencies} dedupedDependencies
 * @param {Component[]} components
 * @returns {ComponentsManifestsMap}
 */
function getComponentsManifests(
  dedupedDependencies: DedupedDependencies,
  components: Component[]
): ComponentsManifestsMap {
  const componentsManifests: ComponentsManifestsMap = new Map();
  components.forEach((component) => {
    const packageName = componentIdToPackageName(component.state._consumer);
    if (dedupedDependencies.componentDependenciesMap.has(packageName)) {
      const dependencies = dedupedDependencies.componentDependenciesMap.get(
        packageName
      ) as DependenciesObjectDefinition;
      const version = component.id.hasVersion() ? (component.id.version as string) : '0.0.1-new';
      const manifest = new ComponentManifest(packageName, new SemVer(version), dependencies, component);
      componentsManifests.set(packageName, manifest);
    }
  });
  return componentsManifests;
}

/**
 * Main function to dedupe dependencies
 * It will optimized the dependencies structure to make sure there is minimum duplication of the same dependency (as a result of conflicted versions)
 * it will take everything possible to be defined in the root, and only conflicts in the components
 * it's similar to what happens when you use yarn workspaces
 *
 * @export
 * @param {DependenciesObjectDefinition} rootDependencies
 * @param {ComponentDependenciesMap} componentDependenciesMap
 * @returns {DedupedDependencies}
 */
export function dedupeDependencies(
  rootDependencies: DependenciesObjectDefinition,
  componentDependenciesMap: ComponentDependenciesMap
): DedupedDependencies {
  const indexedByDepId = indexByDepId(componentDependenciesMap);
  const dedupedDependenciesWithoutRootOriginal = hoistDependencies(indexedByDepId);
  const result = mergeWithRootDeps(rootDependencies, dedupedDependenciesWithoutRootOriginal);
  return result;
}

/**
 * Get the components and build a map with the package name (from the component) as key and the dependencies as values
 *
 * @param {Component[]} components
 * @returns
 */
function buildComponentDependenciesMap(components: Component[]) {
  const result = new Map<PackageName, DependenciesObjectDefinition>();

  components.forEach((component) => {
    const packageName = componentIdToPackageName(component.state._consumer);
    const depGraph = new DependencyGraph(component);
    const depObject = depGraph.toJson();
    result.set(packageName, depObject);
  });
  return result;
}

/**
 * This will get the map of dependencies for each component and will create a new index with the dependencyId (package name) as key
 * and all components / ranges as value
 * It used as a pre processing as part of the deduping process
 *
 * @param {ComponentDependenciesMap} componentDependenciesMap
 * @returns {PackageNameIndex}
 */
function indexByDepId(componentDependenciesMap: ComponentDependenciesMap): PackageNameIndex {
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
  const lifecycleTypeByKeyName = {
    dependencies: RUNTIME_DEP_LIFECYCLE_TYPE,
    devDependencies: DEV_DEP_LIFECYCLE_TYPE,
    peerDependencies: PEER_DEP_LIFECYCLE_TYPE,
  };
  return (deps: DepObjectValue, depKeyName: DepObjectKeyName) => {
    const lifecycleType = lifecycleTypeByKeyName[depKeyName] as DependencyLifecycleType;
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
  return (range: SemVer, depId: PackageName) => {
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

/**
 * This is the second phase of the deduping process.
 * It will get the index calculated in the first phase (with dep id as key)
 * and will find the most intersect range for each dep and move it to the root
 * it will also move deps which are both dev deps and runtime deps to be runtime deps
 *
 * @param {PackageNameIndex} depIdIndex
 * @returns {DedupedDependencies}
 */
function hoistDependencies(depIdIndex: PackageNameIndex): DedupedDependencies {
  // Handle peer dependnecies
  // handle git urls
  // Handle logical or (||)
}

/**
 * This is the third phase of the deduping process
 * It's not exactly part of the dedupe process but its required for the bit install to work properly
 * it will take the deduped dependencies and will add them missing deps from the provided root deps
 * it used for installing deps in the root level before any component use it
 * otherwise they won't be install, and you will need to re-run install after writing the require statement in the code
 *
 * @param {DependenciesObjectDefinition} rootDependencies
 * @param {DedupedDependencies} dedupedDependencies
 * @returns {DedupedDependencies}
 */
function mergeWithRootDeps(
  rootDependencies: DependenciesObjectDefinition,
  dedupedDependencies: DedupedDependencies
): DedupedDependencies {
  forEachObjIndexed(mergeSpecificLifeCycleRootDepsToDedupedDependencies(dedupedDependencies), rootDependencies);
  return dedupedDependencies;
}

function mergeSpecificLifeCycleRootDepsToDedupedDependencies(dedupedDependencies: DedupedDependencies) {
  return (deps: DepObjectValue, depKeyName: DepObjectKeyName) => {
    forEachObjIndexed(mergeRootDepToDedupedDependencies(dedupedDependencies, depKeyName), deps);
  };
}

function mergeRootDepToDedupedDependencies(dedupedDependencies: DedupedDependencies, depKeyName: DepObjectKeyName) {
  return (range: SemVer, depId: PackageName) => {
    // Do not add it if it's already exist from the components calculation
    if (isDepExistInAnyOfTheRootDedupedDependencies(depId, dedupedDependencies)) return;
    const existingRootDeps = dedupedDependencies.rootDependencies;
    if (existingRootDeps[depKeyName]) {
      // @ts-ignore - for some reason ts thinks it might be undefined
      existingRootDeps[depKeyName][depId] = range.toString();
    } else {
      existingRootDeps[depKeyName] = {
        [depId]: range.toString(),
      };
    }
  };
}

function isDepExistInAnyOfTheRootDedupedDependencies(depId: string, dedupedDependencies: DedupedDependencies) {
  const rootDedupedDeps = dedupedDependencies.rootDependencies;
  return (
    isDepExistInDepObject(depId, rootDedupedDeps.dependencies) ||
    isDepExistInDepObject(depId, rootDedupedDeps.devDependencies) ||
    isDepExistInDepObject(depId, rootDedupedDeps.peerDependencies)
  );
}

function isDepExistInDepObject(depId: string, depObjectValue: DepObjectValue = {}) {
  return depObjectValue.hasOwnProperty(depId);
}
