import path from 'path';

/**
 * return the package name by the import statement path to node package
 *
 * @param {string} packagePath import statement path
 * @returns {string} name of the package
 */
export function resolvePackageNameByPath(packagePath: string): string {
  const packagePathArr = packagePath.split(path.sep);
  // Regular package without path. example - import _ from 'lodash'
  if (packagePathArr.length === 1) return packagePath;
  // sass-loader/webpack path. remove the tilda, it's not part of the package name
  if (packagePathArr[0].startsWith('~')) packagePathArr[0] = packagePathArr[0].replace('~', '');
  // Scoped package. example - import getSymbolIterator from '@angular/core/src/util.d.ts';
  if (packagePathArr[0].startsWith('@')) return path.join(packagePathArr[0], packagePathArr[1]);
  // Regular package with internal path. example import something from 'mypackage/src/util/isString'
  return packagePathArr[0];
}
