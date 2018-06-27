/**
 * this file had been forked from https://github.com/dependents/node-filing-cabinet
 */
import { isRelativeImport } from '../../utils';

const path = require('path');
const debug = require('debug')('cabinet');

const getModuleType = require('module-definition');
const resolve = require('resolve');

const amdLookup = require('module-lookup-amd');
const stylusLookup = require('stylus-lookup');
const sassLookup = require('sass-lookup');
const ts = require('typescript');

const resolveDependencyPath = require('resolve-dependency-path');
const appModulePath = require('app-module-path');
const webpackResolve = require('enhanced-resolve');
const isRelative = require('is-relative-path');
const objectAssign = require('object-assign');

const vueLookUp = require('../lookups/vue-lookup');

const defaultLookups = {
  '.js': jsLookup,
  '.jsx': jsLookup,
  '.ts': tsLookup,
  '.tsx': tsLookup,
  '.scss': sassLookup,
  '.sass': sassLookup,
  '.styl': stylusLookup,
  // Less and Sass imports are very similar
  '.less': sassLookup,
  '.vue': vueLookUp
};

module.exports = function cabinet(options) {
  let partial = options.partial;
  const filename = options.filename;
  const directory = options.directory;
  const config = options.config;
  const webpackConfig = options.webpackConfig;
  const configPath = options.configPath;
  const ast = options.ast;
  const ext = options.ext || path.extname(filename);
  const resolveConfig = options.resolveConfig;
  const isScript = options.isScript;
  const content = options.content;
  debug(`working on a dependency "${partial}" of a file "${filename}"`);

  let resolver = defaultLookups[ext];

  if ((ext === '.css' || ext === '.sass' || ext === '.scss' || ext === '.less') && partial.startsWith('~')) {
    // webpack syntax for resolving a module
    partial = partial.replace('~', '');
    resolver = jsLookup;
  }

  if (!resolver) {
    debug('using generic resolver');
    resolver = resolveDependencyPath;
  }

  debug(`found a resolver for ${ext}`);

  // TODO: Change all resolvers to accept an options argument
  let result = resolver(
    partial,
    filename,
    directory,
    config,
    webpackConfig,
    configPath,
    ast,
    isScript,
    content,
    resolveConfig
  );
  const partialExt = path.extname(partial);
  if (!result && partialExt && partialExt !== ext) {
    resolver = defaultLookups[partialExt];
    if (resolver) {
      // todo: this strategy probably fails often. if, for example, a dependency A.js inside B.ts
      // was not found using the ts resolve, it tries the js resolver, however, parsing the ts file
      // with js parser, won't work most of the time. A better approach would be to fix the
      // original resolver.
      debug(
        `dependency has a different extension (${partialExt}) than the original file (${ext}), trying to use its resolver instead`
      );
      try {
        result = resolver(
          partial,
          filename,
          directory,
          config,
          webpackConfig,
          configPath,
          ast,
          isScript,
          content,
          resolveConfig
        );
      } catch (err) {
        debug(`unable to use the resolver of ${partialExt} for ${filename}. got an error ${err.message}`);
      }
    }
  }
  debug(`resolved path for ${partial}: ${result}`);
  return result;
};

module.exports.supportedFileExtensions = Object.keys(defaultLookups);

/**
 * Register a custom lookup resolver for a file extension
 *
 * @param  {String} extension - The file extension that should use the resolver
 * @param  {Function} lookupStrategy - A resolver of partial paths
 */
module.exports.register = function (extension, lookupStrategy) {
  defaultLookups[extension] = lookupStrategy;

  if (this.supportedFileExtensions.indexOf(extension) === -1) {
    this.supportedFileExtensions.push(extension);
  }
};

/**
 * Exposed for testing
 *
 * @param  {Object} options
 * @param  {String} options.config
 * @param  {String} options.webpackConfig
 * @param  {String} options.filename
 * @param  {Object} options.ast
 * @return {String}
 */
module.exports._getJSType = function (options) {
  options = options || {};

  if (options.config) {
    return 'amd';
  }

  if (options.webpackConfig) {
    return 'webpack';
  }

  if (options.ast) {
    debug('reusing the given ast');
    return getModuleType.fromSource(options.ast);
  }

  if (options.content) {
    debug('reusing the given ast');
    return getModuleType.fromSource(options.content);
  }

  debug('using the filename to find the module type');
  return getModuleType.sync(options.filename);
};

/**
 * @private
 * @param  {String} partial
 * @param  {String} filename
 * @param  {String} directory
 * @param  {String} [config]
 * @param  {String} [webpackConfig]
 * @param  {String} [configPath]
 * @param  {Object} [ast]
 * @return {String}
 */
function jsLookup(
  partial,
  filename,
  directory,
  config,
  webpackConfig,
  configPath,
  ast,
  isScript,
  content,
  resolveConfig
) {
  const type = module.exports._getJSType({
    config,
    webpackConfig,
    filename,
    ast,
    isScript,
    content
  });

  switch (type) {
    case 'amd':
      debug('using amd resolver');
      return amdLookup({
        config,
        // Optional in case a pre-parsed config is being passed in
        configPath,
        partial,
        directory,
        filename
      });

    case 'commonjs':
      debug('using commonjs resolver');
      return commonJSLookup(partial, filename, directory, resolveConfig);

    case 'webpack':
      debug('using webpack resolver for es6');
      return resolveWebpackPath(partial, filename, directory, webpackConfig);

    case 'es6':
    default:
      debug('using commonjs resolver for es6');
      return commonJSLookup(partial, filename, directory, resolveConfig);
  }
}

