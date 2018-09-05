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
        debug(`unfiltered number of dependencies: ${dependencies.length}`);
        dependencies = dependencies.filter(function (filePath) {
          return config.filter(filePath, config.filename);
        });
        debug(`filtered number of dependencies: ${dependencies.length}`);
      }
      debug('cabinet-resolved all dependencies: ', dependencies);
      tree[dependency] = dependencies;
      config.visited[dependency] = dependencies;
      dependencies.forEach(d => stack.push(d));
    } else {
      debug(`already visited ${dependency}`);
    }
  }

  return tree;
}
