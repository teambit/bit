/**
 * this file had been forked from https://github.com/dependents/node-precinct
 */
import fs from 'fs-extra';
import path from 'path';

import getModuleType from 'module-definition';
import Walker from 'node-source-walk';

import detectiveAmd from 'detective-amd';
import detectiveStylus from 'detective-stylus';

import detectiveCss from '../detectives/detective-css';
import detectiveEs6 from '../detectives/detective-es6';
import detectiveLess from '../detectives/detective-less';
import detectiveSass from '../detectives/detective-sass';
import detectiveScss from '../detectives/detective-scss';
import detectiveTypeScript from '../detectives/detective-typescript';

import { SUPPORTED_EXTENSIONS } from '../../../../../constants';
import { BuiltinDeps, DependencyDetector, DetectorHook } from '../detector-hook';

type Options = {
  envDetectors?: DependencyDetector[];
  useContent?: boolean;
  includeCore?: boolean;
  [lang: string]: any;
};

type Detective = (fileContent: string | object, options?: any) => BuiltinDeps;

const extToType = {
  '.css': 'css',
  '.sass': 'sass',
  '.less': 'less',
  '.scss': 'scss',
  '.styl': 'stylus',
  '.mts': 'ts',
  '.cts': 'ts',
  '.ts': 'ts',
  '.tsx': 'ts',
};

const jsExt = ['.js', '.jsx', '.cjs', '.mjs'];

const typeToDetective: Record<string, Detective> = {
  css: detectiveCss,
  sass: detectiveSass,
  less: detectiveLess,
  scss: detectiveScss,
  stylus: detectiveStylus,
  ts: detectiveTypeScript,
  commonjs: detectiveEs6,
  es6: detectiveEs6,
  amd: detectiveAmd,
};

const debug = require('debug')('precinct');

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
const natives = process.binding('natives');

const detectorHook = new DetectorHook();

type FileInfo = {
  ext: string;
  content: string | object;
  ast: any;
  type: string;
};

const getFileInfo = (filename: string): FileInfo => {
  const ext = path.extname(filename);
  const content = fs.readFileSync(filename, 'utf8');
  return { ext, content, ast: content, type: '' };
};

const getDetector = (fileInfo: FileInfo, options?: Options): Detective | undefined => {
  const { ext } = fileInfo;
  const normalizedOptions: Options = options || {};

  // from env detectors
  if (options?.envDetectors) {
    for (const detector of options.envDetectors) {
      if (detector.isSupported({ ext })) {
        fileInfo.type = detector.type || '';
        return detector.detect as Detective;
      }
    }
  }

  // from builtin detectors
  const type = extToType[ext];
  if (typeToDetective[type]) {
    const detective = typeToDetective[type];
    fileInfo.type = type;
    // special logic for tsx files
    if (ext === '.tsx') {
      if (!normalizedOptions.ts) normalizedOptions.ts = {};
      normalizedOptions.ts.jsx = true;
    }
    return detective;
  }

  // from global detector hook (legacy)
  if (detectorHook.isSupported(ext)) {
    const detector = detectorHook.getDetector(ext);
    if (detector) {
      fileInfo.type = ext;
      typeToDetective[ext] = detector.detect as Detective;
      return detector.detect as Detective;
    }
  }

  return undefined;
};

const getJsDetector = (fileInfo: FileInfo, options?: Options): Detective | undefined => {
  if (!jsExt.includes(fileInfo.ext)) {
    return undefined;
  }
  if (typeof fileInfo.content !== 'object') {
    const walker = new Walker();
    try {
      fileInfo.ast = walker.parse(fileInfo.content);
    } catch (e: any) {
      debug('could not parse content: %s', e.message);
      throw e;
    }
  }

  const useContent = options?.useContent;
  const type = useContent ? getModuleType.fromSource(fileInfo.content) : getModuleType.fromSource(fileInfo.ast);
  const detector = typeToDetective[type];
  fileInfo.type = type;

  return detector;
};

const normalizeDeps = (deps: BuiltinDeps, includeCore?: boolean): string[] => {
  const normalizedDeps = Array.isArray(deps) ? deps : Object.keys(deps);
  return includeCore ? normalizedDeps : normalizedDeps.filter((d) => !natives[d]);
};

const getDepsFromFile = (filename: string, options?: Options): string[] => {
  const normalizedOptions: Options = assign({ includeCore: true }, options || {});
  const fileInfo = getFileInfo(filename);

  const detective = getDetector(fileInfo, normalizedOptions) || getJsDetector(fileInfo, normalizedOptions);
  if (!detective) {
    debug(`skipping unsupported file ${filename}`);
    return [];
  }
  debug('module type: ', fileInfo.type);

  const deps = detective(fileInfo.ast, normalizedOptions[fileInfo.type]);

  return normalizeDeps(deps, normalizedOptions?.includeCore);
};

