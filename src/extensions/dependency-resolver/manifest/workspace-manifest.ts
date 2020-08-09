import { SemVer } from 'semver';
import {
  DependenciesObjectDefinition,
  PackageName,
  ComponentsManifestsMap,
  SemverVersion,
  DepObjectValue,
} from '../types';
import { Manifest, ManifestToJsonOptions } from './manifest';
import { ComponentManifest } from './component-manifest';
import { Component, ComponentID } from '../../component';
import componentIdToPackageName from '../../../utils/bit/component-id-to-package-name';
import { DependencyGraph, DepVersionModifierFunc } from '../dependency-graph';
import { dedupeDependencies, DedupedDependencies } from './deduping';
import { Dependency, DependenciesFilterFunction } from '../../../consumer/component/dependencies';
import { MergeDependenciesFunc } from '../dependency-resolver.extension';
import { BitId } from '../../../bit-id';

export type ComponentDependenciesMap = Map<PackageName, DependenciesObjectDefinition>;
export interface WorkspaceManifestToJsonOptions extends ManifestToJsonOptions {
  includeDir?: boolean;
}

export type CreateFromComponentsOptions = {
  filterComponentsFromManifests: boolean;
  createManifestForComponentsWithoutDependencies: boolean;
};
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

  static async createFromComponents(
    name: string,
    version: SemVer,
    rootDependencies: DependenciesObjectDefinition,
    rootDir: string,
    components: Component[],
    options: CreateFromComponentsOptions = {
      filterComponentsFromManifests: true,
      createManifestForComponentsWithoutDependencies: true,
    },
    mergeDependenciesFunc: MergeDependenciesFunc
  ): Promise<WorkspaceManifest> {
    const componentDependenciesMap: ComponentDependenciesMap = await buildComponentDependenciesMap(
      components,
      options.filterComponentsFromManifests,
      rootDependencies,
      mergeDependenciesFunc
    );
    const dedupedDependencies = dedupeDependencies(rootDependencies, componentDependenciesMap);
    const componentsManifestsMap = getComponentsManifests(
      dedupedDependencies,
      components,
      options.createManifestForComponentsWithoutDependencies
    );
    const workspaceManifest = new WorkspaceManifest(
      name,
      version,
      dedupedDependencies.rootDependencies,
      rootDir,
      componentsManifestsMap
    );
    return workspaceManifest;
  }

  toJson(options: WorkspaceManifestToJsonOptions = {}): Record<string, any> {
    const manifest = super.toJson(options);
    if (options.includeDir) {
      return {
        rootDir: this.dir,
        manifest,
      };
    }
    return manifest;
  }
}

/**
 * Get the components and build a map with the package name (from the component) as key and the dependencies as values
 *
 * @param {Component[]} components
 * @param {boolean} [filterComponentsFromManifests=true] - filter existing components from the dep graphs
 * @returns
 */
async function buildComponentDependenciesMap(
  components: Component[],
  filterComponentsFromManifests = true,
  rootDependencies: DependenciesObjectDefinition,
  mergeDependenciesFunc: MergeDependenciesFunc
): Promise<ComponentDependenciesMap> {
  const result = new Map<PackageName, DependenciesObjectDefinition>();
  let filterFn;
  if (filterComponentsFromManifests) {
    filterFn = (componentsToFilterOut: Component[]): DependenciesFilterFunction => (
      dependency: Dependency
    ): boolean => {
      // Remove dependencies which has no version (they are new in the workspace)
      if (!dependency.id.hasVersion()) return false;
      const existingComponent = componentsToFilterOut.find((component) => {
        const depNewId = ComponentID.fromLegacy(dependency.id);
        // For new components, the component has no version but the dependency id has version 0.0.1
        if (!component.id.hasVersion()) {
          return component.id.toString() === dependency.id.toStringWithoutVersion();
        }
        return component.id.isEqual(depNewId);
      });
      if (existingComponent) return false;
      return true;
    };
  }

  const buildResultsP = components.map(async (component) => {
    const packageName = componentIdToPackageName(component.state._consumer);
    const depGraph = new DependencyGraph(component);
    const versionModifierFunc = generateVersionModifier(component, rootDependencies, mergeDependenciesFunc);
    const depObject = await depGraph.toJson(filterFn(components), versionModifierFunc);
    result.set(packageName, depObject);
    return Promise.resolve();
  });
  if (buildResultsP.length) {
    await Promise.all(buildResultsP);
  }
  return result;
}

