// most of the functions in this file were taken from the Madge project: https://github.com/pahen/madge
// reasons for not using Madge directly: 1) it has issues with TypeScript on Windows. 2) it has issues with tsx files

import os from 'os';
import path from 'path';
import dependencyTree from './dependency-tree';

/**
 * Check if running on Windows.
 * @type {Boolean}
 */
const isWin = os.platform() === 'win32';

/**
 * Check if path is from NPM folder
 * @param  {String} path
 * @return {Boolean}
 */
function isNpmPathFunc(path) {
  return path.indexOf('node_modules') >= 0;
}

/**
 * Sort tree.
 * @param  {Object} tree
 * @return {Object}
 */
function sort(tree) {
  return Object.keys(tree)
    .sort()
    .reduce((acc, id) => {
      acc[id] = tree[id].sort();
      return acc;
    }, {});
}

/**
 * Exclude modules from tree using RegExp.
 * @param  {Object} tree
 * @param  {Array} excludeRegExp
 * @return {Object}
 */
function exclude(tree, excludeRegExp) {
  const regExpList = excludeRegExp.map(re => new RegExp(re));

  function regExpFilter(id) {
    return regExpList.findIndex(regexp => regexp.test(id)) < 0;
  }

  return Object.keys(tree)
    .filter(regExpFilter)
    .reduce((acc, id) => {
      acc[id] = tree[id].filter(regExpFilter);
      return acc;
    }, {});
}

/**
 * Process absolute path and return a shorter one.
 * @param  {String} absPath
 * @param  {Object} cache
 * @param  {String} baseDir
 * @return {String}
 */
export function processPath(absPath, cache, baseDir) {
  if (cache[absPath]) {
    return cache[absPath];
  }

  let relPath = path.relative(baseDir, absPath);

  if (isWin) {
    relPath = relPath.replace(/\\/g, '/');
  }

  cache[absPath] = relPath;

  return relPath;
}

/**
 * Convert deep tree produced by dependency-tree to a
 * shallow (one level deep) tree used by madge.
 * @param  {Object} depTree
 * @param  {Object} tree
 * @param  {Object} pathCache
 * @param  {String} baseDir
 * @return {Object}
 */
function convertTree(depTree, tree, pathCache, baseDir) {
  for (const key in depTree) {
    const id = processPath(key, pathCache, baseDir);

    if (!tree[id]) {
      tree[id] = [];

      for (const dep in depTree[key]) {
        tree[id].push(processPath(dep, pathCache, baseDir));
      }
    }

    convertTree(depTree[key], tree, pathCache, baseDir);
  }

  return tree;
}

function addRelativePathsToPathMap(pathMap, pathCache, baseDir) {
  pathMap.forEach((file) => {
    file.relativePath = processPath(file.file, pathCache, baseDir);
    file.dependencies.forEach((dependency) => {
      dependency.relativePath = processPath(dependency.resolvedDep, pathCache, baseDir);
    });
  });
}

/**
 * Generate the tree from the given files
 * @param  {Array} files
 * @param config
 * @return {Object}
 */
export default function generateTree(files = [], config) {
  const depTree = {};
  const visited = {};
  const nonExistent = {};
  const npmPaths = {};
  const pathCache = {};
  const pathMap = [];
  const errors = {};

  files.forEach((file) => {
    if (visited[file]) {
      return;
    }

    const detective = config.detectiveOptions;
    try {
      const dependencyTreeResult = dependencyTree({
        filename: file,
        directory: config.baseDir,
        requireConfig: config.requireConfig,
        webpackConfig: config.webpackConfig,
        resolveConfig: config.resolveConfig,
        visited,
        filter: (dependencyFilePath, traversedFilePath) => {
          let dependencyFilterRes = true;
          const isNpmPath = isNpmPathFunc(dependencyFilePath);

          if (config.dependencyFilter) {
            dependencyFilterRes = config.dependencyFilter(dependencyFilePath, traversedFilePath, config.baseDir);
          }

          if (config.includeNpm && isNpmPath) {
            (npmPaths[traversedFilePath] = npmPaths[traversedFilePath] || []).push(dependencyFilePath);
          }

          return !isNpmPath && (dependencyFilterRes || dependencyFilterRes === undefined);
        },
        detective,
        nonExistent,
        pathMap
      });
      Object.assign(depTree, dependencyTreeResult);
    } catch (err) {
      errors[file] = err;
    }
  });

  let tree = convertTree(depTree, {}, pathCache, config.baseDir);
  for (const npmKey in npmPaths) {
    const id = processPath(npmKey, pathCache, config.baseDir);

    npmPaths[npmKey].forEach((npmPath) => {
      tree[id].push(processPath(npmPath, pathCache, config.baseDir));
    });
  }

  if (config.excludeRegExp) {
    tree = exclude(tree, config.excludeRegExp);
  }

  addRelativePathsToPathMap(pathMap, pathCache, config.baseDir);

  return {
    madgeTree: sort(tree),
    skipped: nonExistent,
    pathMap,
    errors
  };
}
