// @flow
/**
 * Path Map is the extra data about the files and the dependencies, such as ImportSpecifiers and
 * custom-resolve-modules used.
 * The data is retrieved by dependency-tree which collects them from the various detectives.
 * It is used to update the final tree.
 */
import R from 'ramda';

import { processPath } from './generate-tree-madge';
import { Specifier } from '@teambit/legacy/dist/consumer/component/dependencies/dependency';

export type PathMapDependency = {
  importSource: string; // dependency path as it has been received from dependency-tree lib
  resolvedDep: string; // path relative to consumer root (after convertPathMapToRelativePaths() )
  importSpecifiers?: Specifier[]; // relevant for ES6 and TS
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
