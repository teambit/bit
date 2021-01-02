// @flow

/**
 * this file had been forked from https://github.com/dependents/node-filing-cabinet
 */
import appModulePath from 'app-module-path';
import webpackResolve from 'enhanced-resolve';
import isRelative from 'is-relative-path';
import getModuleType from 'module-definition';
import amdLookup from 'module-lookup-amd';
import objectAssign from 'object-assign';
import path from 'path';
import resolve from 'resolve';
import resolveDependencyPath from 'resolve-dependency-path';
import sassLookup from 'sass-lookup';
import stylusLookup from 'stylus-lookup';
import ts from 'typescript';

import { isRelativeImport } from '../../../../../utils';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import vueLookUp from '../lookups/vue-lookup';
import { DetectorHook } from '../detector-hook';

const debug = require('debug')('cabinet');

const defaultLookups = {
  '.js': jsLookup,
  '.jsx': jsLookup,
  '.ts': tsLookup,
  '.tsx': tsLookup,
  '.scss': cssPreprocessorLookup,
  '.sass': cssPreprocessorLookup,
  '.styl': stylusLookup,
  '.less': cssPreprocessorLookup,
  '.vue': vueLookUp,
};

// for some reason, .ts is not sufficient, .d.ts is needed as well
// these extensions are used with commonJs and nonRelative lookups. When a dependency doesn't have an
// extension it will look for files with these extensions in order.
// for example, `const a = require('.a')`, it'll look for a.js, a.jsx, a.ts and so on.
const resolveExtensions = Object.keys(defaultLookups).concat(['.d.ts', '.json', '.css']);

// when webpack resolves dependencies from a style file, such as .scss file, look for style extensions only
const styleExtensions = ['.scss', '.sass', '.less', '.css'];

type Options = {
  dependency: string; // previous name was "partial"
  filename: string;
  directory: string;
  config: Record<string, any>;
  webpackConfig?: Record<string, any>;
  configPath?: string;
  resolveConfig?: Record<string, any>;
  isScript?: boolean; // relevant for Vue files
  ast?: string;
  ext?: string;
  content?: string;
  wasCustomResolveUsed?: boolean;
};

export default function cabinet(options: Options) {
  const detectorHook = new DetectorHook();
  const { dependency, filename } = options;
  const ext = options.ext || path.extname(filename);
  debug(`working on a dependency "${dependency}" of a file "${filename}"`);

  let resolver = defaultLookups[ext];

  if (!resolver) {
    debug('using generic resolver');
    resolver = resolveDependencyPath;
  }
  if (ext === '.css' && dependency.startsWith('~')) resolver = cssPreprocessorLookup;

  const detector = detectorHook.getDetector(ext);
  if (detector) {
    // test if the new detector API has a dependency lookup.
    if (detector.dependencyLookup) {
      resolver = detector.dependencyLookup;
    } else {
      // otherwise use TypeScript as the default resolver.
      resolver = tsLookup;
    }
  }

  debug(`found a resolver ${resolver.name} for ${ext}`);

  let result = resolver(options);
  const dependencyExt = path.extname(dependency);
  if (!result && dependencyExt && dependencyExt !== ext) {
    resolver = defaultLookups[dependencyExt];
    if (resolver) {
      // todo: this strategy probably fails often. if, for example, a dependency A.js inside B.ts
      // was not found using the ts resolve, it tries the js resolver, however, parsing the ts file
      // with js parser, won't work most of the time. A better approach would be to fix the
      // original resolver.
      debug(
        `dependency has a different extension (${dependencyExt}) than the original file (${ext}), trying to use its resolver instead`
      );
      try {
        result = resolver(options);
      } catch (err) {
        debug(`unable to use the resolver of ${dependencyExt} for ${filename}. got an error ${err.message}`);
      }
    }
  }
  debug(`resolved path for ${dependency}: ${result}`);
  return result;
}

