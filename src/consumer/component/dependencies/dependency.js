/** @flow */
import { BitId } from '../../../bit-id';

export type RelativePath = {
  sourceRelativePath: string,
  destinationRelativePath: string,
  importSpecifiers?: Object
};

export default class Dependency {
  constructor(id: BitId, relativePaths: RelativePath[]) {
    this.id = id;
    this.relativePaths = relativePaths;
  }
}
