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
import { Component } from '../../component';
import componentIdToPackageName from '../../../utils/bit/component-id-to-package-name';
import { DependencyGraph } from '../dependency-graph';
import { RUNTIME_DEP_LIFECYCLE_TYPE, DEV_DEP_LIFECYCLE_TYPE, PEER_DEP_LIFECYCLE_TYPE } from '../constants';
import { dedupeDependencies, DedupedDependencies } from './deduping';

export type ComponentDependenciesMap = Map<PackageName, DependenciesObjectDefinition>;

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
