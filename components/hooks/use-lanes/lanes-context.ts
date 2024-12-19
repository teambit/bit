import { LaneId } from '@teambit/lane-id';
import { LaneModel, LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { createContext, useContext } from 'react';
import { FetchMoreLanes, UseLanesOptions } from './use-lanes';

export type LanesContextModel = {
  lanesModel?: LanesModel;
  updateViewedLane?: (viewedLaneId?: LaneId) => void;
  addLanes?: (lanes: LaneModel[]) => LanesModel | undefined;
  fetchMoreLanes?: FetchMoreLanes;
  hasMore?: boolean;
  loading?: boolean;
  options?: UseLanesOptions;
  offset?: number;
  limit?: number;
};

export const LanesContext: React.Context<LanesContextModel | undefined> = createContext<LanesContextModel | undefined>(
  undefined
);

export const useLanesContext: () => LanesContextModel | undefined = () => {
  const lanesContext = useContext(LanesContext);
  return lanesContext;
};
