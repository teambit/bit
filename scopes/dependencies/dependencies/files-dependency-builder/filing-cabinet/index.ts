// @flow

/**
 * this file had been forked from https://github.com/dependents/node-filing-cabinet
 */
import path from 'path';
import resolveDependencyPath from 'resolve-dependency-path';
import stylusLookup from 'stylus-lookup';

import { lookupJavaScript, lookupTypeScript } from '@teambit/typescript.deps-lookups.lookup-typescript';
import { lookupStyling } from '@teambit/styling.deps-lookups.lookup-styling';

import type { DependencyDetector } from '@teambit/dependency-resolver';
import { DetectorHook } from '@teambit/dependency-resolver';

const debug = require('debug')('cabinet');

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
};

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
