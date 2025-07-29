/**
 * this file had been forked from https://github.com/dependents/node-precinct
 */
import fs from 'fs-extra';
import path from 'path';

// @ts-ignore we currently have @types/node as v12, and this is available > 16. once updated, remove the ts-ignore
import { isBuiltin } from 'module';

import getModuleType from 'module-definition';
import Walker from 'node-source-walk';

import detectiveAmd from 'detective-amd';
import detectiveStylus from 'detective-stylus';

import detectiveEs6 from '@teambit/node.deps-detectors.detective-es6';
import detectiveCss from '@teambit/styling.deps-detectors.detective-css';
import detectiveLess from '@teambit/styling.deps-detectors.detective-less';
import detectiveSass from '@teambit/styling.deps-detectors.detective-sass';
import detectiveScss from '@teambit/styling.deps-detectors.detective-scss';
import detectiveTypeScript from '@teambit/typescript.deps-detectors.detective-typescript';

import type { DependencyDetector } from '../detector-hook';
import { DetectorHook } from '../detector-hook';

/**
 * The file info object.
 * - `ext` is the file extension.
 * - `content` is the input file content.
 * - `type` is the parsed file type from ext or content.
 * - `ast` is the eventually consumed content by the corresponding detective.
 */
type FileInfo = {
  ext: string;
  content: string | object;
  type: string;
  ast: any;
  filename: string;
};

type Options = {
  envDetectors?: DependencyDetector[];
  useContent?: boolean;
  includeCore?: boolean;
  type?: string;
  [lang: string]: any;
};

type BuiltinDeps = string[] | Record<string, any>;
type Detective = (fileContent: string, options?: any) => BuiltinDeps;

const jsExt = ['.js', '.jsx', '.cjs', '.mjs'];

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

const detectorHook = new DetectorHook();

const assign = (o1, o2) => {
  // eslint-disable-next-line
  for (const key in o2) {
    // eslint-disable-next-line
    if (o2.hasOwnProperty(key)) {
      o1[key] = o2[key];
    }
  }

  return o1;
};

/**
 * Get file info from the given file path.
 */
const getFileInfo = (filename: string): FileInfo => {
  const ext = path.extname(filename);
  const content = fs.readFileSync(filename, 'utf8');
  return {
    ext,
    content,
    // determined later
    type: '',
    // initialized with the content
    ast: content,
    filename,
  };
};

/**
 * Get the non-JS detective for the given file info.
 * The type of the file would be determined as well.
 * Return undefined if no proper detective found, perhaps it's plain
 * JavaScript or unknown content. We can deal with it later.
 */
const getDetector = (fileInfo: FileInfo, options?: Options): Detective | undefined => {
  const { ext, filename } = fileInfo;
  const normalizedOptions: Options = options || {};

  // from env detectors
  if (options?.envDetectors) {
    for (const detector of options.envDetectors) {
      if (detector.isSupported({ ext, filename })) {
        fileInfo.type = detector.type || '';
        return detector.detect as Detective;
      }
    }
  }

  // from builtin detectors
  // - check `fileInfo.type` first to support `precinct(content, { type })`
  const type = fileInfo.type || extToType[ext];
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
  if (detectorHook.isSupported(ext, filename)) {
    const detector = detectorHook.getDetector(ext, filename);
    if (detector) {
      fileInfo.type = ext;
      typeToDetective[ext] = detector.detect as Detective;
      return detector.detect as Detective;
    }
  }

  return undefined;
};

/**
 * Get the JS detective (amd/es6/cjs) for the given file info.
 * The type and ast of the file would be determined as well.
 */
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

/**
 * Normalize the deps into an array.
 */
const normalizeDeps = (deps: BuiltinDeps, includeCore?: boolean): string[] => {
  const normalizedDeps = Array.isArray(deps) ? deps : Object.keys(deps);
  return includeCore ? normalizedDeps : normalizedDeps.filter((d) => !isBuiltin(d));
};

const getDepsFromFile = (filename: string, options?: Options): string[] => {
  const normalizedOptions: Options = assign({ includeCore: true }, options || {});
  const fileInfo = getFileInfo(filename);
  if (
    typeof fileInfo.content === 'string' &&
    (fileInfo.content.startsWith('// @bit-no-check') || fileInfo.content.startsWith('/* @bit-no-check'))
  ) {
    debug(`skipping file ${filename}, it has a @bit-no-check comment`);
    return [];
  }

  const detective = getDetector(fileInfo, normalizedOptions) || getJsDetector(fileInfo, normalizedOptions);
  if (!detective) {
    debug(`skipping unsupported file ${filename}`);
    return [];
  }
  debug('module type: ', fileInfo.type);

  const deps = detective(fileInfo.ast, normalizedOptions[fileInfo.type]);

  return normalizeDeps(deps, normalizedOptions?.includeCore);
};

const precinct = {
  paperwork: getDepsFromFile,
};

export default precinct;
