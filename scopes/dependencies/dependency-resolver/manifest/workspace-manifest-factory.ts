import { Component } from '@teambit/component';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import { SemVer } from 'semver';
import { ComponentDependency, DependencyList, PackageName } from '../dependencies';
import { VariantPolicy, WorkspacePolicy, EnvPolicy, PeersAutoDetectPolicy } from '../policy';

import { DependencyResolverMain } from '../dependency-resolver.main.runtime';
import { ComponentsManifestsMap } from '../types';
import { ComponentManifest } from './component-manifest';
import { dedupeDependencies, DedupedDependencies, getEmptyDedupedDependencies } from './deduping';
import { ManifestToJsonOptions, ManifestDependenciesObject } from './manifest';
import { updateDependencyVersion } from './update-dependency-version';
import { WorkspaceManifest } from './workspace-manifest';

export type DepsFilterFn = (dependencies: DependencyList) => DependencyList;

export type ComponentDependenciesMap = Map<PackageName, ManifestDependenciesObject>;
export interface WorkspaceManifestToJsonOptions extends ManifestToJsonOptions {
  includeDir?: boolean;
}

export type CreateFromComponentsOptions = {
  filterComponentsFromManifests: boolean;
  createManifestForComponentsWithoutDependencies: boolean;
  dedupe?: boolean;
  dependencyFilterFn?: DepsFilterFn;
  hasRootComponents?: boolean;
};

const DEFAULT_CREATE_OPTIONS: CreateFromComponentsOptions = {
  filterComponentsFromManifests: true,
  createManifestForComponentsWithoutDependencies: true,
  dedupe: true,
};
export class WorkspaceManifestFactory {
  constructor(private dependencyResolver: DependencyResolverMain) {}

  async createFromComponents(
    name: string,
    version: SemVer,
    rootPolicy: WorkspacePolicy,
    rootDir: string,
    components: Component[],
    options: CreateFromComponentsOptions = DEFAULT_CREATE_OPTIONS
  ): Promise<WorkspaceManifest> {
    // Make sure to take other default if passed options with only one option
    const optsWithDefaults = Object.assign({}, DEFAULT_CREATE_OPTIONS, options);
    const componentDependenciesMap: ComponentDependenciesMap = await this.buildComponentDependenciesMap(
      components,
      optsWithDefaults.filterComponentsFromManifests,
      rootPolicy,
      optsWithDefaults.dependencyFilterFn,
      optsWithDefaults.hasRootComponents
    );
    let dedupedDependencies = getEmptyDedupedDependencies();
    if (options.dedupe) {
      dedupedDependencies = dedupeDependencies(rootPolicy, componentDependenciesMap);
    } else {
      dedupedDependencies.rootDependencies = rootPolicy.toManifest();
      dedupedDependencies.componentDependenciesMap = componentDependenciesMap;
    }
    const componentsManifestsMap = await this.getComponentsManifests(
      dedupedDependencies,
      components,
      optsWithDefaults.createManifestForComponentsWithoutDependencies
    );
    const envPeers = this.getEnvsPeersPolicy(componentsManifestsMap);
    const workspaceManifest = new WorkspaceManifest(
      name,
      version,
      dedupedDependencies.rootDependencies,
      envPeers,
      rootDir,
      componentsManifestsMap
    );
    return workspaceManifest;
  }

  private getEnvsPeersPolicy(componentsManifestsMap: ComponentsManifestsMap) {
    const foundEnvs: EnvPolicy[] = [];
    for (const component of componentsManifestsMap.values()) {
      foundEnvs.push(component.envPolicy);
    }
    const peersPolicies = foundEnvs.map((policy) => policy.peersAutoDetectPolicy);
    // TODO: At the moment we are just merge everything, so in case of conflicts one will be taken
    // TODO: once we have root for each env, we should know to handle it differently
    const mergedPolicies = PeersAutoDetectPolicy.mergePolices(peersPolicies);
    return mergedPolicies;
  }

