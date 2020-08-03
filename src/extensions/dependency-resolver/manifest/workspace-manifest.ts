import { SemVer } from 'semver';
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
import { Component, ComponentID } from '../../component';
import componentIdToPackageName from '../../../utils/bit/component-id-to-package-name';
import { DependencyGraph } from '../dependency-graph';
import { RUNTIME_DEP_LIFECYCLE_TYPE, DEV_DEP_LIFECYCLE_TYPE, PEER_DEP_LIFECYCLE_TYPE } from '../constants';
import { dedupeDependencies, DedupedDependencies } from './deduping';
import { Dependencies, Dependency, DependenciesFilterFunction } from '../../../consumer/component/dependencies';

export type ComponentDependenciesMap = Map<PackageName, DependenciesObjectDefinition>;
export type ManifestToJsonOptions = {
  includeDir?: boolean;
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

  static createFromComponents(
    name: string,
    version: SemVer,
    dependencies: DependenciesObjectDefinition,
    rootDir: string,
    components: Component[],
    filterComponentsFromManifests = true
  ): WorkspaceManifest {
    const componentDependenciesMap: ComponentDependenciesMap = buildComponentDependenciesMap(
      components,
      filterComponentsFromManifests
    );
    const dedupedDependencies = dedupeDependencies(dependencies, componentDependenciesMap);
    const componentsManifestsMap = getComponentsManifests(dedupedDependencies, components);
    const workspaceManifest = new WorkspaceManifest(name, version, dependencies, rootDir, componentsManifestsMap);
    return workspaceManifest;
  }

  toJson(options: ManifestToJsonOptions = {}): Record<string, any> {
    const manifest = super.toJson();
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
function buildComponentDependenciesMap(components: Component[], filterComponentsFromManifests = true) {
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

  components.forEach((component) => {
    const packageName = componentIdToPackageName(component.state._consumer);
    const depGraph = new DependencyGraph(component);
    const depObject = depGraph.toJson(filterFn(components));
    result.set(packageName, depObject);
  });
  return result;
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
