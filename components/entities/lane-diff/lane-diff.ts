import { ComponentID } from '@teambit/component-id';
import { LaneId } from '@teambit/lane-id';
import { LaneComponentDiff, PlainLaneComponentDiff } from './lane-component-diff';

export type PlainLaneDiff = {
  sourceLane: string;
  targetLane?: string;
  diff: PlainLaneComponentDiff[];
};

export class LaneDiff {
  constructor(readonly sourceLane: LaneId, readonly diff: LaneComponentDiff[], readonly targetLane?: LaneId) {}

  /**
   * count components that are up to date.
   */
  countUpToDate() {
    const upToDate = this.diff.filter((status) => status.upToDate);
    return upToDate.length;
  }

  /**
   * list the components behind.
   */
  behind() {
    return this.diff.filter((status) => !status.upToDate);
  }

  /**
   * list the components that are up to date.
   */
  upToDate() {
    return this.diff.filter((status) => status.upToDate);
  }

  /**
   * count how many components are behind their target.
   */
  countBehind() {
    return this.behind().length;
  }

  /**
   * determines whether component is up to date.
   */
  isUpToDate(ids: ComponentID[] = []): boolean {
    const strIds = ids?.map((id) => id.toString());
    const componentDiffs = strIds.length
      ? this.diff.filter((componentDiff) => strIds.includes(componentDiff.componentId.toString()))
      : this.diff;

    return componentDiffs.every((status) => {
      return status.upToDate;
    });
  }

  listOutOfDate(ids?: ComponentID[]) {
    const strIds = ids?.map((id) => id.toString());
    const componentDiffs = strIds
      ? this.diff.filter((componentDiff) => strIds.includes(componentDiff.componentId.toString()))
      : this.diff;

    return componentDiffs.filter((status) => {
      return !status.upToDate;
    });
  }

  get new() {
    return this.diff.filter((diff) => diff.new);
  }

  get changed() {
    return this.diff.filter((diff) => diff.changed);
  }

  toObject(): PlainLaneDiff {
    return {
      sourceLane: this.sourceLane.toString(),
      targetLane: this.targetLane?.toString(),
      diff: this.diff.map((componentDiff) => componentDiff.toObject()),
    };
  }

  static from(laneComponentDiff: PlainLaneDiff) {
    const laneComponentDiffList = laneComponentDiff.diff.map((componentDiff) => LaneComponentDiff.from(componentDiff));
    return new LaneDiff(
      LaneId.parse(laneComponentDiff.sourceLane),
      laneComponentDiffList,
      laneComponentDiff?.targetLane ? LaneId.parse(laneComponentDiff.targetLane) : undefined
    );
  }
}
