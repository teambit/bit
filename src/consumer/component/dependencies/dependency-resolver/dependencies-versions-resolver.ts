import R from 'ramda';
import { ComponentID } from '@teambit/component-id';
import Consumer from '../../../../consumer/consumer';
import logger from '../../../../logger/logger';
import Component from '../../../component/consumer-component';
import { ExtensionDataEntry, ExtensionDataList } from '../../../config/extension-data';
import Dependencies from '../dependencies';
import Dependency from '../dependency';
import DependencyResolver, { DebugComponentsDependency } from './dependencies-resolver';
import OverridesDependencies from './overrides-dependencies';
import { DEPENDENCIES_FIELDS } from '../../../../constants';
import { getValidVersion } from './auto-detect-deps';

export function updateDependenciesVersions(
  consumer: Consumer,
  component: Component,
  overridesDependencies: OverridesDependencies,
  autoDetectOverrides: Record<string, any>,
  debugDependencies?: DebugComponentsDependency[]
) {
  const autoDetectConfigMerge = DependencyResolver.getOnComponentAutoDetectConfigMerge(component.id) || {};

  updateDependencies(component.dependencies);
  updateDependencies(component.devDependencies);
  updateExtensions(component.extensions);

  /**
   * the `pkg` can be missing only in two scenarios:
   * 1: the dependency is using relative-paths, not the module path. (which bit-status shows an error and suggests
   * running bit link --rewire).
   * 2: this gets called for extension-id.
   */
  function resolveVersion(id: ComponentID, pkg?: string): string | undefined {
    const idFromBitMap = getIdFromBitMap(id);
    const idFromComponentConfig = getIdFromComponentConfig(id);
    const getFromComponentConfig = () => idFromComponentConfig;
    const getFromBitMap = () => idFromBitMap || null;
    // later, change this to return the version from the overrides.
    const getFromOverrides = () => (pkg && isPkgInOverrides(pkg) ? id : null);
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

  function updateDependency(dependency: Dependency) {
    const { id, packageName } = dependency;
    const resolvedVersion = resolveVersion(id, packageName);
    if (resolvedVersion) {
      dependency.id = dependency.id.changeVersion(resolvedVersion);
    }
  }
  function updateDependencies(dependencies: Dependencies) {
    dependencies.get().forEach(updateDependency);
  }

  function updateExtension(extension: ExtensionDataEntry) {
    if (extension.newExtensionId && extension.extensionId) {
      const resolvedVersion = resolveVersion(extension.newExtensionId);
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
    return consumer.bitMap.getComponentIdIfExist(componentId, { ignoreVersion: true });
  }

  function getIdFromComponentConfig(componentId: ComponentID): ComponentID | undefined {
    const dependencies = component.overrides.getComponentDependenciesWithVersion();
    if (R.isEmpty(dependencies)) return undefined;
    const dependency = Object.keys(dependencies).find((idStr) => componentId.toStringWithoutVersion() === idStr);
    if (!dependency) return undefined;
    return componentId.changeVersion(dependencies[dependency]);
  }

  function isPkgInOverrides(pkgName: string): boolean {
    const dependencies = overridesDependencies.getDependenciesToAddManually();
    if (!dependencies) return false;
    const allDeps = Object.values(dependencies)
      .map((obj) => Object.keys(obj))
      .flat();
    return allDeps.includes(pkgName);
  }

  function isPkgInAutoDetectOverrides(pkgName: string): boolean {
    return DEPENDENCIES_FIELDS.some(
      (depField) => autoDetectOverrides[depField] && autoDetectOverrides[depField][pkgName]
    );
  }

  function isPkgInWorkspacePolicies(pkgName: string) {
    return DependencyResolver.getWorkspacePolicy().dependencies?.[pkgName];
  }

  function resolveFromMergeConfig(id: ComponentID, pkgName: string) {
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
