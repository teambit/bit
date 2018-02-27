/** @flow */
import { BitId, BitIds } from '../bit-id';

export class RemovedObjects {
  removedComponentIds: BitIds;
  missingComponents: BitIds;
  removedDependencies: BitIds;
  dependentBits: Object;
  constructor({
    removedComponentIds,
    missingComponents,
    removedDependencies,
    dependentBits
  }: {
    removedComponentIds?: BitIds,
    missingComponents?: BitIds,
    removedDependencies?: BitIds,
    dependentBits?: Object
  }) {
    this.removedComponentIds = removedComponentIds || new BitIds();
    this.missingComponents = missingComponents || new BitIds();
    this.removedDependencies = removedDependencies || new BitIds();
    this.dependentBits = dependentBits || {};
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
    removedComponentIds?: BitIds,
    missingComponents?: BitIds,
    modifiedComponents?: BitIds,
    removedDependencies?: BitIds,
    dependentBits?: Object
  ) {
    super({ removedComponentIds, missingComponents, removedDependencies, dependentBits });
    this.modifiedComponents = modifiedComponents;
  }
}
