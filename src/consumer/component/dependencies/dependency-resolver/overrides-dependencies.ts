import minimatch from 'minimatch';
import path from 'path';
import _ from 'lodash';
import R from 'ramda';
import { BitId, BitIds } from '../../../../bit-id';
import {
  COMPONENT_ORIGINS,
  DEPENDENCIES_FIELDS,
  MANUALLY_ADD_DEPENDENCY,
  MANUALLY_REMOVE_DEPENDENCY,
  OVERRIDE_COMPONENT_PREFIX,
} from '../../../../constants';
import Consumer from '../../../../consumer/consumer';
import logger from '../../../../logger/logger';
import { ResolvedPackageData, resolvePackageData, resolvePackagePath } from '../../../../utils/packages';
import { PathLinux } from '../../../../utils/path';
import ComponentMap from '../../../bit-map/component-map';
import Component from '../../../component/consumer-component';
import { AllDependencies, FileType } from './dependencies-resolver';

export type ManuallyChangedDependencies = {
  dependencies?: string[];
  devDependencies?: string[];
  peerDependencies?: string[];
};

export default class OverridesDependencies {
  component: Component;
  consumer: Consumer;
  componentMap: ComponentMap;
  componentFromModel: Component | null | undefined;
  manuallyRemovedDependencies: ManuallyChangedDependencies;
  manuallyAddedDependencies: ManuallyChangedDependencies;
  missingPackageDependencies: string[];
  constructor(component: Component, consumer: Consumer) {
    this.component = component;
    this.consumer = consumer; // $FlowFixMe
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.componentMap = this.component.componentMap;
    this.componentFromModel = this.component.componentFromModel;
    this.manuallyRemovedDependencies = {};
    this.manuallyAddedDependencies = {};
    this.missingPackageDependencies = [];
  }

  shouldIgnoreFile(file: string, fileType: FileType): boolean {
    const shouldIgnoreByGlobMatch = (patterns: string[]) => {
      return patterns.some((pattern) => minimatch(file, pattern));
    };
    const field = fileType.isTestFile ? 'devDependencies' : 'dependencies';
    const ignoreField = this.component.overrides.getIgnoredFiles(field);
    const ignore = shouldIgnoreByGlobMatch(ignoreField);
    if (ignore) {
      this._addManuallyRemovedDep(field, file);
    }
    return ignore;
  }

  shouldIgnorePackage(packageName: string, fileType: FileType): boolean {
    const field = fileType.isTestFile ? 'devDependencies' : 'dependencies';
    return this.shouldIgnorePackageByType(packageName, field);
  }

  shouldIgnorePackageByType(packageName: string, field: string): boolean {
    const shouldIgnorePackage = (packages: string[]) => {
      return packages.some((pkg) => pkg === packageName);
    };
    const ignoreField = this.component.overrides.getIgnoredPackages(field);
    const ignore = shouldIgnorePackage(ignoreField);
    if (ignore) {
      this._addManuallyRemovedDep(field, packageName);
    }
    return ignore;
  }

  shouldIgnorePeerPackage(packageName: string): boolean {
    const shouldIgnorePackage = (packages: string[]) => {
      return packages.some((pkg) => pkg === packageName);
    };
    const field = 'peerDependencies';
    const ignorePeer = this.component.overrides.getIgnoredPackages(field);
    const ignore = shouldIgnorePackage(ignorePeer);
    if (ignore) {
      this._addManuallyRemovedDep(field, packageName);
    }
    return ignore;
  }

  shouldIgnoreComponent(componentId: BitId, fileType: FileType): boolean {
    const componentIdStr = componentId.toStringWithoutVersion();
    const shouldIgnore = (ids: BitId[]) => {
      return ids.some((id) => {
        return componentId.isEqualWithoutVersion(id) || componentId.isEqualWithoutScopeAndVersion(id);
      });
    };
    const field = fileType.isTestFile ? 'devDependencies' : 'dependencies';
    const ignoredComponents = this._getIgnoredComponentsByField(field);
    const ignore = shouldIgnore(ignoredComponents);
    if (ignore) {
      this._addManuallyRemovedDep(field, componentIdStr);
    }
    return ignore;
  }

