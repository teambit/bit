import R from 'ramda';
import { BitId } from '../../../../bit-id';
import Consumer from '../../../../consumer/consumer';
import logger from '../../../../logger/logger';
import Component from '../../../component/consumer-component';
import { ExtensionDataEntry, ExtensionDataList } from '../../../config/extension-data';
import Dependencies from '../dependencies';
import Dependency from '../dependency';
import { DebugComponentsDependency } from './dependencies-resolver';

export default function updateDependenciesVersions(
  consumer: Consumer,
  component: Component,
  debugDependencies?: DebugComponentsDependency[]
) {
  updateDependencies(component.dependencies);
  updateDependencies(component.devDependencies);
  updateExtensions(component.extensions);

  function resolveVersion(id: BitId): string | undefined {
    // @ts-ignore component.componentFromModel is set
    const idFromModel = getIdFromModelDeps(component.componentFromModel, id);
    const idFromBitMap = getIdFromBitMap(id);
    const idFromComponentConfig = getIdFromComponentConfig(id);
    const getFromComponentConfig = () => idFromComponentConfig;
    const getFromBitMap = () => idFromBitMap || null;
    const getFromModel = () => idFromModel || null;
    const debugDep = debugDependencies?.find((dep) => dep.id.isEqualWithoutVersion(id));

    // @todo: change this once vendors feature is in.
    const getCurrentVersion = () => (id.hasVersion() ? id : null);
    const strategies = [getFromComponentConfig, getCurrentVersion, getFromBitMap, getFromModel];

    for (const strategy of strategies) {
      const strategyId = strategy();
      if (strategyId) {
        logger.debug(
          `found dependency version ${strategyId.version} for ${id.toString()} in strategy ${strategy.name}`
        );
        if (debugDep) {
          debugDep.versionResolvedFrom =
            strategy.name === 'getCurrentVersion' ? debugDep.versionResolvedFrom : strategy.name.replace('getFrom', '');
          debugDep.version = strategyId.version;
        }

        return strategyId.version;
      }
    }
    return undefined;
  }

  function updateDependency(dependency: Dependency) {
    const resolvedVersion = resolveVersion(dependency.id);
    if (resolvedVersion) {
      dependency.id = dependency.id.changeVersion(resolvedVersion);
    }
  }
  function updateDependencies(dependencies: Dependencies) {
    dependencies.get().forEach(updateDependency);
  }

  function updateExtension(extension: ExtensionDataEntry) {
    if (extension.extensionId) {
      const resolvedVersion = resolveVersion(extension.extensionId);
      if (resolvedVersion) {
        extension.extensionId = extension.extensionId.changeVersion(resolvedVersion);
      }
    }
  }
  function updateExtensions(extensions: ExtensionDataList) {
    extensions.forEach(updateExtension);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  function getIdFromModelDeps(componentFromModel?: Component, componentId: BitId): BitId | null | undefined {
    if (!componentFromModel) return null;
    const dependency = componentFromModel.getAllDependenciesIds().searchWithoutVersion(componentId);
    if (!dependency) return null;
    return dependency;
  }

  function getIdFromBitMap(componentId: BitId): BitId | null | undefined {
    return consumer.bitMap.getBitIdIfExist(componentId, { ignoreVersion: true });
  }

  function getIdFromComponentConfig(componentId: BitId): BitId | undefined {
    const dependencies = component.overrides.getComponentDependenciesWithVersion();
    if (R.isEmpty(dependencies)) return undefined;
    const dependency = Object.keys(dependencies).find(
      (idStr) =>
        componentId.toStringWithoutVersion() === idStr || componentId.toStringWithoutScopeAndVersion() === idStr
    );
    if (!dependency) return undefined;
    return componentId.changeVersion(dependencies[dependency]);
  }
}
