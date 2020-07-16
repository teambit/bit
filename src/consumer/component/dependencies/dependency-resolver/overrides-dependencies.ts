import minimatch from 'minimatch';
import {
  COMPONENT_ORIGINS,
  MANUALLY_REMOVE_DEPENDENCY,
  MANUALLY_ADD_DEPENDENCY,
  OVERRIDE_COMPONENT_PREFIX,
  DEPENDENCIES_FIELDS
} from '../../../../constants';
import ComponentMap from '../../../bit-map/component-map';
import { BitId, BitIds } from '../../../../bit-id';
import Component from '../../../component/consumer-component';
import Consumer from '../../../../consumer/consumer';
import hasWildcard from '../../../../utils/string/has-wildcard';
import { FileType, AllDependencies } from './dependencies-resolver';
import logger from '../../../../logger/logger';

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
      return patterns.some(pattern => minimatch(file, pattern));
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
      return packages.some(pkg => pkg === packageName);
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
      return packages.some(pkg => pkg === packageName);
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
    const shouldIgnore = (ids: string[]) => {
      return ids.some(idStr => {
        if (hasWildcard(idStr)) {
          // we don't support wildcards for components for now. it gets things complicated
          // and may cause unpredicted behavior especially for imported that the originally ignored
          // wildcards interfere with legit components
          return null;
        }
        return componentId.toStringWithoutVersion() === idStr || componentId.toStringWithoutScopeAndVersion() === idStr;
      });
    };
    const field = fileType.isTestFile ? 'devDependencies' : 'dependencies';
    const ignoreField = this.component.overrides.getIgnoredComponents(field);
    const ignore = shouldIgnore(ignoreField);
    if (ignore) {
      this._addManuallyRemovedDep(field, componentIdStr);
    }
    return ignore;
  }

  /**
   * this is relevant for extensions that add packages to package.json (such as typescript compiler).
   * we get the list of the packages to add as strings, a package-name can be a bit component
   * (e.g. @bit/user.env.types), in this case, we don't have the component-id as BitId, only as a
   * string. since it comes from the compiler as strings, we don't have a good way to translate it
   * to BitId as we can't compare the id to the objects in the scope nor to the ids in bitmap.
   * the only strategy left is to use the string as is and compare it to what user added in the
   * overrides settings. @see envs.e2e, use-case 'overrides dynamic component dependencies'.
   */
  shouldIgnoreComponentByStr(componentIdStr: string, field: string): boolean {
    if (!componentIdStr.startsWith(OVERRIDE_COMPONENT_PREFIX)) return false;
    componentIdStr = componentIdStr.replace(OVERRIDE_COMPONENT_PREFIX, '');
    const shouldIgnore = (ids: string[]) => {
      return ids.some(idStr => componentIdStr === idStr);
    };
    const ignoreField = this.component.overrides.getIgnoredComponents(field);
    const ignore = shouldIgnore(ignoreField);
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
    const idsFromBitmap = this.consumer.bitMap.getAllBitIds([COMPONENT_ORIGINS.AUTHORED, COMPONENT_ORIGINS.IMPORTED]);
    const components = {};
    const packages = {};
    DEPENDENCIES_FIELDS.forEach(depField => {
      if (!overrides[depField]) return;
      const idsFromModel = this.componentFromModel ? this.componentFromModel.dependencies.getAllIds() : new BitIds();
      Object.keys(overrides[depField]).forEach(dependency => {
        const dependencyValue = overrides[depField][dependency];
        if (dependencyValue === MANUALLY_REMOVE_DEPENDENCY) return;
        const componentId = this._getComponentIdToAdd(
          depField,
          dependency,
          dependencyValue,
          idsFromBitmap,
          idsFromModel
        );
        if (componentId) {
          const dependencyExist = existingDependencies[depField].find(d =>
            d.id.isEqualWithoutScopeAndVersion(componentId)
          );
          if (!dependencyExist) {
            this._addManuallyAddedDep(depField, componentId.toString());
            components[depField] ? components[depField].push(componentId) : (components[depField] = [componentId]);
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

  _getComponentIdToAdd(
    field: string,
    dependency: string,
    dependencyValue: string,
    idsFromBitmap: BitIds,
    idsFromModel: BitIds
  ): BitId | null | undefined {
    if (field === 'peerDependencies') return null;
    // TODO: fix this, it's not relevant any more
    // We should go to package.json and check if it's a component
    if (!dependency.startsWith(OVERRIDE_COMPONENT_PREFIX)) return null;
    const compIds = this.component.overrides._getComponentNamesFromPackages(dependency);
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
        return dependencyValue === MANUALLY_ADD_DEPENDENCY ? id : id.changeVersion(dependencyValue);
      }
    }
    return null;
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
          const found = Object.keys(packageJson[depField]).find(pkg => pkg === dependency);
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
}
