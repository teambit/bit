import R from 'ramda';
import { PathLinuxAbsolute } from '../path';
import PackageJson from '../../consumer/component/package-json';
import { resolvePackageNameByPath } from './resolve-pkg-name-by-path';
import { BitId } from '../../bit-id';

export interface ResolvedPackageData {
  fullPath?: PathLinuxAbsolute;
  name: string;
  concreteVersion?: string; // Version from the package.json of the package itself
  versionUsedByDependent?: string; // Version from the dependent package.json
  componentId?: BitId; // add the component id in case it's a bit component
}

/**
 * Get a path to node package and return the name and version
 *
 * @param {any} packageFullPath full path to the package
 * @returns {Object} name and version of the package
 */
export function resolvePackageData(cwd: string, packageFullPath: PathLinuxAbsolute): ResolvedPackageData | undefined {
  const NODE_MODULES = 'node_modules';
  const result: ResolvedPackageData = {
    fullPath: packageFullPath,
    name: '',
    componentId: undefined
  };
  // Start by searching in the component dir and up from there
  // If not found search in package dir itself.
  // We are doing this, because the package.json inside the package dir contain exact version
  // And the component/consumer package.json might contain semver like ^ or ~
  // We want to have this semver as dependency and not the exact version, otherwise it will be considered as modified all the time
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const packageJsonInfo = PackageJson.findPackage(cwd);
  if (packageJsonInfo) {
    // The +1 is for the / after the node_modules, we didn't enter it into the NODE_MODULES const because it makes problems on windows
    const packageRelativePath = packageFullPath.substring(
      packageFullPath.lastIndexOf(NODE_MODULES) + NODE_MODULES.length + 1,
      packageFullPath.length
    );

    const packageName = resolvePackageNameByPath(packageRelativePath);
    const packageNameNormalized = packageName.replace('\\', '/');
    const packageVersion =
      R.path(['dependencies', packageNameNormalized], packageJsonInfo) ||
      R.path(['devDependencies', packageNameNormalized], packageJsonInfo) ||
      R.path(['peerDependencies', packageNameNormalized], packageJsonInfo);
    if (packageVersion) {
      result.name = packageNameNormalized;
      result.versionUsedByDependent = packageVersion;
    }
  }

  // Get the package relative path to the node_modules dir
  const packageDir = resolvePackageDirFromFilePath(packageFullPath);

  // don't propagate here since loading a package.json of another folder and taking the version from it will result wrong version
  // This for example happen in the following case:
  // if you have 2 authored component which one dependent on the other
  // we will look for the package.json on the dependency but won't find it
  // if we propagate we will take the version from the root's package json which has nothing with the component version
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const packageInfo = PackageJson.loadSync(packageDir);

  // when running 'bitjs get-dependencies' command, packageInfo is sometimes empty
  // or when using custom-module-resolution it may be empty or the name/version are empty
  if (!packageInfo || !packageInfo.name || !packageInfo.version) {
    if (!result.name) {
      return undefined;
    }
    return result;
  }
  result.name = packageInfo.name;
  result.concreteVersion = packageInfo.version;
  if (packageInfo.componentId) {
    result.componentId = new BitId(packageInfo.componentId);
  }
  return result;
}

/**
 * given the full path of a package file, returns the root dir of the package, so then we could
 * find the package.json in that directory.
 *
 * example of a normal package:
 * absolutePackageFilePath: /user/workspace/node_modules/lodash.isboolean/index.js
 * returns: /user/workspace/node_modules/lodash.isboolean
 *
 * example of a scoped package:
 * absolutePackageFilePath: /user/workspace/node_modules/@babel/core/lib/index.js
 * returns: /user/workspace/node_modules/@babel/core
 */
function resolvePackageDirFromFilePath(absolutePackageFilePath: string): string {
  const NODE_MODULES = 'node_modules';
  const indexOfLastNodeModules = absolutePackageFilePath.lastIndexOf(NODE_MODULES) + NODE_MODULES.length + 1;
  const pathInsideNodeModules = absolutePackageFilePath.substring(indexOfLastNodeModules);
  const packageName = resolvePackageNameByPath(pathInsideNodeModules);
  const pathUntilNodeModules = absolutePackageFilePath.substring(0, indexOfLastNodeModules);
  return pathUntilNodeModules + packageName;
}
