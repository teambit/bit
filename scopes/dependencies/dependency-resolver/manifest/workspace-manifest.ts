import { Component } from '@teambit/component';
import { BitId } from 'bit-bin/dist/bit-id';
import { DependenciesFilterFunction, Dependency } from 'bit-bin/dist/consumer/component/dependencies';
import componentIdToPackageName from 'bit-bin/dist/utils/bit/component-id-to-package-name';
import { SemVer } from 'semver';

import { DependencyGraph, DepVersionModifierFunc } from '../dependency-graph';
import { MergeDependenciesFunc } from '../dependency-resolver.main.runtime';
import {
  ComponentsManifestsMap,
  DependenciesObjectDefinition,
  DepObjectValue,
  PackageName,
  SemverVersion,
} from '../types';
import { ComponentManifest } from './component-manifest';
import { DedupedDependencies, dedupeDependencies, getEmptyDedupedDependencies } from './deduping';
import { Manifest, ManifestToJsonOptions } from './manifest';

export type ComponentDependenciesMap = Map<PackageName, DependenciesObjectDefinition>;
export interface WorkspaceManifestToJsonOptions extends ManifestToJsonOptions {
  includeDir?: boolean;
}

export type CreateFromComponentsOptions = {
  filterComponentsFromManifests: boolean;
  createManifestForComponentsWithoutDependencies: boolean;
  dedupe?: boolean;
};

const DEFAULT_CREATE_OPTIONS: CreateFromComponentsOptions = {
  filterComponentsFromManifests: true,
  createManifestForComponentsWithoutDependencies: true,
  dedupe: true,
};
export class WorkspaceManifest extends Manifest {
  constructor(
    // TODO: please prefer readonly on public
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
    options: CreateFromComponentsOptions = DEFAULT_CREATE_OPTIONS,
    mergeDependenciesFunc: MergeDependenciesFunc
  ): Promise<WorkspaceManifest> {
    // Make sure to take other default if passed options with only one option
    const optsWithDefaults = Object.assign({}, DEFAULT_CREATE_OPTIONS, options);
    const componentDependenciesMap: ComponentDependenciesMap = await buildComponentDependenciesMap(
      components,
      optsWithDefaults.filterComponentsFromManifests,
      rootDependencies,
      mergeDependenciesFunc
    );
    let dedupedDependencies = getEmptyDedupedDependencies();
    if (options.dedupe) {
      dedupedDependencies = dedupeDependencies(rootDependencies, componentDependenciesMap);
    } else {
      dedupedDependencies.rootDependencies = rootDependencies;
      dedupedDependencies.componentDependenciesMap = componentDependenciesMap;
    }
    const componentsManifestsMap = getComponentsManifests(
      dedupedDependencies,
      components,
      optsWithDefaults.createManifestForComponentsWithoutDependencies
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

  getComponentMap() {}

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
        // For new components, the component has no version but the dependency id has version 0.0.1
        if (!component.id.hasVersion()) {
          return component.id.toString() === dependency.id.toStringWithoutVersion();
        }
        return component.id._legacy.isEqual(dependency.id);
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

    if (depObject.dependencies) delete depObject.dependencies['bit-bin'];
    if (depObject.devDependencies) delete depObject.devDependencies['bit-bin'];
    if (depObject.peerDependencies) delete depObject.peerDependencies['bit-bin'];

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

      const getVersion = (): string => {
        if (!component.id.hasVersion()) return '0.0.1-new';
        if (component.id._legacy.isVersionSnap()) return `0.0.1-${component.id.version}`;
        return component.id.version as string;
      };

      const version = getVersion();
      const manifest = new ComponentManifest(packageName, new SemVer(version), dependencies, component);
      componentsManifests.set(packageName, manifest);
    }
  });
  return componentsManifests;
}
