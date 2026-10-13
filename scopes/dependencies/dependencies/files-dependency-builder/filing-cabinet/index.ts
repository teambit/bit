// @flow

/**
 * this file had been forked from https://github.com/dependents/node-filing-cabinet
 */
import path from 'path';
import { createRequire } from 'module';

import type { DependencyDetector } from '@teambit/dependency-resolver';
import { DetectorHook } from '@teambit/dependency-resolver';

const debug = require('debug')('cabinet');

// Default native resolution does not need the TypeScript, Babel or styling lookup packages.
function lazyLookup(load: () => (options: Options) => any): (options: Options) => any {
  let lookup: ((options: Options) => any) | undefined;
  return (options) => {
    lookup ||= load();
    return lookup(options);
  };
}
const lookupJavaScript = lazyLookup(
  () => require('@teambit/typescript.deps-lookups.lookup-typescript').lookupJavaScript
);
const lookupTypeScript = lazyLookup(
  () => require('@teambit/typescript.deps-lookups.lookup-typescript').lookupTypeScript
);
const lookupStyling = lazyLookup(() => require('@teambit/styling.deps-lookups.lookup-styling').lookupStyling);
const resolveDependencyPath = lazyLookup(() => {
  const loaded = require('resolve-dependency-path');
  return loaded.default || loaded;
});
const stylusLookup = lazyLookup(() => {
  const loaded = require('stylus-lookup');
  return loaded.default || loaded;
});

const defaultLookups = {
  '.js': lookupJavaScript,
  '.cjs': lookupJavaScript,
  '.mjs': lookupJavaScript,
  '.jsx': lookupJavaScript,
  '.ts': lookupTypeScript,
  '.tsx': lookupTypeScript,
  '.cts': lookupTypeScript,
  '.mts': lookupTypeScript,
  '.scss': lookupStyling,
  '.sass': lookupStyling,
  '.styl': stylusLookup,
  '.less': lookupStyling,
  // md/mdx docs import components/packages, resolved the same way ts imports are
  '.md': lookupTypeScript,
  '.mdx': lookupTypeScript,
};

const nativeDefaults = { ...defaultLookups };
const lookupRequire = createRequire(require.resolve('@teambit/typescript.deps-lookups.lookup-typescript'));
const appModulePath = lookupRequire('app-module-path') as { addPath: (directory: string) => void };
const originalAddPath = appModulePath.addPath;

/** Custom lookups and detector predicates retain their original synchronous dispatch. */
export function canUseRustCommonJS(
  filename: string,
  options: {
    envDetectors?: DependencyDetector[];
    requireConfig?: unknown;
    webpackConfig?: unknown;
    resolveConfig?: unknown;
  }
): boolean {
  const ext = path.extname(filename);
  return (
    module.exports.default === cabinet &&
    ['.js', '.jsx', '.cjs', '.mjs', '.ts', '.tsx', '.cts', '.mts'].includes(ext) &&
    defaultLookups[ext] === nativeDefaults[ext] &&
    appModulePath.addPath === originalAddPath &&
    !DetectorHook.hooks.length &&
    !options.envDetectors?.length &&
    !options.requireConfig &&
    !options.webpackConfig &&
    !options.resolveConfig
  );
}

export function isRustCommonJSDependency(filename: string, dependency: string): boolean {
  return !['.ts', '.tsx', '.cts', '.mts'].includes(path.extname(filename)) || !dependency.startsWith('.');
}

/** Preserve the existing lookup's public module search-path side effect. */
export function registerRustCommonJSPath(filename: string): void {
  appModulePath.addPath(path.join(path.dirname(filename), 'node_modules'));
}

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
  envDetectors?: DependencyDetector[];
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
  if (ext === '.css' && dependency.startsWith('~')) resolver = lookupStyling;

  const detector = detectorHook.getDetector(ext, filename);
  if (detector) {
    // test if the new detector API has a dependency lookup.
    if (detector.dependencyLookup) {
      resolver = detector.dependencyLookup;
    } else {
      // otherwise use TypeScript as the default resolver.
      resolver = lookupTypeScript;
    }
  }

  if (options?.envDetectors) {
    for (const envDetector of options.envDetectors) {
      if (envDetector.isSupported({ ext, filename }) && envDetector.dependencyLookup) {
        resolver = envDetector.dependencyLookup;
      }
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
      } catch (err: any) {
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
