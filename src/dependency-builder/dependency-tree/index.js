import R from 'ramda';
import { isRelativeImport } from '../../utils';

/**
 * this file had been forked from https://github.com/dependents/node-dependency-tree
 */

const precinct = require('../precinct');
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
 * @return {Object}
 */
module.exports = function (options) {
  const config = new Config(options);

  if (!fs.existsSync(config.filename)) {
    debug(`file ${config.filename} does not exist`);
    return {};
  }

  return traverse(config);
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
  } catch (e) {
    debug(`error getting dependencies: ${e.message}`);
    debug(e.stack);
    e.code = 'PARSING_ERROR';
    config.errors[config.filename] = e;
    dependenciesRaw = [];
  }
  dependencies =
    R.is(Object, dependenciesRaw) && !Array.isArray(dependenciesRaw) ? Object.keys(dependenciesRaw) : dependenciesRaw;
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
    let result;
    try {
      result = cabinet(cabinetParams);
    } catch (err) {
      debug(`error resolving dependencies: ${err.message}`);
      debug(err.stack);
      err.code = 'RESOLVE_ERROR';
      throw err;
    }

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
 * the traverse is not a recursive function anymore, it has been changed to be iterative to fix
 * some performance issues.
 * @todo: we have some redundancy here with the `tree` and pathMap`. the `tree` has only the dependencies,
 * `pathMap` has the dependencies and some more info, such as importSpecifiers. we should use only
 * pathMap and get rid of tree.
 */
function traverse(config) {
  const tree = [];
  const stack = [config.filename];
  while (stack.length) {
    const dependency = stack.pop();
    debug(`traversing ${dependency}`);
    if (!config.visited[dependency]) {
      const localConfig = config.clone();
      localConfig.filename = dependency;
      let dependencies = module.exports._getDependencies(localConfig);
      if (config.filter) {
        debug('using filter function to filter out dependencies');
        debug(`number of dependencies before filtering: ${dependencies.length}`);
        dependencies = dependencies.filter(function (filePath) {
          return localConfig.filter(filePath, localConfig.filename);
        });
        debug(`number of dependencies after filtering: ${dependencies.length}`);
      }
      debug('cabinet-resolved all dependencies: ', dependencies);
      tree[dependency] = dependencies;
      const filePathMap = config.pathMap.find(pathMapEntry => pathMapEntry.file === dependency);
      if (!filePathMap) throw new Error(`file ${dependency} is missing from PathMap`);
      config.visited[dependency] = filePathMap;
      dependencies.forEach(d => stack.push(d));
    } else {
      debug(`already visited ${dependency}. Will try to find it and its dependencies in the cache`);
      const dependenciesStack = [dependency];
      while (dependenciesStack.length) {
        const dep = dependenciesStack.pop();
        if (!config.visited[dep]) {
          debug(`unable to find ${dep} in the cache, it was probably filtered before`);
          continue;
        }
        debug(`found ${dep} in the cache`);
        const dependencies = config.visited[dep].dependencies.map(d => d.resolvedDep);
        tree[dep] = dependencies;
        config.pathMap.push(config.visited[dep]);
        dependencies.forEach((d) => {
          if (!tree[d]) dependenciesStack.push(d);
        });
      }
    }
  }

  return tree;
}
