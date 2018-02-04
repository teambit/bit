/** @flow */
import { BitId } from '../../../bit-id';
import type { PathLinux } from '../../../utils/path';

export type RelativePath = {
  sourceRelativePath: PathLinux,
  destinationRelativePath: PathLinux,
  importSpecifiers?: Object
};

export default class Dependency {
  id: BitId;
  relativePaths: RelativePath[];
  constructor(id: BitId, relativePaths: RelativePath[]) {
    this.id = id;
    this.relativePaths = relativePaths;
  }
}
