// @flow
// TODO: This should be exported as a bit component

import parents from 'parents';
import fs from 'fs';
import path from 'path';
// import findPackage from 'find-package';
import R from 'ramda';
import generateTree from './generate-tree-madge';

/**
 * Taken from this package (with some minor changes):
 * https://www.npmjs.com/package/find-package
 * https://github.com/jalba/find-package
 * 
 */
function findPath(dir) {
  const parentsArr = parents(dir);
  let i;
  for (i = 0; i < parentsArr.length; i++) {
    const config = `${parentsArr[i]}/package.json`;
    try {
        // console.log('config', config);
      if (fs.lstatSync(config).isFile()) {
        return config;
      }
    } catch (e) {}
  }
  return null;
}

/**
 * Taken from this package (with some minor changes):
 * https://www.npmjs.com/package/find-package
 * https://github.com/jalba/find-package
 * 
 */
function findPackage(dir, addPaths) {
  const pathToConfig = findPath(dir);
  let configJSON = null;
  if (pathToConfig !== null) configJSON = require(pathToConfig);
  if (configJSON && addPaths) {
    configJSON.paths = {
      relative: path.relative(dir, pathToConfig),
      absolute: pathToConfig,
    };
  } else if (configJSON !== null) {
    delete configJSON.paths;
  }

  return configJSON;
}

/**
 * Group dependencies by types (files, bits, packages)
 * @param {any} dependencies list of dependencies paths to group
 * @returns {Function} function which group the dependencies
 */
const byType = R.groupBy((dependencies) => {
  const bitPackage = path.join('node_modules', 'bit');
  return dependencies.includes(bitPackage) ? 'bits' :
         dependencies.includes('node_modules') ? 'packages' :
         'files';
});

/**
 * Get a path to node package and return the name and version
 *
 * @param {any} packageFullPath full path to the package
 * @returns {Object} name and version of the package
 */
function resolveNodePackage(cwd, packageFullPath) {
  const NODE_MODULES = 'node_modules';
  const result = {};
  // Start by searching in the component dir and up from there
  // If not found search in package dir itself.
  // We are doing this, because the package.json insisde the package dir contain exact version
  // And the component/consumer package.json might contain semver like ^ or ~
  // We want to have this semver as dependency and not the exact version, otherwise it will be considered as modified all the time
  const packageJsonInfo = findPackage(cwd);
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

  const packageInfo = findPackage(packageFullPath);
  result[packageInfo.name] = packageInfo.version;
  return result;
}

/**
 * Gets a list of dependencies and group them by types (files, bits, packages)
 * It's also transform the node packge dependencies from array of paths to object in this format:
 * {dependencyName: version} (like in package.json)
 *
 * @param {any} list of dependencies paths
 * @param {any} cwd root of working directory (used for node packages version calculation)
 * @returns {Object} object with the dependencies groups
 */
