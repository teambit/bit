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
  const updateViewedLane = useCallback(
    (lane?: LaneId) => {
      setViewedLaneId(lane);
      setLanesState((state) => {
        state?.setViewedOrDefaultLane(lane);
        return state;
      });
    },
    [lanesModel]
  );

  const location = useLocation();
  const query = useQuery();

  const ignoreDerivingFromUrl = useCallback((_location?: Location) => {
    if (ignoreDerivingFromUrlFromProps) return ignoreDerivingFromUrlFromProps.some((fn) => fn(_location));
    return false;
  }, []);

  useEffect(() => {
    if (viewedIdFromProps) updateViewedLane(viewedIdFromProps);
  }, [viewedIdFromProps?.toString()]);

  useEffect(() => {
    if (ignoreDerivingFromUrl(location)) return;

    const viewedLaneIdFromUrl =
      (location?.pathname && LanesModel.getLaneIdFromPathname(location?.pathname, query)) || undefined;

    const viewedLaneIdToSet =
      viewedLaneIdFromUrl ||
      viewedLaneId ||
      lanesModel?.currentLane?.id ||
      lanesModel?.lanes.find((lane) => lane.id.isDefault())?.id;

    updateViewedLane(viewedLaneIdToSet);
  }, [location?.pathname]);

  useEffect(() => {
    setLanesState((existing) => {
      if (!loading && lanesModel?.lanes.length) {
        const state = new LanesModel({ ...lanesModel });
        if (viewedLaneId === undefined && lanesModel?.currentLane?.id) {
          state.setViewedOrDefaultLane(lanesModel?.currentLane?.id);
        } else {
          state.setViewedOrDefaultLane(viewedLaneId);
        }
        return state;
      }
      return existing;
    });
  }, [loading, lanesModel?.lanes.length, viewedLaneId]);

  const lanesContextModel: LanesContextModel = {
    lanesModel: lanesState,
    updateLanesModel: setLanesState,
    updateViewedLane,
  };

  return <LanesContext.Provider value={lanesContextModel}>{children}</LanesContext.Provider>;
}
