import R from 'ramda';

import { DEFAULT_BINDINGS_PREFIX } from '../../../../constants';
import {
  ResolvedPackageData,
  resolvePackageData,
  resolvePackageNameByPath,
  resolvePackagePath,
} from '../../../../utils/packages';
import { processPath, Missing } from './generate-tree-madge';

export type MissingGroupItem = { originFile: string; packages?: string[]; components?: string[]; files?: string[] };
export type FoundPackages = {
  packages: { [packageName: string]: string };
  components: ResolvedPackageData[];
};

export class MissingHandler {
  constructor(
    private missing: Missing,
    private componentDir: string,
    private workspacePath: string,
    private bindingPrefix: string,
    private isLegacyProject: boolean
  ) {}

  /**
   * Run over each entry in the missing array and transform the missing from list of paths
   * to object with missing types
   */
  groupAndFindMissing(): { missingGroups: MissingGroupItem[]; foundPackages: FoundPackages } {
    const missingGroups: MissingGroupItem[] = this.groupMissingByType();
    missingGroups.forEach((group: MissingGroupItem) => {
      if (group.packages) group.packages = group.packages.map(resolvePackageNameByPath);
      if (group.components) group.components = group.components.map(resolvePackageNameByPath);
    });
    // This is a hack to solve problems that madge has with packages for type script files
    // It see them as missing even if they are exists
    const foundPackages: FoundPackages = {
      packages: {},
      components: [],
    };
    missingGroups.forEach((group) => this.processMissingGroup(group, foundPackages));

    return { missingGroups, foundPackages };
  }

  private processMissingGroup(group: MissingGroupItem, foundPackages: FoundPackages) {
    if (!group.packages) return;
    const missingPackages: string[] = [];
    group.packages.forEach((packageName) => {
      // Don't try to resolve the same package twice
      if (missingPackages.includes(packageName)) return;
      const resolvedPath = resolvePackagePath(packageName, this.componentDir, this.workspacePath);
      if (!resolvedPath) {
        missingPackages.push(packageName);
        return;
      }
      const resolvedPackageData = resolvePackageData(this.componentDir, resolvedPath);
      if (!resolvedPackageData) {
        missingPackages.push(packageName);
        return;
      }
      // if the package is actually a component add it to the components list
      if (resolvedPackageData.componentId) {
        foundPackages.components.push(resolvedPackageData);
      } else {
        const version = resolvedPackageData.versionUsedByDependent || resolvedPackageData.concreteVersion;
        if (!version) throw new Error(`unable to find the version for a package ${packageName}`);
        const packageWithVersion = {
          [resolvedPackageData.name]: version,
        };
        Object.assign(foundPackages.packages, packageWithVersion);
      }
    });
  }

  /**
   * Group missing dependencies by types (files, components, packages)
   * @param {Array} missing list of missing paths to group
   * @returns {Function} function which group the dependencies
   */
  private groupMissingByType(): MissingGroupItem[] {
    const byPathType = R.groupBy((item) => {
      if (
        this.isLegacyProject &&
        (item.startsWith(`${this.bindingPrefix}/`) || item.startsWith(`${DEFAULT_BINDINGS_PREFIX}/`))
      ) {
        return 'components';
      }
      return item.startsWith('.') ? 'files' : 'packages';
    });
    return Object.keys(this.missing).map((key) =>
      Object.assign({ originFile: processPath(key, {}, this.componentDir) }, byPathType(this.missing[key]))
    );
  }
}
