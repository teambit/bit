/** @flow */
import { BitId, BitIds } from '../bit-id';

export class RemovedObjects {
  removedComponentIds: BitIds = [];
  missingComponents: BitIds = [];
  dependentBits: Object = {};
  removedDependencies: BitIds = [];
  constructor({
    removedComponentIds = new BitIds(),
    missingComponents = new BitIds(),
    removedDependencies = new BitIds(),
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

  static fromObjects(payload: Object): RemovedObjects {
    const missingComponents = payload.missingComponents.map(id => new BitId(id));
    const removedComponentIds = payload.removedComponentIds.map(id => new BitId(id));
    const removedDependencies = payload.removedDependencies.map(id => new BitId(id));
    return new RemovedObjects({
      missingComponents,
      removedComponentIds,
      removedDependencies,
      dependentBits: payload.dependentBits
    });
  }
}
export class RemovedLocalObjects extends RemovedObjects {
  modifiedComponents: BitIds;
  constructor(
    removedComponentIds: BitIds = [],
    missingComponents: BitIds = [],
    modifiedComponents: BitIds = [],
    dependentBits: Object = {},
    removedDependencies: BitIds = []
  ) {
    super({ removedComponentIds, missingComponents, removedDependencies, dependentBits });
    this.modifiedComponents = modifiedComponents;
  }
}
