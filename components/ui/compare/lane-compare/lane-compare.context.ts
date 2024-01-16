import { createContext, useContext } from 'react';
import { LaneCompareState } from '@teambit/lanes.ui.compare.lane-compare-state';
import { LaneComponentDiff, LaneDiff } from '@teambit/lanes.entities.lane-diff';
import { ComponentID } from '@teambit/component-id';
import { DefaultLaneState, LaneFilter } from './lane-compare';

export type LaneCompareContextModel = {
  laneCompareState: LaneCompareState;
  setLaneCompareState: React.Dispatch<React.SetStateAction<LaneCompareState>>;
  fullScreenDrawerKey: string | undefined;
  setFullScreen: React.Dispatch<React.SetStateAction<string | undefined>>;
  openDrawerList: string[];
  setOpenDrawerList: React.Dispatch<React.SetStateAction<string[]>>;
  lastDrawerInteractedWith?: string;
  setLastDrawerInteractedWith: React.Dispatch<React.SetStateAction<string | undefined>>;
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
