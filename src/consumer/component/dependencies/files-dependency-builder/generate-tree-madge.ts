// most of the functions in this file were taken from the Madge project: https://github.com/pahen/madge
// reasons for not using Madge directly: 1) it has issues with TypeScript on Windows. 2) it has issues with tsx files

import os from 'os';
import path from 'path';

import dependencyTree from './dependency-tree';
import { PathLinuxRelative } from '../../../../utils/path';

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
function isNpmPathFunc(pathStr) {
  return pathStr.indexOf('node_modules') >= 0;
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
  const regExpList = excludeRegExp.map((re) => new RegExp(re));

  function regExpFilter(id) {
    return regExpList.findIndex((regexp) => regexp.test(id)) < 0;
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
function convertTreePaths(depTree, pathCache, baseDir) {
  const tree = {};
  Object.keys(depTree).forEach((file) => {
    tree[processPath(file, pathCache, baseDir)] = depTree[file].map((d) => processPath(d, pathCache, baseDir));
  });

  return tree;
}

// e.g. { 'index.ts': ['foo.ts', '../node_modules/react/index.js'] }
// all paths are normalized to Linux
export type MadgeTree = { [relativePath: string]: PathLinuxRelative[] };

// e.g. { '/tmp/workspace': ['lodash', 'ramda'] };
export type Missing = { [absolutePath: string]: string[] };

type GenerateTreeResults = {
  madgeTree: MadgeTree;
  skipped: Missing;
  pathMap: any;
  errors: { [filePath: string]: Error };
};

/**
 * Generate the tree from the given files
 * @param  {Array} files
 * @param config
 * @return {Object}
 */
export default function generateTree(files: string[] = [], config): GenerateTreeResults {
  const depTree = {};
  const nonExistent = {};
  const npmPaths = {};
  const pathCache = {};
  const pathMap = [];
  const errors = {};

  files.forEach((file) => {
    if (depTree[file]) {
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
        visited: config.visited,
        errors,
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
        pathMap,
        cacheProjectAst: config.cacheProjectAst,
      });
      Object.assign(depTree, dependencyTreeResult);
    } catch (err) {
      errors[file] = err;
    }
  });

  let tree = convertTreePaths(depTree, pathCache, config.baseDir);

  // rename errors keys from absolute paths to relative paths
  Object.keys(errors).forEach((file) => {
    const relativeFile = processPath(file, pathCache, config.baseDir);
    if (relativeFile !== file) {
      errors[relativeFile] = errors[file];
      delete errors[file];
    }
  });

  Object.keys(npmPaths).forEach((npmKey) => {
    const id = processPath(npmKey, pathCache, config.baseDir);
    // a file might not be in the tree if it has errors or errors found with its parents
    if (!tree[id]) return;
    npmPaths[npmKey].forEach((npmPath) => {
      tree[id].push(processPath(npmPath, pathCache, config.baseDir));
    });
  });

  if (config.excludeRegExp) {
    tree = exclude(tree, config.excludeRegExp);
  }

  return {
    madgeTree: sort(tree),
    skipped: nonExistent,
    pathMap,
    errors,
  };
}