module.exports.supportedFileExtensions = Object.keys(defaultLookups);

/**
 * Register a custom lookup resolver for a file extension
 *
 * @param  {String} extension - The file extension that should use the resolver
 * @param  {Function} lookupStrategy - A resolver of dependency paths
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

function _getJSType(options) {
  options = options || {};

  if (options.config) {
    return 'amd';
  }

  if (options.webpackConfig) {
    return 'webpack';
  }

  const ast = options.ast || options.content;
  if (ast) {
    debug('reusing the given ast or content');
    return getModuleType.fromSource(ast);
  }

  debug('using the filename to find the module type');
  return getModuleType.sync(options.filename);
}

/**
 * @private
 * @param  {String} dependency
 * @param  {String} filename
 * @param  {String} directory
 * @param  {String} [config]
 * @param  {String} [webpackConfig]
 * @param  {String} [configPath]
 * @param  {Object} [ast]
 * @return {String}
 */
function jsLookup(options: Options) {
  const { configPath, dependency, directory, config, webpackConfig, filename, ast, isScript, content } = options;
  const type = _getJSType({
    config,
    webpackConfig,
    filename,
    ast,
    isScript,
    content,
  });

  switch (type) {
    case 'amd':
      debug('using amd resolver');
      return amdLookup({
        config,
        // Optional in case a pre-parsed config is being passed in
        configPath,
        partial: dependency,
        directory,
        filename,
      });

    case 'webpack':
      debug('using webpack resolver for es6');
      return resolveWebpackPath(dependency, filename, directory, webpackConfig);

    case 'commonjs':
    case 'es6':
    default:
      debug(`using commonjs resolver ${type}`);
      return commonJSLookup(options);
  }
}

/**
 * from https://github.com/webpack-contrib/sass-loader
   webpack provides an [advanced mechanism to resolve files](https://webpack.js.org/concepts/module-resolution/).
   The sass-loader uses node-sass' custom importer feature to pass all queries to the webpack resolving engine.
   Thus you can import your Sass modules from `node_modules`. Just prepend them with a `~` to tell webpack that
   this is not a relative import:
    ```css
    @import "~bootstrap/dist/css/bootstrap";
      ```
    It's important to only prepend it with `~`, because `~/` resolves to the home directory.
    webpack needs to distinguish between `bootstrap` and `~bootstrap` because CSS and Sass files have no special
    syntax for importing relative files. Writing `@import "file"` is the same as `@import "./file";
 */
function cssPreprocessorLookup(options: Options) {
  const { filename, dependency, directory, resolveConfig } = options;
  if (resolveConfig && !isRelativeImport(dependency)) {
    const result = resolveNonRelativePath(dependency, filename, directory, resolveConfig);
    if (result) {
      options.wasCustomResolveUsed = true;
      return result;
    }
  }
  if (dependency.startsWith('~') && !dependency.startsWith('~/')) {
    // webpack syntax for resolving a module from node_modules
    debug('changing the resolver of css preprocessor to resolveWebpackPath as it has a ~ prefix');
    const dependencyWithNoTilda = dependency.replace('~', '');
    return resolveWebpack(dependencyWithNoTilda, filename, directory, { extensions: styleExtensions, symlinks: false });
  }

  // Less and Sass imports are very similar
  return sassLookup({ dependency, filename, directory });
}