/**
 * This will create a function that will modify the version of the component dependencies before calling the package manager install
 * It's important for this use case:
 * between 2 bit components we are not allowing a range, only a specific version as dependency
 * therefor, when resolve a component dependency we take the version from the actual installed version in the file system
 * imagine the following case
 * I have in my policy my-dep:0.0.10
 * during installation it is installed (hoisted to the root)
 * now i'm changing it to be ^0.0.11
 * On the next bit install, when I will look at the component deps I'll see it with version 0.0.10 always (that's resolved from the FS)
 * so the version ^0.0.11 will be never installed.
 * For installation purpose we want a different resolve method, we want to take the version from the policies so we will install the correct one
 * this function will get the root deps / policy, and a function to merge the component policies (by the dep resolver extension).
 * it will then search for the dep version in the component policy, than in the workspace policy and take it from there
 * now in the described case, it will be change to ^0.0.11 and will be install correctly
 * then on the next calculation for tagging it will have the installed version
 *
 * @param {Component} component
 * @param {DependenciesObjectDefinition} rootDependencies
 * @param {MergeDependenciesFunc} mergeDependenciesFunc
 * @returns {DepVersionModifierFunc}
 */
function generateVersionModifier(
  component: Component,
  rootDependencies: DependenciesObjectDefinition,
  mergeDependenciesFunc: MergeDependenciesFunc
): DepVersionModifierFunc {
  return async (_depId: BitId, depPackageName: string, currentVersion?: SemverVersion): Promise<SemverVersion> => {
    const mergedPolicies = await mergeDependenciesFunc(component.config.extensions);
    return (
      getPackageVersionFromDepsObject(mergedPolicies, depPackageName) ||
      getPackageVersionFromDepsObject(rootDependencies, depPackageName) ||
      currentVersion ||
      '0.0.1-new'
    );
  };
}

/**
 * This will search for a version of a package in all types of deps (runtime, dev, peer) (it will ignore versions with "-")
 *
 * @param {DependenciesObjectDefinition} depsObject
 * @param {string} depPackageName
 * @returns {(SemverVersion | undefined)}
 */
function getPackageVersionFromDepsObject(
  depsObject: DependenciesObjectDefinition,
  depPackageName: string
): SemverVersion | undefined {
  return (
    getVersionWithoutMinusFromSpecificDeps(depsObject.dependencies, depPackageName) ||
    getVersionWithoutMinusFromSpecificDeps(depsObject.devDependencies, depPackageName) ||
    getVersionWithoutMinusFromSpecificDeps(depsObject.peerDependencies, depPackageName)
  );
}

/**
 * This will get an object of {depId: version} and wil return the version if it's not "-"
 *
 * @param {DepObjectValue} [deps={}]
 * @param {string} depPackageName
 * @returns {(SemverVersion | undefined)}
 */
function getVersionWithoutMinusFromSpecificDeps(
  deps: DepObjectValue = {},
  depPackageName: string
): SemverVersion | undefined {
  if (!deps) return undefined;
  if (deps[depPackageName] && deps[depPackageName] !== '-') return deps[depPackageName];
  return undefined;
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
  components: Component[],
  createManifestForComponentsWithoutDependencies = true
): ComponentsManifestsMap {
  const componentsManifests: ComponentsManifestsMap = new Map();
  components.forEach((component) => {
    const packageName = componentIdToPackageName(component.state._consumer);
    if (
      dedupedDependencies.componentDependenciesMap.has(packageName) ||
      createManifestForComponentsWithoutDependencies
    ) {
      const blankDependencies: DependenciesObjectDefinition = {
        dependencies: {},
        devDependencies: {},
        peerDependencies: {},
      };
      let dependencies = blankDependencies;
      if (dedupedDependencies.componentDependenciesMap.has(packageName)) {
        dependencies = dedupedDependencies.componentDependenciesMap.get(packageName) as DependenciesObjectDefinition;
      }
      const version = component.id.hasVersion() ? (component.id.version as string) : '0.0.1-new';
      const manifest = new ComponentManifest(packageName, new SemVer(version), dependencies, component);
      componentsManifests.set(packageName, manifest);
    }
  });
  return componentsManifests;
}
