import { BitId, BitIds } from '../bit-id';

export class RemovedObjects {
  bitIds: BitIds;
  missingComponents: BitIds;
  dependentBits: BitIds;
  removedDependencies: BitIds;
  constructor(
    bitIds: BitIds = [],
    missingComponents: BitIds = [],
    removedDependencies: BitIds = [],
    dependentBits: BitIds = []
  ) {
    this.bitIds = bitIds;
    this.missingComponents = missingComponents;
    this.dependentBits = dependentBits;
    this.removedDependencies = removedDependencies;
  }
}
export class RemovedLocalObjects extends RemovedObjects {
  dependentBits: BitIds;
  constructor(
    bitIds: BitIds,
    missingComponents: BitIds,
    modifiedComponents: BitIds,
    dependentBits: BitIds,
    removedDependencies: BitIds
  ) {
    super(bitIds, missingComponents, dependentBits, removedDependencies);
    this.modifiedComponents = modifiedComponents;
  }
}
