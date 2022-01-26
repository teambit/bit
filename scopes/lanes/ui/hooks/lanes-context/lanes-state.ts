import { LaneData } from '@teambit/legacy/dist/scope/lanes/lanes';
import { flatten } from 'lodash';

export const DEFAULT_LANE = 'main';

export type LanesState = {
  currentLane?: LaneViewModel;
  lanes?: {
    byScope: Map<string, LaneViewModel[]>;
    list: LaneViewModel[];
  };
};

export type LaneViewModel = {
  name: string;
  scope: string;
  laneName: string;
  isMerged: boolean | null;
};

export function mapToLaneViewModel(laneData: LaneData): LaneViewModel {
  const { name, remote, isMerged } = laneData;
  const laneName = name;
  const fullName = remote || name;
  const scope = remote?.split('/')[0] || '';

  return { name: fullName, laneName, scope, isMerged };
}

export function groupByScope(lanes: LaneViewModel[]): Map<string, LaneViewModel[]> {
  return lanes.reduce((accum, next) => {
    const { scope } = next;
    if (!accum.has(scope)) {
      accum.set(scope, [next]);
    } else {
      const existing = accum.get(scope) as LaneViewModel[];
      accum.set(scope, [...existing, next]);
    }
    return accum;
  }, new Map<string, LaneViewModel[]>());
}

export function mapToLanesState(lanesData: LaneData[], currentLaneName: string): Partial<LanesState> {
  const laneViewModels = lanesData.filter((lane) => lane.name !== DEFAULT_LANE).map(mapToLaneViewModel);
  const lanesByScope = groupByScope(laneViewModels);
  const currentLane = laneViewModels.find((lane) => lane.name === currentLaneName);
  const lanes = {
    byScope: lanesByScope,
    list: laneViewModels,
  };
  return {
    lanes,
    currentLane,
  };
}
