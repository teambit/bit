import R from 'ramda';

import { BitId } from '../../../bit-id';
import { PathLinux } from '../../../utils/path';
import { ImportSpecifier } from './files-dependency-builder/types/dependency-tree-type';

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
  sourceRelativePath: PathLinux; // location of the link file
  destinationRelativePath: PathLinux; // destination written inside the link file
  importSpecifiers?: ImportSpecifier[];
  isCustomResolveUsed?: boolean; // custom resolve can be configured on consumer bit.json file in resolveModules attribute
  importSource?: string; // available when isCustomResolveUsed=true, contains the import path. e.g. "import x from 'src/utils'", importSource is 'src/utils'.
};

export default class Dependency {
  id: BitId;
  relativePaths: RelativePath[];
  packageName?: string;

  constructor(id: BitId, relativePaths: RelativePath[], packageName?: string) {
    this.id = id;
    this.relativePaths = relativePaths;
    this.packageName = packageName;
  }

  static getClone(dependency: Dependency): Record<string, any> {
    return {
      id: dependency.id,
      relativePaths: R.clone(dependency.relativePaths),
      packageName: dependency.packageName,
    };
  }
}
