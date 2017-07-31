// TODO: This should be exported as a bit component

// @flow
import path from 'path';
import madge from 'madge';
import findPackage from 'find-package';
import R from 'ramda';

/**
 * Group dependecies by types (files, bits, packages)
 * @param {any} dependecies list of dependencies paths to group
 * @returns {Function} function which group the dependencies
 */
const byType = R.groupBy((dependecies) => {
  return dependecies.startsWith('bit/') ? 'bits' :
         dependecies.startsWith('node_modules') ? 'packages' :
         'files';
});

/**
 * Get a path to node package and return the name and version
 *
 * @param {any} packageFullPath full path to the package
 * @returns {Object} name and version of the package
 */
function resloveNodePackage(packageFullPath) {
  let result = {};
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
  let groups = byType(list);
  if (groups.packages) {
    const packages = groups.packages.reduce((res, packagePath) => {
      const packageWithVersion = resloveNodePackage(`${cwd}/${packagePath}`);
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
  let result = {};
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
function resolveMissingPackageName(packagePath) {
  const packagePathArr = packagePath.split(path.sep); // TODO: make sure this is working on windows
  // Regular package without path. example - import _ from 'lodash'
  if (packagePathArr.length === 1) return packagePath;
  // Scoped package. example - import getSymbolIterator from '@angular/core/src/util.d.ts';
  if (packagePathArr[0].startsWith('@')) return path.join(packagePathArr[0], packagePathArr[1]);
  // Regular package with internal path. example import something from 'mypackage/src/util/isString'
  return packagePathArr[0];
}

/**
 * Run over each entry in the missing array and transform the missing from list of paths
 * to object with missing types
 *
 * @param {Array} missings
 * @returns new object with grouped missings
 */
function groupMissings(missings) {
  const groups = byPathType(missings);
  groups.packages = groups.packages ? groups.packages.map(resolveMissingPackageName) : undefined;

  return groups;
}


/**
 * Function for fetching dependency tree of file or dir
 * @param cwd working directory
 * @param filePath path of the file to calculate the dependecies
 * @return {Promise<{missing, tree}>}
 */
export default function getDependecyTree(cwd: string, filePath: string): Promise<*> {
  return madge(filePath, { baseDir: cwd, includeNpm: true })
    .then((res) => ({ missing: groupMissings(res.skipped), tree: groupDependencyTree(res.tree, cwd) }))
}
