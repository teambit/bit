/**
 * this file had been forked from https://github.com/dependents/node-precinct
 */
import detectiveAmd from 'detective-amd';
import detectiveStylus from 'detective-stylus';
import fs from 'fs-extra';
import getModuleType from 'module-definition';
import Walker from 'node-source-walk';
import path from 'path';

// import { SUPPORTED_EXTENSIONS } from '../../../../../constants';
import detectiveCss from '../detectives/detective-css';
import detectiveEs6 from '../detectives/detective-es6';
import detectiveLess from '../detectives/detective-less';
import detectiveSass from '../detectives/detective-sass';
import detectiveScss from '../detectives/detective-scss';
import detectiveTypeScript from '../detectives/detective-typescript';
import { DependencyDetector, BuilinDependencyDetector, DetectorHook } from '../detector-hook';

const debug = require('debug')('precinct');

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
const natives = process.binding('natives');

const detectorHook = new DetectorHook();

// TODO: expose all builtin detectors for 3rd-party reuse

const builtinDetectorsByExt = {
  '.css': detectiveCss,
  '.sass': detectiveSass,
  '.less': detectiveLess,
  '.scss': detectiveScss,
  '.styl': detectiveStylus,
  '.mts': detectiveTypeScript,
  '.cts': detectiveTypeScript,
  '.ts': detectiveTypeScript,
  '.tsx': detectiveTypeScript,
  // '.jsx': detectiveEs6, // need further detemination
  // '.mjs': detectiveEs6, // need further detemination
};

const builtinJsDetectorsByType = {
  commonjs: detectiveEs6,
  es6: detectiveEs6,
  amd: detectiveAmd,
};

const builtinDetectors = {
  commonjs: detectiveEs6,
  es6: detectiveEs6,
  amd: detectiveAmd,
  sass: detectiveSass,
  less: detectiveLess,
  scss: detectiveScss,
  css: detectiveCss,
  stylus: detectiveStylus,
  ts: detectiveTypeScript,
  tsx: detectiveTypeScript,
};

const getDetector = (ext, content, options): { type: string; content: any, detector: BuilinDependencyDetector } | null => {
  // 0. options could be type
  const preDefinedType = typeof options === 'string' ? options : options.type || '';

  // 1. find by envDetectors
  if (options.envDetectors) {
    const detector = options.envDetectors.find((detector: DependencyDetector) => {
      if (detector.isSupported({ ext })) {
        return true;
      }
      return false;
    })
    if (detector) {
      return { type: detector.type, content, detector };
    }
  }

  // 2. find by builtinDetectorsByExt
  // TODO: preDefinedType to builtin detector
  preDefinedType;
  if (builtinDetectorsByExt[ext]) {
    // tsx -> options.ts.jsx = true
    if (ext === '.tsx') {
      if (!options.ts) options.ts = {};
      options.ts.jsx = true
    }
    // TODO: type
    return { type: '', content, detector: builtinDetectorsByExt[ext]};
  }

  // get type by preDefinedType or module-definition
  // TODO: further simplify the code to get ast
  let ast;
  if (!preDefinedType && typeof content !== 'object') {
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
  } else {
    ast = content;

    if (typeof content === 'object') {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      precinct.ast = content;
    }
  }
  const type = options.useContent
    ? getModuleType.fromSource(content)
    : preDefinedType || getModuleType.fromSource(ast);

  // 3. find for JS files
  if (builtinJsDetectorsByType[type]) {
    return { type, content: ast, detector: builtinJsDetectorsByType[type]};
  }

  // 4. find by detectorHooks
  const hookDetector = detectorHook.getDetector(type);
  if (hookDetector) {
    return { type, content: ast, detector: hookDetector };
  }

  return null;
}

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

  if (builtinDetectors[type]) {
    theDetective = builtinDetectors[type]
  } else {
    detector = detectorHook.getDetector(type);
    if (detector) {
      theDetective = detector.detect.bind(detector);
    } else {}
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

  // ast === precinct.ast <- content <- node-source-walk
  // type <- options.type <- module-definition
  // theDetective <- detectorHook.getDetector(type) <- detectiveXxx
  // <- precinct.ast
  // <- dependencies <- theDetective(ast, options[type])
  // TODO: precinct.ast? options[type]?
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

const getTypeByExt = (ext, options) => {
  let type = '';

  if (options.envDetectors) {
    options.envDetectors.some((detector: DependencyDetector) => {
      if (detector.isSupported({ ext })) {
        type = detector.type || ext.substring(1);
        return true;
      }
      return false;
    })
  }

  if (type) {
    return type;
  }

  switch (ext) {
    case '.css':
    case '.scss':
    case '.sass':
    case '.less':
    case '.ts':
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
        // TODO: remove dot ('.vue' -> 'vue')?
        return ext;
      }

      return null;
  }
};

/**
 * Returns the dependencies for the given file path
 *
 * @param {String} filename
 * @param {Object} [options]
 * @param {Boolean} [options.includeCore=true] - Whether or not to include core modules in the dependency list
 * @return {String[]}
 */
export const getDeps = (filename, options) => {
  options = assign(
    {
      includeCore: true,
    },
    options || {}
  );

  // TODO:
  options.envDetectrors;

  const content = fs.readFileSync(filename, 'utf8');
  const ext = path.extname(filename);

  let deps: string[] = [];
  const detectorInfo = getDetector(ext, content, options);
  if (detectorInfo) {
    deps = detectorInfo.detector.detect(detectorInfo.content, options[detectorInfo.type] || {});
  }

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

/**
 * @deprecated
 * Use getDeps instead please.
 */
precinct.paperwork = getDeps;

export const detectors = [];

export default precinct;
