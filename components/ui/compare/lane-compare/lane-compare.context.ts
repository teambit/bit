import { createContext, useContext } from 'react';
import type { LaneCompareState } from '@teambit/lanes.ui.compare.lane-compare-state';
import type { LaneComponentDiff, LaneDiff } from '@teambit/lanes.entities.lane-diff';
import type { ComponentID } from '@teambit/component-id';
import type { DefaultLaneState, LaneFilter } from './lane-compare.models';

export type LaneCompareContextModel = {
  laneCompareState: LaneCompareState;
  setLaneCompareState: React.Dispatch<React.SetStateAction<LaneCompareState>>;
  filters?: LaneFilter[];
  groupBy?: 'scope' | 'status';
  defaultLaneState: DefaultLaneState;
  laneDiff?: LaneDiff;
  loadingLaneDiff?: boolean;
  componentsToDiff: [ComponentID | undefined, ComponentID | undefined][];
  groupedComponentsToDiff: Map<string, [ComponentID | undefined, ComponentID | undefined][]> | null;
  laneComponentDiffByCompId: Map<string, LaneComponentDiff>;
};

export const LaneCompareContext = createContext<LaneCompareContextModel | undefined>(undefined);

export const useLaneCompareContext = (): LaneCompareContextModel | undefined => {
  const context = useContext(LaneCompareContext);
  return context;
};
