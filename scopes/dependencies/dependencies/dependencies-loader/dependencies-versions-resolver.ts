import { ComponentID } from '@teambit/component-id';
import Consumer from '@teambit/legacy/dist/consumer/consumer';
import { Workspace } from '@teambit/workspace';
import logger from '@teambit/legacy/dist/logger/logger';
import { isEmpty } from 'lodash';
import Component from '@teambit/legacy/dist/consumer/component/consumer-component';
import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import Dependencies from '@teambit/legacy/dist/consumer/component/dependencies/dependencies';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DEPENDENCIES_FIELDS } from '@teambit/legacy/dist/constants';
import Dependency from '@teambit/legacy/dist/consumer/component/dependencies/dependency';
import OverridesDependencies from './overrides-dependencies';
import { DebugComponentsDependency, getValidVersion } from './auto-detect-deps';

type DepType = 'dependencies' | 'devDependencies' | 'peerDependencies';

export function updateDependenciesVersions(
  depsResolver: DependencyResolverMain,
  workspace: Workspace,
  component: Component,
  overridesDependencies: OverridesDependencies,
  autoDetectOverrides?: Record<string, any>,
  debugDependencies?: DebugComponentsDependency[],
  updateExtensionsVersions = true
) {
  const consumer: Consumer = workspace.consumer;
  const autoDetectConfigMerge = workspace.getAutoDetectConfigMerge(component.id) || {};

  updateDependencies(component.dependencies, 'dependencies');
  updateDependencies(component.devDependencies, 'devDependencies');
  updateDependencies(component.peerDependencies, 'peerDependencies');
  if (updateExtensionsVersions) {
    updateExtensions(component.extensions);
  }

  /**
   * the `pkg` can be missing only in two scenarios:
   * 1: the dependency is using relative-paths, not the module path. (which bit-status shows an error and suggests
   * running bit link --rewire).
   * 2: this gets called for extension-id.
   */
  function resolveVersion(id: ComponentID, depType: DepType, pkg?: string): string | undefined {
    const idFromBitMap = getIdFromBitMap(id);
    const idFromComponentConfig = getIdFromComponentConfig(id);
    const getFromComponentConfig = () => idFromComponentConfig;
    const getFromBitMap = () => idFromBitMap || null;
    // later, change this to return the version from the overrides.
    const getFromOverrides = () => resolveFromOverrides(id, depType, pkg);
    const debugDep = debugDependencies?.find((dep) => dep.id.isEqualWithoutVersion(id));
    // the id we get from the auto-detect is coming from the package.json of the dependency.
    const getFromDepPackageJson = () => (id.hasVersion() ? id : null);
    // In case it's resolved from the node_modules, and it's also in the ws policy or variants,
    // use the resolved version from the node_modules / package folder
    const getFromDepPackageJsonDueToWorkspacePolicy = () =>
      pkg && id.hasVersion() && isPkgInWorkspacePolicies(pkg) ? id : null;
    // merge config here is only auto-detected ones. their priority is less then the ws policy
    // otherwise, imagine you merge a lane, you don't like the dependency you got from the other lane, you run
    // bit-install to change it, but it won't do anything.
    const getFromMergeConfig = () => (pkg ? resolveFromMergeConfig(id, pkg) : null);
    const getFromDepPackageJsonDueToAutoDetectOverrides = () => (pkg && isPkgInAutoDetectOverrides(pkg) ? id : null);
    // If there is a version in the node_modules/package folder, but it's not in the ws policy,
    // prefer the version from the model over the version from the node_modules
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const getFromModel = () => getIdFromModelDeps(component.componentFromModel!, id);

    const strategies = [
      getFromComponentConfig,
      getFromOverrides,
      getFromBitMap,
      getFromDepPackageJsonDueToWorkspacePolicy,
      getFromMergeConfig,
      getFromDepPackageJsonDueToAutoDetectOverrides,
      getFromModel,
      getFromDepPackageJson,
    ];

    for (const strategy of strategies) {
      const strategyId = strategy();
      if (strategyId) {
        logger.debug(
          `found dependency version ${strategyId.version} for ${id.toString()} in strategy ${strategy.name}`
        );
        if (debugDep) {
          debugDep.versionResolvedFrom = strategy.name.replace('getFrom', '');
          debugDep.version = strategyId.version;
        }

        return strategyId.version;
      }
    }
    return undefined;
  }

  function updateDependency(dependency: Dependency, depType: DepType) {
    const { id, packageName } = dependency;
    const resolvedVersion = resolveVersion(id, depType, packageName);
    if (resolvedVersion) {
      dependency.id = dependency.id.changeVersion(resolvedVersion);
    }
  }
  function updateDependencies(dependencies: Dependencies, depType: DepType) {
    dependencies.get().forEach((dep) => updateDependency(dep, depType));
  }

  function updateExtension(extension: ExtensionDataEntry) {
    if (extension.extensionId) {
      const resolvedVersion = resolveVersion(extension.extensionId, 'devDependencies');
      if (resolvedVersion) {
        extension.extensionId = extension.extensionId.changeVersion(resolvedVersion);
      }
    }
  }
  function updateExtensions(extensions: ExtensionDataList) {
    extensions.forEach(updateExtension);
  }

  function getIdFromModelDeps(componentFromModel: Component, componentId: ComponentID): ComponentID | null {
    if (!componentFromModel) return null;
    const dependency = componentFromModel.getAllDependenciesIds().searchWithoutVersion(componentId);
    if (!dependency) return null;
    return dependency;
  }

  function getIdFromBitMap(componentId: ComponentID): ComponentID | null | undefined {
    const existingIds = consumer.bitmapIdsFromCurrentLane.filterWithoutVersion(componentId);
    return existingIds.length === 1 ? existingIds[0] : undefined;
  }

  function getIdFromComponentConfig(componentId: ComponentID): ComponentID | undefined {
    const dependencies = component.overrides.getComponentDependenciesWithVersion();
    if (isEmpty(dependencies)) return undefined;
    const dependency = Object.keys(dependencies).find((idStr) => componentId.toStringWithoutVersion() === idStr);
    if (!dependency) return undefined;
    return componentId.changeVersion(dependencies[dependency]);
  }

  function resolveFromOverrides(id: ComponentID, depType: DepType, pkgName?: string): ComponentID | undefined {
    if (!pkgName) return undefined;
    const dependencies = overridesDependencies.getDependenciesToAddManually();
    const found = dependencies?.[depType]?.[pkgName];
    if (!found) return undefined;
    const validVersion = getValidVersion(found);
    return validVersion ? id.changeVersion(validVersion) : undefined;
  }

  function isPkgInAutoDetectOverrides(pkgName: string): boolean {
    return DEPENDENCIES_FIELDS.some(
      (depField) => autoDetectOverrides?.[depField] && autoDetectOverrides[depField][pkgName]
    );
  }

  function isPkgInWorkspacePolicies(pkgName: string) {
    return depsResolver.getWorkspacePolicyManifest().dependencies?.[pkgName];
  }

  function resolveFromMergeConfig(id: ComponentID, pkgName: string): ComponentID | undefined {
    let foundVersion: string | undefined | null;
    DEPENDENCIES_FIELDS.forEach((field) => {
      if (autoDetectConfigMerge[field]?.[pkgName]) {
        foundVersion = autoDetectConfigMerge[field]?.[pkgName];
        foundVersion = foundVersion ? getValidVersion(foundVersion) : null;
      }
    });
    return foundVersion ? id.changeVersion(foundVersion) : undefined;
  }
}
