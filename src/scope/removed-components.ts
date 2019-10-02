/** @flow */
import { BitId, BitIds } from '../bit-id';
import { BitIdStr } from '../bit-id/bit-id';

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

  static fromObjects(payload: {
    removedComponentIds: string[],
    missingComponents: string[],
    removedDependencies: string[],
    dependentBits: { [string]: Object[] }
  }): RemovedObjects {
    // this function being called from an ssh, so the ids must have a remote scope
    const missingComponents = new BitIds(...payload.missingComponents.map(id => BitId.parse(id, true)));
    const removedComponentIds = new BitIds(...payload.removedComponentIds.map(id => BitId.parse(id, true)));
    const removedDependencies = new BitIds(...payload.removedDependencies.map(id => BitId.parse(id, true)));
    const dependentBits = Object.keys(payload.dependentBits).reduce((acc, current) => {
      acc[current] = new BitIds(...payload.dependentBits[current].map(id => new BitId(id)));
      return acc;
    }, {});
    return new RemovedObjects({
      missingComponents,
      removedComponentIds,
      removedDependencies,
      dependentBits
    });
  }
}

export class RemovedLocalObjects extends RemovedObjects {
  modifiedComponents: BitIds;
  constructor(
    removedComponentIds?: BitIds,
    missingComponents?: BitIds,
    modifiedComponents: BitIds,
    removedDependencies?: BitIds,
    dependentBits?: Object
  ) {
    super({ removedComponentIds, missingComponents, removedDependencies, dependentBits });
    this.modifiedComponents = modifiedComponents;
  }
}
