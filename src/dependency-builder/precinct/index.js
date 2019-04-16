/**
 * this file had been forked from https://github.com/dependents/node-precinct
 */
import fs from 'fs';
import path from 'path';
import getModuleType from 'module-definition';
import Walker from 'node-source-walk';
import detectiveAmd from 'detective-amd';
import detectiveStylus from 'detective-stylus';
import detectiveEs6 from '../detectives/detective-es6';
import detectiveLess from '../detectives/detective-less';
import detectiveSass from '../detectives/detective-sass';
import detectiveScss from '../detectives/detective-scss';
import detectiveCss from '../detectives/detective-css';
import detectiveTypeScript from '../detectives/detective-typescript';
import detectiveStylable from '../detectives/detective-stylable';
import detectiveVue from '../detectives/detective-vue';
import { SUPPORTED_EXTENSIONS } from '../../constants';

const debug = require('debug')('precinct');

const natives = process.binding('natives');

/**
 * Finds the list of dependencies for the given file
 *
 * @param {String|Object} content - File's content or AST
 * @param {Object} [options]
 * @param {String} [options.type] - The type of content being passed in. Useful if you want to use a non-js detective
 * @return {String[]}
 */
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
      precinct.ast = ast;
    } catch (e) {
      // In case a previous call had it populated
      precinct.ast = null;
      debug('could not parse content: %s', e.message);
      throw e;
    }
    // SASS files shouldn't be parsed by Acorn
  } else {
    ast = content;

    if (typeof content === 'object') {
      precinct.ast = content;
    }
  }

  type = options.useContent ? getModuleType.fromSource(content) : type || getModuleType.fromSource(ast);
  debug('module type: ', type);

  let theDetective;

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
    case 'stylable':
      theDetective = detectiveStylable;
      break;
    case 'vue':
      theDetective = detectiveVue;
      break;
    default:
      break;
  }

  if (theDetective) {
    dependencies = type === 'vue' ? theDetective(ast, options) : theDetective(ast, options[type] || {});
  }

  // For non-JS files that we don't parse
  if (theDetective && theDetective.ast) {
    precinct.ast = theDetective.ast;
  }

  return dependencies;
}

function assign(o1, o2) {
  for (const key in o2) {
    if (o2.hasOwnProperty(key)) {
      o1[key] = o2[key];
    }
  }

  return o1;
}

/**
 * Returns the dependencies for the given file path
 *
 * @param {String} filename
 * @param {Object} [options]
 * @param {Boolean} [options.includeCore=true] - Whether or not to include core modules in the dependency list
 * @return {String[]}
 */
precinct.paperwork = function (filename, options) {
  options = assign(
    {
      includeCore: true
    },
    options || {}
  );

  const content = fs.readFileSync(filename, 'utf8');
  const ext = path.extname(filename);

  const getType = () => {
    if (filename.endsWith('.st.css')) {
      return 'stylable';
    }
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
      case '.jsx':
        return 'es6';
      default:
        return null;
    }
  };

  const getDeps = () => {
    if (SUPPORTED_EXTENSIONS.includes(ext)) return precinct(content, options);
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

module.exports = precinct;
