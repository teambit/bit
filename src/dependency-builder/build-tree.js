// @flow
// TODO: This should be exported as a bit component

import fs from 'fs';
import path from 'path';
import R from 'ramda';
import generateTree from './generate-tree-madge';
import PackageJson from '../package-json/package-json';
import partition from 'lodash.partition';
import lset from 'lodash.set';
import { DEFAULT_BINDINGS_PREFIX } from '../constants';

/**
 * Import Specifier data.
 * For example, `import foo from './bar' `, "foo" is the import-specifier and is default.
 * Conversely, `import { foo } from './bar' `, here, "foo" is non-default.
 */
export type Specifier = {
  isDefault: boolean,
  name: string
}

/**
 * ImportSpecifier are used later on to generate links from component to its dependencies.
 * For example, a component might have a dependency: "import { foo } from './bar' ", when a link is generated, we use
 * the import-specifier name, which is "foo" to generate the link correctly.
 */
export type ImportSpecifier = {
  mainFile: Specifier,
  linkFile?: Specifier // relevant only when the dependency is a link file (e.g. index.js which import and export the variable from other file)
}

export type LinkFile = {
  file: string,
  importSpecifiers: ImportSpecifier[]
};

export type PathMapDependency = {
  dep: string, // dependency path as it has been received from dependency-tree lib
  resolvedDep: string, // absolute path
  relativePath: string, // path relative to consumer root
  importSpecifiers: ImportSpecifier[],
  linkFile?: boolean,
  realDependencies?: LinkFile[]
}

/**
 * PathMap is used to get the ImportSpecifiers from dependency-tree library
 */
export type PathMapItem = {
  file: string,
  dependencies: PathMapDependency[]
}


export type Dependencies = {
  files: string[],
  packages?: Object,
  importSpecifiers?: ImportSpecifier[],
  linkFiles?: LinkFile[]
}

export type Tree = {
  [main_file: string]: Dependencies
}


/**
 * Group dependencies by types (files, bits, packages)
 * @param {any} dependencies list of dependencies paths to group
 * @returns {Function} function which group the dependencies
 */