  getDependenciesToAddManually(
    packageJson: Record<string, any> | null | undefined,
    existingDependencies: AllDependencies
  ): { components: Record<string, any>; packages: Record<string, any> } | null | undefined {
    const overrides = this.component.overrides.componentOverridesData;
    if (!overrides) return null;
    const idsFromBitmap = this.consumer.bitMap.getAllBitIdsFromAllLanes([
      COMPONENT_ORIGINS.AUTHORED,
      COMPONENT_ORIGINS.IMPORTED,
    ]);
    const idsFromModel = this.componentFromModel ? this.componentFromModel.dependencies.getAllIds() : new BitIds();
    const components = {};
    const packages = {};
    DEPENDENCIES_FIELDS.forEach((depField) => {
      if (!overrides[depField]) return;
      Object.keys(overrides[depField]).forEach((dependency) => {
        const dependencyValue = overrides[depField][dependency];
        if (dependencyValue === MANUALLY_REMOVE_DEPENDENCY) return;
        const componentData = this._getComponentIdToAdd(
          depField,
          dependency,
          dependencyValue,
          idsFromBitmap,
          idsFromModel
        );
        if (componentData && componentData.componentId) {
          const dependencyExist = existingDependencies[depField].find((d) =>
            d.id.isEqualWithoutScopeAndVersion(componentData.componentId)
          );
          if (!dependencyExist) {
            this._addManuallyAddedDep(depField, componentData.componentId.toString());
            components[depField] ? components[depField].push(componentData) : (components[depField] = [componentData]);
          }
          return;
        }
        const addedPkg = this._manuallyAddPackage(depField, dependency, dependencyValue, packageJson);
        if (addedPkg) {
          packages[depField] = Object.assign(packages[depField] || {}, addedPkg);
        }
      });
    });
    return { components, packages };
  }

  _getIgnoredComponentsByField(field: 'devDependencies' | 'dependencies' | 'peerDependencies'): BitId[] {
    const ignoredPackages = this.component.overrides.getIgnoredPackages(field);
    const idsFromBitmap = this.consumer.bitMap.getAllBitIdsFromAllLanes([
      COMPONENT_ORIGINS.AUTHORED,
      COMPONENT_ORIGINS.IMPORTED,
    ]);
    const idsFromModel = this.componentFromModel ? this.componentFromModel.dependencies.getAllIds() : new BitIds();
    const ignoredComponents = ignoredPackages.map((packageName) =>
      this._getComponentIdFromPackage(packageName, idsFromBitmap, idsFromModel)
    );
    return _.compact(ignoredComponents);
  }

  _getComponentIdToAdd(
    field: string,
    dependency: string,
    dependencyValue: string,
    idsFromBitmap: BitIds,
    idsFromModel: BitIds
  ): { componentId?: BitId; packageName?: string } | undefined {
    if (field === 'peerDependencies') return undefined;
    if (this.consumer.isLegacy && dependency.startsWith(OVERRIDE_COMPONENT_PREFIX)) {
      const componentId = this._getComponentIdToAddForLegacyWs(
        field,

        dependency,

        dependencyValue,

        idsFromBitmap,

        idsFromModel
      );
      return {
        componentId,
      };
    }
    const packageData = this._resolvePackageData(dependency);
    return { componentId: packageData?.componentId, packageName: packageData?.name };
  }

  _getComponentIdFromPackage(packageName: string, idsFromBitmap: BitIds, idsFromModel: BitIds): BitId | undefined {
    // backward compatibility
    if (this.consumer.isLegacy && packageName.startsWith(OVERRIDE_COMPONENT_PREFIX)) {
      const existing = this._getExistingComponentIdFromLegacyPackageName(packageName, idsFromBitmap, idsFromModel);
      return existing;
    }
    const packageData = this._resolvePackageData(packageName);
    return packageData?.componentId;
  }

  /**
   * This is used to support legacy projects (before harmony were components used @bit as prefix)
   * @param field
   * @param dependency
   * @param dependencyValue
   * @param idsFromBitmap
   * @param idsFromModel
   */
  _getComponentIdToAddForLegacyWs(
    field: string,
    dependency: string,
    dependencyValue: string,
    idsFromBitmap: BitIds,
    idsFromModel: BitIds
  ): BitId | undefined {
    if (field === 'peerDependencies') return undefined;
    if (!dependency.startsWith(OVERRIDE_COMPONENT_PREFIX)) return undefined;
    const id = this._getExistingComponentIdFromLegacyPackageName(dependency, idsFromBitmap, idsFromModel);
    if (id) {
      return dependencyValue === MANUALLY_ADD_DEPENDENCY ? id : id.changeVersion(dependencyValue);
    }
    return undefined;
  }

