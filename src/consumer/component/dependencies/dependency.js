/** @flow */
import R from 'ramda';
import { BitId } from '../../../bit-id';
import type { PathLinux } from '../../../utils/path';
import type { ImportSpecifier } from './dependency-resolver/types/dependency-tree-type';
import BitMap from '../../bit-map';
import { COMPONENT_ORIGINS } from '../../../constants';

/**
 * a dependency component may have multiple files that are required from the parent component, each
 * one of the files has its RelativePath instance.
 *
 * For example:
 * main component: "foo" => foo.js => `const isString = require('../utils/is-string'); const isArray = require('../utils/is-array');
 * dependency: "utils" => utils/is-string.js, utils/is-array.js
 * In this example, the component "foo" has one dependency "utils" with two RelativePaths.
 * one for utils/is-string.js file and the second for utils/is-array.js file
 */
export type RelativePath = {
  sourceRelativePath: PathLinux, // location of the link file
  destinationRelativePath: PathLinux, // destination written inside the link file
  importSpecifiers?: ImportSpecifier[],
  isCustomResolveUsed?: boolean, // custom resolve can be configured on consumer bit.json file in resolveModules attribute
  importSource?: string // available when isCustomResolveUsed=true, contains the import path. e.g. "import x from 'src/utils'", importSource is 'src/utils'.
};

export default class Dependency {
  id: BitId;
  relativePaths: RelativePath[];
  constructor(id: BitId, relativePaths: RelativePath[]) {
    this.id = id;
    this.relativePaths = relativePaths;
  }

  static stripOriginallySharedDir(dependency: Dependency, bitMap: BitMap, originallySharedDir: string): void {
    const pathWithoutSharedDir = (pathStr, sharedDir) => {
      if (!sharedDir) return pathStr;
      const partToRemove = `${sharedDir}/`;
      return pathStr.replace(partToRemove, '');
    };
    const depFromBitMap = bitMap.getComponentIfExist(dependency.id);
    dependency.relativePaths.forEach((relativePath: RelativePath) => {
      relativePath.sourceRelativePath = pathWithoutSharedDir(relativePath.sourceRelativePath, originallySharedDir);
      if (depFromBitMap && depFromBitMap.origin === COMPONENT_ORIGINS.IMPORTED) {
        relativePath.destinationRelativePath = pathWithoutSharedDir(
          relativePath.destinationRelativePath,
          depFromBitMap.originallySharedDir
        );
      }
    });
  }

  static getClone(dependency: Dependency): Object {
    return {
      id: dependency.id,
      relativePaths: R.clone(dependency.relativePaths)
    };
  }
}
