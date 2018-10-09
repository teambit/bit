// @flow
// TODO: This should be exported as a bit component

import fs from 'fs';
import path from 'path';
import R from 'ramda';
import partition from 'lodash.partition';
import lset from 'lodash.set';
import generateTree, { processPath } from './generate-tree-madge';
import PackageJson from '../package-json/package-json';
import { DEFAULT_BINDINGS_PREFIX, SUPPORTED_EXTENSIONS } from '../constants';
import { getPathMapWithLinkFilesData, convertPathMapToRelativePaths } from './path-map';
import type { PathMapItem } from './path-map';
import type {
  Tree,
  FileObject,
  ImportSpecifier,
  DependencyTreeParams,
  ResolveModulesConfig
} from './types/dependency-tree-type';

export type LinkFile = {
  file: string,
  importSpecifiers: ImportSpecifier[]
};

/**
 * Group dependencies by types (files, bits, packages)
 * @param {any} dependencies list of dependencies paths to group
 * @returns {Function} function which group the dependencies
 */
const byType = (list, bindingPrefix) => {
  const grouped = R.groupBy((item) => {
    if (item.includes(`node_modules/${bindingPrefix}`) || item.includes(`node_modules/${DEFAULT_BINDINGS_PREFIX}`)) {
      return 'bits';
    }
    return item.includes('node_modules') ? 'packages' : 'files';
  });
  return grouped(list);
};

/**
 * Get a path to node package and return the name and version
 *
 * @param {any} packageFullPath full path to the package
 * @returns {Object} name and version of the package
 */
export function resolveNodePackage(cwd: string, packageFullPath: string): Object {
  const NODE_MODULES = 'node_modules';
  const result = {};
  // Start by searching in the component dir and up from there
  // If not found search in package dir itself.
  // We are doing this, because the package.json insisde the package dir contain exact version
  // And the component/consumer package.json might contain semver like ^ or ~
  // We want to have this semver as dependency and not the exact version, otherwise it will be considered as modified all the time
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
      result[packageNameNormalized] = packageVersion;
      return result;
    }
  }

  // Get the package relative path to the node_modules dir
  const indexOfLastNodeModules = packageFullPath.lastIndexOf(NODE_MODULES) + NODE_MODULES.length + 1;
  const indexOfPackageFolderEnd = packageFullPath.indexOf(path.sep, indexOfLastNodeModules);
  const packageDir = packageFullPath.substring(0, indexOfPackageFolderEnd);

  // don't propagate here since loading a package.json of another folder and taking the version from it will result wrong version
  // This for example happen in the following case:
  // if you have 2 authored component which one dependet on the other
  // we will look for the package.json on the dependency but won't find it
  // if we propagate we will take the version from the root's package json which has nothing with the component version
  const packageInfo = PackageJson.loadSync(packageDir, false);

  // when running 'bitjs get-dependencies' command, packageInfo is sometimes empty
  // or when using custom-module-resolution it may be empty or the name/version are empty
  if (!packageInfo || !packageInfo.name || !packageInfo.version) return null;
  result[packageInfo.name] = packageInfo.version;
  return result;
}

/**
 * Gets a list of dependencies and group them by types (files, bits, packages)
 * It's also transform the node package dependencies from array of paths to object in this format:
 * {dependencyName: version} (like in package.json)
 *
 * @param {any} list of dependencies paths
 * @param {any} cwd root of working directory (used for node packages version calculation)
 * @returns {Object} object with the dependencies groups
 */
function groupDependencyList(list, cwd, bindingPrefix) {
  const groups = byType(list, bindingPrefix);
  if (groups.packages) {
    const packages = {};
    const unidentifiedPackages = [];
    groups.packages.forEach((packagePath) => {
      const packageWithVersion = resolveNodePackage(cwd, path.join(cwd, packagePath));
      if (packageWithVersion) Object.assign(packages, packageWithVersion);
      else unidentifiedPackages.push(packagePath);
    });
    groups.packages = packages;
    if (!R.isEmpty(unidentifiedPackages)) {
      groups.unidentifiedPackages = unidentifiedPackages;
    }
  }
  return groups;
}

/**
 * Run over each entry in the tree and transform the dependencies from list of paths
 * to object with dependencies types
 *
 * @param {any} tree
 * @param {any} cwd the working directory path
 * @returns new tree with grouped dependencies
 */
function groupDependencyTree(tree, cwd, bindingPrefix) {
  const result = {};
  Object.keys(tree).forEach((key) => {
    result[key] = groupDependencyList(tree[key], cwd, bindingPrefix);
  });

  return result;
}

/**
 * Get an import statement path to node package and return the package name
 *
 * @param {string} packagePath import statement path
 * @returns {string} name of the package
 */
