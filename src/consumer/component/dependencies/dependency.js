/** @flow */
import { BitId } from '../../../bit-id';
import type { PathLinux } from '../../../utils/path';
import type { ImportSpecifier } from './dependency-resolver/types/dependency-tree-type';

export type RelativePath = {
  sourceRelativePath: PathLinux,
  destinationRelativePath: PathLinux,
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
}