function tsLookup(
  partial,
  filename,
  directory,
  config,
  webpackConfig,
  configPath,
  ast,
  isScript,
  content,
  resolveConfig
) {
  if (partial[0] !== '.') {
    // when a path is not relative, use the standard commonJS lookup
    return commonJSLookup(partial, filename, directory, resolveConfig);
  }
  debug('performing a typescript lookup');

  const options = {
    module: ts.ModuleKind.CommonJS
  };

  const host = ts.createCompilerHost({});
  debug('with options: ', options);
  let resolvedModule = ts.resolveModuleName(partial, filename, options, host).resolvedModule;
  if (!resolvedModule) {
    // for some reason, on Windows, ts.resolveModuleName method tries to find the module in the
    // root directory. For example, it searches for module './bar', in 'c:\bar.ts'.
    const fallbackModule = path.resolve(path.dirname(filename), partial);
    resolvedModule = ts.resolveModuleName(fallbackModule, filename, options, host).resolvedModule;
  }
  if (!resolvedModule) {
    // ts.resolveModuleName doesn't always work, fallback to commonJSLookup
    debug('failed resolving with tsLookup, trying commonJSLookup');
    return commonJSLookup(partial, filename, directory, resolveConfig);
  }
  debug('ts resolved module: ', resolvedModule);
  const result = resolvedModule ? resolvedModule.resolvedFileName : '';

  debug(`result: ${result}`);
  return result ? path.resolve(result) : '';
}

function resolveNonRelativePath(partial, filename, directory, resolveConfig) {
  const webpackResolveConfig = {};
  if (resolveConfig.modulesDirectories) webpackResolveConfig.modules = resolveConfig.modulesDirectories;
  if (resolveConfig.aliases) webpackResolveConfig.alias = resolveConfig.aliases;
  webpackResolveConfig.extensions = Object.keys(defaultLookups).concat(['.json']);
  try {
    const resolver = webpackResolve.create.sync(webpackResolveConfig);
    const lookupPath = isRelative(partial) ? path.dirname(filename) : directory;
    return resolver(lookupPath, partial);
  } catch (e) {
    debug(`error when resolving ${partial}`);
    debug(e.message);
    debug(e.stack);
    return '';
  }
}

/**
 * TODO: Export to a separate module
 *
 * @private
 * @param  {String} partial
 * @param  {String} filename
 * @param  {String} directory
 * @return {String}
 */
function commonJSLookup(partial, filename, directory, resolveConfig) {
  directory = path.dirname(filename); // node_modules should be propagated from the file location backwards
  // Need to resolve partials within the directory of the module, not filing-cabinet
  const moduleLookupDir = path.join(directory, 'node_modules');

  debug(`adding ${moduleLookupDir} to the require resolution paths`);

  appModulePath.addPath(moduleLookupDir);

  // Make sure the partial is being resolved to the filename's context
  // 3rd party modules will not be relative
  if (partial[0] === '.') {
    partial = path.resolve(path.dirname(filename), partial);
  }

  let result = '';

  try {
    result = resolve.sync(partial, {
      extensions: ['.js', '.jsx', '.vue', '.ts', '.d.ts', '.tsx', '.json'], // for some reason, .ts is not sufficient, .d.ts is needed as well
      basedir: directory,
      // Add fileDir to resolve index.js files in that dir
      moduleDirectory: ['node_modules', directory]
    });
    debug(`resolved path: ${result}`);
  } catch (e) {
    if (!isRelativeImport(partial) && resolveConfig) {
      debug(`trying to resolve using resolveConfig ${JSON.stringify(resolveConfig)}`);
      result = resolveNonRelativePath(partial, filename, directory, resolveConfig);
    } else {
      debug(`could not resolve ${partial}`);
    }
  }

  return result;
}

function resolveWebpackPath(partial, filename, directory, webpackConfig) {
  webpackConfig = path.resolve(webpackConfig);

  try {
    var loadedConfig = require(webpackConfig);

    if (typeof loadedConfig === 'function') {
      loadedConfig = loadedConfig();
    }
  } catch (e) {
    debug(`error loading the webpack config at ${webpackConfig}`);
    debug(e.message);
    debug(e.stack);
    return '';
  }

  const resolveConfig = objectAssign({}, loadedConfig.resolve);

  if (!resolveConfig.modules && (resolveConfig.root || resolveConfig.modulesDirectories)) {
    resolveConfig.modules = [];

    if (resolveConfig.root) {
      resolveConfig.modules = resolveConfig.modules.concat(resolveConfig.root);
    }

    if (resolveConfig.modulesDirectories) {
      resolveConfig.modules = resolveConfig.modules.concat(resolveConfig.modulesDirectories);
    }
  }

  try {
    const resolver = webpackResolve.create.sync(resolveConfig);

    // We don't care about what the loader resolves the partial to
    // we only wnat the path of the resolved file
    partial = stripLoader(partial);

    const lookupPath = isRelative(partial) ? path.dirname(filename) : directory;

    return resolver(lookupPath, partial);
  } catch (e) {
    debug(`error when resolving ${partial}`);
    debug(e.message);
    debug(e.stack);
    return '';
  }
}

function stripLoader(partial) {
  const exclamationLocation = partial.indexOf('!');

  if (exclamationLocation === -1) {
    return partial;
  }

  return partial.slice(exclamationLocation + 1);
}
