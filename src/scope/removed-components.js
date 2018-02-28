/** @flow */
import { BitId, BitIds } from '../bit-id';
import type { BitIdStr } from '../bit-id/bit-id';

export type RemovedObjectSerialized = {
  removedComponentIds: BitIdStr[],
  missingComponents: BitIdStr[],
  removedDependencies: BitIdStr[],
  dependentBits: Object
};

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

  serialize(): RemovedObjectSerialized {
    return {
      removedComponentIds: this.removedComponentIds.serialize(),
      missingComponents: this.missingComponents.serialize(),
      removedDependencies: this.removedDependencies.serialize(),
      dependentBits: this.dependentBits
    };
  }

  static fromObjects(payload: Object): RemovedObjects {
    const missingComponents = new BitIds(...payload.missingComponents.map(id => BitId.parse(id)));
    const removedComponentIds = new BitIds(...payload.removedComponentIds.map(id => BitId.parse(id)));
    const removedDependencies = new BitIds(...payload.removedDependencies.map(id => BitId.parse(id)));
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
