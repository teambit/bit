import R from 'ramda';
import { isRelativeImport } from '../../utils';
/**
 * this file had been forked from https://github.com/dependents/node-dependency-tree
 */

const precinct = require('../precinct');
const path = require('path');
const fs = require('fs');
const cabinet = require('../filing-cabinet');
const debug = require('debug')('tree');
const Config = require('./Config');

/**
 * Recursively find all dependencies (avoiding circular) traversing the entire dependency tree
 * and returns a flat list of all unique, visited nodes
 *
 * @param {Object} options
 * @param {String} options.filename - The path of the module whose tree to traverse
 * @param {String} options.directory - The directory containing all JS files
 * @param {String} [options.requireConfig] - The path to a requirejs config
 * @param {String} [options.webpackConfig] - The path to a webpack config
 * @param {Object} [options.visited] - Cache of visited, absolutely pathed files that should not be reprocessed.
 *                             Format is a filename -> tree as list lookup table
 * @param {Array} [options.nonExistent] - List of partials that do not exist
 * @param {Boolean} [options.isListForm=false]
 * @return {Object}
 */
module.exports = function (options) {
  const config = new Config(options);

  if (!fs.existsSync(config.filename)) {
    debug(`file ${config.filename} does not exist`);
    return config.isListForm ? [] : {};
  }

  const results = traverse(config);
  debug('traversal complete', results);

  debug('deduped list of nonExistent partials: ', config.nonExistent);

  let tree;
  if (config.isListForm) {
    debug('list form of results requested');

    tree = removeDups(results);
    debug('removed dups from the resulting list');
  } else {
    debug('object form of results requested');

    tree = {};
    tree[config.filename] = results;
  }

  debug('final tree', tree);
  return tree;
};

/**
 * Executes a post-order depth first search on the dependency tree and returns a
 * list of absolute file paths. The order of files in the list will be the
 * proper concatenation order for bundling.
 *
 * In other words, for any file in the list, all of that file's dependencies (direct or indirect) will appear at
 * lower indices in the list. The root (entry point) file will therefore appear last.
 *
 * The list will not contain duplicates.
 *
 * Params are those of module.exports
 */
module.exports.toList = function (options) {
  options.isListForm = true;

  return module.exports(options);
};

/**
 * Returns the list of dependencies for the given filename
 *
 * Protected for testing
 *
 * @param  {Config} config
 * @return {Array}
 */
module.exports._getDependencies = function (config) {
  let dependenciesRaw; // from some detectives it comes as an array, from some it is an object
  let dependencies; // always an array
  const precinctOptions = config.detectiveConfig;
  precinctOptions.includeCore = false;

  try {
    dependenciesRaw = precinct.paperwork(config.filename, precinctOptions);
    dependencies =
      R.is(Object, dependenciesRaw) && !Array.isArray(dependenciesRaw) ? Object.keys(dependenciesRaw) : dependenciesRaw;
  } catch (e) {
    debug(`error getting dependencies: ${e.message}`);
    debug(e.stack);
    return [];
  }
  const isDependenciesArray = Array.isArray(dependenciesRaw);
  debug(`extracted ${dependencies.length} dependencies: `, dependencies);

  const resolvedDependencies = [];
  const pathMapDependencies = [];
  const pathMapFile = { file: config.filename };

  for (let i = 0, l = dependencies.length; i < l; i++) {
    const dependency = dependencies[i];
    const cabinetParams = {
      partial: dependency,
      filename: config.filename,
      directory: config.directory,
      ast: precinct.ast,
      config: config.requireConfig,
      webpackConfig: config.webpackConfig,
      resolveConfig: config.resolveConfig
    };
    if (!isDependenciesArray && dependenciesRaw[dependency].isScript !== undefined) {
      // used for vue
      cabinetParams.isScript = dependenciesRaw[dependency].isScript;
    }
    const result = cabinet(cabinetParams);
    if (!result) {
      debug(`skipping an empty filepath resolution for partial: ${dependency}`);
      if (config.nonExistent[config.filename]) {
        config.nonExistent[config.filename].push(dependency);
      } else {
        config.nonExistent[config.filename] = [dependency];
      }
      continue;
    }

    const exists = fs.existsSync(result);

    if (!exists) {
      if (config.nonExistent[config.filename]) {
        config.nonExistent[config.filename].push(dependency);
      } else {
        config.nonExistent[config.filename] = [dependency];
      }
      debug(`skipping non-empty but non-existent resolution: ${result} for partial: ${dependency}`);
      continue;
    }
    const pathMap = { importSource: dependency, resolvedDep: result };
    if (!isDependenciesArray && dependenciesRaw[dependency].importSpecifiers) {
      pathMap.importSpecifiers = dependenciesRaw[dependency].importSpecifiers;
    }
    if (!isRelativeImport(dependency) && config.resolveConfig) {
      // is includes also packages, which actually don't use customResolve, however, they will be
      // filtered out later.
      pathMap.isCustomResolveUsed = true;
    }

    pathMapDependencies.push(pathMap);

    resolvedDependencies.push(result);
  }
  pathMapFile.dependencies = pathMapDependencies;
  config.pathMap.push(pathMapFile);

  return resolvedDependencies;
};

/**
 * @param  {Config} config
 * @return {Object|String[]}
 */
function traverse(config) {
  let subTree = config.isListForm ? [] : {};

  debug(`traversing ${config.filename}`);

  if (config.visited[config.filename]) {
    debug(`already visited ${config.filename}`);
    return config.visited[config.filename];
  }

  let dependencies = module.exports._getDependencies(config);

  debug('cabinet-resolved all dependencies: ', dependencies);
  // Prevents cycles by eagerly marking the current file as read
  // so that any dependent dependencies exit
  config.visited[config.filename] = config.isListForm ? [] : {};

  if (config.filter) {
    debug('using filter function to filter out dependencies');
    debug(`unfiltered number of dependencies: ${dependencies.length}`);
    dependencies = dependencies.filter(function (filePath) {
      return config.filter(filePath, config.filename);
    });
    debug(`filtered number of dependencies: ${dependencies.length}`);
  }

  for (let i = 0, l = dependencies.length; i < l; i++) {
    const d = dependencies[i];
    const localConfig = config.clone();
    localConfig.filename = d;

    if (localConfig.isListForm) {
      subTree = subTree.concat(traverse(localConfig));
    } else {
      subTree[d] = traverse(localConfig);
    }
  }

  if (config.isListForm) {
    // Prevents redundancy about each memoized step
    subTree = removeDups(subTree);
    subTree.push(config.filename);
    config.visited[config.filename] = config.visited[config.filename].concat(subTree);
  } else {
    config.visited[config.filename] = subTree;
  }

  return subTree;
}

/**
 * Returns a list of unique items from the array
 *
 * @param  {String[]} list
 * @return {String[]}
 */
function removeDups(list) {
  const cache = {};
  const unique = [];

  list.forEach(function (item) {
    if (!cache[item]) {
      unique.push(item);
      cache[item] = true;
    }
  });

  return unique;
}