const byType = (list, bindingPrefix) => {
  const grouped = R.groupBy((item) => {
    if (item.includes(`node_modules/${bindingPrefix}`) || item.includes(`node_modules/${DEFAULT_BINDINGS_PREFIX}`)) return 'bits';
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
    const packageRelativePath = packageFullPath.substring(packageFullPath.lastIndexOf(NODE_MODULES) + NODE_MODULES.length + 1, packageFullPath.length);

    const packageName = resolvePackageNameByPath(packageRelativePath);
    const packageVersion = R.path(['dependencies', packageName], packageJsonInfo) ||
                           R.path(['devDependencies', packageName], packageJsonInfo) ||
                           R.path(['peerDependencies', packageName], packageJsonInfo);
    if (packageVersion) {
      result[packageName] = packageVersion;
      return result;
    }
  }

  // Get the package relative path to the node_modules dir
  let packageDir = packageFullPath;
  // Check if the full path is path to the index file and not only to the directory
  const stats = fs.statSync(packageFullPath);
  if (stats.isFile()) {
    packageDir = path.dirname(packageFullPath);
  }
  // don't propagate here since loading a package.json of another folder and taking the version from it will result wrong version
  // This for example happen in the following case:
  // if you have 2 authored component which one dependet on the other
  // we will look for the package.json on the dependency but won't find it
  // if we propagate we will take the version from the root's package json which has nothing with the component version
  const packageInfo = PackageJson.loadSync(packageDir, false);
  if (!packageInfo) return null; // when running 'bitjs get-dependencies' command, packageInfo is sometimes empty
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
    const packages = groups.packages.reduce((res, packagePath) => {
      const packageWithVersion = resolveNodePackage(cwd, path.join(cwd, packagePath));
      return Object.assign(res, packageWithVersion);
    }, {});
    groups.packages = packages;
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
    foundPackagesPartition.forEach(pack => foundPackages[pack] = mergedDependencies[pack]);
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
  const groups = Object.keys(missing).map(key => Object.assign({ originFile: path.relative(cwd, key) }, byPathType(missing[key], bindingPrefix)));
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

        return packageWithVersion ? Object.assign(foundPackages, packageWithVersion) :
        missingPackages.push(packageWithVersion);
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


  return { groups, foundPackages };
}

/**
 * if a dependency file is in fact a link file, get its real dependencies.
 */
function getDependenciesFromLinkFileIfExists(dependency: PathMapDependency, dependencyPathMap: PathMapItem): LinkFile[] {
  const dependencies = [];
  if (!dependency.importSpecifiers) return dependencies;
  for (let specifier of dependency.importSpecifiers) {
    const realDep = dependencyPathMap.dependencies.find((dep) => {
      if (!dep.importSpecifiers) return false;
      return dep.importSpecifiers.find(depSpecifier => depSpecifier.name === specifier.name);
    });
    if (!realDep) {
      // this is not a link file as it doesn't import at least one specifier.
      break;
    }
    const depImportSpecifier = realDep.importSpecifiers.find(depSpecifier => depSpecifier.name === specifier.name);
    const importSpecifier: ImportSpecifier = {
      mainFile: specifier,
      linkFile: depImportSpecifier
    };
    // add to dependencies array
    const file = realDep.relativePath;
    const existingFile = dependencies.find(oneDependency => oneDependency.file === file);
    if (existingFile) {
      existingFile.importSpecifiers.push(importSpecifier);
    } else {
      dependencies.push({ file, importSpecifiers: [importSpecifier] });
    }
  }
  return dependencies;
}

/**
 * mark dependencies that are link-files as such. Also, add the data of the real dependencies
 */
function updatePathMapWithLinkFilesData(pathMap: PathMapItem[]): void {
  pathMap.forEach((file: PathMapItem) => {
    if (!file.dependencies || !file.dependencies.length) return;
    file.dependencies.forEach((dependency: PathMapDependency) => {
      if (!dependency.importSpecifiers || !dependency.importSpecifiers.length) {
        // importSpecifiers was not implemented for this language
        return;
      }
      const dependencyPathMap = pathMap.find(file => file.file === dependency.resolvedDep);
      if (!dependencyPathMap || !dependencyPathMap.dependencies || !dependencyPathMap.dependencies.length) return;
      const dependenciesFromLinkFiles = getDependenciesFromLinkFileIfExists(dependency, dependencyPathMap);
      if (dependenciesFromLinkFiles.length) { // it is a link file
        dependency.linkFile = true;
        dependency.realDependencies = dependenciesFromLinkFiles;
      }
    });
  });
}

/**
 * remove link-files from the files array and add a new attribute 'linkFiles' to the tree
 */
function updateTreeWithLinkFilesAndImportSpecifiers(tree: Tree, pathMap: PathMapItem[]): void {
  if (!pathMap || !pathMap.length) return; // pathMap is relevant for supported languages only
  updatePathMapWithLinkFilesData(pathMap);
  Object.keys(tree).forEach((mainFile) => {
    if (!tree[mainFile].files || !tree[mainFile].files.length) return;
    const mainFilePathMap = pathMap.find(file => file.relativePath === mainFile);
    if (!mainFilePathMap) return; // @todo: throw an error
    const linkFiles = [];
    const importSpecifiers = [];
    tree[mainFile].files.forEach((dependency, key) => {
      const dependencyPathMap = mainFilePathMap.dependencies.find(file => file.relativePath === dependency);
      if (!dependencyPathMap) return; // @todo: throw an error
      if (dependencyPathMap.linkFile) {
        const linkFile = { file: dependency, dependencies: dependencyPathMap.realDependencies };
        linkFiles.push(linkFile);
        tree[mainFile].files.splice(key, 1); // delete the linkFile from the files array, as it's not a real dependency
      } else {
        if (dependencyPathMap.importSpecifiers && dependencyPathMap.importSpecifiers.length) {
          const depImportSpecifiers = dependencyPathMap.importSpecifiers.map(importSpecifier => {
            return {
              mainFile: importSpecifier
            };
          });
          importSpecifiers.push({ file: dependency, importSpecifiers: depImportSpecifiers });
        }
      }
    });
    if (linkFiles.length) tree[mainFile].linkFiles = linkFiles;
    if (importSpecifiers.length) tree[mainFile].importSpecifiers = importSpecifiers;
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
export async function getDependencyTree(baseDir: string, consumerPath: string, filePaths: string[], bindingPrefix: string): Promise<{ missing: Object, tree: Tree}> {
  const config = { baseDir, includeNpm: true, requireConfig: null, webpackConfig: null, visited: {}, nonExistent: [] };
  const result = generateTree(filePaths, config);
  const { groups, foundPackages } = groupMissing(result.skipped, baseDir, consumerPath, bindingPrefix);
  const tree: Tree = groupDependencyTree(result.tree, baseDir, bindingPrefix);
  // const relativeFilePaths = filePaths.map(filePath => path.relative(baseDir, filePath));
  // Merge manually found packages with madge founded packages
  if (foundPackages && !R.isEmpty(foundPackages)) {
    // Madge found packages so we need to merge them with the manual
    Object.keys(foundPackages).forEach((pkg) => {
      // locate package in groups(contains missing)
      groups.forEach((fileDep) => {
        if (fileDep.packages && fileDep.packages.includes(pkg)) {
          fileDep.packages = fileDep.packages.filter(packageName => packageName !== pkg);
          lset(tree[fileDep['originFile']], ['packages',pkg], foundPackages[pkg]);
        }
      });
    });
  }

  updateTreeWithLinkFilesAndImportSpecifiers(tree, result.pathMap);
  return { missing: groups, tree };
}
