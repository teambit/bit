// TODO: This should be exported as a bit component

// @flow
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
 * Function for fetching dependecy tree of file or dir
 * @param cwd working directory
 * @param filePath path of the file to calculate the dependecies
 * @return {Promise<{missing, tree}>}
 */
export default function getDependecyTree(cwd: string, filePath: string): Promise<*> {
  return madge(filePath, { baseDir: cwd, includeNpm: true })
    .then((res) => ({ missing: res.skipped, tree: groupDependencyTree(res.tree, cwd) }))
}
