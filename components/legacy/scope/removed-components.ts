import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { BitIdStr } from '@teambit/legacy-bit-id';

export type RemovedObjectSerialized = {
  removedComponentIds: BitIdStr[];
  missingComponents: BitIdStr[];
  dependentBits: Record<string, BitIdStr[]>;
  removedFromLane: BitIdStr[];
  removedLanes: string[];
};

export class RemovedObjects {
  removedComponentIds: ComponentIdList;
  missingComponents: ComponentIdList;
  dependentBits: Record<string, ComponentIdList>;
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
    dependentBits?: Record<string, ComponentIdList>;
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
    const dependentBits = Object.keys(this.dependentBits).reduce((acc, current) => {
      acc[current] = this.dependentBits[current].toStringArray();
      return acc;
    }, {});
    return {
      removedComponentIds: this.removedComponentIds.toStringArray(),
      missingComponents: this.missingComponents.toStringArray(),
      dependentBits,
      removedFromLane: this.removedFromLane.toStringArray(),
      removedLanes: this.removedLanes,
    };
  }

  static fromObjects(payload: {
    removedComponentIds: string[];
    missingComponents: string[];
    dependentBits: { [key: string]: string[] };
    removedFromLane: string[];
    removedLanes: string[];
  }): RemovedObjects {
    // this function being called from a remote, so the ids must have a remote scope
    const missingComponents = ComponentIdList.fromStringArray(payload.missingComponents);
    const removedComponentIds = ComponentIdList.fromStringArray(payload.removedComponentIds);
    const removedFromLane = payload.removedFromLane
      ? ComponentIdList.fromStringArray(payload.removedFromLane)
      : new ComponentIdList();
    const dependentBits = Object.keys(payload.dependentBits).reduce((acc, current) => {
      const componentIds = payload.dependentBits[current].map((id) =>
        typeof id === 'string' ? ComponentID.fromString(id) : ComponentID.fromObject(id as any)
      );
      acc[current] = ComponentIdList.fromArray(componentIds);
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