  /**
   * For legacy use only, do not use it on harmony projects
   * This will parse the package name and look for the parsed result in the bitmap / ids from model and return the matched id if exist
   * @param dependency
   * @param idsFromBitmap
   * @param idsFromModel
   */
  _getExistingComponentIdFromLegacyPackageName(
    dependency: string,
    idsFromBitmap: BitIds,
    idsFromModel: BitIds
  ): BitId | undefined {
    let result: BitId | undefined;
    if (!dependency.startsWith(OVERRIDE_COMPONENT_PREFIX)) return undefined;
    const compIds = this._getComponentIdFromLegacyPackageName(dependency);
    for (const compId of [...compIds, dependency]) {
      const bitId = compId.replace(OVERRIDE_COMPONENT_PREFIX, '');
      const idFromBitMap =
        idsFromBitmap.searchStrWithoutVersion(bitId) || idsFromBitmap.searchStrWithoutScopeAndVersion(bitId);
      const idFromModel =
        idsFromModel.searchStrWithoutVersion(bitId) || idsFromModel.searchStrWithoutScopeAndVersion(bitId);
      // $FlowFixMe one of them must be set (see one line above)
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const id: BitId = idFromModel || idFromBitMap;
      if (id) {
        result = id;
      }
    }
    return result;
  }

  // This strategy is used only for legacy projects (backward computability)
  // This strategy should be stopped using since harmony, because a package name
  // might be completely different than a component id
  // instead we should go to the package.json and check the component name there
  // Like we do in resolvePackageData()
  /**
   * it is possible that a user added the component into the overrides as a package.
   * e.g. `@bit/david.utils.is-string` instead of `@bit/david.utils/is-string`
   * or, if not using bit.dev, `@bit/utils.is-string` instead of `@bit/utils/is-string`
   */
  _getComponentIdFromLegacyPackageName(idStr: string): string[] {
    const idSplitByDot = idStr.split('.');
    const numberOfDots = idSplitByDot.length - 1;
    if (numberOfDots === 0) return []; // nothing to do. it wasn't entered as a package
    const localScopeComponent = idSplitByDot.join('/'); // convert all dots to slashes
    if (numberOfDots === 1) {
      // it can't be from bit.dev, it must be locally
      return [localScopeComponent];
    }
    // there are two dots or more. it can be from bit.dev and it can be locally
    // for a remoteScopeComponent, leave the first dot and convert only the rest to a slash
    const remoteScopeComponent = `${R.head(idSplitByDot)}.${R.tail(idSplitByDot).join('/')}`;
    return [localScopeComponent, remoteScopeComponent];
  }

  _manuallyAddPackage(
    field: string,
    dependency: string,
    dependencyValue: string,
    packageJson: Record<string, any> | null | undefined
  ): Record<string, any> | null | undefined {
    const packageVersionToAdd = (): string | null | undefined => {
      if (dependencyValue !== MANUALLY_ADD_DEPENDENCY) {
        return dependencyValue;
      }
      if (!packageJson) return null;
      for (const depField of DEPENDENCIES_FIELDS) {
        if (packageJson[depField]) {
          const found = Object.keys(packageJson[depField]).find((pkg) => pkg === dependency);
          if (found) return packageJson[depField][dependency];
        }
      }
      return null;
    };
    const versionToAdd = packageVersionToAdd();
    if (!versionToAdd) {
      logger.debug(`unable to manually add the dependency "${dependency}" into "${this.component.id.toString()}".
it's not an existing component, nor existing package (in a package.json)`);
      this.missingPackageDependencies.push(dependency);
      return undefined;
    }
    const packageStr = `${dependency}@${versionToAdd}`;
    this._addManuallyAddedDep(field, packageStr);

    return { [dependency]: versionToAdd };
  }

  _addManuallyRemovedDep(field: string, value: string) {
    this.manuallyRemovedDependencies[field]
      ? this.manuallyRemovedDependencies[field].push(value)
      : (this.manuallyRemovedDependencies[field] = [value]);
  }

  _addManuallyAddedDep(field: string, value: string) {
    this.manuallyAddedDependencies[field]
      ? this.manuallyAddedDependencies[field].push(value)
      : (this.manuallyAddedDependencies[field] = [value]);
  }

  // TODO: maybe cache those results??
  _resolvePackageData(packageName: string): ResolvedPackageData | undefined {
    const rootDir: PathLinux | null | undefined = this.componentMap.rootDir;
    const consumerPath = this.consumer.getPath();
    const basePath = rootDir ? path.join(consumerPath, rootDir) : consumerPath;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const modulePath = resolvePackagePath(packageName, basePath, consumerPath);
    if (!modulePath) return undefined; // e.g. it's author and wasn't exported yet, so there's no node_modules of that component
    const packageObject = resolvePackageData(basePath, modulePath);
    return packageObject;
  }
}
