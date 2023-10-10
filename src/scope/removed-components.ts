import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { BitIdStr } from '../bit-id/bit-id';

export type RemovedObjectSerialized = {
  removedComponentIds: BitIdStr[];
  missingComponents: BitIdStr[];
  dependentBits: Record<string, any>;
  removedFromLane: BitIdStr[];
  removedLanes: string[];
};

export default class RemovedObjects {
  removedComponentIds: ComponentIdList;
  missingComponents: ComponentIdList;
  dependentBits: Record<string, any>;
  removedFromLane: ComponentIdList;
  removedLanes: string[];
  constructor({
    removedComponentIds,
    missingComponents,
    dependentBits,
    removedFromLane,
    removedLanes,
  }: {
    removedComponentIds?: ComponentIdList;
    missingComponents?: ComponentIdList;
    dependentBits?: Record<string, any>;
    removedFromLane?: ComponentIdList;
    removedLanes?: string[];
  }) {
    this.removedComponentIds = removedComponentIds || new ComponentIdList();
    this.missingComponents = missingComponents || new ComponentIdList();
    this.dependentBits = dependentBits || {};
    this.removedFromLane = removedFromLane || new ComponentIdList();
    this.removedLanes = removedLanes || [];
  }

  serialize(): RemovedObjectSerialized {
    return {
      removedComponentIds: this.removedComponentIds.serialize(),
      missingComponents: this.missingComponents.serialize(),
      dependentBits: this.dependentBits,
      removedFromLane: this.removedFromLane.serialize(),
      removedLanes: this.removedLanes,
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
    const missingComponents = new ComponentIdList(...payload.missingComponents.map((id) => ComponentID.fromString(id)));
    const removedComponentIds = new ComponentIdList(
      ...payload.removedComponentIds.map((id) => ComponentID.fromString(id))
    );
    const removedFromLane = payload.removedFromLane
      ? new ComponentIdList(...payload.removedFromLane.map((id) => ComponentID.fromString(id)))
      : new ComponentIdList();
    const dependentBits = Object.keys(payload.dependentBits).reduce((acc, current) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      acc[current] = new ComponentIdList(...payload.dependentBits[current].map((id) => new ComponentID(id)));
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