  /**
   * Get the components and build a map with the package name (from the component) as key and the dependencies as values
   *
   * @param {Component[]} components
   * @param {boolean} [filterComponentsFromManifests=true] - filter existing components from the dep graphs
   * @returns
   */
  private async buildComponentDependenciesMap(
    components: Component[],
    filterComponentsFromManifests = true,
    rootPolicy: WorkspacePolicy,
    dependencyFilterFn: DepsFilterFn | undefined,
    hasRootComponents?: boolean
  ): Promise<ComponentDependenciesMap> {
    const buildResultsP = components.map(async (component) => {
      const packageName = componentIdToPackageName(component.state._consumer);
      let depList = await this.dependencyResolver.getDependencies(component);
      const componentPolicy = await this.dependencyResolver.getPolicy(component);
      if (filterComponentsFromManifests) {
        depList = filterComponents(depList, components);
      }
      depList = filterResolvedFromEnv(depList, componentPolicy);
      // Remove bit bin from dep list
      depList = depList.filter((dep) => dep.id !== '@teambit/legacy');
      if (dependencyFilterFn) {
        depList = dependencyFilterFn(depList);
      }
      await this.updateDependenciesVersions(component, rootPolicy, depList);
      const depManifest = depList.toDependenciesManifest();
      if (hasRootComponents) {
        for (const compDep of Array.from(component.state.dependencies.dependencies) as any) {
          depManifest.dependencies[compDep.packageName] = `workspace:*`;
        }
      }

      return { packageName, depManifest };
    });
    const result: ComponentDependenciesMap = new Map();

    if (buildResultsP.length) {
      const results = await Promise.all(buildResultsP);
      results.forEach((currResult) => {
        result.set(currResult.packageName, currResult.depManifest);
      });
    }

    return result;
  }

  private async updateDependenciesVersions(
    component: Component,
    rootPolicy: WorkspacePolicy,
    dependencyList: DependencyList
  ): Promise<void> {
    const mergedPolicies = await this.dependencyResolver.mergeVariantPolicies(component.config.extensions);
    dependencyList.forEach((dep) => {
      updateDependencyVersion(dep, rootPolicy, mergedPolicies);
    });
  }

  /**
   * Get the components manifests based on the calculated dedupedDependencies
   *
   * @param {DedupedDependencies} dedupedDependencies
   * @param {Component[]} components
   * @returns {ComponentsManifestsMap}
   */
  async getComponentsManifests(
    dedupedDependencies: DedupedDependencies,
    components: Component[],
    createManifestForComponentsWithoutDependencies = true
  ): Promise<ComponentsManifestsMap> {
    const componentsManifests: ComponentsManifestsMap = new Map();
    await Promise.all(
      components.map(async (component) => {
        const packageName = componentIdToPackageName(component.state._consumer);
        if (
          dedupedDependencies.componentDependenciesMap.has(packageName) ||
          createManifestForComponentsWithoutDependencies
        ) {
          const blankDependencies: ManifestDependenciesObject = {
            dependencies: {},
            devDependencies: {},
            peerDependencies: {},
          };
          let dependencies = blankDependencies;
          if (dedupedDependencies.componentDependenciesMap.has(packageName)) {
            dependencies = dedupedDependencies.componentDependenciesMap.get(packageName) as ManifestDependenciesObject;
          }

          const getVersion = (): string => {
            if (!component.id.hasVersion()) return '0.0.1-new';
            if (component.id._legacy.isVersionSnap()) return `0.0.1-${component.id.version}`;
            return component.id.version as string;
          };

          const version = getVersion();
          const envPolicy = await this.dependencyResolver.getComponentEnvPolicy(component);
          const manifest = new ComponentManifest(packageName, new SemVer(version), dependencies, component, envPolicy);
          componentsManifests.set(packageName, manifest);
        }
      })
    );
    return componentsManifests;
  }
}

function filterComponents(dependencyList: DependencyList, componentsToFilterOut: Component[]): DependencyList {
  const filtered = dependencyList.filter((dep) => {
    // Do not filter non components (like packages) dependencies
    if (!(dep instanceof ComponentDependency)) {
      return true;
    }
    // Remove dependencies which has no version (they are new in the workspace)
    if (!dep.componentId.hasVersion()) return false;
    const existingComponent = componentsToFilterOut.find((component) => {
      // For new components, the component has no version but the dependency id has version 0.0.1
      if (!component.id.hasVersion()) {
        return component.id.toString() === dep.componentId.toString({ ignoreVersion: true });
      }
      // We are checking against both component.id._legacy and component.state._consumer.id
      // Because during tag operation, the component.id._legacy has the current version (before the tag)
      // while the component.state._consumer.id has the upcoming version (the version that will be after the tag)
      // The dependency in some cases is already updated to the upcoming version
      return (
        component.id._legacy.isEqual(dep.componentId._legacy) ||
        component.state._consumer.id.isEqual(dep.componentId._legacy)
      );
    });
    if (existingComponent) return false;
    return true;
  });
  return filtered;
}

/**
 * Filter deps which should be resolved from the env, we don't want to install them, they will be linked manually later
 * @param dependencyList
 * @param componentPolicy
 */
function filterResolvedFromEnv(dependencyList: DependencyList, componentPolicy: VariantPolicy): DependencyList {
  const filtered = dependencyList.filter((dep) => {
    const fromPolicy = componentPolicy.find(dep.id);
    if (!fromPolicy) {
      return true;
    }
    if (fromPolicy.value.resolveFromEnv) {
      return false;
    }
    return true;
  });
  return filtered;
}
