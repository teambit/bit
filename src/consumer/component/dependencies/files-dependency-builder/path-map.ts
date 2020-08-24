// @flow
/**
 * Path Map is the extra data about the files and the dependencies, such as ImportSpecifiers and
 * custom-resolve-modules used.
 * The data is retrieved by dependency-tree which collects them from the various detectives.
 * It is used to update the final tree.
 */
import R from 'ramda';

import { processPath } from './generate-tree-madge';
import { ImportSpecifier, LinkFile, Specifier } from './types/dependency-tree-type';

const debug = require('debug')('path-map');

export type PathMapDependency = {
  importSource: string; // dependency path as it has been received from dependency-tree lib
  isCustomResolveUsed?: boolean; // whether a custom resolver, such as an alias "@" for "src" dir, is used
  resolvedDep: string; // path relative to consumer root (after convertPathMapToRelativePaths() )
  importSpecifiers?: Specifier[]; // relevant for ES6 and TS
  linkFile?: boolean;
  realDependencies?: LinkFile[]; // in case it's a link-file
};

/**
 * PathMap is used to get the ImportSpecifiers from dependency-tree library
 */
export type PathMapItem = {
  file: string; // path relative to consumer root (after convertPathMapToRelativePaths() )
  dependencies: PathMapDependency[];
};

export function convertPathMapToRelativePaths(pathMap: PathMapItem[], baseDir: string): PathMapItem[] {
  const pathCache = {};
  return pathMap.map((file: PathMapItem) => {
    const newFile = R.clone(file);
    newFile.file = processPath(file.file, pathCache, baseDir);
    newFile.dependencies = file.dependencies.map((dependency) => {
      const newDependency = R.clone(dependency);
      newDependency.resolvedDep = processPath(dependency.resolvedDep, pathCache, baseDir);
      return newDependency;
    });
    return newFile;
  });
}

/**
 * if a resolvedDep of a specifier has its own importSpecifiers and one of them is the same of the
 * given specifier, then, the realDep is not the resolvedDep and might be the resolvedDep of the
 * resolvedDep. It needs to be done in multiple rounds because it might have multiple link files.
 *
 * it is easier to understand with an example:
 * bar/foo.js requires an index file => utils/index.js, => `import { isString } from '../utils';`
 * which requires another index file: utils/is-string/index.js, => `export { default as isString } from './is-string';`
 * which requires a real file utils/is-string/is-string.js => `export default function isString() { };`
 *
 * according to the files, the dependency of bar/foo is utils/index.js.
 * however, we suspect that utils/index.js is only a link file so we try to find the realDep.
 *
 * round 1:
 * utils/is-string/index.js is a first candidate because it has isString in one of the dependencies
 * importSpecifiers. however, since it has dependencies itself, we might find more candidates.
 * continue to round 2 to find out.
 *
 * round 2:
 * isString specifier of utils/is-string/index.js is connected to utils/is-string/is-string.js
 * which introduce this file as the second candidate. this file doesn't have any dependency,
 * therefore it returns this file as the final realDep.
 */