function resolvePackageNameByPath(packagePath) {
  const packagePathArr = packagePath.split(path.sep); // TODO: make sure this is working on windows
  // Regular package without path. example - import _ from 'lodash'
  if (packagePathArr.length === 1) return packagePath;
  // Scoped package. example - import getSymbolIterator from '@angular/core/src/util.d.ts';
  if (packagePathArr[0].startsWith('@')) return path.join(packagePathArr[0], packagePathArr[1]);
  // Regular package with internal path. example import something from 'mypackage/src/util/isString'
  return packagePathArr[0];
}

/**
 * Recursively search for node module inside node_modules dir
 * This function propegate up until it get's to the root provided then stops
 *
 * @param {string} nmPath - package name
 * @param {string} workingDir - dir to start searching of
 * @param {string} root - path to dir to stop the search
 * @returns The resolved path for the package directory
 */
export function resolveModulePath(nmPath: string, workingDir: string, root: string) {
  const pathToCheck = path.resolve(workingDir, 'node_modules', nmPath);

  if (fs.existsSync(pathToCheck)) {
    return pathToCheck;
  }

  if (workingDir === root) {
    return null;
  }

  const parentWorkingDir = path.dirname(workingDir);
  if (parentWorkingDir === workingDir) return null;

  return resolveModulePath(nmPath, parentWorkingDir, root);
}

/**
 * Resolve package dependencies from package.json according to package names
 *
 * @param {Object} packageJson
 * @param {string []} packagesNames
 * @returns new object with found and missing
 */
