import React, { ReactNode, useState, useEffect, useCallback } from 'react';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { useLocation, Location } from '@teambit/base-react.navigation.link';
import { LaneId } from '@teambit/lane-id';
import { LanesContext, LanesContextModel } from './lanes-context';

export type IgnoreDerivingFromUrl = (location?: Location) => boolean;

export type LanesProviderProps = {
  children: ReactNode;
  viewedLaneId?: LaneId;
  targetLanes?: LanesModel;
  skipNetworkCall?: boolean;
  ignoreDerivingFromUrl?: IgnoreDerivingFromUrl[];
};

export function LanesProvider({
  children,
  viewedLaneId: viewedIdFromProps,
  targetLanes,
  ignoreDerivingFromUrl: ignoreDerivingFromUrlFromProps,
  skipNetworkCall,
}: LanesProviderProps) {
  const { lanesModel, loading } = useLanes(targetLanes, skipNetworkCall);

  const [lanesState, setLanesState] = useState<LanesModel | undefined>(lanesModel);
  const [viewedLaneId, setViewedLaneId] = useState<LaneId | undefined>(viewedIdFromProps);

  const location = useLocation();
  const query = useQuery();

  const ignoreDerivingFromUrl = useCallback((_location?: Location) => {
    if (ignoreDerivingFromUrlFromProps) return ignoreDerivingFromUrlFromProps.some((fn) => fn(_location));
    return false;
  }, []);

  useEffect(() => {
    if (viewedIdFromProps) setViewedLaneId(viewedIdFromProps);
  }, [viewedIdFromProps?.toString()]);

  useEffect(() => {
    if (ignoreDerivingFromUrl(location)) return;

    // const onHomeRoute = location?.pathname === '/';
    const viewedLaneIdFromUrl =
      (location?.pathname && LanesModel.getLaneIdFromPathname(location?.pathname, query)) || undefined;

    const viewedLaneIdToSet =
      viewedLaneIdFromUrl || lanesModel?.currentLane?.id || lanesModel?.lanes.find((lane) => lane.id.isDefault())?.id;

    setViewedLaneId(viewedLaneIdToSet);
  }, [location?.pathname]);

  useEffect(() => {
    if (viewedLaneId === undefined && lanesModel?.currentLane?.id) {
      setViewedLaneId(lanesModel.currentLane.id);
      lanesModel?.setViewedOrDefaultLane(lanesModel.currentLane.id);
      setLanesState(lanesModel);
      return;
    }
    lanesModel?.setViewedOrDefaultLane(viewedLaneId);
    setLanesState(lanesModel);
  }, [loading, lanesModel?.lanes.length]);

  lanesState?.setViewedOrDefaultLane(viewedLaneId);

  const lanesContextModel: LanesContextModel = {
    lanesModel: lanesState,
    updateLanesModel: setLanesState,
    updateViewedLane: setViewedLaneId,
  };

  return <LanesContext.Provider value={lanesContextModel}>{children}</LanesContext.Provider>;
}
