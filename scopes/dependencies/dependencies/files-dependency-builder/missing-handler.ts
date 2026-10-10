import fs from 'fs';
import path from 'path';
import { resolvePackageNameByPath, resolvePackagePath } from '@teambit/legacy.utils';
import type { ResolvedPackageData } from '../resolve-pkg-data';
import { resolvePackageData } from '../resolve-pkg-data';
import type { Missing } from './generate-tree-madge';
import { processPath } from './generate-tree-madge';
import { groupBy } from 'lodash';

export type MissingGroupItem = { originFile: string; packages?: string[]; files?: string[] };
export type FoundPackages = {
  packages: { [packageName: string]: string };
  components: ResolvedPackageData[];
};

export class MissingHandler {
  constructor(
    private missing: Missing,
    private componentDir: string,
    private workspacePath: string
  ) {}

  /**
   * Run over each entry in the missing array and transform the missing from list of paths
   * to object with missing types
   */
  groupAndFindMissing(): { missingGroups: MissingGroupItem[]; foundPackages: FoundPackages } {
    const missingGroups: MissingGroupItem[] = this.groupMissingByType();
    missingGroups.forEach((group: MissingGroupItem) => {
      if (group.packages) group.packages = group.packages.map(resolvePackageNameByPath);
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
        const version =
          resolvedPackageData.versionUsedByDependent ||
          resolvedPackageData.concreteVersion ||
          // a private package of a pnpm workspace may have no version. any version of it is the one there
          (isWorkspaceProjectPackage(resolvedPath, this.workspacePath) ? '*' : undefined);
        if (!version) throw new Error(`unable to find the version for a package ${packageName}`);
        const packageWithVersion = {
          [resolvedPackageData.name]: version,
        };
        Object.assign(foundPackages.packages, packageWithVersion);
      }
    });
  }

  /**
   * Group missing dependencies by types (files, packages)
   * @param {Array} missing list of missing paths to group
   * @returns {Function} function which group the dependencies
   */
  private groupMissingByType(): MissingGroupItem[] {
    const byPathType = (item) => (item.startsWith('.') ? 'files' : 'packages');
    return Object.keys(this.missing).map((key) =>
      Object.assign({ originFile: processPath(key, {}, this.componentDir) }, groupBy(this.missing[key], byPathType))
    );
  }
}

/**
 * a package linked to a project of the workspace: its real path is in the workspace, outside of any
 * node_modules. an installed package is under node_modules, wherever the link to it points.
 */
function isWorkspaceProjectPackage(packagePath: string, workspacePath: string): boolean {
  try {
    const relativePath = path.relative(fs.realpathSync(workspacePath), fs.realpathSync(packagePath));
    const segments = relativePath.split(path.sep);
    return (
      Boolean(relativePath) &&
      !path.isAbsolute(relativePath) &&
      segments[0] !== '..' &&
      !segments.includes('node_modules')
    );
  } catch {
    return false;
  }
}
