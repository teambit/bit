import {
  DEPENDENCIES_FIELDS,
  MANUALLY_ADD_DEPENDENCY,
  MANUALLY_REMOVE_DEPENDENCY,
} from '@teambit/legacy/dist/constants';
import { logger } from '@teambit/legacy.logger';
import { ConsumerComponent as Component, ManuallyChangedDependencies } from '@teambit/legacy.consumer-component';
import { FileType } from './auto-detect-deps';

export default class OverridesDependencies {
  component: Component;
  componentFromModel: Component | null | undefined;
  manuallyRemovedDependencies: ManuallyChangedDependencies;
  manuallyAddedDependencies: ManuallyChangedDependencies;
  missingPackageDependencies: string[];
  constructor(component: Component) {
    this.component = component;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.componentFromModel = this.component.componentFromModel;
    this.manuallyRemovedDependencies = {};
    this.manuallyAddedDependencies = {};
    this.missingPackageDependencies = [];
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

  getDependenciesToAddManually(): Record<string, any> | undefined {
    const overrides = this.component.overrides.componentOverridesData;
    if (!overrides) return undefined;
    const packages = {};
    DEPENDENCIES_FIELDS.forEach((depField) => {
      if (!overrides[depField]) return;
      Object.keys(overrides[depField]).forEach((dependency) => {
        const dependencyValue = overrides[depField][dependency];
        if (dependencyValue === MANUALLY_REMOVE_DEPENDENCY) return;
        (packages[depField] ||= {})[dependency] = dependencyValue;
      });
    });
    return packages;
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
    if (this.manuallyAddedDependencies?.[field]?.includes(value)) return;

    this.manuallyAddedDependencies[field]
      ? this.manuallyAddedDependencies[field].push(value)
      : (this.manuallyAddedDependencies[field] = [value]);
  }
}
