/**
 * this file had been forked from https://github.com/dependents/node-dependency-tree
 */
import cabinet from '../filing-cabinet';
import precinct from '../precinct';
import Config from './Config';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
const debug = require('debug')('tree');
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
const fs = require('fs');
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!

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
export default function (options) {
  const config = new Config(options);

  if (!fs.existsSync(config.filename)) {
    debug(`file ${config.filename} does not exist`);
    return {};
  }

  return traverse(config);
}

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
  const precinctOptions = config.detectiveConfig;
  precinctOptions.includeCore = false;
  // @ts-ignore
  delete precinct.ast;

  try {
    dependenciesRaw = precinct.paperwork(config.filename, precinctOptions);
  } catch (e) {
    debug(`error getting dependencies: ${e.message}`);
    debug(e.stack);
    e.code = 'PARSING_ERROR';
    config.errors[config.filename] = e;
    dependenciesRaw = [];
  }
  const dependencies =
    typeof dependenciesRaw === 'object' && !Array.isArray(dependenciesRaw)
      ? Object.keys(dependenciesRaw)
      : dependenciesRaw;
  const isDependenciesArray = Array.isArray(dependenciesRaw);
  debug(`extracted ${dependencies.length} dependencies: `, dependencies);

  const resolvedDependencies = [];
  const pathMapDependencies = [];
  const pathMapFile = { file: config.filename };

  dependencies.forEach((dependency) => processDependency(dependency));
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  pathMapFile.dependencies = pathMapDependencies;
  config.pathMap.push(pathMapFile);
  return resolvedDependencies;

  function processDependency(dependency) {
    if (isHttp(dependency)) {
      debug(`skipping an http dependency: ${dependency}`);
      return;
    }
    const cabinetParams = {
      dependency,
      filename: config.filename,
      directory: config.directory,
      // @ts-ignore
      ast: precinct.ast,
      config: config.requireConfig,
      webpackConfig: config.webpackConfig,
      resolveConfig: config.resolveConfig,
    };
    if (!isDependenciesArray && dependenciesRaw[dependency].isScript !== undefined) {
      // used for vue
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
      debug(`skipping an empty filepath resolution for dependency: ${dependency}`);
      addToNonExistent(dependency);
      return;
    }

    const exists = fs.existsSync(result);

    if (!exists) {
      addToNonExistent(dependency);
      debug(`skipping non-empty but non-existent resolution: ${result} for dependency: ${dependency}`);
      return;
    }
    const pathMap = { importSource: dependency, resolvedDep: result };
    if (!isDependenciesArray && dependenciesRaw[dependency].importSpecifiers) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      pathMap.importSpecifiers = dependenciesRaw[dependency].importSpecifiers;
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (cabinetParams.wasCustomResolveUsed) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      pathMap.isCustomResolveUsed = true;
    }

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    pathMapDependencies.push(pathMap);

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    resolvedDependencies.push(result);
  }
  function addToNonExistent(dependency) {
    if (config.nonExistent[config.filename]) {
      config.nonExistent[config.filename].push(dependency);
    } else {
      config.nonExistent[config.filename] = [dependency];
    }
  }
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
    if (config.visited[dependency]) {
      populateFromCache(dependency);
    } else {
      traverseDependency(dependency);
    }
  }

  return tree;

  function traverseDependency(dependency) {
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
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    tree[dependency] = dependencies;
    const filePathMap = config.pathMap.find((pathMapEntry) => pathMapEntry.file === dependency);
    if (!filePathMap) throw new Error(`file ${dependency} is missing from PathMap`);
    config.visited[dependency] = {
      pathMap: filePathMap,
      missing: config.nonExistent[dependency],
      error: config.errors[dependency],
    };
    stack.push(...dependencies);
  }

  function populateFromCache(dependency) {
    debug(`already visited ${dependency}. Will try to find it and its dependencies in the cache`);
    const dependenciesStack = [dependency];
    while (dependenciesStack.length) {
      findAllDependenciesInCache(dependenciesStack);
    }
  }

  function findAllDependenciesInCache(dependenciesStack) {
    const dependency = dependenciesStack.pop();
    if (!config.visited[dependency]) {
      debug(`unable to find ${dependency} in the cache, it was probably filtered before`);
      return;
    }
    debug(`found ${dependency} in the cache`);
    const dependencies = config.visited[dependency].pathMap.dependencies.map((d) => d.resolvedDep);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    tree[dependency] = dependencies;
    config.pathMap.push(config.visited[dependency].pathMap);
    if (config.visited[dependency].missing) {
      config.nonExistent[dependency] = config.visited[dependency].missing;
    }
    if (config.visited[dependency].error) {
      config.errors[dependency] = config.visited[dependency].error;
    }
    dependencies.forEach((d) => {
      if (!tree[d]) dependenciesStack.push(d);
    });
  }
}

/**
 * whether the dependency is from CDN. (http/https)
 */
function isHttp(dependency) {
  return Boolean(dependency.startsWith('http://') || dependency.startsWith('https://'));
}
