import R from 'ramda';
import { partition } from 'lodash';
import { processPath } from './generate-tree-madge';
import { DEFAULT_BINDINGS_PREFIX } from '../../../../constants';
import PackageJson from '../../package-json';
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

export class GroupMissing {
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
  doGroup(): { missingGroups: MissingGroupItem[]; foundPackages: FoundPackages } {
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
    const packageJson = PackageJson.findPackage(this.componentDir);
    missingGroups.forEach(group => this.processMissingGroup(group, packageJson, foundPackages, missingGroups));

    return { missingGroups, foundPackages };
  }

  private processMissingGroup(
    group: MissingGroupItem,
    packageJson: {},
    foundPackages: FoundPackages,
    missingGroups: MissingGroupItem[]
  ) {
    const missingPackages: string[] = [];
    if (group.packages) {
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
    // this was disabled since it cause these bugs:
    // (as part of 9ddeb61aa29c170cd58df0c2cc1cc30db1ebded8 of bit-javascript)
    // https://github.com/teambit/bit/issues/635
    // https://github.com/teambit/bit/issues/690
    // later it re-enabled by this commit (d192a295632255dba9f0d62232fb237feeb8f33a of bit-javascript)
    // now with Harmony, it makes sense to disable it because if we can't find the package.json of
    // that package, we have no way to know whether this is a package or a component. as a reminder,
    // with Harmony it's possible to have a totally different package-name than the component-id
    // and the only way to know the component-id is by loading the package.json and reading the
    // component-id data.
    if (packageJson) {
      const result = findPackagesInPackageJson(packageJson, missingPackages);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      missingGroups.packages = result.missingPackages;
      Object.assign(foundPackages.packages, result.foundPackages);

      if (group.bits) {
        const foundBits = findPackagesInPackageJson(packageJson, group.bits);
        R.forEachObjIndexed((version, name) => {
          const resolvedFoundBit: ResolvedPackageData = {
            name,
            versionUsedByDependent: version
          };
          foundPackages.bits.push(resolvedFoundBit);
        }, foundBits.foundPackages);
      }
    }
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

interface PackageDependency {
  [dependencyId: string]: string;
}

interface PackageDependenciesTypes {
  dependencies?: PackageDependency;
  devDependencies?: PackageDependency;
  peerDependencies?: PackageDependency;
}
interface FindPackagesResult {
  foundPackages: {
    [packageName: string]: PackageDependenciesTypes;
  };
  missingPackages: string[];
}

/**
 * Resolve package dependencies from package.json according to package names
 *
 * @param {Object} packageJson
 * @param {string []} packagesNames
 * @returns new object with found and missing
 */
function findPackagesInPackageJson(packageJson: Record<string, any>, packagesNames: string[]): FindPackagesResult {
  const { dependencies, devDependencies, peerDependencies } = packageJson;
  const foundPackages = {};
  const mergedDependencies = Object.assign({}, dependencies, devDependencies, peerDependencies);
  if (packagesNames && packagesNames.length && !R.isNil(mergedDependencies)) {
    const [foundPackagesPartition, missingPackages] = partition(packagesNames, item => item in mergedDependencies);
    foundPackagesPartition.forEach(pack => (foundPackages[pack] = mergedDependencies[pack]));
    return { foundPackages, missingPackages };
  }
  return { foundPackages: {}, missingPackages: packagesNames };
}
