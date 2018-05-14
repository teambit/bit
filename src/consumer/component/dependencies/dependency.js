/** @flow */
import { BitId } from '../../../bit-id';
import type { PathLinux } from '../../../utils/path';
import type { ImportSpecifier } from './dependency-resolver/types/dependency-tree-type';

export type RelativePath = {
  sourceRelativePath: PathLinux,
  destinationRelativePath: PathLinux,
  importSpecifiers?: ImportSpecifier[],
  importSource: string, // needed when isCustomResolveUsed=true
  isCustomResolveUsed?: boolean // custom resolve can be configured on consumer bit.json file in resolveModules attribute
};

export default class Dependency {
  id: BitId;
  relativePaths: RelativePath[];
  constructor(id: BitId, relativePaths: RelativePath[]) {
    this.id = id;
    this.relativePaths = relativePaths;
  }
}
