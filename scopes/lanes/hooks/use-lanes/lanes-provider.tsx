import React, { ReactNode, useState, useEffect } from 'react';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { useLocation } from '@teambit/base-react.navigation.link';
import { LaneId } from '@teambit/lane-id';
import { LanesContext, LanesContextModel } from './lanes-context';

export type LanesProviderProps = {
  children: ReactNode;
  viewedLaneId?: LaneId;
  targetLanes?: LanesModel;
};

export function LanesProvider({ children, viewedLaneId, targetLanes }: LanesProviderProps) {
  const { lanesModel, loading } = useLanes(targetLanes);
  const [lanesState, setLanesState] = useState<LanesModel | undefined>(lanesModel);
  const location = useLocation();
  const query = useQuery();

  useEffect(() => {
    const onHomeRoute = location?.pathname === '/';
    const viewedLaneFromUrl =
      (location?.pathname && LanesModel.getLaneIdFromPathname(location?.pathname, query)) || undefined;
    const viewedLaneIdToSet =
      viewedLaneId ||
      viewedLaneFromUrl ||
      lanesState?.viewedLane?.id ||
      (onHomeRoute && lanesModel?.currentLane?.id) ||
      lanesModel?.lanes.find((lane) => lane.id.isDefault())?.id;

    lanesModel?.setViewedLane(viewedLaneIdToSet);
    setLanesState(lanesModel);
  }, [loading, location?.pathname, targetLanes]);

  const updateLanesModel = (updatedLanes?: LanesModel) => {
    setLanesState(
      new LanesModel({
        lanes: updatedLanes?.lanes,
        viewedLane: updatedLanes?.viewedLane,
        currentLane: updatedLanes?.currentLane,
      })
    );
  };

  const updateViewedLane = (_viewedLaneId?: LaneId) => {
    lanesState?.setViewedLane(_viewedLaneId);
    setLanesState(lanesState);
  };

  const lanesContextModel: LanesContextModel = {
    lanesModel: lanesState,
    updateLanesModel,
    updateViewedLane,
  };

  return <LanesContext.Provider value={lanesContextModel}>{children}</LanesContext.Provider>;
}
