import { pathNormalizeToLinux } from '..';

/**
 * return the package name by the import statement path to node package
 *
 * @param {string} packagePath import statement path
 * @returns {string} name of the package
 */
export function resolvePackageNameByPath(packagePath: string): string {
  // pathNormalizeToLinux strips trailing slashes (`normalize-path('events/') === 'events'`),
  // so we operate on the normalized form throughout — including for the single-segment branch.
  // Returning the original `packagePath` there would leak a trailing slash like `events/`
  // into downstream consumers (e.g. the MissingPackagesDependenciesOnFs issue), preventing
  // them from matching the real package name `events`.
  const packagePathLinux = pathNormalizeToLinux(packagePath);
  const packagePathArr = packagePathLinux.split('/');
  // Regular package without path. example - import _ from 'lodash'
  if (packagePathArr.length === 1) return packagePathLinux;
  // sass-loader/webpack path. remove the tilda, it's not part of the package name
  if (packagePathArr[0].startsWith('~')) packagePathArr[0] = packagePathArr[0].replace('~', '');
  // Scoped package. example - import getSymbolIterator from '@angular/core/src/util.d.ts';
  if (packagePathArr[0].startsWith('@')) return `${packagePathArr[0]}/${packagePathArr[1]}`;
  // Regular package with internal path. example import something from 'mypackage/src/util/isString'
  return packagePathArr[0];
}