// Legacy implementation

/**
 * Finds the list of dependencies for the given file
 *
 * @param {String|Object} content - File's content or AST
 * @param {Object} [options]
 * @param {String} [options.type] - The type of content being passed in. Useful if you want to use a non-js detective
 * @return {String[]}
 */
// eslint-disable-next-line complexity
function precinct(content, options) {
  options = options || {};
  let dependencies = [];
  let ast;
  let type = options.type;

  // Legacy form backCompat where type was the second parameter
  if (typeof options === 'string') {
    type = options;
    options = {};
  }

  debug('options given: ', options);

  // We assume we're dealing with a JS file
  if (!type && typeof content !== 'object') {
    const walker = new Walker();

    try {
      // Parse once and distribute the AST to all detectives
      ast = walker.parse(content);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      precinct.ast = ast;
    } catch (e: any) {
      // In case a previous call had it populated
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      precinct.ast = null;
      debug('could not parse content: %s', e.message);
      throw e;
    }
    // SASS files shouldn't be parsed by Acorn
  } else {
    ast = content;

    if (typeof content === 'object') {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      precinct.ast = content;
    }
  }

  type = options.useContent ? getModuleType.fromSource(content) : type || getModuleType.fromSource(ast);
  debug('module type: ', type);

  let theDetective;
  let detector;

  switch (type) {
    case 'commonjs':
    case 'es6':
      theDetective = detectiveEs6;
      break;
    case 'amd':
      theDetective = detectiveAmd;
      break;
    case 'sass':
      theDetective = detectiveSass;
      break;
    case 'less':
      theDetective = detectiveLess;
      break;
    case 'scss':
      theDetective = detectiveScss;
      break;
    case 'css':
      theDetective = detectiveCss;
      break;
    case 'stylus':
      theDetective = detectiveStylus;
      break;
    case 'ts':
    case 'tsx':
      theDetective = detectiveTypeScript;
      break;
    default:
      detector = detectorHook.getDetector(type);
      if (detector) theDetective = detector.detect.bind(detector);
      break;
  }

  if (theDetective) {
    // dependencies = type === 'vue' ? theDetective(ast, options) : theDetective(ast, options[type] || {});
    dependencies = theDetective(ast, options[type] || {});
  }

  // For non-JS files that we don't parse
  if (theDetective && theDetective.ast) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    precinct.ast = theDetective.ast;
  }

  return dependencies;
}

function assign(o1, o2) {
  // eslint-disable-next-line
  for (const key in o2) {
    // eslint-disable-next-line
    if (o2.hasOwnProperty(key)) {
      o1[key] = o2[key];
    }
  }

  return o1;
}

precinct.paperwork = getDepsFromFile;

export default precinct;

/**
 * Returns the dependencies for the given file path
 *
 * @param {String} filename
 * @param {Object} [options]
 * @param {Boolean} [options.includeCore=true] - Whether or not to include core modules in the dependency list
 * @return {String[]}
 */
export const legacyPaperwork = function (filename, options) {
  options = assign(
    {
      includeCore: true,
    },
    options || {}
  );

  const content = fs.readFileSync(filename, 'utf8');
  const ext = path.extname(filename);

  const getType = () => {
    switch (ext) {
      case '.css':
      case '.scss':
      case '.sass':
      case '.less':
      case '.ts':
      case '.vue':
        return ext.replace('.', '');
      case '.styl':
        return 'stylus';
      case '.tsx':
        if (!options.ts) options.ts = {};
        options.ts.jsx = true;
        return 'ts';
      case '.mts':
      case '.cts':
        return 'ts';
      case '.jsx':
      case '.mjs':
        return 'es6';
      default:
        if (detectorHook.isSupported(ext)) {
          return ext;
        }

        return null;
    }
  };

  const getDeps = () => {
    if (SUPPORTED_EXTENSIONS.includes(ext) || detectorHook.isSupported(ext)) return precinct(content, options);
    debug(`skipping unsupported file ${filename}`);
    return [];
  };

  const type = getType();
  options.type = type;

  const deps = getDeps();

  if (deps && !options.includeCore) {
    if (Array.isArray(deps)) {
      return deps.filter(function (d) {
        return !natives[d];
      });
    }
    return Object.keys(deps).reduce((acc, value) => {
      if (!natives[value]) acc[value] = deps[value];
      return acc;
    }, {});
  }

  return deps;
};

export const detectors = [];