function groupDependencyList(list, cwd) {
  const groups = byType(list);
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
function groupDependencyTree(tree, cwd) {
  const result = {};
  Object.keys(tree).forEach((key) => {
    result[key] = groupDependencyList(tree[key], cwd);
  });

  return result;
}

/**
 * Group missing dependencies by types (files, bits, packages)
 * @param {Array} missing list of missing paths to group
 * @returns {Function} function which group the dependencies
 */
const byPathType = R.groupBy((missing) => {
  return missing.startsWith('bit/') ? 'bits' :
         missing.startsWith('.') ? 'files' :
         'packages';
});

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
 * Recursivly search for node module inside node_modules dir
 * This function propegate up until it get's to the root provided then stops
 *
 * @param {string} nmPath - package name
 * @param {string} workingDir - dir to start searching of
 * @param {string} root - path to dir to stop the search
 * @returns The resolved path for the package directory
 */
function resolveModulePath(nmPath, workingDir, root) {
  const pathToCheck = path.resolve(workingDir, 'node_modules', nmPath);

  if (fs.existsSync(pathToCheck)) {
    return pathToCheck;
  }

  if (workingDir === root) {
    return null;
  }

  return resolveModulePath(nmPath, path.dirname(workingDir), root);
}

/**
 * Run over each entry in the missing array and transform the missing from list of paths
 * to object with missing types
 *
 * @param {Array} missings
 * @returns new object with grouped missings
 */
function groupMissings(missings, cwd, consumerPath) {
  const groups = byPathType(missings);
  const packages = groups.packages ? groups.packages.map(resolvePackageNameByPath) : [];
  // This is a hack to solve problems that madge has with packages for type script files
  // It see them as missing even if they are exists
  const foundedPackages = {};
  const missingPackages = [];
  packages.forEach((packageName) => {
    // Don't add the same package twice
    if (R.contains(packageName, missingPackages)) return;
    const resolvedPath = resolveModulePath(packageName, cwd, consumerPath);
    if (!resolvedPath) {
      return missingPackages.push(packageName);
    }
    const packageWithVersion = resolveNodePackage(cwd, resolvedPath);
    return packageWithVersion ? Object.assign(foundedPackages, packageWithVersion) :
                                missingPackages.push(packageWithVersion);
  });
  groups.packages = missingPackages;

  return { groups, foundedPackages };
}

function normalizePaths(tree) {
  const modifiedPathTree = {};
  Object.keys(tree).forEach((key) => {
    const normalizedPathArr = tree[key].map(keyPath => path.normalize(keyPath));
    const name = path.normalize(key);
    modifiedPathTree[name] = normalizedPathArr;
  });
  return modifiedPathTree;
}

/**
 * if a dependency file is in fact a link file, get its real dependencies.
 */
function getDependenciesFromLinkFileIfExists(dependency: Object, dependencyPathMap: Object): Object[] {
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
    const importSpecifier = {
      mainFile: specifier,
      linkFile: depImportSpecifier
    };
    dependencies.push({ file: realDep.relativePath, importSpecifier });
  }
  return dependencies;
}

/**
 * mark dependencies that are link-files as such. Also, add the data of the real dependencies
 */
function updatePathMapWithLinkFilesData(pathMap) {
  pathMap.forEach((file) => {
    if (!file.dependencies || !file.dependencies.length) return;
    file.dependencies.forEach((dependency) => {

      if (!dependency.importSpecifiers || !dependency.importSpecifiers.length) {
        // importSpecifiers was not implemented for that language
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
function updateTreeAccordingToLinkFiles(tree, pathMap) {
  if (!pathMap) return; // currently pathMap is relevant for ES6 only
  updatePathMapWithLinkFilesData(pathMap);
  Object.keys(tree).forEach((mainFile) => {
    if (!tree[mainFile].files || !tree[mainFile].files.length) return;
    const mainFilePathMap = pathMap.find(file => file.relativePath === mainFile);
    const linkFiles = [];
    tree[mainFile].files.forEach((dependency, key) => {
      const dependencyPathMap = mainFilePathMap.dependencies.find(file => file.relativePath === dependency);
      if (dependencyPathMap.linkFile) {
        const linkFile = { file: dependency, dependencies: dependencyPathMap.realDependencies };
        linkFiles.push(linkFile);
        tree[mainFile].files.splice(key, 1); // delete the linkFile from the files array, as it's not a real dependency
      }
    });
    if (linkFiles.length) tree[mainFile].linkFiles = linkFiles;
  });
}

/**
 * Function for fetching dependency tree of file or dir
 * @param baseDir working directory
 * @param consumerPath
 * @param filePath path of the file to calculate the dependencies
 * @return {Promise<{missing, tree}>}
 */
export default async function getDependecyTree(baseDir: string, consumerPath: string, filePath: string): Promise<*> {
  const config = { baseDir, includeNpm: true, requireConfig: null, webpackConfig: null, visited: {}, nonExistent: [] };
  const result = generateTree([filePath], config);
  const normalizedTree = normalizePaths(result.tree);
  const { groups, foundedPackages } = groupMissings(result.skipped, baseDir, consumerPath);
  const relativeFilePath = path.relative(baseDir, filePath);
  const tree = groupDependencyTree(normalizedTree, baseDir);
  // Merge manually found packages with madge founded packages
  if (foundedPackages && !R.isEmpty(foundedPackages)) {
    // Madge found packages so we need to merge them with the manual
    if (tree[relativeFilePath].packages) {
      Object.assign(tree[relativeFilePath].packages, foundedPackages);
      // There is only manually found packages
    } else {
      tree[relativeFilePath].packages = foundedPackages;
    }
  }
  updateTreeAccordingToLinkFiles(tree, result.pathMap);
  return { missing: groups, tree };
}
