import { ComponentID } from '@teambit/component-id';
import { ChangeType } from './change-type';

export type PlainLaneComponentDiff = {
  componentId: string;
  changeType: ChangeType;
  upToDate: boolean;
};

export class LaneComponentDiff {
  constructor(readonly componentId: ComponentID, readonly changeType: ChangeType, readonly upToDate: boolean) {}

  toObject() {
    return {
      componentId: this.componentId.toString(),
      changeType: this.changeType,
      upToDate: this.upToDate,
    };
  }

  static from(plainComponentDiff: PlainLaneComponentDiff) {
    const id = ComponentID.fromString(plainComponentDiff.componentId);
    return new LaneComponentDiff(id, plainComponentDiff.changeType, plainComponentDiff.upToDate);
  }
}
