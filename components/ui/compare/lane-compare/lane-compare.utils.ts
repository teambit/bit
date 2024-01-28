import { ComponentID } from '@teambit/component';
import { ChangeType, LaneDiff } from '@teambit/lanes.entities.lane-diff';
import { LaneFilter } from './lane-compare.models';

export function displayChangeType(changeType: ChangeType): string {
  switch (changeType) {
    case ChangeType.SOURCE_CODE:
      return 'code';
    case ChangeType.NONE:
      return 'no changes';
    default:
      return changeType.toLowerCase();
  }
}

export const filterDepKey: (filters?: Array<LaneFilter>) => string | undefined = (filters) => {
  return filters?.map((f) => `${f.type}-${f.values.join()}`).join();
};

export function extractCompsToDiff(laneDiff?: LaneDiff): [ComponentID | undefined, ComponentID | undefined][] {
  return (
    (laneDiff?.diff &&
      laneDiff.diff.map((componentDiff) => [
        (componentDiff.targetHead && componentDiff.componentId.changeVersion(componentDiff.targetHead)) || undefined,
        componentDiff.componentId.changeVersion(componentDiff.sourceHead),
      ])) ||
    []
  );
}