function findTheRealDependency(
  allPathMapItems: PathMapItem[],
  firstPathMap: PathMapItem,
  specifier: Specifier
): PathMapDependency | null | undefined {
  let currentPathMap: PathMapItem = firstPathMap;
  let lastRealDep: PathMapDependency | null | undefined;
  const visitedFiles: string[] = [];

  while (!visitedFiles.includes(currentPathMap.file)) {
    visitedFiles.push(currentPathMap.file);
    const currentRealDep: PathMapDependency | null | undefined = currentPathMap.dependencies.find((dep) => {
      if (!dep.importSpecifiers) return false;
      return dep.importSpecifiers.find((depSpecifier) => depSpecifier.name === specifier.name && depSpecifier.exported);
    });
    if (!currentRealDep) {
      // the currentRealDep is not the real dependency, return the last real we found
      return lastRealDep;
    }
    const realDepPathMap = allPathMapItems.find((file) => file.file === currentRealDep.resolvedDep);
    if (!realDepPathMap || !realDepPathMap.dependencies.length) {
      // since the currentRealDep we just found doesn't have any more dependencies, we know that it
      // is the last one. no need to continue searching.
      return currentRealDep;
    }
    // the realDep we found might not be the last one, continue searching
    lastRealDep = currentRealDep;
    currentPathMap = realDepPathMap;
  }

  // visitedFiles includes currentPathMap.file, which means, it has a cycle dependency
  // when the cycle dependencies involve multiple files, we don't know which one is the real file
  // and which one is the link file. Here is an example:
  // bar/foo.js => `imports { isString } from 'utils'`;
  // utils/index.js => `export { isString } from './is-string'`;
  // utils/is-string.js => `import { isString } from '.'; export default function () {};`
  // the cycle is as follows: bar/foo.js => utils/index.js => utils/is-string.js => utils/index.js.
  // here, we don't know whether the utils/is-string.js is the link-file or maybe utils/index.js
  // we have no choice but ignoring the link-files.
  debug(`an invalid cycle has been found while looking for "${specifier.name}" specifier in "${firstPathMap.file}" file.
visited files by this order: ${visitedFiles.join(', ')}
the first file imports "${specifier.name}" from the second file, the second file imports it from the third and so on.
eventually, the last file imports it from one of the files that were visited already which is an invalid state.`);
  return null;
}

/**
 * if a dependency file is in fact a link file, get its real dependencies.
 */
function getDependenciesFromLinkFileIfExists(
  dependency: PathMapDependency,
  pathMap: PathMapItem[]
): LinkFile[] | null | undefined {
  const dependencyPathMap: PathMapItem | null | undefined = pathMap.find(
    (file) => file.file === dependency.resolvedDep
  );
  if (
    !dependencyPathMap ||
    !dependencyPathMap.dependencies.length ||
    !dependency.importSpecifiers ||
    !dependency.importSpecifiers.length
  ) {
    return null;
  }

  const dependencies = dependency.importSpecifiers.map((specifier: Specifier) => {
    const realDep = findTheRealDependency(pathMap, dependencyPathMap, specifier);
    if (!realDep) return null;
    // @ts-ignore
    const depImportSpecifier = realDep.importSpecifiers.find((depSpecifier) => depSpecifier.name === specifier.name);
    const importSpecifier: ImportSpecifier = {
      mainFile: specifier,
      linkFile: depImportSpecifier,
    };
    return { file: realDep.resolvedDep, importSpecifier };
  });

  if (dependencies.some((dep) => !dep)) {
    // at least one specifier doesn't have "realDep", meaning it doesn't use link-file
    return null;
  }
  const linkFiles = [];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  dependencies.forEach((dep: { file: string; importSpecifier: ImportSpecifier }) => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const existingFile = linkFiles.find((linkFile) => linkFile.file === dep.file);
    if (existingFile) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      existingFile.importSpecifiers.push(dep.importSpecifier);
    } else {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      linkFiles.push({ file: dep.file, importSpecifiers: [dep.importSpecifier] });
    }
  });
  return linkFiles;
}

/**
 * mark dependencies that are link-files as such. Also, add the data of the real dependencies
 */
export function getPathMapWithLinkFilesData(pathMap: PathMapItem[]): PathMapItem[] {
  if (!Array.isArray(pathMap)) throw new TypeError('pathMap must be an array');
  const updateDependencyWithLinkData = (dependency: PathMapDependency) => {
    const dependenciesFromLinkFiles = getDependenciesFromLinkFileIfExists(dependency, pathMap);
    if (dependenciesFromLinkFiles && dependenciesFromLinkFiles.length) {
      // it is a link file
      dependency.linkFile = true;
      dependency.realDependencies = dependenciesFromLinkFiles;
    }
  };
  pathMap.forEach((file: PathMapItem) => {
    file.dependencies.forEach((dependency: PathMapDependency) => {
      updateDependencyWithLinkData(dependency);
    });
  });

  return pathMap;
}
