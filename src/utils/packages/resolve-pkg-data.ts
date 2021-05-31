import R from 'ramda';
import path from 'path';
import readPkgUp from 'read-pkg-up';
import { BitId } from '../../bit-id';
import { PACKAGE_JSON } from '../../constants';
import PackageJson from '../../consumer/component/package-json';
import { PathLinuxAbsolute, PathOsBased, PathOsBasedAbsolute } from '../path';
import { resolvePackageNameByPath } from './resolve-pkg-name-by-path';

export interface ResolvedPackageData {
  fullPath: PathOsBasedAbsolute; // package path
  packageJsonPath?: PathOsBased;
  packageJsonContent?: Record<string, any>;
  dependentPackageJsonPath?: PathOsBased;
  name: string; // package name
  concreteVersion?: string; // version from the package.json of the package itself
  versionUsedByDependent?: string; // version from the dependent package.json
  componentId?: BitId; // component id in case it's a bit component
}

/**
 * find data such as name/version/component-id from the package.json of a component and its dependent.
 * the version from the dependent may have range (such as ~ or ^).
 * the version from the dependency is an exact version.
 * for a package that is not bit-component, we're interested in the range because that's how it was
 * set in the first place and changing it to an exact version result in the component modified.
 * for a bit-component, we're interested in the exact version because this is the version that gets
 * entered into "dependency" field, which not supports range. (when a component is installed via
 * npm, it can be saved into the package.json with range: ^, ~).
 */
export function resolvePackageData(
  dependentDir: string,
  packageFullPath: PathLinuxAbsolute
): ResolvedPackageData | undefined {
  const packageData: ResolvedPackageData = {
    fullPath: packageFullPath,
    name: '',
    componentId: undefined,
  };
  enrichDataFromDependent(packageData, dependentDir);
  enrichDataFromDependency(packageData);
  if (!packageData.name) {
    // data was not found in dependent nor in dependency
    return undefined;
  }
  return packageData;
}

function enrichDataFromDependent(packageData: ResolvedPackageData, dependentDir: string) {
  const NODE_MODULES = 'node_modules';
  // @todo: currently, the "normalize" makes sure that the package.json is valid, however, due to a
  // bug, when importing snaps not from hub, it saves them in .dependencies and generate pkg.json
  // with version that has the hash, which is invalid. later, this .dependencies will be gone.
  const packageJsonInfo = readPkgUp.sync({ cwd: dependentDir, normalize: false });
  if (!packageJsonInfo) {
    return;
  }
  const dependentPackageJson = packageJsonInfo.packageJson;
  const packageFullPath = packageData.fullPath;
  // The +1 is for the / after the node_modules, we didn't enter it into the NODE_MODULES const because it makes problems on windows
  const packageRelativePath = packageFullPath.substring(
    packageFullPath.lastIndexOf(NODE_MODULES) + NODE_MODULES.length + 1,
    packageFullPath.length
  );

  const packageName = resolvePackageNameByPath(packageRelativePath);
  const packageNameNormalized = packageName.replace('\\', '/');
  const packageVersion =
    R.path(['dependencies', packageNameNormalized], dependentPackageJson) ||
    R.path(['devDependencies', packageNameNormalized], dependentPackageJson) ||
    R.path(['peerDependencies', packageNameNormalized], dependentPackageJson);
  if (packageVersion) {
    packageData.dependentPackageJsonPath = packageJsonInfo.path;
    packageData.name = packageNameNormalized;
    packageData.versionUsedByDependent = packageVersion;
  }
}

function enrichDataFromDependency(packageData: ResolvedPackageData) {
  // Get the package relative path to the node_modules dir
  const packageDir = resolvePackageDirFromFilePath(packageData.fullPath);

  // don't propagate here since loading a package.json of another folder and taking the version from it will result wrong version
  // This for example happen in the following case:
  // if you have 2 authored component which one dependent on the other
  // we will look for the package.json on the dependency but won't find it
  // if we propagate we will take the version from the root's package json which has nothing with the component version
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const packageInfo = PackageJson.loadSync(packageDir);

  // the version can be empty when creating the package.json for author, or when using custom-module-resolution
  // that's fine, we still need the component-id in this case.
  if (!packageInfo || !packageInfo.name) {
    return;
  }
  packageData.packageJsonPath = path.join(packageDir, PACKAGE_JSON);
  packageData.packageJsonContent = packageInfo;
  packageData.name = packageInfo.name;
  packageData.concreteVersion = packageInfo.version;
  if (packageInfo.componentId) {
    if (packageInfo.exported === false) {
      // @ts-ignore
      delete packageInfo.componentId.scope;
    }
    packageData.componentId = new BitId(packageInfo.componentId);
  }
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
