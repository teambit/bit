import { BitId, BitIds } from '../bit-id';
import { BitIdStr } from '../bit-id/bit-id';

export type RemovedObjectSerialized = {
  removedComponentIds: BitIdStr[];
  missingComponents: BitIdStr[];
  removedDependencies: BitIdStr[];
  dependentBits: Record<string, any>;
  removedFromLane?: boolean;
  removedLanes: string[];
};

export default class RemovedObjects {
  removedComponentIds: BitIds;
  missingComponents: BitIds;
  removedDependencies: BitIds;
  dependentBits: Record<string, any>;
  removedFromLane: boolean;
  removedLanes: string[];
  constructor({
    removedComponentIds,
    missingComponents,
    removedDependencies,
    dependentBits,
    removedFromLane,
    removedLanes,
  }: {
    removedComponentIds?: BitIds;
    missingComponents?: BitIds;
    removedDependencies?: BitIds;
    dependentBits?: Record<string, any>;
    removedFromLane?: boolean;
    removedLanes?: string[];
  }) {
    this.removedComponentIds = removedComponentIds || new BitIds();
    this.missingComponents = missingComponents || new BitIds();
    this.removedDependencies = removedDependencies || new BitIds();
    this.dependentBits = dependentBits || {};
    this.removedFromLane = removedFromLane || false;
    this.removedLanes = removedLanes || [];
  }

  serialize(): RemovedObjectSerialized {
    return {
      removedComponentIds: this.removedComponentIds.serialize(),
      missingComponents: this.missingComponents.serialize(),
      removedDependencies: this.removedDependencies.serialize(),
      dependentBits: this.dependentBits,
      removedFromLane: this.removedFromLane,
      removedLanes: this.removedLanes,
    };
  }

  static fromObjects(payload: {
    removedComponentIds: string[];
    missingComponents: string[];
    removedDependencies: string[];
    dependentBits: { [key: string]: Record<string, any>[] };
    removedLanes: string[];
  }): RemovedObjects {
    // this function being called from an ssh, so the ids must have a remote scope
    const missingComponents = new BitIds(...payload.missingComponents.map((id) => BitId.parse(id, true)));
    const removedComponentIds = new BitIds(...payload.removedComponentIds.map((id) => BitId.parse(id, true)));
    const removedDependencies = new BitIds(...payload.removedDependencies.map((id) => BitId.parse(id, true)));
    const dependentBits = Object.keys(payload.dependentBits).reduce((acc, current) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      acc[current] = new BitIds(...payload.dependentBits[current].map((id) => new BitId(id)));
      return acc;
    }, {});
    return new RemovedObjects({
      missingComponents,
      removedComponentIds,
      removedDependencies,
      dependentBits,
      removedLanes: payload.removedLanes,
    });
  }
}
