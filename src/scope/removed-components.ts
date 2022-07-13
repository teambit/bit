import { BitId, BitIds } from '../bit-id';
import { BitIdStr } from '../bit-id/bit-id';

export type RemovedObjectSerialized = {
  removedComponentIds: BitIdStr[];
  missingComponents: BitIdStr[];
  dependentBits: Record<string, any>;
  removedFromLane: BitIdStr[];
  removedLanes: string[];
  /**
   * @deprecated
   * 0.0.646 is the latest version this property is used. since then, no dependencies are removed.
   * it's still here for "forward compatibility". (clients that use older version that bit.dev).
   */
  removedDependencies: BitIdStr[];
};

export default class RemovedObjects {
  removedComponentIds: BitIds;
  missingComponents: BitIds;
  dependentBits: Record<string, any>;
  removedFromLane: BitIds;
  removedLanes: string[];
  constructor({
    removedComponentIds,
    missingComponents,
    dependentBits,
    removedFromLane,
    removedLanes,
  }: {
    removedComponentIds?: BitIds;
    missingComponents?: BitIds;
    dependentBits?: Record<string, any>;
    removedFromLane?: BitIds;
    removedLanes?: string[];
  }) {
    this.removedComponentIds = removedComponentIds || new BitIds();
    this.missingComponents = missingComponents || new BitIds();
    this.dependentBits = dependentBits || {};
    this.removedFromLane = removedFromLane || new BitIds();
    this.removedLanes = removedLanes || [];
  }

  serialize(): RemovedObjectSerialized {
    return {
      removedComponentIds: this.removedComponentIds.serialize(),
      missingComponents: this.missingComponents.serialize(),
      dependentBits: this.dependentBits,
      removedFromLane: this.removedFromLane.serialize(),
      removedLanes: this.removedLanes,
      removedDependencies: [], // for forward compatibility
    };
  }

  static fromObjects(payload: {
    removedComponentIds: string[];
    missingComponents: string[];
    dependentBits: { [key: string]: Record<string, any>[] };
    removedFromLane: string[];
    removedLanes: string[];
  }): RemovedObjects {
    // this function being called from an ssh, so the ids must have a remote scope
    const missingComponents = new BitIds(...payload.missingComponents.map((id) => BitId.parse(id, true)));
    const removedComponentIds = new BitIds(...payload.removedComponentIds.map((id) => BitId.parse(id, true)));
    const removedFromLane = payload.removedFromLane
      ? new BitIds(...payload.removedFromLane.map((id) => BitId.parse(id, true)))
      : new BitIds();
    const dependentBits = Object.keys(payload.dependentBits).reduce((acc, current) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      acc[current] = new BitIds(...payload.dependentBits[current].map((id) => new BitId(id)));
      return acc;
    }, {});
    return new RemovedObjects({
      missingComponents,
      removedComponentIds,
      removedFromLane,
      dependentBits,
      removedLanes: payload.removedLanes,
    });
  }
}