function findPackagesInPackageJson(packageJson: Object, packagesNames: string[]) {
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
/**
 * Run over each entry in the missing array and transform the missing from list of paths
 * to object with missing types
 *
 * @param {Array} missing
 * @param {string} cwd
 * @param {string} consumerPath
 * @param {string} bindingPrefix
 * @returns new object with grouped missing
 */
function groupMissing(missing, cwd, consumerPath, bindingPrefix) {
  // temporarily disable this functionality since it cause few bugs: explanation below (on using the packageJson)
  // const packageJson = PackageJson.findPackage(cwd);

  /**
   * Group missing dependencies by types (files, bits, packages)
   * @param {Array} missing list of missing paths to group
   * @returns {Function} function which group the dependencies
   */
  const byPathType = R.groupBy((item) => {
    if (item.startsWith(`${bindingPrefix}/`) || item.startsWith(`${DEFAULT_BINDINGS_PREFIX}/`)) return 'bits';
    return item.startsWith('.') ? 'files' : 'packages';
  });
  const groups = Object.keys(missing).map(key =>
    Object.assign({ originFile: processPath(key, {}, cwd) }, byPathType(missing[key], bindingPrefix))
  );
  groups.forEach((group) => {
    if (group.packages) group.packages = group.packages.map(resolvePackageNameByPath);
  });
  // This is a hack to solve problems that madge has with packages for type script files
  // It see them as missing even if they are exists
  const foundPackages = {};
  const packageJson = PackageJson.findPackage(cwd);

  groups.forEach((group) => {
    const missingPackages = [];
    if (group.packages) {
      group.packages.forEach((packageName) => {
        // Don't add the same package twice
        if (R.contains(packageName, missingPackages)) return;
        const resolvedPath = resolveModulePath(packageName, cwd, consumerPath);
        if (!resolvedPath) {
          return missingPackages.push(packageName);
        }
        const packageWithVersion = resolveNodePackage(cwd, resolvedPath);

        return packageWithVersion
          ? Object.assign(foundPackages, packageWithVersion)
          : missingPackages.push(packageWithVersion);
      });
    }
    if (packageJson) {
      const result = findPackagesInPackageJson(packageJson, missingPackages);
      groups.packages = result.missingPackages;
      Object.assign(foundPackages, result.foundPackages);
    }
  });

  // temporarily disable this functionality since it cause this bugs:
  // https://github.com/teambit/bit/issues/635
  // https://github.com/teambit/bit/issues/690

  return { missingGroups: groups, foundPackages };
}

/**
 * add extra data such as custom-resolve and link-files from pathMap
 */
function updateTreeWithPathMap(tree: Tree, pathMapAbsolute: PathMapItem[], baseDir: string): void {
  if (!pathMapAbsolute.length) return;
  const pathMapRelative = convertPathMapToRelativePaths(pathMapAbsolute, baseDir);
  const pathMap = getPathMapWithLinkFilesData(pathMapRelative);
  Object.keys(tree).forEach((filePath: string) => {
    const treeFiles = tree[filePath].files;
    if (!treeFiles || !treeFiles.length) return; // file has no dependency
    const mainFilePathMap = pathMap.find(file => file.file === filePath);
    if (!mainFilePathMap) throw new Error(`updateTreeWithPathMap: PathMap is missing for ${filePath}`);
    // a file might have a cycle dependency with itself, remove it from the dependencies.
    const files: FileObject[] = treeFiles.filter(dependency => dependency !== filePath).map((dependency: string) => {
      const dependencyPathMap = mainFilePathMap.dependencies.find(file => file.resolvedDep === dependency);
      if (!dependencyPathMap) throw new Error(`updateTreeWithPathMap: dependencyPathMap is missing for ${dependency}`);
      const fileObject: FileObject = {
        file: dependency,
        importSource: dependencyPathMap.importSource,
        isCustomResolveUsed: dependencyPathMap.isCustomResolveUsed
      };
      if (dependencyPathMap.linkFile) {
        fileObject.isLink = true;
        fileObject.linkDependencies = dependencyPathMap.realDependencies;
        return fileObject;
      }
      if (dependencyPathMap.importSpecifiers && dependencyPathMap.importSpecifiers.length) {
        const depImportSpecifiers = dependencyPathMap.importSpecifiers.map((importSpecifier) => {
          return {
            mainFile: importSpecifier
          };
        });
        fileObject.importSpecifiers = depImportSpecifiers;
      }
      return fileObject;
    });
    tree[filePath].files = files; // eslint-disable-line no-param-reassign
  });
}

/**
 * config aliases are passed later on to webpack-enhancer and it expects them to have the full path
 */
function getResolveConfigAbsolute(consumerPath: string, resolveConfig: ?ResolveModulesConfig): ?ResolveModulesConfig {
  if (!resolveConfig) return resolveConfig;
  const resolveConfigAbsolute = R.clone(resolveConfig);
  if (resolveConfig.modulesDirectories) {
    resolveConfigAbsolute.modulesDirectories = resolveConfig.modulesDirectories.map((moduleDirectory) => {
      return path.isAbsolute(moduleDirectory) ? moduleDirectory : path.join(consumerPath, moduleDirectory);
    });
  }
  if (resolveConfigAbsolute.aliases) {
    Object.keys(resolveConfigAbsolute.aliases).forEach((alias) => {
      if (!path.isAbsolute(resolveConfigAbsolute.aliases[alias])) {
        resolveConfigAbsolute.aliases[alias] = path.join(consumerPath, resolveConfigAbsolute.aliases[alias]);
      }
    });
  }
  return resolveConfigAbsolute;
}

function mergeManuallyFoundPackagesToTree(foundPackages, groups, tree: Tree) {
  if (R.isEmpty(foundPackages)) return;
  // Merge manually found packages (by groupMissing()) with the packages found by Madge (generate-tree-madge)
  Object.keys(foundPackages).forEach((pkg) => {
    // locate package in groups(contains missing)
    groups.forEach((fileDep) => {
      if (fileDep.packages && fileDep.packages.includes(pkg)) {
        fileDep.packages = fileDep.packages.filter(packageName => packageName !== pkg);
        lset(tree[fileDep.originFile], ['packages', pkg], foundPackages[pkg]);
      }
    });
  });
}

function mergeMissingToTree(missingGroups, tree: Tree) {
  if (R.isEmpty(missingGroups)) return;
  missingGroups.forEach((missing) => {
    const missingCloned = R.clone(missing);
    delete missingCloned.originFile;
    if (tree[missing.originFile]) tree[missing.originFile].missing = missingCloned;
    else tree[missing.originFile] = { missing: missingCloned };
  });
}

function mergeErrorsToTree(baseDir, errors, tree: Tree) {
  if (R.isEmpty(errors)) return;
  Object.keys(errors).forEach((file) => {
    if (tree[file]) tree[file].error = errors[file];
    else tree[file] = { error: errors[file] };
  });
}

/**
 * Function for fetching dependency tree of file or dir
 * @param baseDir working directory
 * @param consumerPath
 * @param filePaths path of the file to calculate the dependencies
 * @param bindingPrefix
 * @return {Promise<{missing, tree}>}
 */
export async function getDependencyTree({
  baseDir,
  consumerPath,
  filePaths,
  bindingPrefix,
  resolveModulesConfig,
  visited = {}
}: DependencyTreeParams): Promise<{ tree: Tree }> {
  const resolveConfigAbsolute = getResolveConfigAbsolute(consumerPath, resolveModulesConfig);
  const config = {
    baseDir,
    includeNpm: true,
    requireConfig: null,
    webpackConfig: null,
    visited,
    nonExistent: [],
    resolveConfig: resolveConfigAbsolute
  };
  const { madgeTree, skipped, pathMap, errors } = generateTree(filePaths, config);
  const tree: Tree = groupDependencyTree(madgeTree, baseDir, bindingPrefix);
  const { missingGroups, foundPackages } = groupMissing(skipped, baseDir, consumerPath, bindingPrefix);

  if (foundPackages) mergeManuallyFoundPackagesToTree(foundPackages, missingGroups, tree);
  if (errors) mergeErrorsToTree(baseDir, errors, tree);
  if (missingGroups) mergeMissingToTree(missingGroups, tree);
  if (pathMap) updateTreeWithPathMap(tree, pathMap, baseDir);

  return { tree };
}
