import R from 'ramda';
import { processPath } from './generate-tree-madge';
import { DEFAULT_BINDINGS_PREFIX } from '../../../../constants';
import {
  resolvePackagePath,
  resolvePackageData,
  resolvePackageNameByPath,
  ResolvedPackageData
} from '../../../../utils/packages';

type Missing = { [absolutePath: string]: string[] }; // e.g. { '/tmp/workspace': ['lodash', 'ramda'] };
export type MissingGroupItem = { originFile: string; packages?: string[]; bits?: string[]; files?: string[] };
export type FoundPackages = {
  packages: { [packageName: string]: string };
  bits: ResolvedPackageData[];
};

export class MissingHandler {
  constructor(
    private missing: Missing,
    private componentDir: string,
    private workspacePath: string,
    private bindingPrefix: string
  ) {}

  /**
   * Run over each entry in the missing array and transform the missing from list of paths
   * to object with missing types
   */
  groupAndFindMissing(): { missingGroups: MissingGroupItem[]; foundPackages: FoundPackages } {
    const missingGroups: MissingGroupItem[] = this.groupMissingByType();
    missingGroups.forEach((group: MissingGroupItem) => {
      if (group.packages) group.packages = group.packages.map(resolvePackageNameByPath);
      if (group.bits) group.bits = group.bits.map(resolvePackageNameByPath);
    });
    // This is a hack to solve problems that madge has with packages for type script files
    // It see them as missing even if they are exists
    const foundPackages: FoundPackages = {
      packages: {},
      bits: []
    };
    missingGroups.forEach(group => this.processMissingGroup(group, foundPackages));

    return { missingGroups, foundPackages };
  }

  private processMissingGroup(group: MissingGroupItem, foundPackages: FoundPackages) {
    if (!group.packages) return;
    const missingPackages: string[] = [];
    group.packages.forEach(packageName => {
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
      // if the package is actually a component add it to the components (bits) list
      if (resolvedPackageData.componentId) {
        foundPackages.bits.push(resolvedPackageData);
      } else {
        const version = resolvedPackageData.versionUsedByDependent || resolvedPackageData.concreteVersion;
        if (!version) throw new Error(`unable to find the version for a package ${packageName}`);
        const packageWithVersion = {
          [resolvedPackageData.name]: version
        };
        Object.assign(foundPackages.packages, packageWithVersion);
      }
    });
  }

  /**
   * Group missing dependencies by types (files, bits, packages)
   * @param {Array} missing list of missing paths to group
   * @returns {Function} function which group the dependencies
   */
  private groupMissingByType(): MissingGroupItem[] {
    const byPathType = R.groupBy(item => {
      if (item.startsWith(`${this.bindingPrefix}/`) || item.startsWith(`${DEFAULT_BINDINGS_PREFIX}/`)) return 'bits';
      return item.startsWith('.') ? 'files' : 'packages';
    });
    return Object.keys(this.missing).map(key =>
      Object.assign(
        { originFile: processPath(key, {}, this.componentDir) },
        byPathType(this.missing[key], this.bindingPrefix)
      )
    );
  }
}
