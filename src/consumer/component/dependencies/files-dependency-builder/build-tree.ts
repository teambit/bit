// @flow
// TODO: This should be exported as a bit component

import fs from 'fs';
import path from 'path';
import R from 'ramda';
import { partition, set } from 'lodash';
import generateTree, { processPath } from './generate-tree-madge';
import { DEFAULT_BINDINGS_PREFIX } from '../../../../constants';
import { getPathMapWithLinkFilesData, convertPathMapToRelativePaths } from './path-map';
import { PathMapItem } from './path-map';
import {
  Tree,
  FileObject,
  ImportSpecifier,
  DependencyTreeParams,
  ResolveModulesConfig
} from './types/dependency-tree-type';
import PackageJson from '../../package-json';

export type LinkFile = {
  file: string;
  importSpecifiers: ImportSpecifier[];
};

/**
 * Group dependencies by types (files, bits, packages)
 * @param {any} dependencies list of dependencies paths to group
 * @returns {Function} function which group the dependencies
 */
const byType = (list, bindingPrefix) => {
  const grouped = R.groupBy(item => {
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
export function resolveNodePackage(cwd: string, packageFullPath: string): Record<string, any> {
  const NODE_MODULES = 'node_modules';
  const result = {};
  // Start by searching in the component dir and up from there
  // If not found search in package dir itself.
  // We are doing this, because the package.json insisde the package dir contain exact version
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
      result[packageNameNormalized] = packageVersion;
      return result;
    }
  }

  // Get the package relative path to the node_modules dir
  const packageDir = resolvePackageDirFromFilePath(packageFullPath);

  // don't propagate here since loading a package.json of another folder and taking the version from it will result wrong version
  // This for example happen in the following case:
  // if you have 2 authored component which one dependet on the other
  // we will look for the package.json on the dependency but won't find it
  // if we propagate we will take the version from the root's package json which has nothing with the component version
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const packageInfo = PackageJson.loadSync(packageDir);

  // when running 'bitjs get-dependencies' command, packageInfo is sometimes empty
  // or when using custom-module-resolution it may be empty or the name/version are empty
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (!packageInfo || !packageInfo.name || !packageInfo.version) return null;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  result[packageInfo.name] = packageInfo.version;
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
    groups.packages.forEach(packagePath => {
      const packageWithVersion = resolveNodePackage(cwd, path.join(cwd, packagePath));
      if (packageWithVersion) Object.assign(packages, packageWithVersion);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
  Object.keys(tree).forEach(key => {
    result[key] = groupDependencyList(tree[key], cwd, bindingPrefix);
  });

  return result;
}

/**
 * return the package name by the import statement path to node package
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
function findPackagesInPackageJson(packageJson: Record<string, any>, packagesNames: string[]) {
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

type Missing = { [absolutePath: string]: string[] }; // e.g. { '/tmp/workspace': ['lodash', 'ramda'] };
type MissingGroupItem = { originFile: string; packages?: string[]; bits?: string[]; files?: string[] };
type FoundPackages = { [packageName: string]: string };
/**
 * Run over each entry in the missing array and transform the missing from list of paths
 * to object with missing types
 *
 * @param {Array} missing
 * @param {string} cwd
 * @param {string} workspacePath
 * @param {string} bindingPrefix
 * @returns new object with grouped missing
 */
function groupMissing(
  missing: Missing,
  cwd,
  workspacePath,
  bindingPrefix
): { missingGroups: MissingGroupItem[]; foundPackages: FoundPackages } {
  // temporarily disable this functionality since it cause few bugs: explanation below (on using the packageJson)
  // const packageJson = PackageJson.findPackage(cwd);

  /**
   * Group missing dependencies by types (files, bits, packages)
   * @param {Array} missing list of missing paths to group
   * @returns {Function} function which group the dependencies
   */
  const byPathType = R.groupBy(item => {
    if (item.startsWith(`${bindingPrefix}/`) || item.startsWith(`${DEFAULT_BINDINGS_PREFIX}/`)) return 'bits';
    return item.startsWith('.') ? 'files' : 'packages';
  });
  const groups: MissingGroupItem[] = Object.keys(missing).map(key =>
    Object.assign({ originFile: processPath(key, {}, cwd) }, byPathType(missing[key], bindingPrefix))
  );
  groups.forEach((group: MissingGroupItem) => {
    if (group.packages) group.packages = group.packages.map(resolvePackageNameByPath);
    if (group.bits) group.bits = group.bits.map(resolvePackageNameByPath);
  });
  // This is a hack to solve problems that madge has with packages for type script files
  // It see them as missing even if they are exists
  const foundPackages = {};
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const packageJson = PackageJson.findPackage(cwd);
  groups.forEach((group: MissingGroupItem) => {
    const missingPackages: string[] = [];
    if (group.packages) {
      group.packages.forEach(packageName => {
        // Don't try to resolve the same package twice
        if (R.contains(packageName, missingPackages)) return;
        const resolvedPath = resolveModulePath(packageName, cwd, workspacePath);
        if (!resolvedPath) {
          missingPackages.push(packageName);
          return;
        }
        const packageWithVersion = resolveNodePackage(cwd, resolvedPath);

        packageWithVersion
          ? Object.assign(foundPackages, packageWithVersion)
          : missingPackages.push(packageWithVersion);
      });
    }
    if (packageJson) {
      const result = findPackagesInPackageJson(packageJson, missingPackages);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      groups.packages = result.missingPackages;
      Object.assign(foundPackages, result.foundPackages);

      if (group.bits) {
        const foundBits = findPackagesInPackageJson(packageJson, group.bits);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        groups.bits = foundBits.missingPackages;
        Object.assign(foundPackages, foundBits.foundPackages);
      }
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
    const files: FileObject[] = treeFiles
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      .filter(dependency => dependency !== filePath)
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      .map((dependency: string) => {
        const dependencyPathMap = mainFilePathMap.dependencies.find(file => file.resolvedDep === dependency);
        if (!dependencyPathMap)
          throw new Error(`updateTreeWithPathMap: dependencyPathMap is missing for ${dependency}`);
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
          const depImportSpecifiers = dependencyPathMap.importSpecifiers.map(importSpecifier => {
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
function getResolveConfigAbsolute(
  workspacePath: string,
  resolveConfig: ResolveModulesConfig | null | undefined
): ResolveModulesConfig | null | undefined {
  if (!resolveConfig) return resolveConfig;
  const resolveConfigAbsolute = R.clone(resolveConfig);
  if (resolveConfig.modulesDirectories) {
    resolveConfigAbsolute.modulesDirectories = resolveConfig.modulesDirectories.map(moduleDirectory => {
      return path.isAbsolute(moduleDirectory) ? moduleDirectory : path.join(workspacePath, moduleDirectory);
    });
  }
  if (resolveConfigAbsolute.aliases) {
    Object.keys(resolveConfigAbsolute.aliases).forEach(alias => {
      if (!path.isAbsolute(resolveConfigAbsolute.aliases[alias])) {
        resolveConfigAbsolute.aliases[alias] = path.join(workspacePath, resolveConfigAbsolute.aliases[alias]);
      }
    });
  }
  return resolveConfigAbsolute;
}

function mergeManuallyFoundPackagesToTree(foundPackages: FoundPackages, missingGroups: MissingGroupItem[], tree: Tree) {
  if (R.isEmpty(foundPackages)) return;
  // Merge manually found packages (by groupMissing()) with the packages found by Madge (generate-tree-madge)
  Object.keys(foundPackages).forEach(pkg => {
    // locate package in groups(contains missing)
    missingGroups.forEach((fileDep: MissingGroupItem) => {
      if (fileDep.packages && fileDep.packages.includes(pkg)) {
        fileDep.packages = fileDep.packages.filter(packageName => packageName !== pkg);
        set(tree[fileDep.originFile], ['packages', pkg], foundPackages[pkg]);
      }
      if (fileDep.bits && fileDep.bits.includes(pkg)) {
        fileDep.bits = fileDep.bits.filter(packageName => packageName !== pkg);
        if (!tree[fileDep.originFile]) tree[fileDep.originFile] = {};
        if (!tree[fileDep.originFile].bits) tree[fileDep.originFile].bits = [];
        // @ts-ignore
        tree[fileDep.originFile].bits.push(pkg);
      }
    });
  });
}

function mergeMissingToTree(missingGroups, tree: Tree) {
  if (R.isEmpty(missingGroups)) return;
  missingGroups.forEach(missing => {
    const missingCloned = R.clone(missing);
    delete missingCloned.originFile;
    if (tree[missing.originFile]) tree[missing.originFile].missing = missingCloned;
    else tree[missing.originFile] = { missing: missingCloned };
  });
}

function mergeErrorsToTree(baseDir, errors, tree: Tree) {
  if (R.isEmpty(errors)) return;
  Object.keys(errors).forEach(file => {
    if (tree[file]) tree[file].error = errors[file];
    else tree[file] = { error: errors[file] };
  });
}

/**
 * Function for fetching dependency tree of file or dir
 * @param baseDir working directory
 * @param workspacePath
 * @param filePaths path of the file to calculate the dependencies
 * @param bindingPrefix
 * @return {Promise<{missing, tree}>}
 */
export async function getDependencyTree({
  baseDir,
  workspacePath,
  filePaths,
  bindingPrefix,
  resolveModulesConfig,
  visited = {},
  cacheProjectAst
}: DependencyTreeParams): Promise<{ tree: Tree }> {
  const resolveConfigAbsolute = getResolveConfigAbsolute(workspacePath, resolveModulesConfig);
  const config = {
    baseDir,
    includeNpm: true,
    requireConfig: null,
    webpackConfig: null,
    visited,
    nonExistent: [],
    resolveConfig: resolveConfigAbsolute,
    cacheProjectAst
  };
  // This is important because without this, madge won't know to resolve files if we run the
  // CMD not from the root dir
  const fullPaths = filePaths.map(filePath => {
    if (filePath.startsWith(baseDir)) {
      return filePath;
    }
    return path.resolve(baseDir, filePath);
  });
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const { madgeTree, skipped, pathMap, errors } = generateTree(fullPaths, config);
  const tree: Tree = groupDependencyTree(madgeTree, baseDir, bindingPrefix);
  const { missingGroups, foundPackages } = groupMissing(skipped, baseDir, workspacePath, bindingPrefix);

  if (foundPackages) mergeManuallyFoundPackagesToTree(foundPackages, missingGroups, tree);
  if (errors) mergeErrorsToTree(baseDir, errors, tree);
  if (missingGroups) mergeMissingToTree(missingGroups, tree);
  if (pathMap) updateTreeWithPathMap(tree, pathMap, baseDir);

  return { tree };
}
