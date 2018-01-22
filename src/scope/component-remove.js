import { BitId, BitIds } from '../bit-id';

export class RemovedObjects {
  removedComponentIds: BitIds;
  missingComponents: BitIds;
  dependentBits: Object;
  removedDependencies: BitIds;
  constructor({
    removedComponentIds = [],
    missingComponents = [],
    removedDependencies = [],
    dependentBits = {}
  }: {
    removedComponentIds: BitIds,
    missingComponents: BitIds,
    removedDependencies: BitIds,
    dependentBits: Object
  }) {
    this.removedComponentIds = removedComponentIds;
    this.missingComponents = missingComponents;
    this.dependentBits = dependentBits;
    this.removedDependencies = removedDependencies;
  }

  static fromObjects(payload: Object): ComponentObjects {
    let { missingComponents, removedComponentIds, removedDependencies, dependentBits } = payload;
    missingComponents = missingComponents.map(id => new BitId(id));
    removedComponentIds = removedComponentIds.map(id => new BitId(id));
    removedDependencies = removedDependencies.map(id => new BitId(id));
    return new RemovedObjects({ missingComponents, removedComponentIds, removedDependencies, dependentBits });
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
