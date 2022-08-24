import React, { ReactNode, useState, useEffect } from 'react';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { LaneId } from '@teambit/lane-id';
import { LanesContext, LanesContextModel } from './lanes-context';

export type LanesProviderProps = {
  children: ReactNode;
  viewedLaneId?: LaneId;
};

export function LanesProvider({ children, viewedLaneId }: LanesProviderProps) {
  const { lanesModel, loading } = useLanes();
  const [lanesState, setLanesState] = useState<LanesModel | undefined>(undefined);

  useEffect(() => {
    lanesModel?.setViewedLane(viewedLaneId || lanesModel?.currentLane?.id);
    setLanesState(lanesModel);
  }, [loading]);

  const updateLanesModel = (updatedLanes?: LanesModel) => {
    setLanesState(
      new LanesModel({
        lanes: updatedLanes?.lanes,
        viewedLane: updatedLanes?.viewedLane,
        currentLane: updatedLanes?.currentLane,
      })
    );
  };

  const lanesContextModel: LanesContextModel = {
    lanesModel: lanesState,
    updateLanesModel,
  };

  return <LanesContext.Provider value={lanesContextModel}>{children}</LanesContext.Provider>;
}
