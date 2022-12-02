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

export function LanesProvider({ children, viewedLaneId: viewedIdFromProps, targetLanes }: LanesProviderProps) {
  const { lanesModel, loading } = useLanes(targetLanes);
  const [lanesState, setLanesState] = useState<LanesModel | undefined>(lanesModel);
  const [viewedLaneId, setViewedLaneId] = useState<LaneId | undefined>(viewedIdFromProps);

  const location = useLocation();
  const query = useQuery();

  useEffect(() => {
    if (viewedIdFromProps) setViewedLaneId(viewedIdFromProps);
  }, [viewedIdFromProps?.toString()]);

  useEffect(() => {
    const onHomeRoute = location?.pathname === '/';
    const viewedLaneIdFromUrl =
      (location?.pathname && LanesModel.getLaneIdFromPathname(location?.pathname, query)) || undefined;

    const viewedLaneIdToSet =
      viewedLaneIdFromUrl ||
      (onHomeRoute && lanesModel?.currentLane?.id) ||
      lanesModel?.lanes.find((lane) => lane.id.isDefault())?.id;

    setViewedLaneId(viewedLaneIdToSet);
  }, [location?.pathname]);

  useEffect(() => {
    lanesModel?.setViewedLane(viewedLaneId);
    setLanesState(lanesModel);
  }, [loading, lanesModel?.lanes.length]);

  lanesState?.setViewedLane(viewedLaneId);

  const lanesContextModel: LanesContextModel = {
    lanesModel: lanesState,
    updateLanesModel: setLanesState,
    updateViewedLane: setViewedLaneId,
  };

  return <LanesContext.Provider value={lanesContextModel}>{children}</LanesContext.Provider>;
}