function tsLookup(options: Options) {
  const { dependency, filename } = options;
  if (dependency[0] !== '.') {
    // when a path is not relative, use the standard commonJS lookup
    return commonJSLookup(options);
  }
  debug('performing a typescript lookup');

  const tsOptions = {
    module: ts.ModuleKind.CommonJS,
  };

  const host = ts.createCompilerHost({});
  debug('with options: ', tsOptions);
  let resolvedModule = ts.resolveModuleName(dependency, filename, tsOptions, host).resolvedModule;
  if (!resolvedModule) {
    // for some reason, on Windows, ts.resolveModuleName method tries to find the module in the
    // root directory. For example, it searches for module './bar', in 'c:\bar.ts'.
    const fallbackModule = path.resolve(path.dirname(filename), dependency);
    resolvedModule = ts.resolveModuleName(fallbackModule, filename, tsOptions, host).resolvedModule;
  }
  if (!resolvedModule) {
    // ts.resolveModuleName doesn't always work, fallback to commonJSLookup
    debug('failed resolving with tsLookup, trying commonJSLookup');
    return commonJSLookup(options);
  }
  debug('ts resolved module: ', resolvedModule);
  const result = resolvedModule ? resolvedModule.resolvedFileName : '';

  debug(`result: ${result}`);
  return result ? path.resolve(result) : '';
}

function resolveNonRelativePath(dependency, filename, directory, resolveConfig) {
  const webpackResolveConfig = {};
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (resolveConfig.modulesDirectories) webpackResolveConfig.modules = resolveConfig.modulesDirectories;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (resolveConfig.aliases) webpackResolveConfig.alias = resolveConfig.aliases;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  webpackResolveConfig.extensions = resolveExtensions;
  // a resolve module might point to an imported component via the package name, in which case
  // the package name is a symlink to the imported component. we want it to be resolved as a pkg
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  webpackResolveConfig.symlinks = false;
  return resolveWebpack(dependency, filename, directory, webpackResolveConfig);
}

function commonJSLookup(options: Options) {
  const { filename, resolveConfig } = options;
  const directory = path.dirname(filename); // node_modules should be propagated from the file location backwards
  // Need to resolve dependencies within the directory of the module, not filing-cabinet
  const moduleLookupDir = path.join(directory, 'node_modules');

  debug(`adding ${moduleLookupDir} to the require resolution paths`);

  appModulePath.addPath(moduleLookupDir);

  let dependency = options.dependency;

  let result = '';

  if (!isRelativeImport(dependency) && resolveConfig) {
    debug(`trying to resolve using resolveConfig ${JSON.stringify(resolveConfig)}`);
    result = resolveNonRelativePath(dependency, filename, directory, resolveConfig);
    if (result) {
      debug('successfully resolved using resolveConfig');
      options.wasCustomResolveUsed = true;
      return result;
    }
    debug('failed resolved using resolveConfig, fall back to the standard resolver');
  }

  // Make sure the dependency is being resolved to the filename's context
  // 3rd party modules will not be relative
  if (dependency[0] === '.') {
    dependency = path.resolve(path.dirname(filename), dependency);
  }

  try {
    result = resolve.sync(dependency, {
      extensions: resolveExtensions,
      basedir: directory,
      moduleDirectory: ['node_modules'],
    });
    debug(`resolved path: ${result}`);
  } catch (e) {
    debug(`could not resolve ${dependency}`);
  }

  return result;
}

function resolveWebpackPath(dependency, filename, directory, webpackConfig) {
  webpackConfig = path.resolve(webpackConfig);
  let loadedConfig;
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    loadedConfig = require(webpackConfig);

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

  return resolveWebpack(dependency, filename, directory, resolveConfig);
}

function resolveWebpack(dependency, filename, directory, resolveConfig) {
  try {
    const resolver = webpackResolve.create.sync(resolveConfig);

    // We don't care about what the loader resolves the dependency to
    // we only want the path of the resolved file
    dependency = stripLoader(dependency);

    const lookupPath = isRelative(dependency) ? path.dirname(filename) : directory;

    return resolver(lookupPath, dependency);
  } catch (e) {
    debug(`error when resolving ${dependency}`);
    debug(e.message);
    debug(e.stack);
    return '';
  }
}

function stripLoader(dependency) {
  const exclamationLocation = dependency.indexOf('!');

  if (exclamationLocation === -1) {
    return dependency;
  }

  return dependency.slice(exclamationLocation + 1);
}
