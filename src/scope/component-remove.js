import { BitIds } from '../bit-id';

export class RemovedObjects {
  removedComponentIds: BitIds;
  missingComponents: BitIds;
  dependentBits: Object;
  removedDependencies: BitIds;
  constructor(
    bitIds: BitIds = [],
    missingComponents: BitIds = [],
    removedDependencies: BitIds = [],
    dependentBits: Object = {}
  ) {
    this.removedComponentIds = bitIds;
    this.missingComponents = missingComponents;
    this.dependentBits = dependentBits;
    this.removedDependencies = removedDependencies;
  }
}
export class RemovedLocalObjects extends RemovedObjects {
  modifiedComponents: BitIds;
  constructor(
    bitIds: BitIds,
    missingComponents: BitIds,
    modifiedComponents: BitIds = [],
    dependentBits: Object,
    removedDependencies: BitIds
  ) {
    super(bitIds, missingComponents, removedDependencies, dependentBits);
    this.modifiedComponents = modifiedComponents;
  }
}
